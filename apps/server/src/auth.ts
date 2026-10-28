import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError, storageError } from './errors.js';
import { Store, transaction } from './persistence/store.js';
import { normalize, uuid } from './idempotency/normalize.js';

export const tokenHash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const matches = (value: string, hash: string) => timingSafeEqual(Buffer.from(tokenHash(value), 'hex'), Buffer.from(hash, 'hex'));
export type Credentials = { token: string | undefined; csrf?: string | undefined; origin?: string | undefined };
export type Context = { actorId: string; datasetId: string; epoch: number; revision: number };

export class Authorization {
  constructor(readonly store: Store, private readonly options: {
    operatorSecret?: string | undefined;
    readOnly?: boolean;
    allowedOrigins: () => readonly string[];
  }) {}

  checkOrigin(origin: string | undefined): void {
    if (!origin || !this.options.allowedOrigins().includes(origin)) {
      throw new AppError(403, 'ORIGIN_FORBIDDEN', 'Origem não autorizada.');
    }
  }

  checkWritable(): void {
    if (this.options.readOnly || !this.options.operatorSecret) {
      throw new AppError(403, 'READ_ONLY', 'Escritas locais desabilitadas.');
    }
  }

  // Read-only capability information; POST still reauthenticates Origin/CSRF and context.
  writeAvailability(context: Context): string | null {
    if(this.options.readOnly || !this.options.operatorSecret)return 'READ_ONLY';
    const grant=this.store.db.prepare('SELECT can_write FROM dataset_grant WHERE dataset_id=? AND actor_id=?')
      .get(context.datasetId,context.actorId) as {can_write:number}|undefined;
    return grant?.can_write===1?null:'CONTEXT_FORBIDDEN';
  }

  login(secret: string, origin: string | undefined) {
    this.checkWritable(); this.checkOrigin(origin);
    this.store.assertReady();
    if (!matches(secret, tokenHash(this.options.operatorSecret!))) {
      throw new AppError(401, 'UNAUTHORIZED', 'Credencial inválida.');
    }
    try {
      return transaction(this.store.db, () => {
        const actor = this.store.db.prepare("SELECT id FROM actor WHERE local_key = 'local-operator'").get() as { id: string } | undefined;
        if (!actor) throw new AppError(503, 'DATABASE_UNAVAILABLE', 'Operador local não provisionado.');
        const token = randomBytes(32).toString('base64url'), csrf = randomBytes(32).toString('base64url');
        this.store.db.prepare('INSERT INTO local_session(token_hash, actor_id, csrf_hash, expires_at) VALUES (?, ?, ?, ?)')
          .run(tokenHash(token), actor.id, tokenHash(csrf), Date.now() + 3_600_000);
        return { token, csrf };
      });
    } catch (error) { return storageError(error); }
  }

  authenticate(credentials: Credentials, write = false): string {
    if (write) { this.checkWritable(); this.checkOrigin(credentials.origin); }
    this.store.assertReady();
    if (!credentials.token) throw new AppError(401, 'UNAUTHORIZED', 'Sessão necessária.');
    let session: { actor_id: string; csrf_hash: string; expires_at: number } | undefined;
    try {
      session = this.store.db.prepare('SELECT actor_id, csrf_hash, expires_at FROM local_session WHERE token_hash = ?')
        .get(tokenHash(credentials.token)) as typeof session;
    } catch (error) { return storageError(error); }
    if (!session || session.expires_at <= Date.now()) throw new AppError(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
    if (write && (!credentials.csrf || !matches(credentials.csrf, session.csrf_hash))) {
      throw new AppError(403, 'CSRF_FORBIDDEN', 'Token CSRF inválido.');
    }
    return session.actor_id;
  }

  context(credentials: Credentials, datasetInput: unknown, epochInput: unknown, write = false): Context {
    const actorId = this.authenticate(credentials, write);
    const datasetId = uuid(datasetInput);
    const epoch = normalize(epochInput, { type: 'integer', min: 1 }) as number;
    try {
      const grant = this.store.db.prepare('SELECT can_write FROM dataset_grant WHERE dataset_id = ? AND actor_id = ?')
        .get(datasetId, actorId) as { can_write: number } | undefined;
      if (!grant || (write && !grant.can_write)) throw new AppError(403, 'CONTEXT_FORBIDDEN', 'Contexto não autorizado.');
      const context = this.store.db.prepare(`SELECT d.active_epoch, e.status, e.revision FROM dataset d
        JOIN dataset_epoch e ON e.dataset_id = d.id AND e.epoch = ? WHERE d.id = ?`).get(epoch, datasetId) as
        { active_epoch: number; status: string; revision: number } | undefined;
      if (!context || context.active_epoch !== epoch || context.status !== 'ready') {
        throw new AppError(409, 'EPOCH_CONFLICT', 'Geração obsoleta ou indisponível.');
      }
      return { actorId, datasetId, epoch, revision: context.revision };
    } catch (error) { return storageError(error); }
  }

  currentContext(credentials: Credentials, datasetInput: unknown): Context {
    const actorId = this.authenticate(credentials);
    const datasetId = uuid(datasetInput);
    const row = this.store.db.prepare(`SELECT d.active_epoch FROM dataset d JOIN dataset_grant g
      ON g.dataset_id = d.id AND g.actor_id = ? WHERE d.id = ?`).get(actorId, datasetId) as { active_epoch: number } | undefined;
    if (!row) throw new AppError(403, 'CONTEXT_FORBIDDEN', 'Contexto não autorizado.');
    return this.context(credentials, datasetId, row.active_epoch);
  }

  logout(credentials: Credentials): void {
    this.authenticate(credentials, true);
    transaction(this.store.db, () => {
      this.authenticate(credentials, true);
      this.store.db.prepare('DELETE FROM local_session WHERE token_hash = ?').run(tokenHash(credentials.token!));
    });
  }
}
