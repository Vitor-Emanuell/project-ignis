import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { Store } from '../src/persistence/store.js';
import { tokenHash } from '../src/auth.js';
import { readPersistenceConfig } from '../src/config.js';
import { fixture, ORIGIN, SECRET, SECOND_DATASET } from './support/foundation-fixture.js';

const fixtures: ReturnType<typeof fixture>[] = [];
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map(app => app.close()));
  fixtures.splice(0).forEach(f => f.cleanup());
});
async function setup(extra: { operatorSecret?: string | undefined; readOnly?: boolean } = {}) {
  const f = fixture(); fixtures.push(f);
  const app = await buildApp({ foundation: { store: f.store, host: '127.0.0.1', operatorSecret: SECRET, ...extra } });
  apps.push(app);
  return { ...f, app };
}
async function login(app: FastifyInstance, secret = SECRET) {
  const response = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { origin: ORIGIN }, payload: { secret } });
  expect(response.statusCode).toBe(200);
  const cookie = String(response.headers['set-cookie']).split(';')[0]!;
  return { response, cookie, csrf: response.json<{ csrfToken: string }>().csrfToken };
}

describe('T0002: fronteira HTTP local e segurança', () => {
  it('cookie HttpOnly/SameSite, CSRF e contexto vindo da sessão persistida', async () => {
    const f = await setup();
    const { cookie, csrf, response } = await login(f.app);
    expect(response.headers['set-cookie']).toContain('HttpOnly');
    expect(response.headers['set-cookie']).toContain('SameSite=Strict');
    expect(response.headers['cache-control']).toBe('no-store');
    const installation = f.store.migrate();
    const context = await f.app.inject({ url: `/api/v1/datasets/${installation.datasetId}/context`, headers: { cookie } });
    expect(context.statusCode).toBe(200);
    expect(context.json()).toEqual({ datasetId: installation.datasetId, epoch: 1, revision: 0 });
    const stored = f.store.db.prepare('SELECT token_hash, csrf_hash FROM local_session WHERE token_hash = ?')
      .get(tokenHash(cookie.split('=')[1]!)) as { token_hash: string; csrf_hash: string };
    expect(stored.token_hash).not.toBe(cookie.split('=')[1]); expect(stored.csrf_hash).not.toBe(csrf);
    const removed = await f.app.inject({ method: 'DELETE', url: '/api/v1/session', headers: { cookie, origin: ORIGIN, 'x-csrf-token': csrf } });
    expect(removed.statusCode).toBe(204); expect(removed.headers['set-cookie']).toContain('Max-Age=0');
    expect((await f.app.inject({ url: `/api/v1/datasets/${installation.datasetId}/context`, headers: { cookie } })).statusCode).toBe(401);
  });

  it('nega segredo inválido, origem estrangeira e actorId livre do cliente', async () => {
    const f = await setup();
    for (const origin of [undefined, 'https://evil.example', 'http://127.0.0.1:3000.evil']) {
      const response = await f.app.inject({ method: 'POST', url: '/api/v1/session', headers: origin ? { origin } : {}, payload: { secret: SECRET } });
      expect(response.statusCode).toBe(403); expect(response.body).not.toContain(SECRET);
    }
    const invalid = await f.app.inject({ method: 'POST', url: '/api/v1/session', headers: { origin: ORIGIN }, payload: { secret: 'incorrect' } });
    expect(invalid.statusCode).toBe(401);
    const forged = await f.app.inject({ method: 'POST', url: '/api/v1/session', headers: { origin: ORIGIN }, payload: { secret: SECRET, actorId: 'operator:test' } });
    expect(forged.statusCode).toBe(400);
    expect((await f.app.inject(`/api/v1/datasets/${SECOND_DATASET}/context`)).statusCode).toBe(401);
  });

  it('exige CSRF e origem em revogação e não revela outro dataset', async () => {
    const f = await setup(); const session = await login(f.app);
    for (const headers of [{ cookie: session.cookie, origin: ORIGIN },
      { cookie: session.cookie, origin: ORIGIN, 'x-csrf-token': 'wrong' },
      { cookie: session.cookie, origin: 'https://evil.example', 'x-csrf-token': session.csrf }]) {
      expect((await f.app.inject({ method: 'DELETE', url: '/api/v1/session', headers })).statusCode).toBe(403);
    }
    const inaccessible = await f.app.inject({ url: `/api/v1/datasets/${SECOND_DATASET}/context`, headers: { cookie: session.cookie } });
    expect(inaccessible.statusCode).toBe(403); expect(inaccessible.body).not.toContain('operator:test');
  });

  it('ausência de segredo e modo read-only desabilitam escrita', async () => {
    for (const extra of [{ operatorSecret: undefined }, { readOnly: true }]) {
      const f = await setup(extra);
      const response = await f.app.inject({ method: 'POST', url: '/api/v1/session', headers: { origin: ORIGIN }, payload: { secret: SECRET } });
      expect(response.statusCode).toBe(403); expect(response.json().code).toBe('READ_ONLY');
      expect((await f.app.inject('/health/ready')).statusCode).toBe(200);
    }
  });

  it('reinício e rotação de segredo preservam principal e contexto', async () => {
    const f = await setup(); const old = await login(f.app);
    const originalActor = f.store.migrate().actorId;
    const datasetId = f.store.migrate().datasetId;
    await f.app.close();
    const reopened = new Store(f.path);
    const app = await buildApp({ foundation: { store: reopened, host: '127.0.0.1', operatorSecret: `${SECRET}-rotated` } });
    apps.push(app);
    const next = await login(app, `${SECRET}-rotated`);
    expect(reopened.migrate()).toMatchObject({ actorId: originalActor, datasetId });
    for (const cookie of [old.cookie, next.cookie]) {
      const result = await app.inject({ url: `/api/v1/datasets/${datasetId}/context`, headers: { cookie } });
      expect(result.statusCode).toBe(200); expect(result.json().epoch).toBe(1);
    }
    const actor = reopened.db.prepare('SELECT actor_id FROM local_session WHERE token_hash = ?')
      .get(tokenHash(next.cookie.split('=')[1]!)) as { actor_id: string };
    expect(actor.actor_id).toBe(originalActor);
  });

  it('sessão expirada/revogada e grant removido são reavaliados', async () => {
    const f = await setup(); const session = await login(f.app); const id = f.store.migrate().datasetId;
    f.store.db.prepare('UPDATE local_session SET expires_at = ? WHERE token_hash = ?').run(Date.now() - 1, tokenHash(session.cookie.split('=')[1]!));
    expect((await f.app.inject({ url: `/api/v1/datasets/${id}/context`, headers: { cookie: session.cookie } })).statusCode).toBe(401);
    const renewed = await login(f.app);
    f.store.db.prepare('DELETE FROM dataset_grant WHERE dataset_id = ?').run(id);
    expect((await f.app.inject({ url: `/api/v1/datasets/${id}/context`, headers: { cookie: renewed.cookie } })).statusCode).toBe(403);
  });

  it('rate limit de sessão responde 429 com retry e não registra segredos', async () => {
    const f = await setup();
    for (let n = 0; n < 60; n++) {
      expect((await f.app.inject({ method: 'POST', url: '/api/v1/session', headers: { origin: ORIGIN }, payload: { secret: 'incorrect' } })).statusCode).toBe(401);
    }
    const limited = await f.app.inject({ method: 'POST', url: '/api/v1/session', headers: { origin: ORIGIN }, payload: { secret: SECRET } });
    expect(limited.statusCode).toBe(429); expect(limited.headers['retry-after']).toBe('60');
    expect(limited.body).not.toContain(SECRET);
  });

  it('mantém domínio e API de recibos inexistentes; GET não modifica contexto', async () => {
    const f = await setup();
    for (const url of ['/api/v1/equipment', '/api/v1/commands', '/api/v1/receipts']) {
      expect((await f.app.inject(url)).statusCode).toBe(404);
    }
    const before = f.count(); const revision = f.revision();
    expect((await f.app.inject('/health/ready')).json()).toEqual({ status: 'ok' });
    expect(f.count()).toBe(before); expect(f.revision()).toBe(revision);
  });

  it('configuração persistente tem caminho estável e recusa modo/caminho inválido', () => {
    expect(readPersistenceConfig({}).databasePath).toMatch(/project-ignis[\\/]data[\\/]ignis.sqlite$/);
    expect(readPersistenceConfig({ APP_MODE: 'read-only' }).readOnly).toBe(true);
    expect(() => readPersistenceConfig({ APP_MODE: 'public-write' })).toThrow('APP_MODE');
    expect(() => readPersistenceConfig({ DATABASE_PATH: '' })).toThrow('DATABASE_PATH');
    expect(() => new Store(':memory:')).toThrow('arquivo persistente');
  });
});
