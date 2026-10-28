import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../../src/persistence/store.js';
import { prepareOperational } from '../../src/inventory/prepare.js';
import { buildApp } from '../../src/app.js';
import { OPERATIONAL_ID, ORGANIZATION_ID } from '../../src/inventory/contract.js';
import { ORIGIN, SECRET } from './foundation-fixture.js';

export const base = `/api/v1/datasets/${OPERATIONAL_ID}/epochs/1`;
export const location = () => ({ referenceType: 'base', postalCode: '01000-000', neighborhood: 'Bairro fictício',
  city: 'Cidade fictícia', uf: 'SP', address: 'Rua fictícia, 1', reference: 'Base de demonstração' });
export const valid = (changes: Record<string, unknown> = {}) => ({ commandId: randomUUID(), organizationId: ORGANIZATION_ID,
  categoryCode: 'fixed_speed_radar', categoryVersion: 1, serialNumber: ` ficticio-${randomUUID()} `,
  brand: 'Fabricante fictício', model: 'Modelo fictício', criticality: 3,
  attributes: { regulatedSpeedLimitKmh: 60 }, registrationLocation: location(), ...changes });
export const maintenance = (status = 'unknown') => ({ reason: 'Inspeção fictícia inicial', priority: 'high',
  schedule: { status, ...(status === 'dated' ? { dueDate: '2028-02-29' } : {}),
    ...(status === 'not_applicable' ? { notApplicableReason: 'Demonstração sem agenda aplicável' } : {}) } });
export async function inventoryFixture(prepare = true) {
  const directory = mkdtempSync(join(tmpdir(), 'ignis-t0003-')), path = join(directory, 'test.sqlite');
  const store = new Store(path, true), installation = store.migrate();
  if (prepare) prepareOperational(store);
  const app = await buildApp({ foundation: { store, host: '127.0.0.1', dev: true, operatorSecret: SECRET } });
  const response = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { origin: ORIGIN }, payload: { secret: SECRET } });
  if (response.statusCode !== 200) throw new Error(response.body);
  const cookie = String(response.headers['set-cookie']).split(';')[0]!, csrf = response.json<{ csrfToken: string }>().csrfToken;
  const f = { directory, path, store, app, installation, cookie, csrf,
    headers: { cookie, origin: ORIGIN, 'x-csrf-token': csrf },
    call(method: 'GET' | 'POST' | 'PATCH', route: string, payload?: object) {
      return f.app.inject({ method, url: `${base}${route}`, headers: f.headers, ...(payload ? { payload } : {}) });
    },
    counts() { return Object.fromEntries(['resource', 'equipment', 'resource_location', 'current_state', 'maintenance_request', 'operational_event', 'command_receipt']
      .map(table => [table, (f.store.db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n])); },
    revision() { return (f.store.db.prepare('SELECT revision FROM dataset_epoch WHERE dataset_id = ? AND epoch = 1').get(OPERATIONAL_ID) as { revision: number }).revision; },
    async reopen() {
      await f.app.close(); f.store = new Store(path);
      f.app = await buildApp({ foundation: { store: f.store, host: '127.0.0.1', dev: true, operatorSecret: SECRET } });
    },
    async cleanup() { await f.app.close(); f.store.close(); rmSync(directory, { recursive: true, force: true }); },
  };
  return f;
}
