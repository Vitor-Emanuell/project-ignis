import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { readConfig, readPersistenceConfig } from './config.js';
import { Store } from './persistence/store.js';

async function main() {
  const config = readConfig(process.env);
  const persistence = readPersistenceConfig(process.env);
  const store = new Store(persistence.databasePath);
  let app;
  try { app = await buildApp({
    logger: true,
    foundation: { store, host: config.host, dev: process.argv.includes('--dev'), ...persistence },
    ...(process.argv.includes('--dev') ? {} : {
      staticRoot: fileURLToPath(new URL('../../web/dist/', import.meta.url)),
    }),
  }); } catch (error) { store.close(); throw error; }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void app.close().catch(() => { process.exitCode = 1; });
    });
  }

  try {
    await app.listen(config);
  } catch (error) {
    await app.close();
    throw error;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error && 'code' in error && error.code === 'EADDRINUSE'
    ? 'Porta em uso. Configure outra PORT ou pare o processo que a ocupa.'
    : error instanceof Error ? error.message : 'Erro de inicialização.';
  console.error(`IGNIS: ${message}`);
  process.exitCode = 1;
});
