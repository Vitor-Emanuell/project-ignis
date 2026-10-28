import { existsSync } from 'node:fs';
import { Store } from '../../src/persistence/store.js';
import { AppError } from '../../src/errors.js';
import { executeCommand } from '../../src/idempotency/command.js';
import { authorization, probe } from './foundation-fixture.js';
import type { CommandInput } from '../../src/idempotency/command.js';
import type { Credentials } from '../../src/auth.js';

type Job = {
  path: string; input: CommandInput; credentials: Credentials;
  mode: 'normal' | 'hold' | 'rollback' | 'crash-before' | 'crash-after';
  release?: string;
};
const job = JSON.parse(process.env.IGNIS_TEST_JOB!) as Job;
const store = new Store(job.path);
const wait = new Int32Array(new SharedArrayBuffer(4));
const start = Date.now();
try {
  process.send?.({ phase: 'starting' });
  const result = executeCommand(authorization(store), job.credentials, {
    ...probe,
    apply(db, context, body) {
      const value = probe.apply(db, context, body);
      if (job.mode !== 'normal' && job.mode !== 'crash-after') {
        process.send?.({ phase: 'locked' });
        // A test-only process barrier holds the real SQLite write transaction.
        const deadline = Date.now() + 10_000;
        while (job.mode === 'crash-before' || !job.release || !existsSync(job.release)) {
          if (Date.now() > deadline) throw new Error('Barreira de teste expirou.');
          Atomics.wait(wait, 0, 0, 10);
        }
        if (job.mode === 'rollback') throw new AppError(500, 'TEST_ROLLBACK', 'Falha de teste antes de commit.');
      }
      return value;
    },
  }, job.input);
  if (job.mode === 'crash-after') {
    process.send?.({ phase: 'committed' });
    // Deliberately retain the open connection until the parent kills this process.
    setInterval(() => {}, 1000);
  } else {
    process.send?.({ phase: 'result', result, elapsed: Date.now() - start });
    store.close(); process.disconnect?.();
  }
} catch (error) {
  process.send?.({ phase: 'result', error: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
    status: error instanceof AppError ? error.statusCode : 500, elapsed: Date.now() - start });
  store.close(); process.disconnect?.();
}
