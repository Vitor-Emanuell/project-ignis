/**
 * PROJECT IGNIS — T0007 / PKG-06
 * Two-Phase Telemetry Pipeline and Projections Verification Suite (GATE-01, GATE-02, GATE-03).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import Database from 'better-sqlite3';

import { Store } from '../src/persistence/store.js';
import { AppError } from '../src/errors.js';
import { generateDemo } from '../src/demo/service.js';
import { authorization, sessionFor } from './support/foundation-fixture.js';
import { generation } from './support/t0005-fixture.js';
import {
  SettableTimeProvider,
  TrustedClockService,
  TelemetryAuthService,
  TelemetryBindingService,
  TelemetryProfileValidator,
  CanonicalTelemetryIngestService,
  DefaultTelemetryPipelineHook,
  assertProjectedStateConsistent,
  type IngestTelemetryInput,
  type TelemetryPipelineHook,
} from '../src/domain/telemetry/index.js';

type Row = Record<string, string | number | null>;
const BASE_TIME = Date.parse('2026-10-26T12:00:00.000Z');
const fixtures: { directory: string; store: Store }[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const f of fixtures.splice(0)) {
    try {
      f.store.close();
    } catch {
      // ignore
    }
    const target = resolve(f.directory);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('ignis-t0007-pipe-')) {
      throw new Error('Temporary fixture cleanup outside allocated directory');
    }
    try {
      rmSync(target, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

function insert(db: Database.Database, table: string, row: Row) {
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(
    ...Object.values(row),
  );
}

function expectAppError(fn: () => unknown, statusCode: number, code: string) {
  try {
    fn();
    expect.unreachable(`Expected AppError(${statusCode}, ${code}) to be thrown`);
  } catch (error: any) {
    if (error instanceof AppError) {
      expect(error.statusCode).toBe(statusCode);
      expect(error.code).toBe(code);
    } else {
      expect(error.statusCode ?? error.status).toBe(statusCode);
      expect(error.code ?? error.name).toBe(code);
    }
  }
}

function createPipelineHarness(
  initialTime: number = BASE_TIME,
  historyAllowedFromMs: number = BASE_TIME - 50000,
  resourceBornAtMs: number = BASE_TIME - 100000,
) {
  const directory = mkdtempSync(join(tmpdir(), "ignis-t0007-pipe-'-"));
  const path = join(directory, 'test.sqlite');
  const store = new Store(path, true);
  fixtures.push({ directory, store });

  const installation = store.migrate();
  const { datasetId, actorId } = installation;
  expect(generateDemo(authorization(store), sessionFor(store, actorId), datasetId, 1, generation()).status).toBe(201);

  const camera = (
    store.db.prepare("SELECT id FROM equipment WHERE category_code='camera' LIMIT 1").get() as { id: string }
  ).id;
  const mobile = (
    store.db
      .prepare("SELECT id FROM equipment WHERE category_code='inspection_vehicle' LIMIT 1")
      .get() as { id: string }
  ).id;
  const agent = (store.db.prepare('SELECT id FROM agent LIMIT 1').get() as { id: string }).id;

  const sourceCreated = Math.min(initialTime - 10000, resourceBornAtMs, -100000);
  const sourceId = randomUUID();
  insert(store.db, 'telemetry_source', {
    id: sourceId,
    source_kind: 'fixture_source',
    provisioned_by: actorId,
    active: 1,
    created_at_ms: sourceCreated,
  });

  const rawToken = 'raw-token-' + randomUUID();
  const tokenHash = createHash('sha256').update(rawToken, 'utf8').digest('hex');
  insert(store.db, 'telemetry_credential', {
    token_hash: tokenHash,
    source_id: sourceId,
    issued_at_ms: sourceCreated,
    expires_at_ms: BASE_TIME + 86400000,
    revoked_at_ms: null,
  });

  for (const [id, kind, category, emitter, interval, ttl] of [
    ['FX-NONE-v1', 'equipment', 'camera', 0, null, null],
    ['FX-FIXED-v1', 'equipment', 'camera', 1, 10000, null],
    ['FX-MOBILE-v1', 'equipment', 'inspection_vehicle', 1, 10000, 30000],
    ['FX-AGENT-v1', 'agent', null, null, null, 30000],
  ] as const) {
    insert(store.db, 'telemetry_profile', {
      id,
      version: 1,
      usage: 'fixture',
      resource_kind: kind,
      category_code: category,
      category_version: category === null ? null : 1,
      emitter_expected: emitter,
      expected_interval_ms: interval,
      position_ttl_ms: ttl,
      configuration_json: '{}',
      provenance: 'C03 test fixture',
    });
  }

  for (const [resource, kind, profile] of [
    [camera, 'equipment', 'FX-FIXED-v1'],
    [mobile, 'equipment', 'FX-MOBILE-v1'],
    [agent, 'agent', 'FX-AGENT-v1'],
  ] as const) {
    insert(store.db, 'telemetry_resource_profile', {
      dataset_id: datasetId,
      epoch: 1,
      resource_id: resource,
      resource_kind: kind,
      profile_id: profile,
      profile_version: 1,
      active: 1,
      assigned_at_ms: sourceCreated,
    });
  }

  const cameraBindingId = randomUUID();
  insert(store.db, 'telemetry_binding', {
    dataset_id: datasetId,
    epoch: 1,
    id: cameraBindingId,
    source_id: sourceId,
    resource_id: camera,
    resource_kind: 'equipment',
    channel: 'heartbeat',
    projection_field: 'communication',
    profile_id: 'FX-FIXED-v1',
    profile_version: 1,
    active: 1,
    resource_born_at_ms: resourceBornAtMs,
    history_allowed_from_ms: historyAllowedFromMs,
  });

  const cameraFaultBindingId = randomUUID();
  insert(store.db, 'telemetry_binding', {
    dataset_id: datasetId,
    epoch: 1,
    id: cameraFaultBindingId,
    source_id: sourceId,
    resource_id: camera,
    resource_kind: 'equipment',
    channel: 'fixture_fault_a',
    projection_field: 'fault',
    profile_id: 'FX-FIXED-v1',
    profile_version: 1,
    active: 1,
    resource_born_at_ms: resourceBornAtMs,
    history_allowed_from_ms: historyAllowedFromMs,
  });

  const mobileBindingId = randomUUID();
  insert(store.db, 'telemetry_binding', {
    dataset_id: datasetId,
    epoch: 1,
    id: mobileBindingId,
    source_id: sourceId,
    resource_id: mobile,
    resource_kind: 'equipment',
    channel: 'position',
    projection_field: 'position',
    profile_id: 'FX-MOBILE-v1',
    profile_version: 1,
    active: 1,
    resource_born_at_ms: resourceBornAtMs,
    history_allowed_from_ms: historyAllowedFromMs,
  });

  const mobileHeartbeatBindingId = randomUUID();
  insert(store.db, 'telemetry_binding', {
    dataset_id: datasetId,
    epoch: 1,
    id: mobileHeartbeatBindingId,
    source_id: sourceId,
    resource_id: mobile,
    resource_kind: 'equipment',
    channel: 'heartbeat',
    projection_field: 'communication',
    profile_id: 'FX-MOBILE-v1',
    profile_version: 1,
    active: 1,
    resource_born_at_ms: resourceBornAtMs,
    history_allowed_from_ms: historyAllowedFromMs,
  });

  const timeProvider = new SettableTimeProvider(initialTime);
  const clockService = new TrustedClockService(timeProvider);
  const authService = new TelemetryAuthService({ clockService, timeProvider });
  const bindingService = new TelemetryBindingService();
  const profileValidator = new TelemetryProfileValidator();
  const pipelineHook = new DefaultTelemetryPipelineHook();

  const ingestService = new CanonicalTelemetryIngestService({
    clockService,
    authService,
    bindingService,
    profileValidator,
    pipelineHook,
  });

  return {
    store,
    db: store.db,
    datasetId,
    actorId,
    camera,
    mobile,
    agent,
    sourceId,
    rawToken,
    timeProvider,
    clockService,
    authService,
    bindingService,
    profileValidator,
    pipelineHook,
    ingestService,
  };
}

describe('PROJECT IGNIS — T0007 / PKG-06: Telemetry Pipeline & Projections Suite', () => {
  // 1. Heartbeat Projections
  it('PIP-01: Nominal heartbeat projects communication observation and creates cursor', () => {
    const h = createPipelineHarness();

    const res = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: new Date(BASE_TIME - 5000).toISOString(),
        values: {},
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('applied');

    // Confirm communication observation
    const comm = h.db
      .prepare('SELECT * FROM telemetry_communication_observation WHERE dataset_id = ? AND resource_id = ?')
      .get(h.datasetId, h.camera) as any;
    expect(comm).toBeDefined();
    expect(comm.event_id).toBe(res.body.eventId);
    expect(comm.observed_at_ms).toBe(BASE_TIME - 5000);

    // Confirm cursor
    const cursor = h.db
      .prepare(
        'SELECT * FROM telemetry_channel_cursor WHERE dataset_id = ? AND resource_id = ? AND channel = ?',
      )
      .get(h.datasetId, h.camera, 'heartbeat') as any;
    expect(cursor).toBeDefined();
    expect(cursor.max_sequence_seen).toBe(1);
    expect(cursor.max_occurred_at_ms).toBe(BASE_TIME - 5000);
    expect(cursor.projected_effective_at_ms).toBe(BASE_TIME - 5000);
  });

  it('PIP-02: Subsequent heartbeat with higher sequence advances cursor and updates communication observation', () => {
    const h = createPipelineHarness();

    h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: new Date(BASE_TIME - 5000).toISOString(),
        values: {},
      },
    });

    const res2 = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 2,
        observationType: 'heartbeat',
        occurredAt: new Date(BASE_TIME - 2000).toISOString(),
        values: {},
      },
    });

    expect(res2.status).toBe(200);
    expect(res2.body.disposition).toBe('applied');

    const comm = h.db
      .prepare('SELECT * FROM telemetry_communication_observation WHERE dataset_id = ? AND resource_id = ?')
      .get(h.datasetId, h.camera) as any;
    expect(comm.event_id).toBe(res2.body.eventId);
    expect(comm.observed_at_ms).toBe(BASE_TIME - 2000);

    const cursor = h.db
      .prepare('SELECT * FROM telemetry_channel_cursor WHERE dataset_id = ? AND resource_id = ? AND channel = ?')
      .get(h.datasetId, h.camera, 'heartbeat') as any;
    expect(cursor.max_sequence_seen).toBe(2);
    expect(cursor.max_occurred_at_ms).toBe(BASE_TIME - 2000);
    expect(cursor.projected_effective_at_ms).toBe(BASE_TIME - 2000);
  });

  it('PIP-03 (C03-S17): Heartbeat on stolen equipment is applied, updating communication while preserving stolen state', () => {
    const h = createPipelineHarness();

    // Set equipment to stolen in current_state
    h.db
      .prepare('UPDATE current_state SET operational_state = ? WHERE dataset_id = ? AND resource_id = ?')
      .run('stolen', h.datasetId, h.camera);

    const res = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: new Date(BASE_TIME - 3000).toISOString(),
        values: {},
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('applied');

    // Confirm communication updated
    const comm = h.db
      .prepare('SELECT * FROM telemetry_communication_observation WHERE dataset_id = ? AND resource_id = ?')
      .get(h.datasetId, h.camera) as any;
    expect(comm.event_id).toBe(res.body.eventId);
    expect(comm.observed_at_ms).toBe(BASE_TIME - 3000);

    // Confirm stolen status is strictly preserved
    const state = h.db
      .prepare('SELECT operational_state FROM current_state WHERE dataset_id = ? AND resource_id = ?')
      .get(h.datasetId, h.camera) as any;
    expect(state.operational_state).toBe('stolen');
  });

  it('PIP-04: Heartbeat on disabled equipment returns ignored disposition and does not project communication', () => {
    const h = createPipelineHarness();

    h.db
      .prepare('UPDATE current_state SET operational_state = ? WHERE dataset_id = ? AND resource_id = ?')
      .run('disabled', h.datasetId, h.camera);

    const res = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: new Date(BASE_TIME - 3000).toISOString(),
        values: {},
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('ignored');

    const comm = h.db
      .prepare('SELECT * FROM telemetry_communication_observation WHERE dataset_id = ? AND resource_id = ?')
      .get(h.datasetId, h.camera);
    expect(comm).toBeUndefined();

    // Cursor max_sequence_seen advances to preserve stream ordering barrier (C03 line 149)
    const cursor = h.db
      .prepare('SELECT * FROM telemetry_channel_cursor WHERE dataset_id = ? AND resource_id = ? AND channel = ?')
      .get(h.datasetId, h.camera, 'heartbeat') as any;
    expect(cursor.max_sequence_seen).toBe(1);
    expect(cursor.projected_effective_at_ms).toBeNull();
  });

  it('PIP-05: Out-of-order heartbeat with lower sequence returns historical disposition without updating communication', () => {
    const h = createPipelineHarness();

    // First event: sequence 5
    h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 5,
        observationType: 'heartbeat',
        occurredAt: new Date(BASE_TIME - 3000).toISOString(),
        values: {},
      },
    });

    // Second event: sequence 3 (inferior sequence)
    const res = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 3,
        observationType: 'heartbeat',
        occurredAt: new Date(BASE_TIME - 4000).toISOString(),
        values: {},
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('historical');

    const comm = h.db
      .prepare('SELECT * FROM telemetry_communication_observation WHERE dataset_id = ? AND resource_id = ?')
      .get(h.datasetId, h.camera) as any;
    expect(comm.observed_at_ms).toBe(BASE_TIME - 3000);

    const cursor = h.db
      .prepare('SELECT * FROM telemetry_channel_cursor WHERE dataset_id = ? AND resource_id = ? AND channel = ?')
      .get(h.datasetId, h.camera, 'heartbeat') as any;
    expect(cursor.max_sequence_seen).toBe(5);
    expect(cursor.projected_effective_at_ms).toBe(BASE_TIME - 3000);
  });

  it('PIP-06: Higher sequence with regressed occurred_at returns historical, advances max_sequence_seen but preserves projected time', () => {
    const h = createPipelineHarness();

    // Sequence 1 at 12:00:00
    h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: new Date(BASE_TIME).toISOString(),
        values: {},
      },
    });

    // Sequence 2 at 11:59:50 (10s before sequence 1!)
    const res = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 2,
        observationType: 'heartbeat',
        occurredAt: new Date(BASE_TIME - 10000).toISOString(),
        values: {},
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('historical');

    const cursor = h.db
      .prepare('SELECT * FROM telemetry_channel_cursor WHERE dataset_id = ? AND resource_id = ? AND channel = ?')
      .get(h.datasetId, h.camera, 'heartbeat') as any;
    expect(cursor.max_sequence_seen).toBe(2);
    expect(cursor.max_occurred_at_ms).toBe(BASE_TIME);
    expect(cursor.projected_effective_at_ms).toBe(BASE_TIME);
  });

  // 2. Position Projections & Spatial Classification
  it('PIP-07: Mobile equipment position inside REG-CENTRO resolves region_id and stores observation', () => {
    const h = createPipelineHarness();

    // Coordinates inside REG-CENTRO ([-46.655, -23.565] to [-46.64, -23.55])
    const res = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.mobile,
        channel: 'position',
        sequence: 1,
        observationType: 'position',
        occurredAt: new Date(BASE_TIME - 2000).toISOString(),
        values: {
          latitude: -23.555,
          longitude: -46.65,
          accuracyM: 5.5,
        },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('applied');

    const pos = h.db
      .prepare('SELECT * FROM telemetry_position_observation WHERE dataset_id = ? AND resource_id = ?')
      .get(h.datasetId, h.mobile) as any;
    expect(pos).toBeDefined();
    expect(pos.event_id).toBe(res.body.eventId);
    expect(pos.latitude).toBe(-23.555);
    expect(pos.longitude).toBe(-46.65);
    expect(pos.accuracy_m).toBe(5.5);
    expect(pos.region_id).toBe('10000000-0000-4000-8000-000000000101'); // REG-CENTRO
  });

  it('PIP-08: Mobile equipment position outside any defined polygon stores region_id = null', () => {
    const h = createPipelineHarness();

    // Coordinates far outside any region
    const res = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.mobile,
        channel: 'position',
        sequence: 1,
        observationType: 'position',
        occurredAt: new Date(BASE_TIME - 2000).toISOString(),
        values: {
          latitude: 10.0,
          longitude: 20.0,
        },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('applied');

    const pos = h.db
      .prepare('SELECT * FROM telemetry_position_observation WHERE dataset_id = ? AND resource_id = ?')
      .get(h.datasetId, h.mobile) as any;
    expect(pos).toBeDefined();
    expect(pos.region_id).toBeNull();
  });

  it('PIP-09: Negative coordinates in Southern/Western hemisphere are stored with exact precision', () => {
    const h = createPipelineHarness();

    const res = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.mobile,
        channel: 'position',
        sequence: 1,
        observationType: 'position',
        occurredAt: new Date(BASE_TIME - 1000).toISOString(),
        values: {
          latitude: -23.5505199,
          longitude: -46.6333094,
          accuracyM: 2.1,
        },
      },
    });

    expect(res.status).toBe(200);
    const pos = h.db
      .prepare('SELECT * FROM telemetry_position_observation WHERE dataset_id = ? AND resource_id = ?')
      .get(h.datasetId, h.mobile) as any;
    expect(pos.latitude).toBeCloseTo(-23.5505199, 6);
    expect(pos.longitude).toBeCloseTo(-46.6333094, 6);
  });

  it('PIP-10: Monotonic position updates: later position updates telemetry_position_observation', () => {
    const h = createPipelineHarness();

    h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.mobile,
        channel: 'position',
        sequence: 1,
        observationType: 'position',
        occurredAt: new Date(BASE_TIME - 3000).toISOString(),
        values: { latitude: -23.555, longitude: -46.65 },
      },
    });

    const res2 = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.mobile,
        channel: 'position',
        sequence: 2,
        observationType: 'position',
        occurredAt: new Date(BASE_TIME - 1000).toISOString(),
        values: { latitude: -23.556, longitude: -46.651 },
      },
    });

    expect(res2.status).toBe(200);
    const pos = h.db
      .prepare('SELECT * FROM telemetry_position_observation WHERE dataset_id = ? AND resource_id = ?')
      .get(h.datasetId, h.mobile) as any;
    expect(pos.event_id).toBe(res2.body.eventId);
    expect(pos.latitude).toBe(-23.556);
  });

  it('PIP-11: Dynamic position observation on fixed equipment is rejected by profile validator', () => {
    const h = createPipelineHarness();

    expectAppError(
      () =>
        h.ingestService.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: randomUUID(),
            resourceId: h.camera,
            channel: 'heartbeat',
            sequence: 1,
            observationType: 'position',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: { latitude: -23.555, longitude: -46.65 },
          },
        }),
      422,
      'INVALID_VALUE',
    );
  });

  it('PIP-12: Position on stolen mobile equipment preserves stolen state while updating position observation', () => {
    const h = createPipelineHarness();

    h.db
      .prepare('UPDATE current_state SET operational_state = ? WHERE dataset_id = ? AND resource_id = ?')
      .run('stolen', h.datasetId, h.mobile);

    const res = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.mobile,
        channel: 'position',
        sequence: 1,
        observationType: 'position',
        occurredAt: new Date(BASE_TIME - 2000).toISOString(),
        values: { latitude: -23.555, longitude: -46.65 },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('applied');

    const pos = h.db
      .prepare('SELECT * FROM telemetry_position_observation WHERE dataset_id = ? AND resource_id = ?')
      .get(h.datasetId, h.mobile) as any;
    expect(pos.event_id).toBe(res.body.eventId);

    const state = h.db
      .prepare('SELECT operational_state FROM current_state WHERE dataset_id = ? AND resource_id = ?')
      .get(h.datasetId, h.mobile) as any;
    expect(state.operational_state).toBe('stolen');
  });

  it('PIP-13: Out-of-order position returns historical disposition without modifying position observation', () => {
    const h = createPipelineHarness();

    h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.mobile,
        channel: 'position',
        sequence: 10,
        observationType: 'position',
        occurredAt: new Date(BASE_TIME - 1000).toISOString(),
        values: { latitude: -23.555, longitude: -46.65 },
      },
    });

    const res = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.mobile,
        channel: 'position',
        sequence: 8,
        observationType: 'position',
        occurredAt: new Date(BASE_TIME - 2000).toISOString(),
        values: { latitude: -23.111, longitude: -46.111 },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('historical');

    const pos = h.db
      .prepare('SELECT * FROM telemetry_position_observation WHERE dataset_id = ? AND resource_id = ?')
      .get(h.datasetId, h.mobile) as any;
    expect(pos.latitude).toBe(-23.555);
  });

  // 3. Causal Fault Episodes
  it('PIP-14: fault_detected observation inserts causal episode during Phase 1 and links telemetry_event', () => {
    const h = createPipelineHarness();

    const episodeId = 'ep-' + randomUUID();
    const episodeStartedAtMs = BASE_TIME - 4000;

    const res = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'fixture_fault_a',
        sequence: 1,
        observationType: 'fault_detected',
        occurredAt: new Date(BASE_TIME - 3000).toISOString(),
        values: {
          episodeId,
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs,
        },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('applied');

    const ep = h.db
      .prepare('SELECT * FROM telemetry_episode WHERE dataset_id = ? AND resource_id = ? AND episode_id = ?')
      .get(h.datasetId, h.camera, episodeId) as any;
    expect(ep).toBeDefined();
    expect(ep.cause_code).toBe('fixture_fault_a');
    expect(ep.episode_started_at_ms).toBe(episodeStartedAtMs);

    const evt = h.db
      .prepare('SELECT * FROM telemetry_event WHERE dataset_id = ? AND event_id = ?')
      .get(h.datasetId, res.body.eventId) as any;
    expect(evt.episode_id).toBe(episodeId);
    expect(evt.cause_code).toBe('fixture_fault_a');
  });

  it('PIP-15: fault_cleared observation with valid existing episode succeeds', () => {
    const h = createPipelineHarness();

    const episodeId = 'ep-' + randomUUID();
    const episodeStartedAtMs = BASE_TIME - 6000;

    // Detect first
    h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'fixture_fault_a',
        sequence: 1,
        observationType: 'fault_detected',
        occurredAt: new Date(BASE_TIME - 5000).toISOString(),
        values: {
          episodeId,
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs,
        },
      },
    });

    // Clear second
    const res = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'fixture_fault_a',
        sequence: 2,
        observationType: 'fault_cleared',
        occurredAt: new Date(BASE_TIME - 2000).toISOString(),
        values: {
          episodeId,
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs,
        },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('applied');

    const evt = h.db
      .prepare('SELECT * FROM telemetry_event WHERE dataset_id = ? AND event_id = ?')
      .get(h.datasetId, res.body.eventId) as any;
    expect(evt.observation_type).toBe('fault_cleared');
    expect(evt.episode_id).toBe(episodeId);
  });

  it('PIP-16: fault_cleared observation with non-existent episode throws 422 UNKNOWN_EPISODE', () => {
    const h = createPipelineHarness();

    const nonExistentEpisodeId = 'ep-missing-' + randomUUID();

    expectAppError(
      () =>
        h.ingestService.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: randomUUID(),
            resourceId: h.camera,
            channel: 'fixture_fault_a',
            sequence: 1,
            observationType: 'fault_cleared',
            occurredAt: new Date(BASE_TIME - 2000).toISOString(),
            values: {
              episodeId: nonExistentEpisodeId,
              causeCode: 'fixture_fault_a',
              episodeStartedAtMs: BASE_TIME - 3000,
            },
          },
        }),
      422,
      'UNKNOWN_EPISODE',
    );
  });

  it('PIP-17 (C03-S02/S03): fault_detected covered by prior completed cause resolution returns historical without reopening', () => {
    const h = createPipelineHarness();

    const cutoff = BASE_TIME - 2000;
    // Insert cause resolution for fixture_fault_a
    insert(h.db, 'telemetry_cause_resolution', {
      dataset_id: h.datasetId,
      epoch: 1,
      id: randomUUID(),
      resource_id: h.camera,
      cause_code: 'fixture_fault_a',
      completed_at_ms: cutoff,
      recorded_at_ms: cutoff,
      actor_id: h.actorId,
      evidence_json: '{"resolution":"maintenance"}',
    });

    // Episode starting at BASE_TIME - 4000 (before cutoff)
    const res = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'fixture_fault_a',
        sequence: 1,
        observationType: 'fault_detected',
        occurredAt: new Date(BASE_TIME - 1000).toISOString(),
        values: {
          episodeId: 'ep-' + randomUUID(),
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs: BASE_TIME - 4000,
        },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('historical');

    const evt = h.db
      .prepare('SELECT disposition, reason_code FROM telemetry_event WHERE dataset_id = ? AND event_id = ?')
      .get(h.datasetId, res.body.eventId) as any;
    expect(evt.disposition).toBe('historical');
    expect(evt.reason_code).toBe('COVERED_BY_CAUSE_RESOLUTION');
  });

  it('PIP-18 (C03-S04): fault_detected starting after cause resolution cutoff is eligible and applied', () => {
    const h = createPipelineHarness();

    const cutoff = BASE_TIME - 4000;
    insert(h.db, 'telemetry_cause_resolution', {
      dataset_id: h.datasetId,
      epoch: 1,
      id: randomUUID(),
      resource_id: h.camera,
      cause_code: 'fixture_fault_a',
      completed_at_ms: cutoff,
      recorded_at_ms: cutoff,
      actor_id: h.actorId,
      evidence_json: '{"resolution":"maintenance"}',
    });

    // Episode starting at cutoff + 1ms
    const res = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'fixture_fault_a',
        sequence: 1,
        observationType: 'fault_detected',
        occurredAt: new Date(BASE_TIME - 2000).toISOString(),
        values: {
          episodeId: 'ep-' + randomUUID(),
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs: cutoff + 1,
        },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('applied');
  });

  // 4. Cursor Monotonicity & Boundary Invariants
  it('PIP-19: Zero timestamp (1970-01-01T00:00:00.000Z = 0 ms) is handled correctly without COALESCE corruption', () => {
    const zeroTimeHarness = createPipelineHarness(0, -1000000, -2000000);

    const res = zeroTimeHarness.ingestService.ingest(zeroTimeHarness.db, {
      commandId: randomUUID(),
      rawToken: zeroTimeHarness.rawToken,
      datasetId: zeroTimeHarness.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: zeroTimeHarness.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: '1970-01-01T00:00:00.000Z',
        values: {},
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('applied');

    const cursor = zeroTimeHarness.db
      .prepare(
        'SELECT max_sequence_seen, max_occurred_at_ms, projected_effective_at_ms FROM telemetry_channel_cursor WHERE dataset_id = ? AND resource_id = ? AND channel = ?',
      )
      .get(zeroTimeHarness.datasetId, zeroTimeHarness.camera, 'heartbeat') as any;
    expect(cursor.max_sequence_seen).toBe(1);
    expect(cursor.max_occurred_at_ms).toBe(0);
    expect(cursor.projected_effective_at_ms).toBe(0);
  });

  it('PIP-20: Negative timestamp (1969-12-31T23:59:50.000Z = -10000 ms) is handled correctly without COALESCE corruption', () => {
    const negTimeHarness = createPipelineHarness(-5000, -1000000, -2000000);

    const res = negTimeHarness.ingestService.ingest(negTimeHarness.db, {
      commandId: randomUUID(),
      rawToken: negTimeHarness.rawToken,
      datasetId: negTimeHarness.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: negTimeHarness.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: '1969-12-31T23:59:50.000Z', // -10000 ms
        values: {},
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('applied');

    const cursor = negTimeHarness.db
      .prepare(
        'SELECT max_sequence_seen, max_occurred_at_ms, projected_effective_at_ms FROM telemetry_channel_cursor WHERE dataset_id = ? AND resource_id = ? AND channel = ?',
      )
      .get(negTimeHarness.datasetId, negTimeHarness.camera, 'heartbeat') as any;
    expect(cursor.max_sequence_seen).toBe(1);
    expect(cursor.max_occurred_at_ms).toBe(-10000);
    expect(cursor.projected_effective_at_ms).toBe(-10000);
  });

  it('PIP-21: Multiple channels on same resource maintain independent stream cursors without crosstalk', () => {
    const h = createPipelineHarness();

    // Heartbeat channel
    h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 42,
        observationType: 'heartbeat',
        occurredAt: new Date(BASE_TIME - 3000).toISOString(),
        values: {},
      },
    });

    // Fault channel
    h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'fixture_fault_a',
        sequence: 7,
        observationType: 'fault_detected',
        occurredAt: new Date(BASE_TIME - 2000).toISOString(),
        values: {
          episodeId: 'ep-' + randomUUID(),
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs: BASE_TIME - 2500,
        },
      },
    });

    const curHeartbeat = h.db
      .prepare(
        'SELECT max_sequence_seen FROM telemetry_channel_cursor WHERE dataset_id = ? AND resource_id = ? AND channel = ?',
      )
      .get(h.datasetId, h.camera, 'heartbeat') as any;
    expect(curHeartbeat.max_sequence_seen).toBe(42);

    const curFault = h.db
      .prepare(
        'SELECT max_sequence_seen FROM telemetry_channel_cursor WHERE dataset_id = ? AND resource_id = ? AND channel = ?',
      )
      .get(h.datasetId, h.camera, 'fixture_fault_a') as any;
    expect(curFault.max_sequence_seen).toBe(7);
  });

  it('PIP-22: Sequence 0 is a valid initial sequence slot', () => {
    const h = createPipelineHarness();

    const res = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 0,
        observationType: 'heartbeat',
        occurredAt: new Date(BASE_TIME - 3000).toISOString(),
        values: {},
      },
    });

    expect(res.status).toBe(200);
    const cursor = h.db
      .prepare(
        'SELECT max_sequence_seen FROM telemetry_channel_cursor WHERE dataset_id = ? AND resource_id = ? AND channel = ?',
      )
      .get(h.datasetId, h.camera, 'heartbeat') as any;
    expect(cursor.max_sequence_seen).toBe(0);
  });

  // 5. Clocks & Tolerated Future Clamping
  it('PIP-23 (C03-S14): Observation in TOLERATED_FUTURE clamps observationEffectiveAtMs to sample time and suppresses clock advance', () => {
    const h = createPipelineHarness();

    const initialClock = (
      h.db.prepare('SELECT trusted_utc_ms FROM telemetry_trusted_clock WHERE singleton = 1').get() as
        | { trusted_utc_ms: number }
        | undefined
    )?.trusted_utc_ms;

    // BASE_TIME is 12:00:00. Event occurredAt is 12:00:20 (+20s, within 30s tolerance)
    const futureOccurredAt = new Date(BASE_TIME + 20000).toISOString();

    const res = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: futureOccurredAt,
        values: {},
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('applied');
    // appliedAt is clamped to sample time (BASE_TIME)
    expect(res.body.appliedAt).toBe(new Date(BASE_TIME).toISOString());

    // Durable clock watermark is NOT advanced
    const currentClock = (
      h.db.prepare('SELECT trusted_utc_ms FROM telemetry_trusted_clock WHERE singleton = 1').get() as
        | { trusted_utc_ms: number }
        | undefined
    )?.trusted_utc_ms;
    expect(currentClock).toBe(initialClock);

    // Cursor records effective clamped time
    const cursor = h.db
      .prepare(
        'SELECT projected_effective_at_ms, max_occurred_at_ms FROM telemetry_channel_cursor WHERE dataset_id = ? AND resource_id = ? AND channel = ?',
      )
      .get(h.datasetId, h.camera, 'heartbeat') as any;
    expect(cursor.projected_effective_at_ms).toBe(BASE_TIME);
    expect(cursor.max_occurred_at_ms).toBe(BASE_TIME + 20000);
  });

  // 6. GATE-01: Fail-Closed Pipeline Hook Contract
  it('PIP-24 (GATE-01): Missing pipeline hook fails closed with 500 PIPELINE_HOOK_REQUIRED', () => {
    const h = createPipelineHarness();

    const ingestWithoutHook = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      // pipelineHook omitted
    });

    expectAppError(
      () =>
        ingestWithoutHook.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: randomUUID(),
            resourceId: h.camera,
            channel: 'heartbeat',
            sequence: 1,
            observationType: 'heartbeat',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: {},
          },
        }),
      500,
      'PIPELINE_HOOK_REQUIRED',
    );
  });

  it('PIP-25 (GATE-01): Hook lacking project method fails closed with 500 PIPELINE_HOOK_INCOMPLETE', () => {
    const h = createPipelineHarness();

    expectAppError(
      () =>
        new CanonicalTelemetryIngestService({
          clockService: h.clockService,
          authService: h.authService,
          bindingService: h.bindingService,
          profileValidator: h.profileValidator,
          pipelineHook: { evaluateAndProject: () => ({ disposition: 'applied', effects: {}, reasonCode: 'OK' }) } as any,
        }),
      500,
      'PIPELINE_HOOK_INCOMPLETE',
    );
  });

  // 7. GATE-02: Runtime In-Transaction Consistency (assertProjectedStateConsistent)
  it('PIP-26 (GATE-02): Mismatch where hook declares communication effect but project omits SQL insert throws PROJECTION_INCONSISTENCY and rolls back', () => {
    const h = createPipelineHarness();

    const negligentCommHook: TelemetryPipelineHook = {
      evaluateAndProject: (context) => ({
        disposition: 'applied',
        effects: {
          cursor: { advanced: true, sequence: 1, maxOccurredAtMs: BASE_TIME, projectedEffectiveAtMs: BASE_TIME },
          communication: {
            projected: true,
            resourceId: context.canonicalEvent.payload.resourceId,
            sourceId: context.auth.sourceId,
            eventId: context.canonicalEvent.eventId,
            channel: 'heartbeat',
            observedAtMs: BASE_TIME,
          },
          operationalProjection: true,
        },
        reasonCode: 'TEST',
      }),
      project: (context, result) => {
        // Deliberately omit communication insert and call assertProjectedStateConsistent
        assertProjectedStateConsistent(context.db, context, result);
      },
    };

    const faultyService = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: negligentCommHook,
    });

    expectAppError(
      () =>
        faultyService.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: randomUUID(),
            resourceId: h.camera,
            channel: 'heartbeat',
            sequence: 1,
            observationType: 'heartbeat',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: {},
          },
        }),
      500,
      'PROJECTION_INCONSISTENCY',
    );

    // Confirm full atomic rollback: zero events or sequence slots persisted
    const eventCount = (
      h.db.prepare('SELECT count(*) as count FROM telemetry_event WHERE dataset_id = ?').get(h.datasetId) as any
    ).count;
    expect(eventCount).toBe(0);
  });

  it('PIP-27 (GATE-02): Mismatch where hook declares position effect but DB row has divergent coordinates throws PROJECTION_INCONSISTENCY', () => {
    const h = createPipelineHarness();

    const divergentPosHook: TelemetryPipelineHook = {
      evaluateAndProject: (context) => ({
        disposition: 'applied',
        effects: {
          cursor: { advanced: true, sequence: 1, maxOccurredAtMs: BASE_TIME, projectedEffectiveAtMs: BASE_TIME },
          position: {
            projected: true,
            resourceId: context.canonicalEvent.payload.resourceId,
            sourceId: context.auth.sourceId,
            eventId: context.canonicalEvent.eventId,
            channel: 'position',
            observedAtMs: BASE_TIME,
            latitude: -23.5,
            longitude: -46.6,
            accuracyM: null,
            regionId: null,
          },
          operationalProjection: true,
        },
        reasonCode: 'TEST',
      }),
      project: (context, result) => {
        // Insert divergent coordinates into DB
        context.db
          .prepare(
            `INSERT INTO telemetry_position_observation (
               dataset_id, epoch, resource_id, source_id, event_id, channel, observed_at_ms, latitude, longitude, region_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            context.datasetId,
            context.epoch,
            context.canonicalEvent.payload.resourceId,
            context.auth.sourceId,
            context.canonicalEvent.eventId,
            'position',
            BASE_TIME,
            -10.0, // divergent!
            -20.0, // divergent!
            null,
          );
        assertProjectedStateConsistent(context.db, context, result);
      },
    };

    const faultyService = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: divergentPosHook,
    });

    expectAppError(
      () =>
        faultyService.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: randomUUID(),
            resourceId: h.mobile,
            channel: 'position',
            sequence: 1,
            observationType: 'position',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: { latitude: -23.5, longitude: -46.6 },
          },
        }),
      500,
      'PROJECTION_INCONSISTENCY',
    );
  });

  it('PIP-28 (GATE-02): Undeclared phantom communication row triggers PROJECTION_INCONSISTENCY', () => {
    const h = createPipelineHarness();

    const phantomCommHook: TelemetryPipelineHook = {
      evaluateAndProject: () => ({
        disposition: 'applied',
        effects: {
          cursor: { advanced: true, sequence: 1, maxOccurredAtMs: BASE_TIME, projectedEffectiveAtMs: BASE_TIME },
          // communication deliberately NOT declared in effects
          operationalProjection: false,
        },
        reasonCode: 'TEST',
      }),
      project: (context, result) => {
        // But hook creates a phantom communication row
        context.db
          .prepare(
            `INSERT INTO telemetry_communication_observation (
               dataset_id, epoch, resource_id, source_id, event_id, channel, observed_at_ms
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            context.datasetId,
            context.epoch,
            context.canonicalEvent.payload.resourceId,
            context.auth.sourceId,
            context.canonicalEvent.eventId,
            'heartbeat',
            BASE_TIME,
          );
        assertProjectedStateConsistent(context.db, context, result);
      },
    };

    const faultyService = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: phantomCommHook,
    });

    expectAppError(
      () =>
        faultyService.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: randomUUID(),
            resourceId: h.camera,
            channel: 'heartbeat',
            sequence: 1,
            observationType: 'heartbeat',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: {},
          },
        }),
      500,
      'PROJECTION_INCONSISTENCY',
    );
  });

  it('PIP-29 (GATE-02): Undeclared phantom position row triggers PROJECTION_INCONSISTENCY', () => {
    const h = createPipelineHarness();

    const phantomPosHook: TelemetryPipelineHook = {
      evaluateAndProject: () => ({
        disposition: 'applied',
        effects: {
          cursor: { advanced: true, sequence: 1, maxOccurredAtMs: BASE_TIME, projectedEffectiveAtMs: BASE_TIME },
          // position deliberately NOT declared
          operationalProjection: false,
        },
        reasonCode: 'TEST',
      }),
      project: (context, result) => {
        context.db
          .prepare(
            `INSERT INTO telemetry_position_observation (
               dataset_id, epoch, resource_id, source_id, event_id, channel, observed_at_ms, latitude, longitude, region_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            context.datasetId,
            context.epoch,
            context.canonicalEvent.payload.resourceId,
            context.auth.sourceId,
            context.canonicalEvent.eventId,
            'position',
            BASE_TIME,
            -23.5,
            -46.6,
            null,
          );
        assertProjectedStateConsistent(context.db, context, result);
      },
    };

    const faultyService = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: phantomPosHook,
    });

    expectAppError(
      () =>
        faultyService.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: randomUUID(),
            resourceId: h.mobile,
            channel: 'position',
            sequence: 1,
            observationType: 'position',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: { latitude: -23.5, longitude: -46.6 },
          },
        }),
      500,
      'PROJECTION_INCONSISTENCY',
    );
  });

  // 8. Transactional Atomicity & Rollback Verification
  it('PIP-30: Hook throwing error during project() rolls back all Phase 1 and core ingest mutations', () => {
    const h = createPipelineHarness();

    const explodingHook: TelemetryPipelineHook = {
      evaluateAndProject: (context) => {
        // Phase 1 creates episode row
        context.db
          .prepare(
            `INSERT INTO telemetry_episode (
               dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms
             ) VALUES (?, ?, ?, 'ep-crash-phase2', 'fixture_fault_a', ?, ?, ?)`,
          )
          .run(
            context.datasetId,
            context.epoch,
            context.canonicalEvent.payload.resourceId,
            context.auth.sourceId,
            BASE_TIME - 1000,
            BASE_TIME,
          );

        return {
          disposition: 'applied',
          effects: {
            cursor: { advanced: true, sequence: 1 },
            operationalProjection: true,
          },
          reasonCode: 'NOMINAL',
        };
      },
      project: () => {
        throw new Error('SIMULATED_PHASE_2_FAILURE');
      },
    };

    const service = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: explodingHook,
    });

    expect(() =>
      service.ingest(h.db, {
        commandId: randomUUID(),
        rawToken: h.rawToken,
        datasetId: h.datasetId,
        epoch: 1,
        envelope: {
          eventId: randomUUID(),
          resourceId: h.camera,
          channel: 'heartbeat',
          sequence: 1,
          observationType: 'heartbeat',
          occurredAt: new Date(BASE_TIME).toISOString(),
          values: {},
        },
      }),
    ).toThrow('SIMULATED_PHASE_2_FAILURE');

    // Confirm that episode inserted in Phase 1 was completely rolled back!
    const epCount = (
      h.db
        .prepare("SELECT count(*) as count FROM telemetry_episode WHERE episode_id = 'ep-crash-phase2'")
        .get() as any
    ).count;
    expect(epCount).toBe(0);

    // Confirm event was rolled back
    const eventCount = (
      h.db.prepare('SELECT count(*) as count FROM telemetry_event WHERE dataset_id = ?').get(h.datasetId) as any
    ).count;
    expect(eventCount).toBe(0);
  });

  it('PIP-31: Foreign Keys are active and enforced throughout pipeline operations', () => {
    const h = createPipelineHarness();
    const fkRow = h.db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    expect(fkRow.foreign_keys).toBe(1);
  });

  // 9. Concurrency & Performance
  it('PIP-32: Sequential ingests on distinct streams advance dataset revisions monotonically', () => {
    const h = createPipelineHarness();

    const res1 = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: new Date(BASE_TIME - 4000).toISOString(),
        values: {},
      },
    });

    const res2 = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.mobile,
        channel: 'position',
        sequence: 1,
        observationType: 'position',
        occurredAt: new Date(BASE_TIME - 3000).toISOString(),
        values: { latitude: -23.555, longitude: -46.65 },
      },
    });

    expect(res2.body.resultingRevision).toBeGreaterThan(res1.body.resultingRevision);
  });

  it('PIP-33: Heartbeat on mobile equipment updates communication observation correctly', () => {
    const h = createPipelineHarness();

    const res = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.mobile,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: new Date(BASE_TIME - 2000).toISOString(),
        values: {},
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('applied');

    const comm = h.db
      .prepare('SELECT * FROM telemetry_communication_observation WHERE dataset_id = ? AND resource_id = ?')
      .get(h.datasetId, h.mobile) as any;
    expect(comm.event_id).toBe(res.body.eventId);
  });

  it('PIP-34: Equal occurrence time with higher sequence is eligible and applied', () => {
    const h = createPipelineHarness();

    // Sequence 1 at T
    h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: new Date(BASE_TIME - 2000).toISOString(),
        values: {},
      },
    });

    // Sequence 2 at EXACT same T
    const res = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 2,
        observationType: 'heartbeat',
        occurredAt: new Date(BASE_TIME - 2000).toISOString(),
        values: {},
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('applied');

    const cursor = h.db
      .prepare('SELECT * FROM telemetry_channel_cursor WHERE dataset_id = ? AND resource_id = ? AND channel = ?')
      .get(h.datasetId, h.camera, 'heartbeat') as any;
    expect(cursor.max_sequence_seen).toBe(2);
    expect(cursor.max_occurred_at_ms).toBe(BASE_TIME - 2000);
  });

  it('PIP-35: Replay of confirmed command preserves original response body and receipt', () => {
    const h = createPipelineHarness();

    const commandId = randomUUID();
    const eventId = randomUUID();
    const envelope = {
      eventId,
      resourceId: h.camera,
      channel: 'heartbeat',
      sequence: 1,
      observationType: 'heartbeat',
      occurredAt: new Date(BASE_TIME - 2000).toISOString(),
      values: {},
    };

    const res1 = h.ingestService.ingest(h.db, {
      commandId,
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope,
    });

    const res2 = h.ingestService.ingest(h.db, {
      commandId,
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope,
    });

    expect(res1.replayed).toBe(false);
    expect(res2.replayed).toBe(true);
    expect(res2.body.eventId).toBe(res1.body.eventId);
    expect(res2.body.resultingRevision).toBe(res1.body.resultingRevision);
  });

  it('PIP-36: Non-object or missing effects in hook result throws 500 INVALID_HOOK_RESULT', () => {
    const h = createPipelineHarness();

    const invalidEffectsHook: TelemetryPipelineHook = {
      evaluateAndProject: () => ({
        disposition: 'applied',
        effects: null as any,
        reasonCode: 'OK',
      }),
      project: () => {},
    };

    const service = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: invalidEffectsHook,
    });

    expectAppError(
      () =>
        service.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: randomUUID(),
            resourceId: h.camera,
            channel: 'heartbeat',
            sequence: 1,
            observationType: 'heartbeat',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: {},
          },
        }),
      500,
      'INVALID_HOOK_RESULT',
    );
  });

  it('PIP-37: Non-existent dataset epoch fails closed before pipeline hook execution', () => {
    const h = createPipelineHarness();

    expectAppError(
      () =>
        h.ingestService.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 999, // non-existent
          envelope: {
            eventId: randomUUID(),
            resourceId: h.camera,
            channel: 'heartbeat',
            sequence: 1,
            observationType: 'heartbeat',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: {},
          },
        }),
      409,
      'EPOCH_CONFLICT',
    );
  });

  // 10. PKG06-FIX-01: Regression and Boundary Verifications (FIX-01A, FIX-01B, FIX-01C)
  // FIX-01A: Causal Episode Reuse & Conflict Rejection
  it('PIP-FIX-01: First fault_detected creates episode with created: true, second fault_detected with same episodeId reuses episode with created: false without primary key error', () => {
    const h = createPipelineHarness();

    const episodeId = 'ep-reuse-' + randomUUID();
    const episodeStartedAtMs = BASE_TIME - 5000;

    // First fault_detected observation (sequence 1)
    const res1 = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'fixture_fault_a',
        sequence: 1,
        observationType: 'fault_detected',
        occurredAt: new Date(BASE_TIME - 4000).toISOString(),
        values: {
          episodeId,
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs,
        },
      },
    });

    expect(res1.status).toBe(200);
    expect(res1.body.disposition).toBe('applied');

    const evt1 = h.db
      .prepare('SELECT effects_json FROM telemetry_event WHERE dataset_id = ? AND event_id = ?')
      .get(h.datasetId, res1.body.eventId) as any;
    const effects1 = JSON.parse(evt1.effects_json);
    expect(effects1.episode).toBeDefined();
    expect(effects1.episode.created).toBe(true);
    expect(effects1.episode.episodeId).toBe(episodeId);

    // Second fault_detected observation for the same ongoing episode (sequence 2)
    const res2 = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'fixture_fault_a',
        sequence: 2,
        observationType: 'fault_detected',
        occurredAt: new Date(BASE_TIME - 2000).toISOString(),
        values: {
          episodeId,
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs,
        },
      },
    });

    expect(res2.status).toBe(200);
    expect(res2.body.disposition).toBe('applied');

    const evt2 = h.db
      .prepare('SELECT effects_json FROM telemetry_event WHERE dataset_id = ? AND event_id = ?')
      .get(h.datasetId, res2.body.eventId) as any;
    const effects2 = JSON.parse(evt2.effects_json);
    expect(effects2.episode).toBeDefined();
    expect(effects2.episode.created).toBe(false);
    expect(effects2.episode.episodeId).toBe(episodeId);

    // Verify exactly ONE physical episode exists in SQLite
    const epCount = (
      h.db
        .prepare('SELECT count(*) as count FROM telemetry_episode WHERE dataset_id = ? AND episode_id = ?')
        .get(h.datasetId, episodeId) as any
    ).count;
    expect(epCount).toBe(1);
  });

  it('PIP-FIX-02: Conflicting cause_code for existing episodeId fails closed with 409 EPISODE_CONFLICT', () => {
    const h = createPipelineHarness();

    const episodeId = 'ep-conflict-cause-' + randomUUID();
    const episodeStartedAtMs = BASE_TIME - 5000;

    // Create episode with fixture_fault_a
    h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'fixture_fault_a',
        sequence: 1,
        observationType: 'fault_detected',
        occurredAt: new Date(BASE_TIME - 4000).toISOString(),
        values: {
          episodeId,
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs,
        },
      },
    });

    // Attempt second observation with same episodeId but conflicting causeCode directly against hook
    expectAppError(
      () =>
        h.pipelineHook.evaluateAndProject({
          db: h.db,
          datasetId: h.datasetId,
          epoch: 1,
          auth: { sourceId: h.sourceId } as any,
          binding: {} as any,
          canonicalEvent: {
            payload: {
              resourceId: h.camera,
              channel: 'fixture_fault_a',
              sequence: 2,
              observationType: 'fault_detected',
            },
            occurredAt: new Date(BASE_TIME - 2000).toISOString(),
            eventId: randomUUID(),
          } as any,
          windowEvaluation: { observationEffectiveAtMs: BASE_TIME - 2000, processingDataNowMs: BASE_TIME } as any,
          rawObservation: {} as any,
          validatedObservation: {
            values: {
              episodeId,
              causeCode: 'fixture_fault_b', // conflicting cause!
              episodeStartedAtMs,
            },
          } as any,
        }),
      409,
      'EPISODE_CONFLICT',
    );
  });

  it('PIP-FIX-03: Conflicting episodeStartedAtMs for existing episodeId fails closed with 409 EPISODE_CONFLICT', () => {
    const h = createPipelineHarness();

    const episodeId = 'ep-conflict-start-' + randomUUID();

    // Create episode with start BASE_TIME - 5000
    h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'fixture_fault_a',
        sequence: 1,
        observationType: 'fault_detected',
        occurredAt: new Date(BASE_TIME - 4000).toISOString(),
        values: {
          episodeId,
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs: BASE_TIME - 5000,
        },
      },
    });

    // Attempt second observation with same episodeId but conflicting start time
    expectAppError(
      () =>
        h.ingestService.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: randomUUID(),
            resourceId: h.camera,
            channel: 'fixture_fault_a',
            sequence: 2,
            observationType: 'fault_detected',
            occurredAt: new Date(BASE_TIME - 2000).toISOString(),
            values: {
              episodeId,
              causeCode: 'fixture_fault_a',
              episodeStartedAtMs: BASE_TIME - 6000, // conflicting!
            },
          },
        }),
      409,
      'EPISODE_CONFLICT',
    );
  });

  it('PIP-FIX-04: Alias collision: another episodeId with identical cause_code and episodeStartedAtMs fails closed with 409 EPISODE_CONFLICT', () => {
    const h = createPipelineHarness();

    const startMs = BASE_TIME - 5000;

    // First episode
    h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'fixture_fault_a',
        sequence: 1,
        observationType: 'fault_detected',
        occurredAt: new Date(BASE_TIME - 4000).toISOString(),
        values: {
          episodeId: 'ep-alias-1-' + randomUUID(),
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs: startMs,
        },
      },
    });

    // Second episode with different episodeId but identical cause and startMs
    expectAppError(
      () =>
        h.ingestService.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: randomUUID(),
            resourceId: h.camera,
            channel: 'fixture_fault_a',
            sequence: 2,
            observationType: 'fault_detected',
            occurredAt: new Date(BASE_TIME - 3000).toISOString(),
            values: {
              episodeId: 'ep-alias-2-' + randomUUID(), // different ID!
              causeCode: 'fixture_fault_a',
              episodeStartedAtMs: startMs, // identical cause and start!
            },
          },
        }),
      409,
      'EPISODE_CONFLICT',
    );
  });

  it('PIP-FIX-05: Rollback on episode conflict: neither event nor slot is persisted', () => {
    const h = createPipelineHarness();

    const episodeId = 'ep-rollback-' + randomUUID();
    h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'fixture_fault_a',
        sequence: 1,
        observationType: 'fault_detected',
        occurredAt: new Date(BASE_TIME - 4000).toISOString(),
        values: {
          episodeId,
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs: BASE_TIME - 5000,
        },
      },
    });

    const conflictingEventId = randomUUID();
    expectAppError(
      () =>
        h.ingestService.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: conflictingEventId,
            resourceId: h.camera,
            channel: 'fixture_fault_a',
            sequence: 2,
            observationType: 'fault_detected',
            occurredAt: new Date(BASE_TIME - 2000).toISOString(),
            values: {
              episodeId,
              causeCode: 'fixture_fault_a',
              episodeStartedAtMs: BASE_TIME - 6000, // conflicting start time!
            },
          },
        }),
      409,
      'EPISODE_CONFLICT',
    );

    // Verify slot 2 and conflicting event were not persisted
    const eventRow = h.db.prepare('SELECT event_id FROM telemetry_event WHERE event_id = ?').get(conflictingEventId);
    expect(eventRow).toBeUndefined();
    const slotRow = h.db
      .prepare('SELECT event_id FROM telemetry_sequence_slot WHERE sequence = 2 AND channel = ?')
      .get('fixture_fault_a');
    expect(slotRow).toBeUndefined();
  });

  // FIX-01B: Mandatory Effects and Fail-Closed Validation
  it('PIP-FIX-06: Hook effects missing cursor property fails closed with 500 PROJECTION_INCONSISTENCY', () => {
    const h = createPipelineHarness();

    const hookMissingCursor: TelemetryPipelineHook = {
      evaluateAndProject: () => ({
        disposition: 'applied',
        effects: {
          operationalProjection: false,
        } as any,
        reasonCode: 'TEST',
      }),
      project: (context, result) => {
        assertProjectedStateConsistent(context.db, context, result);
      },
    };

    const service = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: hookMissingCursor,
    });

    expectAppError(
      () =>
        service.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: randomUUID(),
            resourceId: h.camera,
            channel: 'heartbeat',
            sequence: 1,
            observationType: 'heartbeat',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: {},
          },
        }),
      500,
      'PROJECTION_INCONSISTENCY',
    );
  });

  it('PIP-FIX-07: Hook effects with null or non-object cursor fails closed with 500 PROJECTION_INCONSISTENCY', () => {
    const h = createPipelineHarness();

    const hookNullCursor: TelemetryPipelineHook = {
      evaluateAndProject: () => ({
        disposition: 'applied',
        effects: {
          cursor: null as any,
          operationalProjection: false,
        },
        reasonCode: 'TEST',
      }),
      project: (context, result) => {
        assertProjectedStateConsistent(context.db, context, result);
      },
    };

    const service = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: hookNullCursor,
    });

    expectAppError(
      () =>
        service.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: randomUUID(),
            resourceId: h.camera,
            channel: 'heartbeat',
            sequence: 1,
            observationType: 'heartbeat',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: {},
          },
        }),
      500,
      'PROJECTION_INCONSISTENCY',
    );
  });

  it('PIP-FIX-08: Hook effects missing operationalProjection boolean fails closed with 500 PROJECTION_INCONSISTENCY', () => {
    const h = createPipelineHarness();

    const hookMissingOperational: TelemetryPipelineHook = {
      evaluateAndProject: () => ({
        disposition: 'applied',
        effects: {
          cursor: { advanced: true, sequence: 1 },
        } as any,
        reasonCode: 'TEST',
      }),
      project: (context, result) => {
        assertProjectedStateConsistent(context.db, context, result);
      },
    };

    const service = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: hookMissingOperational,
    });

    expectAppError(
      () =>
        service.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: randomUUID(),
            resourceId: h.camera,
            channel: 'heartbeat',
            sequence: 1,
            observationType: 'heartbeat',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: {},
          },
        }),
      500,
      'PROJECTION_INCONSISTENCY',
    );
  });

  it('PIP-FIX-09: Applied heartbeat observation missing communication effect fails closed with 500 PROJECTION_INCONSISTENCY', () => {
    const h = createPipelineHarness();

    const hookMissingComm: TelemetryPipelineHook = {
      evaluateAndProject: () => ({
        disposition: 'applied',
        effects: {
          cursor: { advanced: true, sequence: 1 },
          operationalProjection: true,
          // communication missing!
        },
        reasonCode: 'TEST',
      }),
      project: (context, result) => {
        assertProjectedStateConsistent(context.db, context, result);
      },
    };

    const service = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: hookMissingComm,
    });

    expectAppError(
      () =>
        service.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: randomUUID(),
            resourceId: h.camera,
            channel: 'heartbeat',
            sequence: 1,
            observationType: 'heartbeat',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: {},
          },
        }),
      500,
      'PROJECTION_INCONSISTENCY',
    );
  });

  it('PIP-FIX-10: Applied position observation missing position effect fails closed with 500 PROJECTION_INCONSISTENCY', () => {
    const h = createPipelineHarness();

    const hookMissingPos: TelemetryPipelineHook = {
      evaluateAndProject: () => ({
        disposition: 'applied',
        effects: {
          cursor: { advanced: true, sequence: 1 },
          operationalProjection: true,
          // position missing!
        },
        reasonCode: 'TEST',
      }),
      project: (context, result) => {
        assertProjectedStateConsistent(context.db, context, result);
      },
    };

    const service = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: hookMissingPos,
    });

    expectAppError(
      () =>
        service.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: randomUUID(),
            resourceId: h.mobile,
            channel: 'position',
            sequence: 1,
            observationType: 'position',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: { latitude: -23.5, longitude: -46.6 },
          },
        }),
      500,
      'PROJECTION_INCONSISTENCY',
    );
  });

  it('PIP-FIX-11: Historical disposition declaring communication projection fails closed with 500 PROJECTION_INCONSISTENCY', () => {
    const h = createPipelineHarness();

    const hookIllegalHistoricalComm: TelemetryPipelineHook = {
      evaluateAndProject: (context) => ({
        disposition: 'historical',
        effects: {
          cursor: { advanced: false, sequence: 1 },
          communication: {
            projected: true,
            resourceId: context.canonicalEvent.payload.resourceId,
            sourceId: context.auth.sourceId,
            eventId: context.canonicalEvent.eventId,
            channel: 'heartbeat',
            observedAtMs: BASE_TIME,
          },
          operationalProjection: false,
        },
        reasonCode: 'TEST',
      }),
      project: (context, result) => {
        assertProjectedStateConsistent(context.db, context, result);
      },
    };

    const service = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: hookIllegalHistoricalComm,
    });

    expectAppError(
      () =>
        service.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: randomUUID(),
            resourceId: h.camera,
            channel: 'heartbeat',
            sequence: 1,
            observationType: 'heartbeat',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: {},
          },
        }),
      500,
      'PROJECTION_INCONSISTENCY',
    );
  });

  it('PIP-FIX-12: Ignored disposition declaring position projection fails closed with 500 PROJECTION_INCONSISTENCY', () => {
    const h = createPipelineHarness();

    const hookIllegalIgnoredPos: TelemetryPipelineHook = {
      evaluateAndProject: (context) => ({
        disposition: 'ignored',
        effects: {
          cursor: { advanced: false, sequence: 1 },
          position: {
            projected: true,
            resourceId: context.canonicalEvent.payload.resourceId,
            sourceId: context.auth.sourceId,
            eventId: context.canonicalEvent.eventId,
            channel: 'position',
            observedAtMs: BASE_TIME,
            latitude: -23.5,
            longitude: -46.6,
            accuracyM: null,
            regionId: null,
          },
          operationalProjection: false,
        },
        reasonCode: 'TEST',
      }),
      project: (context, result) => {
        assertProjectedStateConsistent(context.db, context, result);
      },
    };

    const service = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: hookIllegalIgnoredPos,
    });

    expectAppError(
      () =>
        service.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: randomUUID(),
            resourceId: h.mobile,
            channel: 'position',
            sequence: 1,
            observationType: 'position',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: { latitude: -23.5, longitude: -46.6 },
          },
        }),
      500,
      'PROJECTION_INCONSISTENCY',
    );
  });

  // FIX-01C: Closed Schema & Extra Field Rejection
  it('PIP-FIX-13: Unknown root property in effects fails closed with 500 PROJECTION_INCONSISTENCY', () => {
    const h = createPipelineHarness();

    const hookUnknownRoot: TelemetryPipelineHook = {
      evaluateAndProject: () => ({
        disposition: 'applied',
        effects: {
          cursor: { advanced: true, sequence: 1 },
          communication: {
            projected: true,
            resourceId: h.camera,
            sourceId: h.sourceId,
            eventId: 'ev-1',
            channel: 'heartbeat',
            observedAtMs: BASE_TIME,
          },
          operationalProjection: true,
          extraUnknownField: 'PROHIBITED_METADATA', // unknown key!
        } as any,
        reasonCode: 'TEST',
      }),
      project: (context, result) => {
        assertProjectedStateConsistent(context.db, context, result);
      },
    };

    const service = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: hookUnknownRoot,
    });

    expectAppError(
      () =>
        service.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: randomUUID(),
            resourceId: h.camera,
            channel: 'heartbeat',
            sequence: 1,
            observationType: 'heartbeat',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: {},
          },
        }),
      500,
      'PROJECTION_INCONSISTENCY',
    );
  });

  it('PIP-FIX-14: Unknown property inside cursor fails closed with 500 PROJECTION_INCONSISTENCY', () => {
    const h = createPipelineHarness();

    const hookUnknownCursorKey: TelemetryPipelineHook = {
      evaluateAndProject: () => ({
        disposition: 'applied',
        effects: {
          cursor: {
            advanced: true,
            sequence: 1,
            rogueCursorKey: 123, // unknown!
          } as any,
          communication: {
            projected: true,
            resourceId: h.camera,
            sourceId: h.sourceId,
            eventId: 'ev-1',
            channel: 'heartbeat',
            observedAtMs: BASE_TIME,
          },
          operationalProjection: true,
        },
        reasonCode: 'TEST',
      }),
      project: (context, result) => {
        assertProjectedStateConsistent(context.db, context, result);
      },
    };

    const service = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: hookUnknownCursorKey,
    });

    expectAppError(
      () =>
        service.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: randomUUID(),
            resourceId: h.camera,
            channel: 'heartbeat',
            sequence: 1,
            observationType: 'heartbeat',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: {},
          },
        }),
      500,
      'PROJECTION_INCONSISTENCY',
    );
  });

  it('PIP-FIX-15: Unknown property inside communication fails closed with 500 PROJECTION_INCONSISTENCY', () => {
    const h = createPipelineHarness();

    const hookUnknownCommKey: TelemetryPipelineHook = {
      evaluateAndProject: (context) => ({
        disposition: 'applied',
        effects: {
          cursor: { advanced: true, sequence: 1 },
          communication: {
            projected: true,
            resourceId: h.camera,
            sourceId: h.sourceId,
            eventId: context.canonicalEvent.eventId,
            channel: 'heartbeat',
            observedAtMs: BASE_TIME,
            rogueCommKey: 'BAD', // unknown!
          } as any,
          operationalProjection: true,
        },
        reasonCode: 'TEST',
      }),
      project: (context, result) => {
        assertProjectedStateConsistent(context.db, context, result);
      },
    };

    const service = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: hookUnknownCommKey,
    });

    expectAppError(
      () =>
        service.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: randomUUID(),
            resourceId: h.camera,
            channel: 'heartbeat',
            sequence: 1,
            observationType: 'heartbeat',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: {},
          },
        }),
      500,
      'PROJECTION_INCONSISTENCY',
    );
  });

  it('PIP-FIX-16: Unknown property inside position fails closed with 500 PROJECTION_INCONSISTENCY', () => {
    const h = createPipelineHarness();

    const hookUnknownPosKey: TelemetryPipelineHook = {
      evaluateAndProject: (context) => ({
        disposition: 'applied',
        effects: {
          cursor: { advanced: true, sequence: 1 },
          position: {
            projected: true,
            resourceId: h.mobile,
            sourceId: h.sourceId,
            eventId: context.canonicalEvent.eventId,
            channel: 'position',
            observedAtMs: BASE_TIME,
            latitude: -23.5,
            longitude: -46.6,
            accuracyM: null,
            regionId: null,
            altitudeMeters: 800, // unknown key!
          } as any,
          operationalProjection: true,
        },
        reasonCode: 'TEST',
      }),
      project: (context, result) => {
        assertProjectedStateConsistent(context.db, context, result);
      },
    };

    const service = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: hookUnknownPosKey,
    });

    expectAppError(
      () =>
        service.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: randomUUID(),
            resourceId: h.mobile,
            channel: 'position',
            sequence: 1,
            observationType: 'position',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: { latitude: -23.5, longitude: -46.6 },
          },
        }),
      500,
      'PROJECTION_INCONSISTENCY',
    );
  });

  it('PIP-FIX-17: Unknown property inside episode fails closed with 500 PROJECTION_INCONSISTENCY', () => {
    const h = createPipelineHarness();

    const realHook = new DefaultTelemetryPipelineHook();
    const hookUnknownEpKey: TelemetryPipelineHook = {
      evaluateAndProject: (context) => {
        const res = realHook.evaluateAndProject(context);
        if (res.effects && res.effects.episode) {
          (res.effects.episode as any).rogueEpisodeKey = true;
        }
        return res;
      },
      project: (context, result) => {
        realHook.project(context, result);
      },
    };

    const service = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: hookUnknownEpKey,
    });

    expectAppError(
      () =>
        service.ingest(h.db, {
          commandId: randomUUID(),
          rawToken: h.rawToken,
          datasetId: h.datasetId,
          epoch: 1,
          envelope: {
            eventId: randomUUID(),
            resourceId: h.camera,
            channel: 'fixture_fault_a',
            sequence: 1,
            observationType: 'fault_detected',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: {
              episodeId: 'ep-1',
              causeCode: 'fixture_fault_a',
              episodeStartedAtMs: BASE_TIME - 1000,
            },
          },
        }),
      500,
      'PROJECTION_INCONSISTENCY',
    );
  });

  // Performance Verification
  it('PIP-PERF-01: Rapid ingestion of 25 consecutive observations completes within 3000ms', () => {
    const h = createPipelineHarness();
    const startTime = Date.now();

    for (let i = 1; i <= 25; i++) {
      h.ingestService.ingest(h.db, {
        commandId: randomUUID(),
        rawToken: h.rawToken,
        datasetId: h.datasetId,
        epoch: 1,
        envelope: {
          eventId: randomUUID(),
          resourceId: h.camera,
          channel: 'heartbeat',
          sequence: i,
          observationType: 'heartbeat',
          occurredAt: new Date(BASE_TIME - 25000 + i * 1000).toISOString(),
          values: {},
        },
      });
    }

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(3000);

    const cursor = h.db
      .prepare('SELECT * FROM telemetry_channel_cursor WHERE dataset_id = ? AND resource_id = ? AND channel = ?')
      .get(h.datasetId, h.camera, 'heartbeat') as any;
    expect(cursor.max_sequence_seen).toBe(25);
  });
});
