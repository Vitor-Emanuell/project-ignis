import { afterAll, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { fixture } from './support/foundation-fixture.js';

const entry = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const database = fixture();
afterAll(() => database.cleanup());

function launch(env: NodeJS.ProcessEnv = {}) {
  return spawn(process.execPath, [entry], {
    // Static files must resolve independently of the caller's working directory.
    cwd: tmpdir(),
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATABASE_PATH: database.path, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  await exited;
}

function waitForAddress(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Bootstrap excedeu 10 s: ${output}`)), 10_000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Bootstrap terminou com ${code}: ${output}`));
    });
    child.stderr?.on('data', chunk => { output += String(chunk); });
    child.stdout?.on('data', chunk => {
      output += String(chunk);
      const address = output.match(/Server listening at (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
      if (address) { clearTimeout(timer); resolve(address); }
    });
  });
}

it('executa build em processo real, serve HTML/JS, para e reinicia', async () => {
  for (let run = 0; run < 2; run++) {
    const child = launch();
    let address = '';
    try {
      address = await waitForAddress(child);
      const live = await fetch(`${address}/health/live`);
      expect(live.status).toBe(200);
      expect(await live.json()).toEqual({ status: 'ok' });
      const page = await fetch(address);
      expect(page.status).toBe(200);
      expect(page.headers.get('content-type')).toContain('text/html');
      const html = await page.text();
      expect(html).toContain('IGNIS');
      const asset = html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1];
      expect(asset).toBeDefined();
      const script = await fetch(`${address}${asset}`);
      expect(script.status).toBe(200);
      expect(script.headers.get('content-type')).toMatch(/javascript/);
      expect(await script.text()).toContain('Inventário de equipamentos');
      // Readiness was intentionally absent in T0001 and is now supplied by T0002.
      expect((await fetch(`${address}/health/ready`)).status).toBe(200);
      expect((await fetch(`${address}/missing.js`)).status).toBe(404);
    } finally {
      await stop(child);
    }
    await expect(fetch(`${address}/health/live`)).rejects.toThrow();
  }
});

it('falha com saída não zero e mensagem legível para configuração inválida', async () => {
  const child = launch({ PORT: 'invalid' });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  try {
    const [code] = await once(child, 'exit');
    expect(code).toBe(1);
    expect(stderr).toContain('IGNIS: PORT deve ser um inteiro');
  } finally {
    await stop(child);
  }
});

it('explica conflito de porta e libera recursos', async () => {
  const holder = await buildApp();
  const address = await holder.listen({ host: '127.0.0.1', port: 0 });
  const child = launch({ PORT: new URL(address).port });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  try {
    const [code] = await once(child, 'exit');
    expect(code).toBe(1);
    expect(stderr).toContain('Porta em uso');
  } finally {
    await stop(child);
    await holder.close();
  }
});
