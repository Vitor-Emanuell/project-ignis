import { afterEach, expect, it } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Store, transaction } from '../src/persistence/store.js';
import { prepareOperational } from '../src/inventory/prepare.js';
import { CATEGORY, OPERATIONAL_ID, ORGANIZATION_ID } from '../src/inventory/contract.js';
import { CATEGORIES } from '../src/inventory/catalog.js';
import { canonicalJson } from '../src/idempotency/json.js';
import { configuredDataset } from '../../web/src/api.js';
import { inventoryFixture, valid, maintenance, location, base } from './support/inventory-fixture.js';
import { ORIGIN, sessionFor } from './support/foundation-fixture.js';
import { raceInventory } from './support/inventory-race.js';

const fixtures: Awaited<ReturnType<typeof inventoryFixture>>[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.cleanup(); });
async function setup(prepare = true) { const f = await inventoryFixture(prepare); fixtures.push(f); return f; }
const equipment = (response: { json: () => any }) => response.json().equipment;

it('V01-T3-01 — migração incremental e preparo separado sem domínio', async () => {
  const f = await setup(false), before = f.counts(), installation = f.store.migrate();
  const first = prepareOperational(f.store);
  expect(first).toEqual({ datasetId: OPERATIONAL_ID, epoch: 1, organizationId: ORGANIZATION_ID, categoryCode: CATEGORY.code, categoryVersion: 1 });
  expect(f.counts()).toEqual(before); expect(f.revision()).toBe(0); expect(f.store.migrate()).toEqual(installation);
  expect(f.store.db.prepare('SELECT kind FROM dataset WHERE id = ?').get(f.installation.datasetId)).toEqual({ kind: 'demo' });
  expect(f.store.db.prepare('SELECT can_write FROM dataset_grant WHERE dataset_id = ? AND actor_id = ?').get(OPERATIONAL_ID, installation.actorId)).toEqual({ can_write: 1 });
  expect(f.store.db.prepare('SELECT * FROM organization').all()).toHaveLength(1);
  // Reproduce a version-1 installation, then upgrade with the original migration/checksum untouched.
  const upgraded = new Store(`${f.directory}/v1.sqlite`, true);
  try {
    const sql = readFileSync(new URL('../migrations/0001-foundation.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    upgraded.db.exec('CREATE TABLE schema_migration(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL)');
    upgraded.db.exec(sql);
    upgraded.db.prepare('INSERT INTO schema_migration VALUES (1, ?)').run(createHash('sha256').update(sql).digest('hex'));
    upgraded.db.pragma('user_version = 1');
    const ids = upgraded.migrate(); expect(upgraded.migrate()).toEqual(ids); expect(upgraded.ready()).toBe(true);
    // T0006 adds 0005, T0007 adds 0006; original migrations and upgrade/repetition checks remain required.
    expect(upgraded.db.prepare('SELECT version FROM schema_migration ORDER BY version').all()).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }, { version: 6 }, { version: 7 }]);
  } finally { upgraded.close(); }
});

it('V01-T3-02 — repetição íntegra, colisões, grant revogado, perfil e epoch incompatível', async () => {
  const f = await setup(); expect(prepareOperational(f.store)).toEqual(prepareOperational(f.store));
  expect(f.counts().resource).toBe(0);
  for (const change of [
    "UPDATE dataset SET kind = 'demo' WHERE code = 'local-operational'",
    "UPDATE dataset SET code = 'wrong-code' WHERE code = 'local-operational'",
    "UPDATE dataset_grant SET can_write = 0 WHERE dataset_id = '" + OPERATIONAL_ID + "'",
    "DELETE FROM dataset_grant WHERE dataset_id = '" + OPERATIONAL_ID + "'",
    'DELETE FROM organization',
    "UPDATE organization SET name = 'divergente'",
    "DROP TRIGGER category_immutable_update; UPDATE category_version SET profile_json = '{}'",
  ]) {
    const other = await setup(); other.store.db.exec(change);
    const before = other.counts(); expect(() => prepareOperational(other.store)).toThrow(/recusado/); expect(other.counts()).toEqual(before);
  }
  const advanced = await setup(); transaction(advanced.store.db, () => {
    advanced.store.db.prepare("UPDATE dataset_epoch SET status = 'retired' WHERE dataset_id = ?").run(OPERATIONAL_ID);
    advanced.store.db.prepare("INSERT INTO dataset_epoch VALUES (?, 2, 'ready', 8)").run(OPERATIONAL_ID);
    advanced.store.db.prepare('UPDATE dataset SET active_epoch = 2 WHERE id = ?').run(OPERATIONAL_ID);
  });
  expect(() => prepareOperational(advanced.store)).toThrow(/recusado/);
  const collision = await setup(false);
  transaction(collision.store.db, () => {
    collision.store.db.prepare("INSERT INTO dataset VALUES (?, 'local-operational', 'demo', 1)").run(randomUUID());
    const id = (collision.store.db.prepare("SELECT id FROM dataset WHERE code = 'local-operational'").get() as { id: string }).id;
    collision.store.db.prepare("INSERT INTO dataset_epoch VALUES (?, 1, 'ready', 0)").run(id);
  });
  expect(() => prepareOperational(collision.store)).toThrow(/recusado/);
});

