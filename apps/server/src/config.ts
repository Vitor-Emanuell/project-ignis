import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function readConfig(env: NodeJS.ProcessEnv) {
  const host = env.HOST ?? '127.0.0.1';
  // T0001 exposes only local diagnostics. Other exposure modes need their own gate.
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
    throw new Error('HOST deve ser loopback: 127.0.0.1, ::1 ou localhost.');
  }

  const rawPort = env.PORT ?? '3000';
  if (!/^\d+$/.test(rawPort) || Number(rawPort) > 65535) {
    throw new Error('PORT deve ser um inteiro entre 0 e 65535 (0 escolhe porta livre).');
  }

  return { host, port: Number(rawPort) };
}

export function readPersistenceConfig(env: NodeJS.ProcessEnv) {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const mode = env.APP_MODE ?? 'local';
  if (!['local', 'read-only'].includes(mode)) throw new Error('APP_MODE deve ser local ou read-only.');
  if (env.DATABASE_PATH === '') throw new Error('DATABASE_PATH não pode ser vazio.');
  if (env.OPERATOR_SECRET && env.OPERATOR_SECRET.length > 256) throw new Error('OPERATOR_SECRET deve ter até 256 caracteres.');
  return {
    databasePath: resolve(root, env.DATABASE_PATH ?? 'data/ignis.sqlite'),
    operatorSecret: env.OPERATOR_SECRET || undefined,
    readOnly: mode === 'read-only',
  };
}
