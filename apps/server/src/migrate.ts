import { readPersistenceConfig } from './config.js';
import { Store, SCHEMA_VERSION } from './persistence/store.js';

let store: Store | undefined;
try {
  store = new Store(readPersistenceConfig(process.env).databasePath, true);
  const context = store.migrate();
  console.log(JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...context, ...store.diagnostics() }));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha de migração.');
  process.exitCode = 1;
} finally { store?.close(); }
