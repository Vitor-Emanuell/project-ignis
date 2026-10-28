import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { readConfig } from '../src/config.js';

const apps: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

describe('diagnóstico HTTP', () => {
  it('retorna live 200 JSON sem dados sensíveis', async () => {
    const app = await buildApp();
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/health/live' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('mantém readiness e domínio ausentes, com erro rastreável', async () => {
    const app = await buildApp();
    apps.push(app);
    for (const url of ['/health/ready', '/api/equipment']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        code: 'NOT_FOUND', message: 'Rota não encontrada.', requestId: expect.any(String),
      });
    }
  });

  it('recusa distribuição sem build com orientação legível', async () => {
    await expect(buildApp({ staticRoot: join(tmpdir(), randomUUID()) }))
      .rejects.toThrow('Execute npm run build');
  });

  it('inicia socket real e fecha o servidor', async () => {
    const app = await buildApp();
    apps.push(app);
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    expect(await (await fetch(`${address}/health/live`)).json()).toEqual({ status: 'ok' });
    await app.close();
    await expect(fetch(`${address}/health/live`)).rejects.toThrow();
  });
});

describe('configuração', () => {
  it('inicia localmente sem segredos ou configuração obrigatória', () => {
    expect(readConfig({})).toEqual({ host: '127.0.0.1', port: 3000 });
    expect(readConfig({ HOST: '::1', PORT: '0' })).toEqual({ host: '::1', port: 0 });
  });

  it.each(['', '-1', '65536', '3000x', '3.5', ' 3000', 'NaN'])('recusa PORT inválida: %s', PORT => {
    expect(() => readConfig({ PORT })).toThrow('PORT deve ser um inteiro');
  });

  it.each(['', '0.0.0.0', '::', 'example.com'])('recusa HOST fora de loopback: %s', HOST => {
    expect(() => readConfig({ HOST })).toThrow('HOST deve ser loopback');
  });
});
