import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../src/errors.js';
import { Authorization, tokenHash } from '../../src/auth.js';
import type { Credentials } from '../../src/auth.js';
import { Store, transaction } from '../../src/persistence/store.js';
import type { CommandInput, CommandSpec } from '../../src/idempotency/command.js';

export const DATASET = '00000000-0000-4000-8000-000000000001';
export const SECOND_DATASET = '00000000-0000-4000-8000-000000000002';
export const COMMAND_ID = '00000000-0000-4000-8000-000000000010';
export const ORIGIN = 'http://127.0.0.1:3000';
export const SECRET = 'technical-test-secret-only';

// Never registered by the application: the normative V00-I technical effect.
export const probe: CommandSpec = {
  operation: 'verification.receipt.v1',
  fields: { expectedVersion: { type: 'integer', min: 0 }, value: { type: 'number' } },
  apply(db, context, body) {
    const changed = db.prepare(`UPDATE dataset_epoch SET revision = revision + 1
      WHERE dataset_id = ? AND epoch = ? AND revision = ?`).run(context.datasetId, context.epoch, body.expectedVersion as number);
    if (changed.changes !== 1) throw new AppError(409, 'VERSION_CONFLICT', 'Versão obsoleta.');
    const revision = context.revision + 1;
    return { status: 200, body: { revision, value: body.value! }, resultingRevision: revision };
  },
};

export const input = (changes: Partial<CommandInput> = {}): CommandInput => ({
  datasetId: DATASET, epoch: 1, commandId: COMMAND_ID, target: null,
  body: { expectedVersion: 0, value: 1 }, ...changes,
});

export function addDataset(store: Store, id: string, epoch: number, actorId: string) {
  transaction(store.db, () => {
    store.db.prepare("INSERT INTO dataset(id, code, kind, active_epoch) VALUES (?, ?, 'demo', ?)").run(id, id, epoch);
    store.db.prepare("INSERT INTO dataset_epoch(dataset_id, epoch, status) VALUES (?, ?, 'ready')").run(id, epoch);
    store.db.prepare('INSERT INTO dataset_grant(dataset_id, actor_id, can_write) VALUES (?, ?, 1)').run(id, actorId);
  });
}

// Seed a persisted, authorized session in the fixture. A client actorId is never used.
export function sessionFor(store: Store, actorId: string): Credentials {
  const token = randomUUID(), csrf = randomUUID();
  store.db.prepare('INSERT INTO local_session(token_hash, actor_id, csrf_hash, expires_at) VALUES (?, ?, ?, ?)')
    .run(tokenHash(token), actorId, tokenHash(csrf), Date.now() + 3_600_000);
  return { token, csrf, origin: ORIGIN };
}

export function authorization(store: Store) {
  return new Authorization(store, { operatorSecret: SECRET, allowedOrigins: () => [ORIGIN] });
}

export function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ignis-t0002-'));
  const path = join(directory, 'test.sqlite');
  const store = new Store(path, true);
  store.migrate();
  store.db.prepare("INSERT INTO actor(id, kind) VALUES ('operator:test', 'operator')").run();
  addDataset(store, DATASET, 1, 'operator:test');
  addDataset(store, SECOND_DATASET, 2, 'operator:test');
  const credentials = sessionFor(store, 'operator:test');
  const auth = authorization(store);
  return { directory, path, store, credentials, auth,
    revision: (datasetId = DATASET, epoch = 1) => (store.db.prepare('SELECT revision FROM dataset_epoch WHERE dataset_id = ? AND epoch = ?')
      .get(datasetId, epoch) as { revision: number }).revision,
    count: () => (store.db.prepare('SELECT count(*) AS count FROM command_receipt').get() as { count: number }).count,
    cleanup() {
      store.close();
      const target = resolve(directory);
      // Recursively remove only the exact temporary directory allocated by this fixture.
      if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('ignis-t0002-')) {
        throw new Error('Diretório temporário fora do escopo de limpeza.');
      }
      rmSync(target, { recursive: true, force: true });
    },
  };
}
