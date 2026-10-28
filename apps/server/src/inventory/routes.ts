import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Authorization, Context } from '../auth.js';
import { credentials } from '../foundation-routes.js';
import { normalizeBody, normalize, uuid } from '../idempotency/normalize.js';
import { AppError } from '../errors.js';
import { ORGANIZATION_ID } from './contract.js';
import { createEquipment, updateEquipment, equipmentView } from './service.js';

import { CATEGORIES, CATEGORY_POLICIES } from './catalog.js';
import { createAgent, updateAgent, agentView } from './agents.js';

type Params = { datasetId: string; epoch: string; id?: string };
const prefix = '/api/v1/datasets/:datasetId/epochs/:epoch';
export function registerInventory(app: FastifyInstance, auth: Authorization) {
  const parse = (request: FastifyRequest<{ Params: Params }>) => {
    if (!/^\d+$/.test(request.params.epoch)) throw new AppError(400, 'INVALID_REQUEST', 'Geração inválida.');
    return { datasetId: uuid(request.params.datasetId), epoch: normalize(Number(request.params.epoch), { type: 'integer', min: 1 }) as number };
  };
  // One read snapshot covers authorization, revision, total and all returned projections.
  const read = <T>(request: FastifyRequest<{ Params: Params }>, action: (context: Context) => T): T => auth.store.db.transaction(() => {
    const p = parse(request);
    const context = auth.context(credentials(request), p.datasetId, p.epoch);
    return action(context);
  }).deferred();
  for (const route of ['catalog', 'equipment', 'equipment/:id', 'agents', 'agents/:id']) {
    app.get<{ Params: Params }>(`${prefix}/${route}`, async (request, reply) => {
      const result = read(request, c => {
        const { datasetId, epoch, revision } = c, db = auth.store.db;
        if (route === 'catalog') return { datasetId, epoch, revision, categories: [...CATEGORIES].sort((a,b)=>a.code<b.code?-1:a.code>b.code?1:a.version-b.version), categoryPolicies: [...CATEGORY_POLICIES].sort((a,b)=>a.code<b.code?-1:1), organizations:
          db.prepare('SELECT id, code, name FROM organization WHERE dataset_id = ? AND epoch = ? AND id = ? ORDER BY code COLLATE BINARY,id').all(datasetId, epoch, ORGANIZATION_ID) };
        if (route.endsWith('/:id')) {
          normalizeBody(request.query, {});
          const id = uuid(request.params.id);
          return route === 'agents/:id' ? {datasetId,epoch,revision,agent:agentView(db,c,id)} : {datasetId,epoch,revision,equipment:equipmentView(db,c,id)};
        }
        const agents = route === 'agents', table = agents ? 'agent' : 'equipment', identity = agents ? 'enrollment_normalized' : 'serial_normalized';
        const query = normalizeBody({ ...(request.query as Record<string, unknown>) }, { page: { type: 'string', optional: true }, pageSize: { type: 'string', optional: true } });
        const pageNumber = (key: string, fallback: number, max = Number.MAX_SAFE_INTEGER) => {
          if (query[key] === undefined) return fallback;
          if (!/^\d+$/.test(query[key] as string)) throw new AppError(400, 'INVALID_REQUEST', 'Paginação inválida.');
          return normalize(Number(query[key]), { type: 'integer', min: 1, max }) as number;
        };
        const page = pageNumber('page', 1), pageSize = pageNumber('pageSize', 50, 200);
        const total = (db.prepare(`SELECT count(*) AS n FROM ${table} WHERE dataset_id = ? AND epoch = ?`).get(datasetId, epoch) as { n: number }).n;
        const offset = (page - 1) * pageSize;
        const ids = offset >= total ? [] : db.prepare(`SELECT id FROM ${table} WHERE dataset_id = ? AND epoch = ?
          ORDER BY ${identity} COLLATE BINARY, id LIMIT ? OFFSET ?`).all(datasetId, epoch, pageSize, offset) as { id: string }[];
        return { datasetId, epoch, revision, page, pageSize, total, items: ids.map(({ id }) => agents ? agentView(db, c, id) : equipmentView(db, c, id)) };
      });
      return reply.header('Cache-Control', 'no-store').send(result);
    });
  }
  app.post<{ Params: Params }>(`${prefix}/equipment`, async (request, reply) => {
    const p = parse(request);
    const result = createEquipment(auth, credentials(request), p.datasetId, p.epoch, request.body);
    return reply.header('Cache-Control', 'no-store').headers(result.headers).code(result.status).send(result.body);
  });
  app.patch<{ Params: Params }>(`${prefix}/equipment/:id`, async (request, reply) => {
    const p = parse(request);
    const result = updateEquipment(auth, credentials(request), p.datasetId, p.epoch, uuid(request.params.id), request.body);
    return reply.header('Cache-Control', 'no-store').headers(result.headers).code(result.status).send(result.body);
  });
  app.post<{ Params: Params }>(`${prefix}/agents`, async (request, reply) => {
    const p=parse(request), result=createAgent(auth,credentials(request),p.datasetId,p.epoch,request.body);
    return reply.header('Cache-Control','no-store').headers(result.headers).code(result.status).send(result.body);
  });
  app.patch<{ Params: Params }>(`${prefix}/agents/:id`, async (request,reply)=>{
    const p=parse(request), result=updateAgent(auth,credentials(request),p.datasetId,p.epoch,uuid(request.params.id),request.body);
    return reply.header('Cache-Control','no-store').headers(result.headers).code(result.status).send(result.body);
  });
}
