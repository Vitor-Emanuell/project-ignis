import type { FastifyInstance } from 'fastify';
import type { Authorization } from '../auth.js';
import { AppError } from '../errors.js';
import { credentials } from '../foundation-routes.js';
import { normalize, normalizeBody, uuid } from '../idempotency/normalize.js';
import { readPredictiveHistory } from './service.js';

export function registerPrediction(app: FastifyInstance, auth: Authorization) {
  app.get<{ Params: { datasetId: string; epoch: string } }>(
    '/api/v1/datasets/:datasetId/epochs/:epoch/prediction/history',
    async (request, reply) => {
      normalizeBody(request.query, {});
      if (!/^\d+$/.test(request.params.epoch)) throw new AppError(400, 'INVALID_REQUEST', 'Geração inválida.');
      const datasetId = uuid(request.params.datasetId);
      const epoch = normalize(Number(request.params.epoch), { type: 'integer', min: 1 }) as number;
      return reply.header('Cache-Control', 'no-store').send(readPredictiveHistory(auth, credentials(request), datasetId, epoch));
    },
  );
}
