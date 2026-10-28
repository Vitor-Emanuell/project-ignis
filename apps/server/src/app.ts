import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError, isSqliteUnavailable } from './errors.js';
import { parseJson } from './idempotency/json.js';
import { registerFoundation } from './foundation-routes.js';
import type { Store } from './persistence/store.js';
import { registerInventory } from './inventory/routes.js';
import { registerDemo } from './demo/routes.js';
import { registerOperations } from './operations/routes.js';
import { registerPrediction } from './prediction/routes.js';
import { registerTelemetry, type TelemetryRouteOptions } from './domain/telemetry/index.js';
import { registerAlerts, type AlertsRouteOptions } from './alerts/index.js';

export async function buildApp(options: { staticRoot?: string; logger?: boolean; foundation?: {
  store: Store; host: string; dev?: boolean; operatorSecret?: string | undefined; readOnly?: boolean;
}; telemetry?: TelemetryRouteOptions; alerts?: AlertsRouteOptions } = {}) {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 64 * 1024 });

  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
    try { done(null, parseJson(body)); } catch (error) { done(error as Error); }
  });

  app.get('/health/live', {
    schema: {
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          required: ['status'],
          properties: { status: { type: 'string', const: 'ok' } },
        },
      },
    },
  }, async () => ({ status: 'ok' }));

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      code: 'NOT_FOUND', message: 'Rota não encontrada.', requestId: request.id,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode === 429 && !reply.getHeader('retry-after')) reply.header('Retry-After', '60');
      return reply.code(error.statusCode).send({ code: error.code, message: error.message, requestId: request.id });
    }
    if (isSqliteUnavailable(error)) {
      return reply.code(503).send({ code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível.', requestId: request.id });
    }
    const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : undefined;
    const status = typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500
      ? statusCode : 500;
    if (status === 500) request.log.error({ err: error }, 'Falha interna');
    return reply.code(status).send({
      code: status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      message: status === 500 ? 'Falha interna.' : 'Requisição inválida.',
      requestId: request.id,
    });
  });

  if (options.foundation) {
    const auth = registerFoundation(app, options.foundation.store, options.foundation);
    registerInventory(app, auth);
    registerDemo(app, auth);
    registerOperations(app, auth);
    registerPrediction(app, auth);
    registerTelemetry(app, options.foundation.store, options.telemetry);
    registerAlerts(app, auth, options.alerts ?? (options.telemetry?.clockService ? { clockService: options.telemetry.clockService } : undefined));
    app.addHook('onClose', async () => { options.foundation!.store.close(); });
  }

  if (options.staticRoot) {
    try {
      await access(join(options.staticRoot, 'index.html'));
    } catch {
      throw new Error('Build web ausente. Execute npm run build antes de npm start.');
    }
    await app.register(fastifyStatic, { root: options.staticRoot });
  }

  return app;
}