it('V01-T3-03 — referência pública, sessão, grants, isolamento e epoch', async () => {
  const f = await setup();
  for (const id of [undefined, '', 'bad', ' ' + OPERATIONAL_ID]) expect(configuredDataset(id)).toBeNull();
  expect(configuredDataset(OPERATIONAL_ID.toUpperCase())).toBe(OPERATIONAL_ID);
  expect((await f.app.inject(`${base}/equipment`)).statusCode).toBe(401);
  expect((await f.app.inject({ url: `${base.replace('/epochs/1', '/epochs/2')}/equipment`, headers: f.headers })).statusCode).toBe(409);
  f.store.db.prepare("INSERT INTO actor(id, kind) VALUES ('operator:stranger', 'operator')").run();
  const stranger = sessionFor(f.store, 'operator:stranger');
  for (const id of [OPERATIONAL_ID, f.installation.datasetId]) expect((await f.app.inject({ url: `/api/v1/datasets/${id}/epochs/1/equipment`, headers: { cookie: `ignis_session=${stranger.token}` } })).statusCode).toBe(403);
  const made = equipment(await f.call('POST', '/equipment', valid()));
  expect((await f.app.inject({ url: `/api/v1/datasets/${f.installation.datasetId}/epochs/1/equipment/${made.id}`, headers: f.headers })).statusCode).toBe(404);
  f.store.db.prepare('UPDATE dataset_grant SET can_write = 0 WHERE dataset_id = ?').run(OPERATIONAL_ID);
  expect((await f.call('POST', '/equipment', valid())).statusCode).toBe(403);
});

it('V01-T3-04 — cookie/origem/CSRF em mutação de inventário, novo acesso e recarga', async () => {
  const f = await setup();
  for (const headers of [{ cookie: f.cookie, origin: ORIGIN }, { cookie: f.cookie, origin: ORIGIN, 'x-csrf-token': 'bad' },
    { ...f.headers, origin: 'https://evil.example' }]) expect((await f.app.inject({ method: 'POST', url: `${base}/equipment`, headers, payload: valid() })).statusCode).toBe(403);
  expect((await f.call('GET', '/equipment')).statusCode).toBe(200);
  expect((await f.app.inject({ method: 'POST', url: `${base}/equipment`, headers: { ...f.headers, origin: 'http://127.0.0.1:5173' }, payload: valid() })).statusCode).toBe(201);
  expect(f.counts().resource).toBe(1);
});

it('V01-T3-05 — perfil único e criação confirmada sem solicitação automática', async () => {
  const f = await setup(), refs = await f.call('GET', '/catalog');
  expect(refs.json().categories).toHaveLength(14);
  expect(refs.json().categories).toEqual([...CATEGORIES].sort((a,b)=>a.code<b.code?-1:1));
  expect(refs.json().categories.find((p: {code:string})=>p.code===CATEGORY.code)).toEqual(CATEGORY);
  expect(refs.json().organizations).toHaveLength(1);
  expect(() => f.store.db.exec("UPDATE category_version SET profile_json = '{}' ")).toThrow(/Immutable/);
  const response = await f.call('POST', '/equipment', valid({ serialNumber: ' radar-ficticio-01 ' }));
  expect(response.statusCode, response.body).toBe(201);
  expect(equipment(response)).toMatchObject({ serialNumber: 'RADAR-FICTICIO-01', publicLabel: 'RADAR-FICTICIO-01', version: 1,
    operationalState: 'not_installed', kind: 'equipment', mobility: 'fixed', maintenance: { requests: [], nextMaintenance: { status: 'unknown', date: null, reason: null } } });
  expect(f.counts()).toEqual({ resource: 1, equipment: 1, resource_location: 1, current_state: 1, maintenance_request: 0, operational_event: 1, command_receipt: 1 });
  expect(f.revision()).toBe(1);
  const event = f.store.db.prepare('SELECT changes_json FROM operational_event').get() as { changes_json: string };
  expect(JSON.parse(event.changes_json)).toMatchObject({ reason: expect.any(String), evidenceIds: [],
    changes: expect.arrayContaining([expect.objectContaining({ fieldPath: 'maintenance', before: null })]) });
  expect(() => f.store.db.exec("UPDATE operational_event SET action = 'inventory.equipment.update.v1'")).toThrow(/Append-only/);
  expect(() => f.store.db.exec('DELETE FROM operational_event')).toThrow(/Append-only/);
  expect(() => f.store.db.prepare(`INSERT INTO resource SELECT ?, epoch, id, kind, organization_id, public_label, version, archived FROM resource`).run(f.installation.datasetId)).toThrow(/FOREIGN KEY/);
  expect(() => f.store.db.exec('UPDATE resource_location SET latitude = 1, longitude = NULL')).toThrow(/CHECK/);
});

