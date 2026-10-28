import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Store, transaction } from '../src/persistence/store.js';
import { computeSnapshotIndicators } from '../src/operations/snapshot.js';
import { createEquipment } from '../src/inventory/service.js';
import { OPERATIONAL_ID } from '../src/inventory/contract.js';
import { inventoryFixture, valid, location, base } from './support/inventory-fixture.js';
import { agentInput, equipmentInput } from './support/t0004-fixture.js';
import { demoFixture, generation } from './support/t0005-fixture.js';
import { ORIGIN, authorization } from './support/foundation-fixture.js';

const invFixtures: Awaited<ReturnType<typeof inventoryFixture>>[] = [];
const demoFixtures: Awaited<ReturnType<typeof demoFixture>>[] = [];

afterEach(async () => {
  for (const f of invFixtures.splice(0)) await f.cleanup();
  for (const f of demoFixtures.splice(0)) await f.cleanup();
});

async function setupOperational() {
  const f = await inventoryFixture(true);
  invFixtures.push(f);
  return f;
}

async function setupDemo() {
  const f = await demoFixture();
  demoFixtures.push(f);
  return f;
}

it('Critério 5 (V03 / R06) — Verificação exaustiva dos 11 casos normativos de disponibilidade, 33.33% e denominador zero', async () => {
  // 1. Individual verification of each of the 11 normative cases from docs/MVP_TECHNICAL_DESIGN.md (Section 3):
  // Case 1: operational + fresh -> eligible=1, available=1, operationalCount=1, availability=100
  expect(
    computeSnapshotIndicators([{ kind: 'equipment', operationalState: 'operational', communication: 'fresh' }]),
  ).toMatchObject({
    eligibleEquipment: 1,
    availableEquipment: 1,
    operationalCount: 1,
    communicationUnknownCount: 0,
    communicationStaleCount: 0,
    availability: 100,
    reason: null,
  });

  // Case 2: operational + not_applicable -> eligible=1, available=1, operationalCount=1, availability=100
  expect(
    computeSnapshotIndicators([{ kind: 'equipment', operationalState: 'operational', communication: 'not_applicable' }]),
  ).toMatchObject({
    eligibleEquipment: 1,
    availableEquipment: 1,
    operationalCount: 1,
    communicationUnknownCount: 0,
    communicationStaleCount: 0,
    availability: 100,
    reason: null,
  });

  // Case 3: operational + stale -> eligible=1, available=0, operationalCount=1, communicationStaleCount=1, availability=0
  expect(
    computeSnapshotIndicators([{ kind: 'equipment', operationalState: 'operational', communication: 'stale' }]),
  ).toMatchObject({
    eligibleEquipment: 1,
    availableEquipment: 0,
    operationalCount: 1,
    communicationUnknownCount: 0,
    communicationStaleCount: 1,
    availability: 0,
    reason: null,
  });

  // Case 4: operational + unknown -> eligible=1, available=0 (NOT confirmed available!), operationalCount=1, communicationUnknownCount=1, availability=0
  expect(
    computeSnapshotIndicators([{ kind: 'equipment', operationalState: 'operational', communication: 'unknown' }]),
  ).toMatchObject({
    eligibleEquipment: 1,
    availableEquipment: 0,
    operationalCount: 1,
    communicationUnknownCount: 1,
    communicationStaleCount: 0,
    availability: 0,
    reason: null,
  });

  // Case 5: malfunction -> eligible=1, available=0, operationalCount=0, availability=0
  expect(
    computeSnapshotIndicators([{ kind: 'equipment', operationalState: 'malfunction', communication: 'fresh' }]),
  ).toMatchObject({
    eligibleEquipment: 1,
    availableEquipment: 0,
    operationalCount: 0,
    availability: 0,
    reason: null,
  });

  // Case 6: maintenance -> eligible=1, available=0, operationalCount=0, availability=0
  expect(
    computeSnapshotIndicators([{ kind: 'equipment', operationalState: 'maintenance', communication: 'fresh' }]),
  ).toMatchObject({
    eligibleEquipment: 1,
    availableEquipment: 0,
    operationalCount: 0,
    availability: 0,
    reason: null,
  });

  // Case 7: disabled -> excluded from denominator (eligible=0, available=0, availability=null, reason=no_eligible_equipment)
  expect(
    computeSnapshotIndicators([{ kind: 'equipment', operationalState: 'disabled', communication: 'fresh' }]),
  ).toMatchObject({
    eligibleEquipment: 0,
    availableEquipment: 0,
    operationalCount: 0,
    availability: null,
    reason: 'no_eligible_equipment',
    byOperationalState: { disabled: 1 },
  });

  // Case 8: not_installed -> excluded from denominator (eligible=0, available=0, availability=null, reason=no_eligible_equipment)
  expect(
    computeSnapshotIndicators([{ kind: 'equipment', operationalState: 'not_installed', communication: 'unknown' }]),
  ).toMatchObject({
    eligibleEquipment: 0,
    availableEquipment: 0,
    operationalCount: 0,
    availability: null,
    reason: 'no_eligible_equipment',
    byOperationalState: { not_installed: 1 },
  });

  // Case 9: stolen -> excluded from denominator (eligible=0, available=0, availability=null, reason=no_eligible_equipment)
  expect(
    computeSnapshotIndicators([{ kind: 'equipment', operationalState: 'stolen', communication: 'stale' }]),
  ).toMatchObject({
    eligibleEquipment: 0,
    availableEquipment: 0,
    operationalCount: 0,
    availability: null,
    reason: 'no_eligible_equipment',
    byOperationalState: { stolen: 1 },
  });

  // Case 10: Agent -> never enters numerator or denominator
  expect(
    computeSnapshotIndicators([{ kind: 'agent', operationalState: null, communication: null, activity: 'available' }]),
  ).toMatchObject({
    totalResources: 1,
    equipmentCount: 0,
    agentCount: 1,
    eligibleEquipment: 0,
    availableEquipment: 0,
    operationalCount: 0,
    availability: null,
    reason: 'no_eligible_equipment',
    byActivity: { available: 1 },
  });

  // Case 11: Denominador zero (empty set or only excluded states + agents) -> availability=null, reason=no_eligible_equipment
  expect(computeSnapshotIndicators([])).toMatchObject({
    totalResources: 0,
    eligibleEquipment: 0,
    availableEquipment: 0,
    availability: null,
    reason: 'no_eligible_equipment',
  });

  // 2. Direct verification of Section 3 canonical example:
  // 2 operational (1 fresh, 1 stale), 1 malfunction, 1 disabled (+ not_installed, stolen, agent) => eligible=3, available=1, availability=33.33%
  const metrics = computeSnapshotIndicators([
    { kind: 'equipment', operationalState: 'operational', communication: 'fresh', latitude: -23.558, longitude: -46.648 },
    { kind: 'equipment', operationalState: 'operational', communication: 'stale', latitude: -23.558, longitude: -46.632 },
    { kind: 'equipment', operationalState: 'malfunction', communication: 'fresh', latitude: -23.542, longitude: -46.632 },
    { kind: 'equipment', operationalState: 'disabled', communication: 'fresh', latitude: -23.542, longitude: -46.648 },
    { kind: 'equipment', operationalState: 'not_installed', communication: 'unknown', latitude: null, longitude: null },
    { kind: 'equipment', operationalState: 'stolen', communication: 'stale', latitude: null, longitude: null },
    { kind: 'agent', operationalState: null, communication: null, activity: 'available', latitude: -23.558, longitude: -46.648 },
  ]);
  expect(metrics).toMatchObject({
    totalResources: 7,
    equipmentCount: 6,
    agentCount: 1,
    locatedCount: 5,
    unlocatedCount: 2,
    operationalCount: 2,
    communicationUnknownCount: 1,
    communicationStaleCount: 2,
    eligibleEquipment: 3,
    availableEquipment: 1,
    availability: 33.33,
    reason: null,
  });

  // 3. End-to-end SQLite + HTTP verification of all 10 resource/state combinations via GET D/operations/snapshot:
  // 4 operational (fresh, not_applicable, stale, unknown) + 1 malfunction + 1 maintenance + 1 disabled + 1 not_installed + 1 stolen + 1 Agent
  // => eligible = 6 (4 operational + 1 malfunction + 1 maintenance)
  // => available = 2 ( ONLY operational+fresh and operational+not_applicable; operational+stale and operational+unknown are NOT available)
  // => availability = 100 * 2 / 6 = 33.33%
  const f = await setupOperational();
  const createdIds: string[] = [];
  for (const serial of [
    'CAM-OP-FRESH',
    'CAM-OP-NA',
    'CAM-OP-STALE',
    'CAM-OP-UNKNOWN',
    'CAM-MALFUNCTION',
    'CAM-MAINTENANCE',
    'CAM-DISABLED',
    'CAM-NOT-INSTALLED',
    'CAM-STOLEN',
  ]) {
    const eq = (
      await f.call(
        'POST',
        '/equipment',
        equipmentInput('camera', {
          serialNumber: serial,
          initialState: 'not_installed',
          registrationLocation: { ...location(), referenceType: 'installation', latitude: -23.558, longitude: -46.648 },
        }),
      )
    ).json().equipment;
    createdIds.push(eq.id);
  }
  await f.call('POST', '/agents', agentInput({ enrollmentNumber: 'AG-OP-01' }));

  transaction(f.store.db, () => {
    const states: [string, string, string][] = [
      [createdIds[0]!, 'operational', 'fresh'],
      [createdIds[1]!, 'operational', 'not_applicable'],
      [createdIds[2]!, 'operational', 'stale'],
      [createdIds[3]!, 'operational', 'unknown'],
      [createdIds[4]!, 'malfunction', 'fresh'],
      [createdIds[5]!, 'maintenance', 'not_applicable'],
      [createdIds[6]!, 'disabled', 'fresh'],
      [createdIds[7]!, 'not_installed', 'unknown'],
      [createdIds[8]!, 'stolen', 'stale'],
    ];
    const stmt = f.store.db.prepare(
      'UPDATE current_state SET operational_state = ?, communication_state = ? WHERE resource_id = ?',
    );
    for (const [id, opState, commState] of states) {
      stmt.run(opState, commState, id);
    }
  });

  const snapRes = await f.call('GET', '/operations/snapshot');
  expect(snapRes.statusCode, snapRes.body).toBe(200);
  expect(snapRes.headers['cache-control']).toBe('no-store');
  const snap = snapRes.json();
  expect(snap.indicators).toMatchObject({
    totalResources: 10,
    equipmentCount: 9,
    agentCount: 1,
    operationalCount: 4,
    communicationUnknownCount: 2,
    communicationStaleCount: 2,
    eligibleEquipment: 6,
    availableEquipment: 2,
    availability: 33.33,
    reason: null,
    byOperationalState: {
      operational: 4,
      malfunction: 1,
      maintenance: 1,
      disabled: 1,
      not_installed: 1,
      stolen: 1,
    },
    byCommunication: {
      fresh: 3,
      not_applicable: 2,
      stale: 2,
      unknown: 2,
    },
  });
});

