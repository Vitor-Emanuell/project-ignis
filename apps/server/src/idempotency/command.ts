import type Database from 'better-sqlite3';
import { AppError } from '../errors.js';
import { Authorization } from '../auth.js';
import type { Context, Credentials } from '../auth.js';
import { transaction } from '../persistence/store.js';
import { hashJson, parseJson, canonicalJson } from './json.js';
import type { Json } from './json.js';
import { normalizeBody, uuid } from './normalize.js';
import type { Field } from './normalize.js';

export type CommandResult = { status: number; body: Json; resultingRevision?: number };
export type CommandMetrics = { waitMs:number; lockMs:number };
export type CommandInput = {
  datasetId: string;
  epoch: number;
  commandId: string;
  target?: { type: string; id: string } | null;
  body: unknown;
};
export type CommandSpec = {
  operation: string;
  fields: Readonly<Record<string, Field>>;
  apply: (db: Database.Database, context: Context, body: Record<string, Json>) => CommandResult;
  demoOnly?: true;
  metrics?: CommandMetrics;
};

// This is a transaction helper for trusted application services, not a public command API.
// No caller-supplied actorId, operation registry, queue, or durable "processing" state.
export function executeCommand(auth: Authorization, credentials: Credentials, spec: CommandSpec, input: CommandInput) {
  const body = normalizeBody(input.body, spec.fields);
  const commandId = uuid(input.commandId);
  const target = input.target == null ? null : { type: input.target.type, id: uuid(input.target.id) };
  const initial = auth.context(credentials, input.datasetId, input.epoch, true);
  const checkKind=(c:Context)=>{
    if(spec.demoOnly && (auth.store.db.prepare('SELECT kind FROM dataset WHERE id=?').get(c.datasetId) as {kind:string}).kind!=='demo')
      throw new AppError(403,'DEMO_ONLY','Geração disponível somente no contexto demonstrativo.');
  };
  checkKind(initial);
  const identity = hashJson({ canonicalVersion: 1, datasetId: initial.datasetId, epoch: initial.epoch,
    actorId: initial.actorId, operation: spec.operation, target, body });

  const waiting=performance.now();let acquired:number|undefined;
  try { return transaction(auth.store.db, () => {
    acquired=performance.now();
    const context = auth.context(credentials, initial.datasetId, initial.epoch, true);
    checkKind(context);
    if (context.actorId !== initial.actorId) throw new AppError(403, 'CONTEXT_FORBIDDEN', 'Principal alterado.');
    const key = [context.datasetId, context.epoch, context.actorId, spec.operation, commandId];
    const receipt = auth.store.db.prepare(`SELECT request_hash, response_status, response_body, resulting_revision
      FROM command_receipt WHERE dataset_id = ? AND epoch = ? AND actor_id = ? AND operation = ? AND command_id = ?`)
      .get(...key) as { request_hash: string; response_status: number; response_body: string | null; resulting_revision: number | null } | undefined;
    if (receipt) {
      if (receipt.request_hash !== identity.hash) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Chave já utilizada com outro conteúdo.');
      return { status: receipt.response_status, body: receipt.response_body === null ? null : parseJson(receipt.response_body),
        headers: { 'Idempotency-Replayed': 'true' }, replayed: true, hash: identity.hash };
    }
    const result = spec.apply(auth.store.db, context, body);
    if (!Number.isInteger(result.status) || result.status < 200 || result.status > 299) {
      throw new Error('Somente resultados confirmados 2xx podem gerar recibo.');
    }
    let snapshot: string;
    let responseBody: Json;
    try {
      snapshot = canonicalJson(result.body); // validate/serialize before commit
      responseBody = parseJson(snapshot);
    } catch (error) {
      throw new Error('Resposta interna inválida; transação revertida.', { cause: error });
    }
    auth.store.db.prepare(`INSERT INTO command_receipt(dataset_id, epoch, actor_id, operation, command_id,
      canonical_version, request_hash, response_status, response_body, resulting_revision)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`).run(...key, identity.hash, result.status, snapshot, result.resultingRevision ?? null);
    return { status: result.status, body: responseBody, headers: {}, replayed: false, hash: identity.hash };
  }); } finally { if(spec.metrics){spec.metrics.waitMs=(acquired??performance.now())-waiting;
    spec.metrics.lockMs=acquired===undefined?0:performance.now()-acquired;} }
}
