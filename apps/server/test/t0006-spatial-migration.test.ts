import { afterEach, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { Store, SCHEMA_VERSION, transaction } from '../src/persistence/store.js';
import {
  REGIONS,
  pointInPolygon,
  pointOnSegment,
  classifyPoint,
  classifyPointInDataset,
} from '../src/operations/regions.js';
import type { RegionGeometry } from '../src/operations/regions.js';
import { prepareOperational } from '../src/inventory/prepare.js';
import { OPERATIONAL_ID } from '../src/inventory/contract.js';
import { createEquipment } from '../src/inventory/service.js';
import { createAgent } from '../src/inventory/agents.js';
import { generateDemo, readDemo } from '../src/demo/service.js';
import { authorization, sessionFor } from './support/foundation-fixture.js';
import { valid, location } from './support/inventory-fixture.js';
import { agentInput } from './support/t0004-fixture.js';
import { generation } from './support/t0005-fixture.js';

const directories: { store: Store; directory: string }[] = [];

afterEach(() => {
  for (const entry of directories.splice(0)) {
    entry.store.close();
    rmSync(entry.directory, { recursive: true, force: true });
  }
});

function createSchema4PopulatedFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ignis-t0006-schema4-'));
  const path = join(directory, 'schema4.sqlite');
  const store = new Store(path, true);
  directories.push({ store, directory });

  const migrationFiles = [
    '0001-foundation.sql',
    '0002-inventory.sql',
    '0003-heterogeneous-inventory.sql',
    '0004-demo-baseline.sql',
  ];

  const actorId = `operator:${randomUUID()}`;
  const demoDatasetId = randomUUID();

  transaction(store.db, () => {
    store.db.exec('CREATE TABLE schema_migration(version INTEGER PRIMARY KEY NOT NULL, checksum TEXT NOT NULL)');
    for (const [index, file] of migrationFiles.entries()) {
      const sql = readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
      store.db.exec(sql);
      const checksum = createHash('sha256').update(sql).digest('hex');
      store.db.prepare('INSERT INTO schema_migration(version, checksum) VALUES (?, ?)').run(index + 1, checksum);
    }
    store.db.pragma('user_version = 4');

    store.db.prepare("INSERT INTO actor(id, kind, local_key) VALUES (?, 'operator', 'local-operator')").run(actorId);
    store.db.prepare("INSERT INTO dataset(id, code, kind, active_epoch) VALUES (?, 'local-demo', 'demo', 1)").run(demoDatasetId);
    store.db.prepare("INSERT INTO dataset_epoch(dataset_id, epoch, status, revision) VALUES (?, 1, 'ready', 0)").run(demoDatasetId);
    store.db.prepare('INSERT INTO dataset_grant(dataset_id, actor_id, can_write) VALUES (?, ?, 1)').run(demoDatasetId, actorId);

    store.db.prepare("INSERT INTO dataset(id, code, kind, active_epoch) VALUES (?, 'local-operational', 'operational', 1)").run(OPERATIONAL_ID);
    store.db.prepare("INSERT INTO dataset_epoch(dataset_id, epoch, status, revision) VALUES (?, 1, 'ready', 0)").run(OPERATIONAL_ID);
    store.db.prepare('INSERT INTO dataset_grant(dataset_id, actor_id, can_write) VALUES (?, ?, 1)').run(OPERATIONAL_ID, actorId);
    store.db
      .prepare("INSERT INTO organization VALUES (?, 1, '10000000-0000-4000-8000-000000000004', 'ORG_LOCAL', 'Órgão municipal fictício')")
      .run(OPERATIONAL_ID);
    store.db
      .prepare("INSERT INTO organization VALUES (?, 1, '10000000-0000-4000-8000-000000000004', 'ORG_LOCAL', 'Órgão municipal fictício')")
      .run(demoDatasetId);

    // Insert schema 4 operational resources: one located inside REG-CENTRO, one without coordinates
    const eqLocatedId = '30000000-0000-4000-8000-000000000001';
    const eqUnlocatedId = '30000000-0000-4000-8000-000000000002';
    store.db
      .prepare("INSERT INTO resource(dataset_id, epoch, id, kind, organization_id, public_label, version) VALUES (?, 1, ?, 'equipment', '10000000-0000-4000-8000-000000000004', 'RAD-S4-01', 1)")
      .run(OPERATIONAL_ID, eqLocatedId);
    store.db
      .prepare("INSERT INTO equipment VALUES (?, 1, ?, 'fixed_speed_radar', 1, 'RAD-S4-01', 'Marca', 'Modelo', 4, 'fixed', '{\"regulatedSpeedLimitKmh\":60}')")
      .run(OPERATIONAL_ID, eqLocatedId);
    store.db
      .prepare(
        `INSERT INTO resource_location(dataset_id, epoch, resource_id, role, reference_type, postal_code, neighborhood, city, uf, address, reference, latitude, longitude)
         VALUES (?, 1, ?, 'registration', 'installation', '01001000', 'Centro', 'Cidade', 'SP', 'Av 1', 'Ref 1', -23.558, -46.648)`,
      )
      .run(OPERATIONAL_ID, eqLocatedId);
    store.db
      .prepare("INSERT INTO current_state(dataset_id, epoch, resource_id, operational_state, version) VALUES (?, 1, ?, 'not_installed', 1)")
      .run(OPERATIONAL_ID, eqLocatedId);

    store.db
      .prepare("INSERT INTO resource(dataset_id, epoch, id, kind, organization_id, public_label, version) VALUES (?, 1, ?, 'equipment', '10000000-0000-4000-8000-000000000004', 'RAD-S4-02', 1)")
      .run(OPERATIONAL_ID, eqUnlocatedId);
    store.db
      .prepare("INSERT INTO equipment VALUES (?, 1, ?, 'fixed_speed_radar', 1, 'RAD-S4-02', 'Marca', 'Modelo', 2, 'fixed', '{\"regulatedSpeedLimitKmh\":80}')")
      .run(OPERATIONAL_ID, eqUnlocatedId);
    store.db
      .prepare(
        `INSERT INTO resource_location(dataset_id, epoch, resource_id, role, reference_type, postal_code, neighborhood, city, uf, address, reference, latitude, longitude)
         VALUES (?, 1, ?, 'registration', 'base', '01001000', 'Centro', 'Cidade', 'SP', 'Av 2', 'Ref 2', NULL, NULL)`,
      )
      .run(OPERATIONAL_ID, eqUnlocatedId);
    store.db
      .prepare("INSERT INTO current_state(dataset_id, epoch, resource_id, operational_state, version) VALUES (?, 1, ?, 'not_installed', 1)")
      .run(OPERATIONAL_ID, eqUnlocatedId);
  });

  return { directory, path, store, actorId, demoDatasetId };
}