it('Critério 6 e 7 — Filtros combinados AND/OR (R05) e recursos sem coordenadas com/sem bbox', async () => {
  const f = await setupOperational();

  // Create 3 equipment and 2 agents across regions and with/without coordinates
  // E1: camera, criticality 5, operational, REG-CENTRO (-23.558, -46.648)
  await f.call(
    'POST',
    '/equipment',
    equipmentInput('camera', {
      serialNumber: 'EQ-CAM-CENTRO',
      criticality: 5,
      initialState: 'operational',
      initialStateReason: 'Operacional no centro',
      registrationLocation: { ...location(), referenceType: 'installation', latitude: -23.558, longitude: -46.648 },
    }),
  );
  // E2: taxi, criticality 3, operational, REG-LESTE (-23.558, -46.632)
  await f.call(
    'POST',
    '/equipment',
    equipmentInput('taxi', {
      serialNumber: 'EQ-TAXI-LESTE',
      criticality: 3,
      initialState: 'operational',
      initialStateReason: 'Operacional no leste',
      registrationLocation: { ...location(), referenceType: 'base', latitude: -23.558, longitude: -46.632 },
    }),
  );
  // E3: fixed_speed_radar, criticality 5, not_installed, NO coordinates (unassigned)
  await f.call(
    'POST',
    '/equipment',
    valid({
      serialNumber: 'EQ-RAD-NOCOORD',
      criticality: 5,
      registrationLocation: { ...location(), latitude: null, longitude: null },
    }),
  );
  // A1: agent, REG-CENTRO (-23.558, -46.648)
  await f.call(
    'POST',
    '/agents',
    agentInput({
      enrollmentNumber: 'AG-CENTRO',
      registrationLocation: { ...location(), referenceType: 'institutional', latitude: -23.558, longitude: -46.648 },
    }),
  );
  // A2: agent, NO coordinates (unassigned)
  await f.call(
    'POST',
    '/agents',
    agentInput({
      enrollmentNumber: 'AG-NOCOORD',
      registrationLocation: { ...location(), referenceType: 'institutional', latitude: null, longitude: null },
    }),
  );

  // 1. Without bbox: all 5 resources (including 2 without coordinates) are returned.
  // Because no telemetry has arrived yet (communication = unknown), operational equipment are physically operational (operationalCount = 2, eligibleEquipment = 2)
  // but NOT confirmed available (availableEquipment = 0, availability = 0).
  const allSnap = (await f.call('GET', '/operations/snapshot')).json();
  expect(allSnap.totalFiltered).toBe(5);
  expect(allSnap.indicators).toMatchObject({
    totalResources: 5,
    locatedCount: 3,
    unlocatedCount: 2,
    operationalCount: 2,
    communicationUnknownCount: 3,
    eligibleEquipment: 2,
    availableEquipment: 0,
    availability: 0,
  });
  expect(allSnap.resources.filter((r: any) => r.positionKind === 'none')).toHaveLength(2);

  // 2. With bbox covering municipality: unlocated resources are excluded
  const bboxSnap = (await f.call('GET', '/operations/snapshot?bbox=-46.66,-23.57,-46.62,-23.53')).json();
  expect(bboxSnap.totalFiltered).toBe(3);
  expect(bboxSnap.indicators.locatedCount).toBe(3);
  expect(bboxSnap.indicators.unlocatedCount).toBe(0);
  expect(bboxSnap.resources.map((r: any) => r.publicLabel)).toEqual(['AG-CENTRO', 'EQ-CAM-CENTRO', 'EQ-TAXI-LESTE']);

  // 3. Clearing bbox restores unlocated resources
  const restoredSnap = (await f.call('GET', '/operations/snapshot')).json();
  expect(restoredSnap.totalFiltered).toBe(5);
  expect(restoredSnap.indicators.unlocatedCount).toBe(2);

  // 4. OR within same field: categoryCode=camera,fixed_speed_radar
  const orCategory = (await f.call('GET', '/operations/snapshot?categoryCode=camera,fixed_speed_radar')).json();
  expect(orCategory.resources.map((r: any) => r.publicLabel)).toEqual(['EQ-CAM-CENTRO', 'EQ-RAD-NOCOORD']);

  // 5. AND across fields + OR within field:
  // kind=equipment AND criticality=5 AND regionId=REG-CENTRO,unassigned
  const andOr = (
    await f.call(
      'GET',
      '/operations/snapshot?kind=equipment&criticality=5&regionId=10000000-0000-4000-8000-000000000101,unassigned',
    )
  ).json();
  expect(andOr.resources.map((r: any) => r.publicLabel)).toEqual(['EQ-CAM-CENTRO', 'EQ-RAD-NOCOORD']);
  expect(andOr.indicators).toMatchObject({
    totalResources: 2,
    operationalCount: 1,
    communicationUnknownCount: 2,
    eligibleEquipment: 1,
    availableEquipment: 0,
    availability: 0,
  });

  // Narrowing further with operationalState=not_installed leaves only EQ-RAD-NOCOORD -> eligible=0 -> availability=null
  const onlyNotInstalled = (
    await f.call('GET', '/operations/snapshot?kind=equipment&criticality=5&operationalState=not_installed')
  ).json();
  expect(onlyNotInstalled.resources.map((r: any) => r.publicLabel)).toEqual(['EQ-RAD-NOCOORD']);
  expect(onlyNotInstalled.indicators).toMatchObject({
    totalResources: 1,
    eligibleEquipment: 0,
    availableEquipment: 0,
    availability: null,
    reason: 'no_eligible_equipment',
  });

  // 6. Invalid filter queries are rejected with 400 or 422
  for (const [query, expectedStatus] of [
    ['unknownParam=1', 400],
    ['kind=', 400],
    ['kind=drone', 422],
    ['categoryCode=unknown_cat', 422],
    ['operationalState=broken', 422],
    ['activity=sleeping', 422],
    ['criticality=abc', 400],
    ['criticality=0', 422],
    ['criticality=6', 422],
    ['regionId=not-a-uuid', 422],
    ['bbox=1,2,3', 400],
    ['bbox=-46.62,-23.55,-46.65,-23.54', 422],
    ['bbox=-200,-23,-46,-22', 422],
  ] as const) {
    const res = await f.call('GET', `/operations/snapshot?${query}`);
    expect(res.statusCode, `${query}: ${res.body}`).toBe(expectedStatus);
  }
});

