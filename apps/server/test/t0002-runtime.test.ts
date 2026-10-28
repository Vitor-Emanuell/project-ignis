import { afterEach, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture, SECRET } from './support/foundation-fixture.js';
import { Store } from '../src/persistence/store.js';

const fixtures: ReturnType<typeof fixture>[] = [];
const children: ReturnType<typeof spawn>[] = [];
const entry = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const migration = fileURLToPath(new URL('../dist/migrate.js', import.meta.url));
afterEach(async () => {
  await Promise.all(children.splice(0).map(async child => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill(); await exited;
    }
  }));
  fixtures.splice(0).forEach(f => f.cleanup());
});
function setup() { const f = fixture(); fixtures.push(f); return f; }
function env(path: string) {
  return { ...process.env, DATABASE_PATH: path, HOST: '127.0.0.1', PORT: '0', OPERATOR_SECRET: SECRET, APP_MODE: 'local' };
}
async function boot(path: string) {
  const child = spawn(process.execPath, [entry], { env: env(path), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  const address = await new Promise<string>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Bootstrap expirou: ${output}`)), 10_000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`Bootstrap ${code}: ${output}`)); });
    child.stderr.on('data', data => { output += String(data); });
    child.stdout.on('data', data => {
      output += String(data);
      const found = output.match(/Server listening at (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
      if (found) { clearTimeout(timer); resolve(found); }
    });
  });
  return { address, async stop() {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill(); await exited;
    }
  } };
}

it('T0002 runtime — migração compilada, sessão HTTP, reinício e revogação reais', async () => {
  const f = setup(), path = join(f.directory, 'runtime.sqlite');
  const migrate = () => {
    const process = spawnSync(globalThis.process.execPath, [migration], { env: env(path), windowsHide: true, encoding: 'utf8' });
    expect(process.status, process.stderr).toBe(0);
    return JSON.parse(process.stdout) as { actorId: string; datasetId: string; epoch: number; sqliteVersion: string };
  };
  const first = migrate(); expect(migrate()).toEqual(first);
  const server = await boot(path);
  expect((await fetch(`${server.address}/health/ready`)).status).toBe(200);
  const login = await fetch(`${server.address}/api/v1/session`, { method: 'POST', headers: {
    origin: server.address, 'content-type': 'application/json',
  }, body: JSON.stringify({ secret: SECRET }) });
  expect(login.status).toBe(200);
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
  const { csrfToken } = await login.json() as { csrfToken: string };
  const contextPath = `/api/v1/datasets/${first.datasetId}/context`;
  expect(await (await fetch(server.address + contextPath, { headers: { cookie } })).json())
    .toEqual({ datasetId: first.datasetId, epoch: 1, revision: 0 });
  await server.stop();
  const restarted = await boot(path);
  expect((await fetch(restarted.address + contextPath, { headers: { cookie } })).status).toBe(200);
  const logout = await fetch(`${restarted.address}/api/v1/session`, { method: 'DELETE', headers: {
    cookie, origin: restarted.address, 'x-csrf-token': csrfToken,
  } });
  expect(logout.status).toBe(204);
  expect((await fetch(restarted.address + contextPath, { headers: { cookie } })).status).toBe(401);
});

it('T0002 runtime — boot não aplica migrações e readiness rejeita esquema vazio', async () => {
  const f = setup(), path = join(f.directory, 'empty.sqlite');
  new Store(path, true).close();
  const server = await boot(path);
  expect((await fetch(`${server.address}/health/live`)).status).toBe(200);
  const ready = await fetch(`${server.address}/health/ready`);
  expect(ready.status).toBe(503); expect(await ready.json()).toEqual({ status: 'unavailable' });
  await server.stop();
  const unchanged = new Store(path);
  try {
    expect(unchanged.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get()).toEqual({ n: 0 });
  } finally { unchanged.close(); }
});

it('T0002 runtime — banco inexistente encerra com orientação, sem criar schema', () => {
  const f = setup(), path = join(f.directory, 'absent.sqlite');
  const child = spawnSync(process.execPath, [entry], { env: env(path), windowsHide: true, encoding: 'utf8' });
  expect(child.status).toBe(1); expect(child.stderr).toContain('Execute npm run db:migrate');
});