it('Critério 1 e 2 — Migration 0005 em banco vazio e upgrade de schema 4 populado com backup e integridade', () => {
  const emptyDir = mkdtempSync(join(tmpdir(), 'ignis-t0006-empty-'));
  const emptyStore = new Store(join(emptyDir, 'empty.sqlite'), true);
  directories.push({ store: emptyStore, directory: emptyDir });

  const install = emptyStore.migrate();
  expect(emptyStore.ready()).toBe(true);
  expect(emptyStore.db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
  expect(SCHEMA_VERSION).toBe(7);
  expect(emptyStore.db.pragma('foreign_key_check')).toEqual([]);
  expect(emptyStore.db.pragma('integrity_check', { simple: true })).toBe('ok');

  const seededRegions = emptyStore.db
    .prepare('SELECT id, code, version FROM region WHERE dataset_id = ? AND epoch = ? ORDER BY code COLLATE BINARY')
    .all(install.datasetId, install.epoch) as { id: string; code: string; version: number }[];
  expect(seededRegions).toEqual(REGIONS.map(r => ({ id: r.id, code: r.code, version: 1 })));

  // Upgrade from populated schema 4 DB + rollback fault test
  const f = createSchema4PopulatedFixture();
  expect(f.store.db.pragma('user_version', { simple: true })).toBe(4);

  f.store.db.exec(
    "CREATE TEMP TRIGGER t6_migration_fault AFTER INSERT ON schema_migration WHEN NEW.version = 5 BEGIN SELECT RAISE(ABORT, 'simulated-t6-fault'); END",
  );
  expect(() => f.store.migrate()).toThrow(/simulated-t6-fault/);
  expect(f.store.db.pragma('user_version', { simple: true })).toBe(4);
  expect(f.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='region'").get()).toBeUndefined();

  f.store.db.exec('DROP TRIGGER temp.t6_migration_fault');
  f.store.migrate();
  expect(f.store.ready()).toBe(true);
  expect(f.store.db.pragma('user_version', { simple: true })).toBe(7);
  expect(f.store.db.pragma('foreign_key_check')).toEqual([]);

  const backups = readdirSync(f.directory).filter(name => name.includes('.schema4-') && name.endsWith('.backup'));
  expect(backups.length).toBeGreaterThanOrEqual(1);
  const backupDb = new Database(join(f.directory, backups[0]!), { readonly: true });
  try {
    expect(backupDb.pragma('user_version', { simple: true })).toBe(4);
    expect(backupDb.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(backupDb.pragma('foreign_key_check')).toEqual([]);
  } finally {
    backupDb.close();
  }

  // Verify backfilled region_id on upgraded schema 4 records
  const upgradedLocs = f.store.db
    .prepare('SELECT resource_id, region_id FROM resource_location WHERE dataset_id = ? AND epoch = 1 ORDER BY resource_id')
    .all(OPERATIONAL_ID) as { resource_id: string; region_id: string | null }[];
  expect(upgradedLocs).toEqual([
    { resource_id: '30000000-0000-4000-8000-000000000001', region_id: '10000000-0000-4000-8000-000000000101' },
    { resource_id: '30000000-0000-4000-8000-000000000002', region_id: null },
  ]);

  // Verify T0005 baseline generation and manifest/event immutability on schema 5
  const auth = authorization(f.store);
  const creds = sessionFor(f.store, f.actorId);
  const genResult = generateDemo(auth, creds, f.demoDatasetId, 1, generation());
  expect(genResult.status).toBe(201);
  const demoRead = readDemo(auth, creds, f.demoDatasetId, 1);
  expect(demoRead.manifest).toMatchObject({
    manifestVersion: 1,
    projectionVersion: 1,
    regionVersion: null,
    counts: { resources: 26, equipment: 20, agents: 6, missingCoordinates: 6, completePairs: 20 },
  });

  // Historical baseline creation events in operational_event preserve regionId: null (matching manifest.regionVersion = null)
  const storedEvents = f.store.db
    .prepare('SELECT changes_json FROM operational_event WHERE dataset_id = ? AND epoch = 1 ORDER BY ordinal')
    .all(f.demoDatasetId) as { changes_json: string }[];
  expect(storedEvents).toHaveLength(26);
  for (const ev of storedEvents) {
    const parsed = JSON.parse(ev.changes_json);
    const regChange = parsed.changes.find((c: { fieldPath: string }) => c.fieldPath === 'registrationLocation');
    expect(regChange.after.regionId).toBeNull();
  }

  // Meanwhile, current spatial projection in resource_location has classified region_id for all 20 located resources
  const demoLocs = f.store.db
    .prepare('SELECT latitude, longitude, region_id FROM resource_location WHERE dataset_id = ? AND epoch = 1')
    .all(f.demoDatasetId) as { latitude: number | null; longitude: number | null; region_id: string | null }[];
  expect(demoLocs).toHaveLength(26);
  expect(demoLocs.filter(l => l.latitude === null && l.longitude === null && l.region_id === null)).toHaveLength(6);
  expect(demoLocs.filter(l => l.latitude !== null && l.longitude !== null && l.region_id !== null)).toHaveLength(20);
});

it('Critério 3 (V02 espacial) — Classificação determinística: interior, fronteira (desempate por code), exterior, null e (0,0)', () => {
  // 1. Interior of each of the 5 canonical regions
  expect(classifyPoint(-23.558, -46.648)).toBe('10000000-0000-4000-8000-000000000101'); // REG-CENTRO
  expect(classifyPoint(-23.558, -46.632)).toBe('10000000-0000-4000-8000-000000000102'); // REG-LESTE
  expect(classifyPoint(-23.542, -46.632)).toBe('10000000-0000-4000-8000-000000000103'); // REG-NORTE
  expect(classifyPoint(-23.542, -46.648)).toBe('10000000-0000-4000-8000-000000000104'); // REG-OESTE
  expect(classifyPoint(-23.55, -46.662)).toBe('10000000-0000-4000-8000-000000000105'); // REG-ZONA-EXPANSAO

  // 2. Boundary points and deterministic tie-breaking by smallest region code (COLLATE BINARY)
  // Shared vertical border (-46.64, -23.558) between REG-CENTRO and REG-LESTE -> REG-CENTRO wins
  expect(classifyPoint(-23.558, -46.64)).toBe('10000000-0000-4000-8000-000000000101');
  // Shared horizontal border (-46.632, -23.55) between REG-LESTE and REG-NORTE -> REG-LESTE wins
  expect(classifyPoint(-23.55, -46.632)).toBe('10000000-0000-4000-8000-000000000102');
  // Shared vertical border (-46.64, -23.542) between REG-NORTE and REG-OESTE -> REG-NORTE wins
  expect(classifyPoint(-23.542, -46.64)).toBe('10000000-0000-4000-8000-000000000103');
  // Shared horizontal border (-46.648, -23.55) between REG-CENTRO and REG-OESTE -> REG-CENTRO wins
  expect(classifyPoint(-23.55, -46.648)).toBe('10000000-0000-4000-8000-000000000101');
  // Center vertex (-46.64, -23.55) shared by all 4 regions -> REG-CENTRO wins
  expect(classifyPoint(-23.55, -46.64)).toBe('10000000-0000-4000-8000-000000000101');

  // 3. Exterior points -> unassigned (null)
  expect(classifyPoint(-23.0, -46.0)).toBeNull();
  expect(classifyPoint(-23.55, -46.6555)).toBeNull(); // corridor between REG-CENTRO/OESTE and REG-ZONA-EXPANSAO
  expect(classifyPoint(0, 0)).toBeNull(); // (0,0) classified as normal point outside municipality, never a sentinel

  // 4. Missing coordinates -> unassigned (null)
  expect(classifyPoint(null, null)).toBeNull();
  expect(classifyPoint(undefined, undefined)).toBeNull();

  // 5. Polygon with interior hole and MultiPolygon geometry
  const donut: RegionGeometry = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      [
        [3, 3],
        [7, 3],
        [7, 7],
        [3, 7],
        [3, 3],
      ],
    ],
  };
  expect(pointInPolygon(2, 2, donut)).toBe(true); // inside outer ring, outside hole
  expect(pointInPolygon(5, 5, donut)).toBe(false); // strictly inside hole
  expect(pointInPolygon(3, 5, donut)).toBe(true); // on hole boundary (inclusive)
  expect(pointOnSegment(5, 0, 0, 0, 10, 0)).toBe(true);

  const multi: RegionGeometry = {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0],
        ],
      ],
      [
        [
          [5, 5],
          [7, 5],
          [7, 7],
          [5, 7],
          [5, 5],
        ],
      ],
    ],
  };
  expect(pointInPolygon(1, 1, multi)).toBe(true);
  expect(pointInPolygon(6, 6, multi)).toBe(true);
  expect(pointInPolygon(3.5, 3.5, multi)).toBe(false);
});

