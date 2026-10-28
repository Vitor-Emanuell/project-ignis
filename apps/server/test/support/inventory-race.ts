import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
export async function raceInventory(path: string, headers: { cookie: string; 'x-csrf-token': string }, bodies: object[], id?: string) {
  const children = bodies.map(body => spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./inventory-child.ts', import.meta.url))], {
    env: { ...process.env, IGNIS_INVENTORY_JOB: JSON.stringify({ path, cookie: headers.cookie, csrf: headers['x-csrf-token'], body, id }) },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  }));
  const exits = children.map(child => once(child, 'exit'));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = async () => {
      await Promise.all(children.map(child => once(child, 'message')));
      const results = children.map(child => once(child, 'message').then(([result]) => result as { status: number; code?: string; body?: unknown }));
      children.forEach(child => child.send('go'));
      const values = await Promise.all(results); await Promise.all(exits); return values;
    };
    return await Promise.race([work(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Concorrência de inventário expirou.')), 12_000); })]);
  } finally {
    clearTimeout(timer); children.forEach(child => { if (child.exitCode === null && child.signalCode === null) child.kill(); }); await Promise.all(exits);
  }
}