it('V01-T3-06 — atributo obrigatório, tipo, fração e faixa fictícia inclusiva', async () => {
  const f = await setup();
  for (const [value, status] of [[undefined, 400], [null, 422], ['60', 400], [1.5, 422], [0, 422], [201, 422]] as const) {
    const response = await f.call('POST', '/equipment', valid({ attributes: value === undefined ? {} : { regulatedSpeedLimitKmh: value } }));
    expect(response.statusCode, response.body).toBe(status);
  }
  expect(f.counts().resource).toBe(0); expect(f.counts().command_receipt).toBe(0);
  for (const value of [1, 200]) expect((await f.call('POST', '/equipment', valid({ attributes: { regulatedSpeedLimitKmh: value } }))).statusCode).toBe(201);
});

it('V01-T3-07 — unicidade normalizada, referências e criação concorrente', async () => {
  const f = await setup(); const first = valid({ serialNumber: ' radar-ab ' });
  expect((await f.call('POST', '/equipment', first)).statusCode).toBe(201);
  expect((await f.call('POST', '/equipment', valid({ serialNumber: 'RADAR-ab' }))).json().code).toBe('SERIAL_CONFLICT');
  // camera is now a valid category; an unknown code still exercises the same rejection invariant.
  for (const fields of [{ organizationId: randomUUID() }, { categoryCode: 'unknown_category' }, { categoryVersion: 2 }]) expect((await f.call('POST', '/equipment', valid(fields))).statusCode).toBe(422);
  const results = await raceInventory(f.path, f.headers, [valid({ serialNumber: 'CONCORRENTE' }), valid({ serialNumber: ' concorrente ' })]);
  expect(results.map(r => r.status).sort()).toEqual([201, 409]); expect(f.counts().resource).toBe(2); expect(f.revision()).toBe(2);
});

it('V01-T3-08 — localização, coordenadas, CEP/UF e proibição de regionId', async () => {
  const f = await setup();
  const good = await f.call('POST', '/equipment', valid());
  expect(equipment(good).registrationLocation).toMatchObject({ referenceType: 'base', postalCode: '01000000', latitude: null, longitude: null, regionId: null });
  for (const [change, status] of [[{ latitude: 1 }, 422], [{ latitude: 91, longitude: 1 }, 422], [{ uf: 'sp' }, 422],
    [{ postalCode: '01234' }, 422], [{ regionId: randomUUID() }, 400], [{ city: '   ' }, 422]] as const) {
    expect((await f.call('POST', '/equipment', valid({ registrationLocation: { ...location(), ...change } }))).statusCode).toBe(status);
  }
  const point = await f.call('POST', '/equipment', valid({ registrationLocation: { ...location(), referenceType: 'installation', latitude: -23, longitude: -46 } }));
  expect(point.statusCode).toBe(201); expect(equipment(point).operationalState).toBe('not_installed');
});

it('V01-T3-09 — três ramos de agenda no domínio Maintenance', async () => {
  const f = await setup();
  for (const status of ['dated', 'unknown', 'not_applicable']) {
    const response = await f.call('POST', '/equipment', valid({ initialMaintenance: maintenance(status) }));
    expect(response.statusCode, response.body).toBe(201);
    const value = equipment(response); expect(value.operationalState).toBe('not_installed'); expect(value.maintenance.requests).toHaveLength(1);
    expect(value.maintenance.requests[0]).toMatchObject({ status: 'open', version: 1, priority: 'high', causeCode: 'initial_preventive_check' });
    expect(value.maintenance.nextMaintenance).toEqual({ status, date: status === 'dated' ? '2028-02-29' : null,
      reason: status === 'not_applicable' ? 'Demonstração sem agenda aplicável' : null });
  }
  expect(f.counts().maintenance_request).toBe(3); expect(f.revision()).toBe(3);
});