it('Critério 2 e 3 — Persistência SQLite de regionId em Equipment/Agent, FKs compostas e imutabilidade de region', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ignis-t0006-domain-'));
  const store = new Store(join(dir, 'domain.sqlite'), true);
  directories.push({ store, directory: dir });
  const install = store.migrate();
  prepareOperational(store);

  const auth = authorization(store);
  const creds = sessionFor(store, install.actorId);

  // Create equipment inside REG-NORTE (-23.542, -46.632)
  const eqNorte = createEquipment(
    auth,
    creds,
    OPERATIONAL_ID,
    1,
    valid({
      serialNumber: 'RAD-NORTE-01',
      registrationLocation: { ...location(), referenceType: 'installation', latitude: -23.542, longitude: -46.632 },
    }),
  );
  expect(eqNorte.status).toBe(201);
  const eqNorteBody = eqNorte.body as { equipment: { id: string; registrationLocation: { regionId: string | null } } };
  expect(eqNorteBody.equipment.registrationLocation.regionId).toBe(
    '10000000-0000-4000-8000-000000000103',
  );

  // Create agent on shared boundary between REG-CENTRO and REG-LESTE (-23.558, -46.64) -> REG-CENTRO
  const agBorder = createAgent(
    auth,
    creds,
    OPERATIONAL_ID,
    1,
    agentInput({
      enrollmentNumber: 'AG-BORDER-01',
      registrationLocation: { ...location(), referenceType: 'institutional', latitude: -23.558, longitude: -46.64 },
    }),
  );
  expect(agBorder.status).toBe(201);
  const agBorderBody = agBorder.body as { agent: { id: string; registrationLocation: { regionId: string | null } } };
  expect(agBorderBody.agent.registrationLocation.regionId).toBe(
    '10000000-0000-4000-8000-000000000101',
  );

  // Create equipment without coordinates -> regionId is null
  const eqNoCoords = createEquipment(
    auth,
    creds,
    OPERATIONAL_ID,
    1,
    valid({
      serialNumber: 'RAD-NOCOORD-01',
      registrationLocation: { ...location(), latitude: null, longitude: null },
    }),
  );
  expect(eqNoCoords.status).toBe(201);
  const eqNoCoordsBody = eqNoCoords.body as { equipment: { id: string; registrationLocation: { regionId: string | null } } };
  expect(eqNoCoordsBody.equipment.registrationLocation.regionId).toBeNull();

  // Verify classifyPointInDataset matches SQLite region table
  expect(classifyPointInDataset(store.db, OPERATIONAL_ID, 1, -23.542, -46.648)).toBe(
    '10000000-0000-4000-8000-000000000104',
  );

  // Immutability of region table and CHECK/FK constraints on resource_location.region_id
  expect(() => store.db.exec("UPDATE region SET name = 'Alterada'")).toThrow(/Immutable region/);
  expect(() => store.db.exec('DELETE FROM region')).toThrow(/Immutable region/);
  expect(() =>
    store.db
      .prepare('UPDATE resource_location SET region_id = ? WHERE resource_id = ?')
      .run('10000000-0000-4000-8000-000000000101', eqNoCoordsBody.equipment.id),
  ).toThrow(/CHECK/);
  expect(() =>
    store.db
      .prepare('UPDATE resource_location SET region_id = ? WHERE resource_id = ?')
      .run(randomUUID(), eqNorteBody.equipment.id),
  ).toThrow(/FOREIGN KEY/);
});
