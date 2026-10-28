import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import type { CommandInput } from '../../src/idempotency/command.js';
import type { Credentials } from '../../src/auth.js';

type Message = {
  phase: string; error?: string; status?: number; elapsed?: number;
  result?: { status: number; replayed: boolean; body: unknown };
};
export function startCommand(job: {
  path: string; input: CommandInput; credentials: Credentials;
  mode: 'normal' | 'hold' | 'rollback' | 'crash-before' | 'crash-after'; release?: string;
}) {
  const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./command-child.ts', import.meta.url))], {
    cwd: fileURLToPath(new URL('../../../../', import.meta.url)),
    env: { ...process.env, IGNIS_TEST_JOB: JSON.stringify(job) },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
  });
  const messages: Message[] = [];
  let output = '';
  child.stdout?.on('data', value => { output += String(value); });
  child.stderr?.on('data', value => { output += String(value); });
  child.on('message', message => { messages.push(message as Message); });
  const exit = once(child, 'exit');
  async function phase(name: string): Promise<Message> {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const poll = () => {
        const message = messages.find(m => m.phase === name);
        if (message) { resolve(message); return; }
        if (child.exitCode !== null || child.signalCode !== null || Date.now() - started > 12_000) {
          reject(new Error(`Filho não chegou a ${name}: ${output}`)); return;
        }
        setTimeout(poll, 10);
      };
      poll();
    });
  }
  return { child, phase, exit,
    async stop() {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await exit;
    },
  };
}
