import { readPersistenceConfig } from './config.js';
import { Store } from './persistence/store.js';
import { prepareOperational } from './inventory/prepare.js';

let store: Store | undefined;
try {
  store = new Store(readPersistenceConfig(process.env).databasePath);
  console.log(JSON.stringify(prepareOperational(store)));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha no preparo operacional.');
  process.exitCode = 1;
} finally { store?.close(); }