it('V01-T3-10 — agenda incoerente ou estrutura inválida sem efeitos', async () => {
  const f = await setup();
  for (const [change, status] of [[{ dueDate: '2028-01-01' }, 400], [{ initialMaintenance: { reason: 'x', schedule: { status: 'unknown' } } }, 400],
    [{ initialMaintenance: { ...maintenance(), schedule: { status: 'dated' } } }, 422],
    [{ initialMaintenance: { ...maintenance(), schedule: { status: 'dated', dueDate: '2027-02-29' } } }, 422],
    [{ initialMaintenance: { ...maintenance(), schedule: { status: 'unknown', dueDate: '2028-01-01' } } }, 422],
    [{ initialMaintenance: { ...maintenance(), schedule: { status: 'not_applicable' } } }, 422],
    [{ initialMaintenance: { ...maintenance(), priority: 'automatic' } }, 422]] as const) {
    const response = await f.call('POST', '/equipment', valid(change)); expect(response.statusCode, response.body).toBe(status);
  }
  expect(Object.values(f.counts()).every(n => n === 0)).toBe(true); expect(f.revision()).toBe(0);
});

it('V01-T3-11 — rollback após cada write, recibo e falha adiada no commit', async () => {
  for (const table of ['resource', 'equipment', 'resource_location', 'current_state', 'maintenance_request', 'operational_event', 'command_receipt', 'commit']) {
    const f = await setup(), input = valid({ initialMaintenance: maintenance() });
    f.store.db.exec(table === 'commit'
      ? `CREATE TEMP TRIGGER fault AFTER INSERT ON command_receipt BEGIN INSERT INTO dataset VALUES ('${randomUUID()}', 'broken-commit', 'demo', 999); END`
      : `CREATE TEMP TRIGGER fault AFTER INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'test-only fault'); END`);
    const response = await f.call('POST', '/equipment', input); expect(response.statusCode).toBe(500);
    expect(Object.values(f.counts()).every(n => n === 0), table).toBe(true); expect(f.revision()).toBe(0); expect(f.store.db.inTransaction).toBe(false);
    f.store.db.exec('DROP TRIGGER temp.fault'); expect((await f.call('POST', '/equipment', input)).statusCode).toBe(201);
  }
});

it('V01-T3-12 — replay durável, corpo original, divergência e geração aposentada', async () => {
  const f = await setup(), input = valid({ initialMaintenance: maintenance('dated') });
  const first = await f.call('POST', '/equipment', input); expect(first.statusCode).toBe(201);
  await f.reopen(); const replay = await f.call('POST', '/equipment', input);
  expect(replay.statusCode).toBe(201); expect(replay.json()).toEqual(first.json()); expect(replay.headers['idempotency-replayed']).toBe('true');
  expect(f.counts().resource).toBe(1); expect(f.counts().maintenance_request).toBe(1); expect(f.revision()).toBe(1);
  expect((await f.call('POST', '/equipment', { ...input, brand: 'Outro' })).json().code).toBe('IDEMPOTENCY_CONFLICT');
  f.store.db.prepare('UPDATE dataset_grant SET can_write = 0 WHERE dataset_id = ?').run(OPERATIONAL_ID);
  expect((await f.call('POST', '/equipment', input)).statusCode).toBe(403);
  f.store.db.prepare('UPDATE dataset_grant SET can_write = 1 WHERE dataset_id = ?').run(OPERATIONAL_ID);
  transaction(f.store.db, () => {
    f.store.db.prepare("UPDATE dataset_epoch SET status = 'retired' WHERE dataset_id = ?").run(OPERATIONAL_ID);
    f.store.db.prepare("INSERT INTO dataset_epoch VALUES (?, 2, 'ready', 0)").run(OPERATIONAL_ID);
    f.store.db.prepare('UPDATE dataset SET active_epoch = 2 WHERE id = ?').run(OPERATIONAL_ID);
  });
  expect((await f.call('POST', '/equipment', input)).json().code).toBe('EPOCH_CONFLICT');
});

