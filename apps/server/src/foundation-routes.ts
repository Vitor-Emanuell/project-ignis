import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Authorization } from './auth.js';
import type { Credentials } from './auth.js';
import { normalizeBody } from './idempotency/normalize.js';
import { Store } from './persistence/store.js';
import { AppError } from './errors.js';

export const credentials = (request: FastifyRequest): Credentials => {
  const session = request.headers.cookie?.split(';').map(part => part.trim()).filter(part => part.startsWith('ignis_session='));
  return { token: session?.length === 1 ? session[0]!.slice('ignis_session='.length) : undefined,
    csrf: typeof request.headers['x-csrf-token'] === 'string' ? request.headers['x-csrf-token'] : undefined,
    origin: request.headers.origin };
};

export function registerFoundation(app: FastifyInstance, store: Store, options: {
  host: string; dev?: boolean; operatorSecret?: string | undefined; readOnly?: boolean;
}) {
  const auth = new Authorization(store, {
    ...options,
    allowedOrigins: () => {
      const address = app.server.address();
      const port = typeof address === 'object' && address ? address.port : 3000;
      const host = options.host === '::1' ? '[::1]' : options.host;
      return [`http://${host}:${port}`, ...(options.dev ? ['http://127.0.0.1:5173'] : [])];
    },
  });
  const cookie = (value: string, maxAge: number) => `ignis_session=${value}; Path=/api/v1; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
  const mutations = new Map<string, { start: number; count: number }>();
  app.addHook('preHandler', async request => {
    if (!['POST', 'PATCH', 'DELETE', 'PUT'].includes(request.method)
      || !request.routeOptions.url?.startsWith('/api/v1/')
      || request.routeOptions.url === '/api/v1/datasets/:datasetId/epochs/:epoch/telemetry') return;
    // Bound the local mutation/session gate; no IP/header is accepted as actor identity.
    const key = request.method === 'POST' && request.routeOptions.url === '/api/v1/session'
      ? 'login' : (credentials(request).token ?? 'login');
    const now = Date.now();
    if (mutations.size > 1000) {
      for (const [id, window] of mutations) if (now - window.start >= 60_000) mutations.delete(id);
    }
    if (!mutations.has(key) && mutations.size >= 1000) throw new AppError(429, 'RATE_LIMITED', 'Limite de sessões atingido.');
    const window = mutations.get(key);
    if (!window || now - window.start >= 60_000) mutations.set(key, { start: now, count: 1 });
    else if (++window.count > 60) {
      throw new AppError(429, 'RATE_LIMITED', 'Limite de mutações atingido; tente em um minuto.');
    }
  });
  app.get('/health/ready', async (_request, reply) => {
    const ready = store.ready();
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ok' : 'unavailable' });
  });
  app.post('/api/v1/session', async (request, reply) => {
    const body = normalizeBody(request.body, { secret: { type: 'string', min: 1 } });
    const session = auth.login(body.secret as string, request.headers.origin);
    return reply.header('Cache-Control', 'no-store').header('Set-Cookie', cookie(session.token, 3600)).send({ csrfToken: session.csrf });
  });
  app.delete('/api/v1/session', async (request, reply) => {
    auth.logout(credentials(request));
    return reply.header('Set-Cookie', cookie('', 0)).code(204).send();
  });
  app.get<{ Params: { datasetId: string } }>('/api/v1/datasets/:datasetId/context', async (request, reply) => {
    const context = auth.currentContext(credentials(request), request.params.datasetId);
    return reply.header('Cache-Control', 'no-store').send({ datasetId: context.datasetId, epoch: context.epoch, revision: context.revision });
  });
  return auth;
}