it('Critério 4 e Gate J01 — Snapshot consistente na mesma revisão, baseline T0005 20/6, regiões e segurança', async () => {
  // 1. Gate J01 on demo dataset with T0005 20/6 baseline
  const demo = await setupDemo();
  const gen = await demo.generate(generation());
  expect(gen.statusCode).toBe(201);

  const regionsRes = await demo.app.inject({ method: 'GET', url: `${demo.path}/regions`, headers: demo.headers });
  expect(regionsRes.statusCode).toBe(200);
  const regionsBody = regionsRes.json();
  expect(regionsBody.regionVersion).toBe(1);
  expect(regionsBody.revision).toBe(1);
  expect(regionsBody.items).toHaveLength(5);

  const snapRes = await demo.app.inject({ method: 'GET', url: `${demo.path}/operations/snapshot`, headers: demo.headers });
  expect(snapRes.statusCode).toBe(200);
  const snapBody = snapRes.json();
  expect(snapBody).toMatchObject({
    datasetId: demo.datasetId,
    epoch: 1,
    revision: 1,
    dataNow: '2026-10-24T12:00:00.000Z',
    regionVersion: 1,
    truncated: false,
    totalFiltered: 26,
    maxResources: 500,
    indicators: {
      totalResources: 26,
      equipmentCount: 20,
      agentCount: 6,
      locatedCount: 20,
      unlocatedCount: 6,
      eligibleEquipment: 0,
      availableEquipment: 0,
      availability: null,
      reason: 'no_eligible_equipment',
    },
  });

  // Check regionSummary sums to 26 resources (20 located in municipal regions + 6 in UNASSIGNED; REG-ZONA-EXPANSAO has 0)
  const totalInSummary = snapBody.regionSummary.reduce((sum: number, r: any) => sum + r.totalResources, 0);
  expect(totalInSummary).toBe(26);
  const unassignedSummary = snapBody.regionSummary.find((r: any) => r.regionId === null);
  expect(unassignedSummary.totalResources).toBe(6);
  const zonaExpansao = snapBody.regionSummary.find((r: any) => r.code === 'REG-ZONA-EXPANSAO');
  expect(zonaExpansao).toMatchObject({
    totalResources: 0,
    availability: null,
    reason: 'no_eligible_equipment',
  });

  // 2. Transactional snapshot consistency under concurrent write
  const op = await setupOperational();
  await op.call('POST', '/equipment', valid({ serialNumber: 'SNAP-CONSISTENT-01' }));
  const db = op.store.db;
  const otherStore = new Store(op.path);
  const originalPrepare = db.prepare.bind(db);
  let concurrentWriteExecuted = false;
  try {
    db.prepare = ((sql: string) => {
      if (!concurrentWriteExecuted && sql.includes('FROM resource_location')) {
        concurrentWriteExecuted = true;
        createEquipment(
          authorization(otherStore),
          { token: op.cookie.slice('ignis_session='.length), csrf: op.csrf, origin: ORIGIN },
          OPERATIONAL_ID,
          1,
          valid({ serialNumber: 'SNAP-CONSISTENT-02' }),
        );
      }
      return originalPrepare(sql);
    }) as typeof db.prepare;

    const firstSnap = (await op.call('GET', '/operations/snapshot')).json();
    expect(concurrentWriteExecuted).toBe(true);
    expect(firstSnap.revision).toBe(1);
    expect(firstSnap.totalFiltered).toBe(1);
    expect(firstSnap.indicators.totalResources).toBe(1);

    const secondSnap = (await op.call('GET', '/operations/snapshot')).json();
    expect(secondSnap.revision).toBe(2);
    expect(secondSnap.totalFiltered).toBe(2);
    expect(secondSnap.indicators.totalResources).toBe(2);
  } finally {
    db.prepare = originalPrepare;
    otherStore.close();
  }

  // 3. Security, authentication, grant and epoch guards on /regions and /operations/snapshot
  for (const route of ['/regions', '/operations/snapshot']) {
    expect((await op.app.inject({ url: `${base}${route}` })).statusCode).toBe(401);
    expect((await op.app.inject({ url: `/api/v1/datasets/${randomUUID()}/epochs/1${route}`, headers: op.headers })).statusCode).toBe(403);
    expect((await op.app.inject({ url: `${base.replace('/epochs/1', '/epochs/2')}${route}`, headers: op.headers })).statusCode).toBe(409);
  }
  expect((await op.call('GET', '/regions?extra=1')).statusCode).toBe(400);
});

