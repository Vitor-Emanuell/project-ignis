import { Store } from '../../src/persistence/store.js';
import { Authorization } from '../../src/auth.js';
import { createEquipment, updateEquipment } from '../../src/inventory/service.js';
import { OPERATIONAL_ID } from '../../src/inventory/contract.js';
import { AppError } from '../../src/errors.js';
import { SECRET, ORIGIN } from './foundation-fixture.js';
const job = JSON.parse(process.env.IGNIS_INVENTORY_JOB!) as { path: string; cookie: string; csrf: string; body: unknown; id?: string };
const store = new Store(job.path), auth = new Authorization(store, { operatorSecret: SECRET, allowedOrigins: () => [ORIGIN] });
process.send?.({ ready: true });
process.once('message', () => {
  try {
    const credentials = { token: job.cookie.split('=')[1], csrf: job.csrf, origin: ORIGIN };
    const result = job.id ? updateEquipment(auth, credentials, OPERATIONAL_ID, 1, job.id, job.body)
      : createEquipment(auth, credentials, OPERATIONAL_ID, 1, job.body);
    process.send?.({ status: result.status, body: result.body });
  } catch (error) { process.send?.({ status: error instanceof AppError ? error.statusCode : 500,
    code: error instanceof AppError ? error.code : String(error) }); }
  finally { store.close(); process.disconnect?.(); }
});