it('V01-T3-13 — edição concorrente real, replay antigo e no-op', async () => {
  const f = await setup(), created = equipment(await f.call('POST', '/equipment', valid()));
  const changes = [{ commandId: randomUUID(), expectedVersion: 1, brand: 'Concorrente A' }, { commandId: randomUUID(), expectedVersion: 1, brand: 'Concorrente B' }];
  const results = await raceInventory(f.path, f.headers, changes, created.id);
  expect(results.map(r => r.status).sort()).toEqual([200, 409]);
  const winnerIndex = results.findIndex(r => r.status === 200), winner = changes[winnerIndex]!;
  const current = equipment(await f.call('GET', `/equipment/${created.id}`)); expect(current.version).toBe(2);
  expect((await f.call('PATCH', `/equipment/${created.id}`, { commandId: randomUUID(), expectedVersion: 2, model: 'Mais recente' })).statusCode).toBe(200);
  const replay = await f.call('PATCH', `/equipment/${created.id}`, winner);
  expect(replay.headers['idempotency-replayed']).toBe('true'); expect(equipment(replay).version).toBe(2);
  const before = f.counts(), revision = f.revision();
  const noop = await f.call('PATCH', `/equipment/${created.id}`, { commandId: randomUUID(), expectedVersion: 3, model: 'Mais recente' });
  expect(noop.statusCode).toBe(200); expect(equipment(noop).version).toBe(3); expect(f.revision()).toBe(revision);
  expect(f.counts()).toEqual({ ...before, command_receipt: before.command_receipt! + 1 });
});

it('V01-T3-14 — PATCH cadastral não altera domínio e remove só base adicional', async () => {
  const f = await setup(), created = equipment(await f.call('POST', '/equipment', valid({ baseLocation: location(), initialMaintenance: maintenance() })));
  for (const change of [{ categoryCode: 'camera' }, { mobility: 'mobile' }, { initialState: 'operational' },
    { initialMaintenance: null }, { organizationId: ORGANIZATION_ID }, { regionId: randomUUID() }, {}]) {
    expect((await f.call('PATCH', `/equipment/${created.id}`, { commandId: randomUUID(), expectedVersion: 1, ...change })).statusCode).toBe(400);
  }
  const response = await f.call('PATCH', `/equipment/${created.id}`, { commandId: randomUUID(), expectedVersion: 1, baseLocation: null });
  expect(response.statusCode).toBe(200); expect(equipment(response).baseLocation).toBeNull();
  expect(equipment(response).registrationLocation).toEqual(created.registrationLocation); expect(equipment(response).maintenance).toEqual(created.maintenance);
  expect(f.counts().resource_location).toBe(1);
});

it('V01-T3-15 — leituras consistentes, ordenação binária e paginação estrita', async () => {
  const f = await setup(); for (const serialNumber of ['ZZ', 'AA', 'MM']) expect((await f.call('POST', '/equipment', valid({ serialNumber }))).statusCode).toBe(201);
  const page = await f.call('GET', '/equipment?page=2&pageSize=1');
  expect(page.json()).toMatchObject({ datasetId: OPERATIONAL_ID, epoch: 1, revision: 3, page: 2, pageSize: 1, total: 3 }); expect(page.json().items[0].serialNumber).toBe('MM');
  expect((await f.call('GET', '/equipment?page=5&pageSize=1')).json()).toMatchObject({ total: 3, items: [] });
  for (const [query, status] of [['page=0', 422], ['pageSize=201', 422], ['page=1.5', 400], ['page=abc', 400], ['page=9007199254740992', 422], ['q=AA', 400], ['page=1&page=2', 400]] as const) expect((await f.call('GET', `/equipment?${query}`)).statusCode).toBe(status);
  expect((await f.call('GET', '/equipment')).json().pageSize).toBe(50);
  expect((await f.call('GET', '/equipment?pageSize=200')).statusCode).toBe(200);
  const before = canonicalJson(f.counts()); await f.call('GET', '/catalog'); expect(canonicalJson(f.counts())).toBe(before);
});

it('T0003 segurança adicional — limite por sessão inclui mutações reais e replays', async () => {
  const f = await setup(), body = valid();
  for (let n = 0; n < 60; n++) expect((await f.call('POST', '/equipment', body)).statusCode).toBe(201);
  const limited = await f.call('POST', '/equipment', body);
  expect(limited.statusCode).toBe(429); expect(limited.headers['retry-after']).toBe('60');
  expect(f.counts().resource).toBe(1); expect(f.counts().command_receipt).toBe(1); expect(f.revision()).toBe(1);
});