it('Critério 4 e 5 — Truncamento em 500 recursos preserva indicadores e regionSummary sobre o total filtrado completo', async () => {
  const f = await setupOperational();
  transaction(f.store.db, () => {
    const insertRes = f.store.db.prepare(
      "INSERT INTO resource(dataset_id, epoch, id, kind, organization_id, public_label, version) VALUES (?, 1, ?, 'equipment', '10000000-0000-4000-8000-000000000004', ?, 1)",
    );
    const insertEq = f.store.db.prepare(
      "INSERT INTO equipment VALUES (?, 1, ?, 'camera', 1, ?, 'IGNIS', 'Cam', 3, 'fixed', '{\"cameraType\":\"ptz\"}')",
    );
    const insertLoc = f.store.db.prepare(
      `INSERT INTO resource_location(dataset_id, epoch, resource_id, role, reference_type, postal_code, neighborhood, city, uf, address, reference, latitude, longitude, region_id)
       VALUES (?, 1, ?, 'registration', 'installation', '01001000', 'Centro', 'Cidade', 'SP', 'Av', 'Ref', -23.558, -46.648, '10000000-0000-4000-8000-000000000101')`,
    );
    const insertState = f.store.db.prepare(
      "INSERT INTO current_state(dataset_id, epoch, resource_id, operational_state, version, communication_state) VALUES (?, 1, ?, 'operational', 1, 'fresh')",
    );
    for (let i = 1; i <= 505; i++) {
      const id = `40000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      const serial = `BULK-CAM-${String(i).padStart(4, '0')}`;
      insertRes.run(OPERATIONAL_ID, id, serial);
      insertEq.run(OPERATIONAL_ID, id, serial);
      insertLoc.run(OPERATIONAL_ID, id);
      insertState.run(OPERATIONAL_ID, id);
    }
    f.store.db.prepare('UPDATE dataset_epoch SET revision = 1 WHERE dataset_id = ? AND epoch = 1').run(OPERATIONAL_ID);
  });

  const snap = (await f.call('GET', '/operations/snapshot')).json();
  expect(snap.truncated).toBe(true);
  expect(snap.totalFiltered).toBe(505);
  expect(snap.maxResources).toBe(500);
  expect(snap.resources).toHaveLength(500);
  expect(snap.indicators).toMatchObject({
    totalResources: 505,
    equipmentCount: 505,
    locatedCount: 505,
    eligibleEquipment: 505,
    availableEquipment: 505,
    availability: 100,
    reason: null,
  });
  const centro = snap.regionSummary.find((r: any) => r.code === 'REG-CENTRO');
  expect(centro.totalResources).toBe(505);
});
