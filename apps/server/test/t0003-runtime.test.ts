import { expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { OPERATIONAL_ID } from '../src/inventory/contract.js';
import { valid, maintenance, inventoryFixture } from './support/inventory-fixture.js';
import { SECRET } from './support/foundation-fixture.js';

const entry = fileURLToPath(new URL('../dist/main.js', import.meta.url));
async function boot(path: string, port = '0') {
  const child = spawn(process.execPath, [entry], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HOST: '127.0.0.1', PORT: port, DATABASE_PATH: path, OPERATOR_SECRET: SECRET, APP_MODE: 'local' } });
  const exit = once(child, 'exit');
  const stop = async () => { if (child.exitCode === null && child.signalCode === null) child.kill(); await exit; };
  try {
    const address = await new Promise<string>((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error(`Boot expirou: ${output}`)), 10_000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('exit', code => { clearTimeout(timer); reject(new Error(`Boot ${code}: ${output}`)); });
      child.stderr.on('data', value => { output += String(value); });
      child.stdout.on('data', value => {
        output += String(value); const match = output.match(/Server listening at (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
        if (match) { clearTimeout(timer); resolve(match); }
      });
    });
    return { address, stop };
  } catch (error) { await stop(); throw error; }
}

it('V01-T3-16 — CLI, distribuição HTTP, reinício, replay, edição e durabilidade reais', async () => {
  const f = await inventoryFixture(false);
  let server: Awaited<ReturnType<typeof boot>> | undefined;
  try {
    const cli = (script: string) => {
      const result = spawnSync(process.execPath, [fileURLToPath(new URL(`../dist/${script}.js`, import.meta.url))], {
        windowsHide: true, encoding: 'utf8', env: { ...process.env, DATABASE_PATH: f.path } });
      expect(result.status, result.stderr).toBe(0); return JSON.parse(result.stdout);
    };
    const ids = cli('prepare-operational'); expect(cli('prepare-operational')).toEqual(ids);
    const actor = cli('migrate').actorId; expect(actor).toBe(f.installation.actorId);
    server = await boot(f.path);
    const firstAddress = server.address;
    const html = await (await fetch(firstAddress)).text(); expect(html).toContain('IGNIS');
    const asset = html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1]; expect(asset).toBeDefined();
    expect(await (await fetch(`${firstAddress}${asset}`)).text()).toContain('Inventário de equipamentos');
    const session = await fetch(`${firstAddress}/api/v1/session`, { method: 'POST', headers: { Origin: firstAddress, 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: SECRET }) });
    expect(session.status).toBe(200);
    const csrf = (await session.json() as { csrfToken: string }).csrfToken;
    const cookie = session.headers.get('set-cookie')!.split(';')[0]!;
    const input = valid({ serialNumber: 'RUNTIME-FICTICIO', initialMaintenance: maintenance('not_applicable') });
    const resourcePath = `/api/v1/datasets/${OPERATIONAL_ID}/epochs/1/equipment`;
    const send = async (address: string, method: string, path: string, body?: object) => fetch(`${address}${path}`, { method,
      headers: { Cookie: cookie, Origin: address, 'X-CSRF-Token': csrf, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const created = await send(firstAddress, 'POST', resourcePath, input); expect(created.status).toBe(201);
    const original = await created.json() as { equipment: { id: string; version: number } };
    await server.stop(); server = await boot(f.path);
    expect((await send(server.address, 'GET', '/health/live')).status).toBe(200);
    expect((await send(server.address, 'GET', '/health/ready')).status).toBe(200);
    expect((await send(server.address, 'GET', `/api/v1/datasets/${OPERATIONAL_ID}/context`)).status).toBe(200);
    const replay = await send(server.address, 'POST', resourcePath, input);
    expect(replay.headers.get('idempotency-replayed')).toBe('true'); expect(await replay.json()).toEqual(original);
    const edited = await send(server.address, 'PATCH', `${resourcePath}/${original.equipment.id}`,
      { commandId: crypto.randomUUID(), expectedVersion: 1, model: 'Editado antes do reinício' });
    expect(edited.status).toBe(200);
    await server.stop(); server = await boot(f.path);
    const detail = await send(server.address, 'GET', `${resourcePath}/${original.equipment.id}`);
    expect(await detail.json()).toMatchObject({ revision: 2, equipment: { version: 2, model: 'Editado antes do reinício',
      maintenance: { nextMaintenance: { status: 'not_applicable', date: null } } } });
    expect(cli('prepare-operational')).toEqual(ids); expect(cli('migrate').actorId).toBe(actor);
    console.info('V01-T3-16: SQLite', f.store.diagnostics(), 'IDs persistentes', ids);
  } finally { await server?.stop(); await f.cleanup(); }
}, 30_000);
