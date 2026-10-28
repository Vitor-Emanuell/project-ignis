import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Authorization } from '../auth.js';
import { AppError } from '../errors.js';
import { credentials } from '../foundation-routes.js';
import { normalize, normalizeBody, uuid } from '../idempotency/normalize.js';
import { listRegions } from './regions.js';
import { readOperationsSnapshot } from './snapshot.js';

type Params = { datasetId: string; epoch: string };
const prefix = '/api/v1/datasets/:datasetId/epochs/:epoch';

function parseParams(request: FastifyRequest<{ Params: Params }>) {
  if (!/^\d+$/.test(request.params.epoch)) {
    throw new AppError(400, 'INVALID_REQUEST', 'Geração inválida.');
  }
  return {
    datasetId: uuid(request.params.datasetId),
    epoch: normalize(Number(request.params.epoch), { type: 'integer', min: 1 }) as number,
  };
}

export function registerOperations(app: FastifyInstance, auth: Authorization) {
  app.get<{ Params: Params }>(`${prefix}/regions`, async (request, reply) => {
    normalizeBody(request.query, {});
    const p = parseParams(request);
    const result = listRegions(auth, credentials(request), p.datasetId, p.epoch);
    return reply.header('Cache-Control', 'no-store').send(result);
  });

  app.get<{ Params: Params }>(`${prefix}/operations/snapshot`, async (request, reply) => {
    const p = parseParams(request);
    const result = readOperationsSnapshot(auth, credentials(request), p.datasetId, p.epoch, request.raw.url ?? request.url);
    return reply.header('Cache-Control', 'no-store').send(result);
  });
}
