/**
 * PROJECT IGNIS — T0007 / PKG-05
 * Testes normativos de Ingestão Telemétrica Canônica e Deduplicação (C03, C02, D08).
 * Cobertura de ING-01 a ING-32.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { AppError } from '../src/errors.js';
import { Store, transaction } from '../src/persistence/store.js';
import { generateDemo } from '../src/demo/service.js';
import { authorization, sessionFor } from './support/foundation-fixture.js';
import { generation } from './support/t0005-fixture.js';
import {
  SettableTimeProvider,
  TrustedClockService,
  TelemetryAuthService,
  TelemetryBindingService,
  TelemetryProfileValidator,
  buildCanonicalEvent,
  buildCanonicalCommand,
  CanonicalTelemetryIngestService,
  ClockTamperedSampleError,
  ClockInvalidTimestampError,
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
      // ignore if already closed
    }
    const target = resolve(f.directory);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('ignis-t0007-ingest-')) {
      throw new Error('Temporary fixture cleanup outside allocated directory');
    }
    try {
      rmSync(target, { recursive: true, force: true });
    } catch {
      // Windows lock retry or ignore
    }
  }
});

function insert(db: Database.Database, table: string, row: Row) {
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...Object.values(row));
}

function rows(db: Database.Database, table: string) {
  return db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
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

function createTestHarness(initialTime: number = BASE_TIME) {
  const directory = mkdtempSync(join(tmpdir(), "ignis-t0007-ingest-'-"));
  const path = join(directory, 'test.sqlite');
  const store = new Store(path, true);
  fixtures.push({ directory, store });

  const installation = store.migrate();
  const { datasetId, actorId } = installation;
  expect(generateDemo(authorization(store), sessionFor(store, actorId), datasetId, 1, generation()).status).toBe(201);

  const camera = (store.db.prepare("SELECT id FROM equipment WHERE category_code='camera' LIMIT 1").get() as { id: string }).id;
  const mobile = (store.db.prepare("SELECT id FROM equipment WHERE category_code='inspection_vehicle' LIMIT 1").get() as { id: string }).id;
  const agent = (store.db.prepare('SELECT id FROM agent LIMIT 1').get() as { id: string }).id;

  const sourceId = randomUUID();
  insert(store.db, 'telemetry_source', {
    id: sourceId,
    source_kind: 'fixture_source',
    provisioned_by: actorId,
    active: 1,
    created_at_ms: BASE_TIME - 10000,
  });

  const rawToken = 'raw-token-' + randomUUID();
  const tokenHash = createHash('sha256').update(rawToken, 'utf8').digest('hex');
  insert(store.db, 'telemetry_credential', {
    token_hash: tokenHash,
    source_id: sourceId,
    issued_at_ms: BASE_TIME - 10000,
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
      assigned_at_ms: BASE_TIME - 5000,
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
    resource_born_at_ms: BASE_TIME - 100000,
    history_allowed_from_ms: BASE_TIME - 50000,
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
    resource_born_at_ms: BASE_TIME - 100000,
    history_allowed_from_ms: BASE_TIME - 50000,
  });

  const agentBindingId = randomUUID();
  insert(store.db, 'telemetry_binding', {
    dataset_id: datasetId,
    epoch: 1,
    id: agentBindingId,
    source_id: sourceId,
    resource_id: agent,
    resource_kind: 'agent',
    channel: 'agent_activity',
    projection_field: 'activity',
    profile_id: 'FX-AGENT-v1',
    profile_version: 1,
    active: 1,
    resource_born_at_ms: BASE_TIME - 100000,
    history_allowed_from_ms: BASE_TIME - 50000,
  });

  const timeProvider = new SettableTimeProvider(initialTime);
  const clockService = new TrustedClockService(timeProvider);
  const authService = new TelemetryAuthService({ clockService, timeProvider });
  const bindingService = new TelemetryBindingService();
  const profileValidator = new TelemetryProfileValidator();

  const defaultHook: TelemetryPipelineHook = {
    evaluateAndProject: () => ({
      disposition: 'applied',
      effects: { communication: true },
      reasonCode: 'TEST_HOOK_APPLIED',
    }),
    project: () => {},
  };

  const ingestService = new CanonicalTelemetryIngestService({
    clockService,
    authService,
    bindingService,
    profileValidator,
    pipelineHook: defaultHook,
  });

  return {
    directory,
    store,
    db: store.db,
    datasetId,
    actorId,
    sourceId,
    rawToken,
    camera,
    mobile,
    agent,
    cameraBindingId,
    mobileBindingId,
    agentBindingId,
    timeProvider,
    clockService,
    authService,
    bindingService,
    profileValidator,
    defaultHook,
    ingestService,
  };
}

describe('T0007 / PKG-05 — Canonical Ingestion & Deduplication Suite', () => {
  // --------------------------------------------------------------------------
  // SECTION 1: Canonicalization & Identity (ING-01 to ING-07)
  // --------------------------------------------------------------------------

  it('ING-01: JCS key ordering independence produces identical canonical string and SHA-256 hash', () => {
    const h = createTestHarness();
    const eventId = randomUUID();
    const commandId = randomUUID();

    const inputA: IngestTelemetryInput = {
      commandId,
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId,
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    };

    const inputB: IngestTelemetryInput = {
      datasetId: h.datasetId,
      commandId,
      epoch: 1,
      rawToken: h.rawToken,
      envelope: {
        values: {},
        occurredAt: '2026-10-26T12:00:00.000Z',
        sequence: 1,
        channel: 'heartbeat',
        observationType: 'heartbeat',
        resourceId: h.camera,
        eventId,
      },
    };

    const ceA = buildCanonicalEvent({
      datasetId: h.datasetId,
      epoch: 1,
      sourceId: h.sourceId,
      sourceKind: 'fixture_source',
      resourceKind: 'equipment',
      envelope: inputA.envelope,
      canonicalValues: {},
      occurredAtISO: '2026-10-26T12:00:00.000Z',
    });

    const ceB = buildCanonicalEvent({
      datasetId: h.datasetId,
      epoch: 1,
      sourceId: h.sourceId,
      sourceKind: 'fixture_source',
      resourceKind: 'equipment',
      envelope: inputB.envelope,
      canonicalValues: {},
      occurredAtISO: '2026-10-26T12:00:00.000Z',
    });

    expect(ceA.canonicalJson).toBe(ceB.canonicalJson);
    expect(ceA.eventHash).toBe(ceB.eventHash);
    expect(ceA.eventHash).toHaveLength(64);
  });

  it('ING-02: Values containing -0 normalize to 0 without differing hash', () => {
    const h = createTestHarness();
    const eventId = randomUUID();

    const ceNormal = buildCanonicalEvent({
      datasetId: h.datasetId,
      epoch: 1,
      sourceId: h.sourceId,
      sourceKind: 'fixture_source',
      resourceKind: 'equipment',
      envelope: {
        eventId,
        resourceId: h.mobile,
        channel: 'position',
        sequence: 1,
        observationType: 'position',
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: { latitude: 0, longitude: -46.63, accuracyM: 5 },
      },
      canonicalValues: { latitude: 0, longitude: -46.63, accuracyM: 5 },
      occurredAtISO: '2026-10-26T12:00:00.000Z',
    });

    const ceNegZero = buildCanonicalEvent({
      datasetId: h.datasetId,
      epoch: 1,
      sourceId: h.sourceId,
      sourceKind: 'fixture_source',
      resourceKind: 'equipment',
      envelope: {
        eventId,
        resourceId: h.mobile,
        channel: 'position',
        sequence: 1,
        observationType: 'position',
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: { latitude: -0, longitude: -46.63, accuracyM: 5 },
      },
      canonicalValues: { latitude: -0, longitude: -46.63, accuracyM: 5 },
      occurredAtISO: '2026-10-26T12:00:00.000Z',
    });

    expect(ceNormal.canonicalJson).toBe(ceNegZero.canonicalJson);
    expect(ceNormal.eventHash).toBe(ceNegZero.eventHash);
    expect(ceNegZero.canonicalJson).toContain('"latitude":0');
    expect(ceNegZero.canonicalJson).not.toContain('"latitude":-0');
  });

  it('ING-03: Number representation in safe integer and decimal ranges produces deterministic JCS serialization', () => {
    const h = createTestHarness();
    const eventId = randomUUID();

    const ce = buildCanonicalEvent({
      datasetId: h.datasetId,
      epoch: 1,
      sourceId: h.sourceId,
      sourceKind: 'fixture_source',
      resourceKind: 'equipment',
      envelope: {
        eventId,
        resourceId: h.mobile,
        channel: 'position',
        sequence: 1,
        observationType: 'position',
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: { latitude: -23.55052, longitude: -46.633308, accuracyM: 10 },
      },
      canonicalValues: { latitude: -23.55052, longitude: -46.633308, accuracyM: 10 },
      occurredAtISO: '2026-10-26T12:00:00.000Z',
    });

    expect(ce.canonicalJson).toContain('"accuracyM":10');
    expect(ce.canonicalJson).toContain('"latitude":-23.55052');
    expect(ce.canonicalJson).toContain('"longitude":-46.633308');
  });

  it('ING-04: payload.values strips internal discriminator kind', () => {
    const h = createTestHarness();
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
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: { latitude: -23.55, longitude: -46.63, accuracyM: 10 },
      },
    });

    expect(res.status).toBe(200);
    const eventRow = h.db.prepare('SELECT canonical_json FROM telemetry_event WHERE event_id = ?').get(res.body.eventId) as { canonical_json: string };
    const parsedCe = JSON.parse(eventRow.canonical_json);
    expect(parsedCe.payload.values).not.toHaveProperty('kind');
    expect(parsedCe.payload.values).toEqual({ latitude: -23.55, longitude: -46.63, accuracyM: 10 });
  });

  it('ING-05: Heartbeat canonical values is empty object {}', () => {
    const h = createTestHarness();
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
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    });

    expect(res.status).toBe(200);
    const eventRow = h.db.prepare('SELECT canonical_json FROM telemetry_event WHERE event_id = ?').get(res.body.eventId) as { canonical_json: string };
    const parsedCe = JSON.parse(eventRow.canonical_json);
    expect(parsedCe.payload.values).toEqual({});
  });

  it('ING-06: Omitted/null units and causationId normalize to null', () => {
    const h = createTestHarness();
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
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    });

    const eventRow = h.db.prepare('SELECT canonical_json FROM telemetry_event WHERE event_id = ?').get(res.body.eventId) as { canonical_json: string };
    const parsedCe = JSON.parse(eventRow.canonical_json);
    expect(parsedCe.causationId).toBeNull();
    expect(parsedCe.payload.units).toBeNull();
  });

  it('ING-07: Timestamp offset equivalence produces identical canonical UTC string and hash', () => {
    const h = createTestHarness();
    const eventId = randomUUID();

    const ceUtc = buildCanonicalEvent({
      datasetId: h.datasetId,
      epoch: 1,
      sourceId: h.sourceId,
      sourceKind: 'fixture_source',
      resourceKind: 'equipment',
      envelope: {
        eventId,
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
      canonicalValues: {},
      occurredAtISO: new Date('2026-10-26T12:00:00.000Z').toISOString(),
    });

    const ceOffset = buildCanonicalEvent({
      datasetId: h.datasetId,
      epoch: 1,
      sourceId: h.sourceId,
      sourceKind: 'fixture_source',
      resourceKind: 'equipment',
      envelope: {
        eventId,
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: '2026-10-26T15:00:00+03:00',
        values: {},
      },
      canonicalValues: {},
      occurredAtISO: new Date('2026-10-26T15:00:00+03:00').toISOString(),
    });

    expect(ceUtc.canonicalJson).toBe(ceOffset.canonicalJson);
    expect(ceUtc.eventHash).toBe(ceOffset.eventHash);
    expect(ceOffset.canonicalJson).toContain('"occurredAt":"2026-10-26T12:00:00.000Z"');
  });

  // --------------------------------------------------------------------------
  // SECTION 2: Ingestion Deduplication (ING-08 to ING-12)
  // --------------------------------------------------------------------------

  it('ING-08: Kc exact replay returns 200 Replay with Idempotency-Replayed header and does not alter revision', () => {
    const h = createTestHarness();
    const commandId = randomUUID();
    const eventId = randomUUID();

    const input: IngestTelemetryInput = {
      commandId,
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId,
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    };

    const first = h.ingestService.ingest(h.db, input);
    expect(first.status).toBe(200);
    expect(first.replayed).toBe(false);
    expect(first.headers['Idempotency-Replayed']).toBeUndefined();
    const initialRevision = first.body.resultingRevision;

    const second = h.ingestService.ingest(h.db, input);
    expect(second.status).toBe(200);
    expect(second.replayed).toBe(true);
    expect(second.headers['Idempotency-Replayed']).toBe('true');
    expect(second.body.resultingRevision).toBe(initialRevision);
    expect(second.body.eventId).toBe(eventId);

    const eventRows = rows(h.db, 'telemetry_event');
    const receiptRows = rows(h.db, 'telemetry_command_receipt');
    expect(eventRows).toHaveLength(1);
    expect(receiptRows).toHaveLength(1);
  });

  it('ING-09: Kc conflict throws 409 IDEMPOTENCY_CONFLICT when commandId is reused with different content', () => {
    const h = createTestHarness();
    const commandId = randomUUID();

    const inputA: IngestTelemetryInput = {
      commandId,
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    };

    const first = h.ingestService.ingest(h.db, inputA);
    expect(first.status).toBe(200);

    const inputB: IngestTelemetryInput = {
      commandId, // Reusing commandId
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(), // Divergent eventId
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 2,
        observationType: 'heartbeat',
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    };

    expectAppError(() => h.ingestService.ingest(h.db, inputB), 409, 'IDEMPOTENCY_CONFLICT');
  });

  it('ING-10: Ke exact replay with new commandId records only new receipt without incrementing revision or duplicating events', () => {
    const h = createTestHarness();
    const eventId = randomUUID();
    const cmd1 = randomUUID();
    const cmd2 = randomUUID();

    const input1: IngestTelemetryInput = {
      commandId: cmd1,
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId,
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    };

    const first = h.ingestService.ingest(h.db, input1);
    expect(first.status).toBe(200);
    const initialRev = first.body.resultingRevision;

    const input2: IngestTelemetryInput = {
      commandId: cmd2, // New command ID
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId, // Same event ID and identical payload
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    };

    const second = h.ingestService.ingest(h.db, input2);
    expect(second.status).toBe(200);
    expect(second.replayed).toBe(true);
    expect(second.body.resultingRevision).toBe(initialRev);

    expect(rows(h.db, 'telemetry_event')).toHaveLength(1);
    expect(rows(h.db, 'telemetry_sequence_slot')).toHaveLength(1);
    expect(rows(h.db, 'telemetry_command_receipt')).toHaveLength(2);

    const epochRow = h.db.prepare('SELECT revision FROM dataset_epoch WHERE dataset_id = ? AND epoch = 1').get(h.datasetId) as { revision: number };
    expect(epochRow.revision).toBe(initialRev);
  });

  it('ING-11: Ke conflict throws 409 EVENT_CONFLICT when eventId is reused with different content', () => {
    const h = createTestHarness();
    const eventId = randomUUID();

    const input1: IngestTelemetryInput = {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId,
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    };

    h.ingestService.ingest(h.db, input1);

    const input2: IngestTelemetryInput = {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId, // Reusing eventId with different sequence
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 2,
        observationType: 'heartbeat',
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    };

    expectAppError(() => h.ingestService.ingest(h.db, input2), 409, 'EVENT_CONFLICT');
  });

  it('ING-12: Ks slot collision throws 409 SEQUENCE_SLOT_COLLISION when sequence is occupied by another eventId', () => {
    const h = createTestHarness();

    const input1: IngestTelemetryInput = {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 10,
        observationType: 'heartbeat',
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    };

    h.ingestService.ingest(h.db, input1);

    const input2: IngestTelemetryInput = {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(), // Different eventId
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 10,          // Same slot
        observationType: 'heartbeat',
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    };

    expectAppError(() => h.ingestService.ingest(h.db, input2), 409, 'SEQUENCE_SLOT_COLLISION');
  });

  // --------------------------------------------------------------------------
  // SECTION 3: Security & Authorization (ING-13 to ING-17)
  // --------------------------------------------------------------------------

  it('ING-13: Credential revoked or source deactivated fails 401/403 BEFORE exposing replay of existing receipt', () => {
    const h = createTestHarness();
    const commandId = randomUUID();
    const eventId = randomUUID();

    const input: IngestTelemetryInput = {
      commandId,
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId,
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    };

    const ok = h.ingestService.ingest(h.db, input);
    expect(ok.status).toBe(200);

    // 1. Revoke credential: replay attempt must fail 401 UNAUTHORIZED rather than returning replayed receipt
    h.db.prepare('UPDATE telemetry_credential SET revoked_at_ms = ? WHERE source_id = ?').run(BASE_TIME, h.sourceId);
    expectAppError(() => h.ingestService.ingest(h.db, input), 401, 'UNAUTHORIZED');

    // 2. Test source deactivated with a separate source on camera 2
    const camera2 = (h.db.prepare("SELECT id FROM equipment WHERE category_code='camera' AND id != ? LIMIT 1").get(h.camera) as { id: string }).id;
    const source2Id = randomUUID();
    insert(h.db, 'telemetry_source', {
      id: source2Id,
      source_kind: 'fixture_source',
      provisioned_by: h.actorId,
      active: 1,
      created_at_ms: BASE_TIME - 10000,
    });
    const token2 = 'raw-token-2-' + randomUUID();
    const token2Hash = createHash('sha256').update(token2, 'utf8').digest('hex');
    insert(h.db, 'telemetry_credential', {
      token_hash: token2Hash,
      source_id: source2Id,
      issued_at_ms: BASE_TIME - 10000,
      expires_at_ms: BASE_TIME + 86400000,
      revoked_at_ms: null,
    });
    insert(h.db, 'telemetry_resource_profile', {
      dataset_id: h.datasetId,
      epoch: 1,
      resource_id: camera2,
      resource_kind: 'equipment',
      profile_id: 'FX-FIXED-v1',
      profile_version: 1,
      active: 1,
      assigned_at_ms: BASE_TIME - 5000,
    });
    insert(h.db, 'telemetry_binding', {
      dataset_id: h.datasetId,
      epoch: 1,
      id: randomUUID(),
      source_id: source2Id,
      resource_id: camera2,
      resource_kind: 'equipment',
      channel: 'heartbeat',
      projection_field: 'communication',
      profile_id: 'FX-FIXED-v1',
      profile_version: 1,
      active: 1,
      resource_born_at_ms: BASE_TIME - 100000,
      history_allowed_from_ms: BASE_TIME - 50000,
    });

    const input2: IngestTelemetryInput = {
      commandId: randomUUID(),
      rawToken: token2,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: camera2,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    };
    const ok2 = h.ingestService.ingest(h.db, input2);
    expect(ok2.status).toBe(200);

    // Deactivate source 2: replay attempt must fail 403 FORBIDDEN rather than returning replayed receipt
    h.db.prepare('UPDATE telemetry_source SET active = 0 WHERE id = ?').run(source2Id);
    expectAppError(() => h.ingestService.ingest(h.db, input2), 403, 'FORBIDDEN');
  });

  it('ING-14: Retired epoch fails 409 EPOCH_CONFLICT before exposing replay', () => {
    const h = createTestHarness();
    const commandId = randomUUID();
    const eventId = randomUUID();

    const input: IngestTelemetryInput = {
      commandId,
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId,
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    };

    const ok = h.ingestService.ingest(h.db, input);
    expect(ok.status).toBe(200);

    // Retire the epoch
    h.db.prepare("UPDATE dataset_epoch SET status = 'retired' WHERE dataset_id = ? AND epoch = 1").run(h.datasetId);

    expectAppError(() => h.ingestService.ingest(h.db, input), 409, 'EPOCH_CONFLICT');
  });

  it('ING-15 (HIGH-02): Relational metadata check under foreign_keys = ON without artificial corruption', () => {
    const h = createTestHarness();
    expect(h.db.pragma('foreign_keys', { simple: true })).toBe(1);

    // Component 1: SQLite schema / DDL integrity
    // Attempting to insert an incompatible profile assignment for equipment must be rejected by triggers
    expect(() =>
      insert(h.db, 'telemetry_resource_profile', {
        dataset_id: h.datasetId,
        epoch: 1,
        resource_id: h.camera, // camera is category 'camera'
        resource_kind: 'equipment',
        profile_id: 'FX-MOBILE-v1', // FX-MOBILE-v1 requires category 'inspection_vehicle'
        profile_version: 1,
        active: 1,
        assigned_at_ms: BASE_TIME,
      }),
    ).toThrow(/Incompatible resource telemetry profile/);

    // Component 2: Validator contract on mismatched metadata
    // Directly verify that TelemetryProfileValidator fails closed with 422 INVALID_VALUE when metadata diverges
    const rawFixedEnv = {
      channel: 'heartbeat',
      observationType: 'heartbeat',
      occurredAtMs: BASE_TIME,
      values: {},
    };
    const cameraBinding = h.db.transaction(() => {
      const auth = h.authService.authenticateSource(h.db, h.rawToken, h.datasetId, 1);
      return h.bindingService.assertBindingActiveInTx(h.db, auth, h.camera, 'heartbeat');
    })();

    // Mismatched mobility
    expectAppError(
      () =>
        h.profileValidator.validate(cameraBinding, rawFixedEnv, {
          resourceId: h.camera,
          resourceKind: 'equipment',
          categoryCode: 'camera',
          categoryVersion: 1,
          mobility: 'mobile', // FX-FIXED-v1 requires 'fixed'
        }),
      422,
      'INVALID_VALUE',
    );

    // Mismatched categoryCode
    expectAppError(
      () =>
        h.profileValidator.validate(cameraBinding, rawFixedEnv, {
          resourceId: h.camera,
          resourceKind: 'equipment',
          categoryCode: 'radar',
          categoryVersion: 1,
          mobility: 'fixed',
        }),
      422,
      'INVALID_VALUE',
    );

    // Component 3: Integration flow with valid equipment and agent
    // Service queries real relational tables, passes real metadata to validator, and commits successfully
    const equipRes = h.ingestService.ingest(h.db, {
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
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    });
    expect(equipRes.status).toBe(200);

    const agentRes = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.agent,
        channel: 'agent_activity',
        sequence: 1,
        observationType: 'agent_activity',
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: { activity: 'available' },
      },
    });
    expect(agentRes.status).toBe(200);

    // Confirm foreign_keys remained ON throughout
    expect(h.db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('ING-16 (ACH-002): Position observation with non-finite or negative accuracyM fails 422 INVALID_VALUE', () => {
    const h = createTestHarness();

    const inputWithNegativeAccuracy: IngestTelemetryInput = {
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
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: { latitude: -23.55, longitude: -46.63, accuracyM: -1 },
      },
    };

    expectAppError(() => h.ingestService.ingest(h.db, inputWithNegativeAccuracy), 422, 'INVALID_VALUE');

    const inputWithNaN: IngestTelemetryInput = {
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
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: { latitude: -23.55, longitude: -46.63, accuracyM: NaN },
      },
    };

    expectAppError(() => h.ingestService.ingest(h.db, inputWithNaN), 422, 'INVALID_VALUE');
  });

  it('ING-17 (ACH-003): Divergent resourceId vs missing binding', () => {
    const h = createTestHarness();

    // 1. Source requests resource with missing binding -> 403 FORBIDDEN
    const unassignedResource = randomUUID();
    const inputMissingBinding: IngestTelemetryInput = {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: unassignedResource,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    };

    expectAppError(() => h.ingestService.ingest(h.db, inputMissingBinding), 403, 'FORBIDDEN');

    // 2. Binding exists for camera, but payload specifies conflicting entityId -> 422 INVALID_VALUE
    const inputConflictingEntityId: IngestTelemetryInput = {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        entityId: h.mobile, // Diverges from resourceId!
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    };

    expectAppError(() => h.ingestService.ingest(h.db, inputConflictingEntityId), 422, 'INVALID_VALUE');
  });

  // --------------------------------------------------------------------------
  // SECTION 4: Clock & Window Evaluation (ING-18 to ING-20)
  // --------------------------------------------------------------------------

  it('ING-18: Host clock regression against durable watermark fails closed with 503 CLOCK_UNTRUSTED', () => {
    const h = createTestHarness(BASE_TIME);

    // Perform an initial ingest to advance durable watermark
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
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    });
    expect(res.status).toBe(200);

    const durable = h.clockService.getDurableWatermark(h.db);
    expect(durable).toBe(BASE_TIME);

    // Now regress physical clock into the past
    h.timeProvider.setTime(BASE_TIME - 10000);

    const inputAfterRegression: IngestTelemetryInput = {
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
        occurredAt: '2026-10-26T11:59:50.000Z',
        values: {},
      },
    };

    expectAppError(() => h.ingestService.ingest(h.db, inputAfterRegression), 503, 'CLOCK_UNTRUSTED');
  });

  it('ING-19: Tolerated future (<= 30s) clamps effective time to dataNow and DOES NOT advance durable clock', () => {
    const h = createTestHarness(BASE_TIME);

    // Event occurred 15s in the future
    const futureTimeMs = BASE_TIME + 15000;
    const futureTimeISO = new Date(futureTimeMs).toISOString();

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
        occurredAt: futureTimeISO,
        values: {},
      },
    });

    expect(res.status).toBe(200);

    const eventRow = h.db.prepare('SELECT occurred_at_ms, observation_effective_at_ms, canonical_json FROM telemetry_event WHERE event_id = ?').get(res.body.eventId) as {
      occurred_at_ms: number;
      observation_effective_at_ms: number;
      canonical_json: string;
    };

    // Original occurredAtMs is preserved in event row and Ce
    expect(eventRow.occurred_at_ms).toBe(futureTimeMs);
    const parsedCe = JSON.parse(eventRow.canonical_json);
    expect(parsedCe.occurredAt).toBe(futureTimeISO);

    // Effective observation time is clamped to processingDataNowMs (BASE_TIME)
    expect(eventRow.observation_effective_at_ms).toBe(BASE_TIME);

    // D08 Interpretation B: durable clock is NOT advanced for future tolerated observations
    const durable = h.clockService.getDurableWatermark(h.db);
    expect(durable).toBeNull();
  });

  it('ING-20: Excessive future (> 30s) is rejected with 422 EXCESSIVE_FUTURE before any writes', () => {
    const h = createTestHarness(BASE_TIME);

    // Event occurred 35s in the future (> 30s limit)
    const futureTimeMs = BASE_TIME + 35000;
    const futureTimeISO = new Date(futureTimeMs).toISOString();

    const input: IngestTelemetryInput = {
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
        occurredAt: futureTimeISO,
        values: {},
      },
    };

    expectAppError(() => h.ingestService.ingest(h.db, input), 422, 'EXCESSIVE_FUTURE');

    // Confirm no writes occurred
    expect(rows(h.db, 'telemetry_event')).toHaveLength(0);
    expect(rows(h.db, 'telemetry_sequence_slot')).toHaveLength(0);
    expect(rows(h.db, 'telemetry_command_receipt')).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // SECTION 5: Pipeline Hook & Transactional Consistency (ING-21 to ING-25)
  // --------------------------------------------------------------------------

  it('ING-21: Missing pipeline hook fails closed with 500 PIPELINE_HOOK_REQUIRED', () => {
    const h = createTestHarness(BASE_TIME);

    const ingestWithoutHook = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      // pipelineHook deliberately omitted
    });

    const input: IngestTelemetryInput = {
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
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    };

    expectAppError(() => ingestWithoutHook.ingest(h.db, input), 500, 'PIPELINE_HOOK_REQUIRED');
  });

  it('ING-21b: Hook missing mandatory project method fails closed with 500 PIPELINE_HOOK_INCOMPLETE', () => {
    const h = createTestHarness(BASE_TIME);

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

  it('ING-22: Hook returning historical disposition persists event as historical and increments revision', () => {
    const h = createTestHarness(BASE_TIME);

    const historicalHook: TelemetryPipelineHook = {
      evaluateAndProject: () => ({
        disposition: 'historical',
        effects: { historyNoted: true },
        reasonCode: 'OUT_OF_ORDER_HISTORICAL',
      }),
      project: () => {},
    };

    const service = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: historicalHook,
    });

    const res = service.ingest(h.db, {
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
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('historical');

    const eventRow = h.db.prepare('SELECT disposition, reason_code, resulting_revision FROM telemetry_event WHERE event_id = ?').get(res.body.eventId) as {
      disposition: string;
      reason_code: string;
      resulting_revision: number;
    };
    expect(eventRow.disposition).toBe('historical');
    expect(eventRow.reason_code).toBe('OUT_OF_ORDER_HISTORICAL');
    expect(eventRow.resulting_revision).toBeGreaterThan(0);
  });

  it('ING-23: Hook returning ignored disposition persists event as ignored', () => {
    const h = createTestHarness(BASE_TIME);

    const ignoredHook: TelemetryPipelineHook = {
      evaluateAndProject: () => ({
        disposition: 'ignored',
        effects: { noop: true },
        reasonCode: 'ADMIN_DISABLED_RESOURCE',
      }),
      project: () => {},
    };

    const service = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: ignoredHook,
    });

    const res = service.ingest(h.db, {
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
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('ignored');

    const eventRow = h.db.prepare('SELECT disposition, reason_code FROM telemetry_event WHERE event_id = ?').get(res.body.eventId) as {
      disposition: string;
      reason_code: string;
    };
    expect(eventRow.disposition).toBe('ignored');
    expect(eventRow.reason_code).toBe('ADMIN_DISABLED_RESOURCE');
  });

  it('ING-24 (MEDIUM-03): Hook throwing error rolls back real SQL mutation and transactional coordinator state', () => {
    const h = createTestHarness(BASE_TIME);

    const initialRevision = (h.db.prepare('SELECT revision FROM dataset_epoch WHERE dataset_id = ? AND epoch = 1').get(h.datasetId) as { revision: number }).revision;

    const throwingHookWithMutation: TelemetryPipelineHook = {
      evaluateAndProject: (context) => {
        // 1. Execute a real SQL mutation within the active transaction
        context.db.prepare(`
          INSERT INTO telemetry_episode (
            dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms
          ) VALUES (?, ?, ?, 'ep-crash-real', 'fixture_fault_a', ?, ?, ?)
        `).run(
          context.datasetId,
          context.epoch,
          context.binding.resourceId,
          context.auth.sourceId,
          BASE_TIME - 1000,
          BASE_TIME,
        );

        // 2. Confirm the mutation is visible inside the uncommitted transaction
        const inside = context.db.prepare("SELECT count(*) as n FROM telemetry_episode WHERE episode_id = 'ep-crash-real'").get() as { n: number };
        expect(inside.n).toBe(1);

        // 3. Throw a controlled exception
        throw new Error('SIMULATED_HOOK_CRASH_AFTER_MUTATION');
      },
      project: () => {},
    };

    const service = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: throwingHookWithMutation,
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
          occurredAt: '2026-10-26T12:00:00.000Z',
          values: {},
        },
      }),
    ).toThrow('SIMULATED_HOOK_CRASH_AFTER_MUTATION');

    // 4. Verify that the SQL mutation was completely rolled back
    const after = h.db.prepare("SELECT count(*) as n FROM telemetry_episode WHERE episode_id = 'ep-crash-real'").get() as { n: number };
    expect(after.n).toBe(0);

    // Verify coordinator state completely intact
    expect(rows(h.db, 'telemetry_event')).toHaveLength(0);
    expect(rows(h.db, 'telemetry_sequence_slot')).toHaveLength(0);
    expect(rows(h.db, 'telemetry_command_receipt')).toHaveLength(0);
    const postRevision = (h.db.prepare('SELECT revision FROM dataset_epoch WHERE dataset_id = ? AND epoch = 1').get(h.datasetId) as { revision: number }).revision;
    expect(postRevision).toBe(initialRevision);
    expect(h.clockService.getDurableWatermark(h.db)).toBeNull();
    expect(h.db.inTransaction).toBe(false);
  });

  it('ING-25 (MEDIUM-04): Real concurrent worker_threads contention on SQLite database file', async () => {
    const h = createTestHarness(BASE_TIME);
    const eventId = randomUUID();
    const commandId = randomUUID();

    const input: IngestTelemetryInput = {
      commandId,
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId,
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    };

    // Spawn a worker thread with an independent SQLite connection to the same file
    const workerCode = `
      const { parentPort, workerData } = require('node:worker_threads');
      const Database = require('better-sqlite3');

      const db = new Database(workerData.path);
      db.pragma('busy_timeout = 5000');

      parentPort.postMessage({ phase: 'ready' });

      parentPort.on('message', (msg) => {
        if (msg === 'execute') {
          const t0 = Date.now();
          // Attempt BEGIN IMMEDIATE to contend for the write lock
          try {
            db.exec('BEGIN IMMEDIATE');
            const elapsed = Date.now() - t0;
            // Read receipts to check deduplication under lock
            const receipt = db.prepare('SELECT request_hash, resulting_revision FROM telemetry_command_receipt WHERE command_id = ?').get(workerData.commandId);
            db.exec('COMMIT');
            db.close();
            parentPort.postMessage({ phase: 'done', elapsed, receipt });
          } catch (err) {
            db.close();
            parentPort.postMessage({ phase: 'error', error: err.message });
          }
        }
      });
    `;

    const worker = new Worker(workerCode, {
      eval: true,
      workerData: { path: h.store.path, commandId },
    });

    try {
      // Wait for worker connection to be ready
      await new Promise<void>((resolve) => {
        worker.on('message', (msg: any) => {
          if (msg.phase === 'ready') resolve();
        });
      });

      // Hook in main thread: signals worker to contend WHILE main holds transaction lock
      let workerTriggered = false;
      const holdingHook: TelemetryPipelineHook = {
        evaluateAndProject: () => {
          if (!workerTriggered) {
            workerTriggered = true;
            worker.postMessage('execute');
            // Block main thread briefly (100ms) with synchronous busy loop to force worker to wait in busy_timeout
            const startHold = Date.now();
            while (Date.now() - startHold < 100) {
              // spin
            }
          }
          return {
            disposition: 'applied',
            effects: { concTested: true },
            reasonCode: 'CONCURRENCY_TEST',
          };
        },
        project: () => {},
      };

      const concurrentIngest = new CanonicalTelemetryIngestService({
        clockService: h.clockService,
        authService: h.authService,
        bindingService: h.bindingService,
        profileValidator: h.profileValidator,
        pipelineHook: holdingHook,
      });

      // Main thread executes ingest
      const mainRes = concurrentIngest.ingest(h.db, input);
      expect(mainRes.status).toBe(200);
      expect(mainRes.replayed).toBe(false);

      // Wait for worker result
      const workerRes = await new Promise<any>((resolve, reject) => {
        worker.on('message', (msg: any) => {
          if (msg.phase === 'done') resolve(msg);
          if (msg.phase === 'error') reject(new Error(msg.error));
        });
      });

      // Worker unblocked and saw the committed receipt
      expect(workerRes.receipt).toBeDefined();
      expect(workerRes.receipt.resulting_revision).toBe(mainRes.body.resultingRevision);
      expect(workerRes.elapsed).toBeGreaterThanOrEqual(50); // Proves lock contention / blocking

      // Confirm exact database invariants
      expect(rows(h.db, 'telemetry_event')).toHaveLength(1);
      expect(rows(h.db, 'telemetry_sequence_slot')).toHaveLength(1);
      expect(rows(h.db, 'telemetry_command_receipt')).toHaveLength(1);
      const epochRow = h.db.prepare('SELECT revision FROM dataset_epoch WHERE dataset_id = ? AND epoch = 1').get(h.datasetId) as { revision: number };
      expect(epochRow.revision).toBe(mainRes.body.resultingRevision);
    } finally {
      worker.terminate();
    }
  });

  // --------------------------------------------------------------------------
  // SECTION 6: High-01 & Medium-02 Provenance & Clock Adversarial (ING-26 to ING-27)
  // --------------------------------------------------------------------------

  it('ING-26 (HIGH-01): Exact single normative clock sample issued per ingest workflow', () => {
    const h = createTestHarness(BASE_TIME);

    const sampleTrustedNowSpy = vi.spyOn(h.clockService, 'sampleTrustedNow');
    const physicalNowSpy = vi.spyOn(h.timeProvider, 'now');

    const input: IngestTelemetryInput = {
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
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {},
      },
    };

    const res = h.ingestService.ingest(h.db, input);
    expect(res.status).toBe(200);

    // EXACTLY 1 normative sample issued
    expect(sampleTrustedNowSpy).toHaveBeenCalledTimes(1);

    // Exactly 2 physical hardware readings: 1 during sampleTrustedNow, 1 during advanceDurable hardware regression check
    expect(physicalNowSpy).toHaveBeenCalledTimes(2);

    // Demonstrate authenticateSource backward compatibility with and without existingSample
    sampleTrustedNowSpy.mockClear();
    const sample = h.clockService.sampleTrustedNow(h.db);
    expect(sampleTrustedNowSpy).toHaveBeenCalledTimes(1);

    // With existingSample: NO second sample issued
    sampleTrustedNowSpy.mockClear();
    const authWithSample = h.authService.authenticateSource(h.db, h.rawToken, h.datasetId, 1, sample);
    expect(authWithSample.sourceId).toBe(h.sourceId);
    expect(sampleTrustedNowSpy).toHaveBeenCalledTimes(0);

    // Without existingSample: issues a sample
    sampleTrustedNowSpy.mockClear();
    const authWithoutSample = h.authService.authenticateSource(h.db, h.rawToken, h.datasetId, 1);
    expect(authWithoutSample.sourceId).toBe(h.sourceId);
    expect(sampleTrustedNowSpy).toHaveBeenCalledTimes(1);
  });

  it('ING-27 (HIGH-01 / MEDIUM-02): Adversarial verification of sample authenticity and provenance', () => {
    const h = createTestHarness(BASE_TIME);

    // 1. Fabricated sample object (not in issuedSamples)
    const fakeSample = Object.freeze({ utcMs: BASE_TIME, sampledAtUtcMs: BASE_TIME });
    expect(() => h.clockService.assertValidSample(h.db, fakeSample)).toThrow(ClockTamperedSampleError);
    expectAppError(
      () => h.authService.authenticateSource(h.db, h.rawToken, h.datasetId, 1, fakeSample as any),
      400,
      'TAMPERED_SAMPLE',
    );

    // 2. Tampered sample object (fields altered)
    const realSample = h.clockService.sampleTrustedNow(h.db);
    const tamperedSample = Object.freeze({ ...realSample, utcMs: realSample.utcMs + 1000 });
    expect(() => h.clockService.assertValidSample(h.db, tamperedSample)).toThrow(ClockTamperedSampleError);

    // 3. Sample from another TrustedClockService instance
    const foreignClock = new TrustedClockService(h.timeProvider);
    const foreignSample = foreignClock.sampleTrustedNow(h.db);
    expect(() => h.clockService.assertValidSample(h.db, foreignSample)).toThrow(ClockTamperedSampleError);

    // 4. Sample issued for another database
    const foreignDir = mkdtempSync(join(tmpdir(), "ignis-t0007-ingest-foreign'-"));
    const foreignPath = join(foreignDir, 'foreign.sqlite');
    const foreignStore = new Store(foreignPath, true);
    fixtures.push({ directory: foreignDir, store: foreignStore });
    foreignStore.migrate();
    expect(() => h.clockService.assertValidSample(foreignStore.db, realSample)).toThrow(ClockTamperedSampleError);

    // 5. Already consumed sample
    transaction(h.db, () => h.clockService.advanceDurable(h.db, realSample));
    expect(() => h.clockService.assertValidSample(h.db, realSample)).toThrow(ClockTamperedSampleError);

    // 6. Expired credential evaluated with valid fresh sample
    const freshSample = h.clockService.sampleTrustedNow(h.db);
    h.timeProvider.setTime(BASE_TIME + 90000000); // Beyond expires_at_ms (BASE_TIME + 86400000)
    const laterSample = h.clockService.sampleTrustedNow(h.db);
    expectAppError(
      () => h.authService.authenticateSource(h.db, h.rawToken, h.datasetId, 1, laterSample),
      401,
      'UNAUTHORIZED',
    );
  });

  // --------------------------------------------------------------------------
  // SECTION 7: Medium-01 Fault Observations & Causal Episodes (ING-28 to ING-30)
  // --------------------------------------------------------------------------

  it('ING-28 (MEDIUM-01): Ingest fault_detected observation creates telemetry_event referencing telemetry_episode', () => {
    const h = createTestHarness(BASE_TIME);

    // Provision binding for fault_a channel on camera
    const faultBindingId = randomUUID();
    insert(h.db, 'telemetry_binding', {
      dataset_id: h.datasetId,
      epoch: 1,
      id: faultBindingId,
      source_id: h.sourceId,
      resource_id: h.camera,
      resource_kind: 'equipment',
      channel: 'fixture_fault_a',
      projection_field: 'fault',
      profile_id: 'FX-FIXED-v1',
      profile_version: 1,
      active: 1,
      resource_born_at_ms: BASE_TIME - 100000,
      history_allowed_from_ms: BASE_TIME - 50000,
    });

    const episodeId = 'ep-' + randomUUID();
    const episodeStartedAtMs = BASE_TIME - 1000;

    const faultHook: TelemetryPipelineHook = {
      evaluateAndProject: (context) => {
        // Hook creates the causal episode row within context.db transaction
        context.db.prepare(`
          INSERT INTO telemetry_episode (
            dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms
          ) VALUES (?, ?, ?, ?, 'fixture_fault_a', ?, ?, ?)
        `).run(
          context.datasetId,
          context.epoch,
          context.binding.resourceId,
          episodeId,
          context.auth.sourceId,
          episodeStartedAtMs,
          context.windowEvaluation.processingDataNowMs,
        );

        return {
          disposition: 'applied',
          effects: { faultActive: true },
          reasonCode: 'FAULT_DETECTED',
          episode: {
            episodeId,
            causeCode: 'fixture_fault_a',
            episodeStartedAtMs,
          },
        };
      },
      project: () => {},
    };

    const service = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: faultHook,
    });

    const res = service.ingest(h.db, {
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
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {
          episodeId,
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs,
        },
      },
    });

    expect(res.status).toBe(200);

    const eventRow = h.db.prepare('SELECT episode_id, cause_code, episode_started_at_ms FROM telemetry_event WHERE event_id = ?').get(res.body.eventId) as {
      episode_id: string;
      cause_code: string;
      episode_started_at_ms: number;
    };
    expect(eventRow.episode_id).toBe(episodeId);
    expect(eventRow.cause_code).toBe('fixture_fault_a');
    expect(eventRow.episode_started_at_ms).toBe(episodeStartedAtMs);
  });

  it('ING-29 (MEDIUM-01): Ingest fault_cleared observation preserves causal episode reference', () => {
    const h = createTestHarness(BASE_TIME);

    const faultBindingId = randomUUID();
    insert(h.db, 'telemetry_binding', {
      dataset_id: h.datasetId,
      epoch: 1,
      id: faultBindingId,
      source_id: h.sourceId,
      resource_id: h.camera,
      resource_kind: 'equipment',
      channel: 'fixture_fault_a',
      projection_field: 'fault',
      profile_id: 'FX-FIXED-v1',
      profile_version: 1,
      active: 1,
      resource_born_at_ms: BASE_TIME - 100000,
      history_allowed_from_ms: BASE_TIME - 50000,
    });

    const episodeId = 'ep-' + randomUUID();
    const episodeStartedAtMs = BASE_TIME - 2000;

    // Pre-insert the episode
    insert(h.db, 'telemetry_episode', {
      dataset_id: h.datasetId,
      epoch: 1,
      resource_id: h.camera,
      episode_id: episodeId,
      cause_code: 'fixture_fault_a',
      source_id: h.sourceId,
      episode_started_at_ms: episodeStartedAtMs,
      recorded_at_ms: BASE_TIME - 2000,
    });

    const clearingHook: TelemetryPipelineHook = {
      evaluateAndProject: () => ({
        disposition: 'applied',
        effects: { faultActive: false },
        reasonCode: 'FAULT_CLEARED',
        episode: {
          episodeId,
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs,
        },
      }),
      project: () => {},
    };

    const service = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: clearingHook,
    });

    const res = service.ingest(h.db, {
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
        occurredAt: '2026-10-26T12:00:00.000Z',
        values: {
          episodeId,
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs,
        },
      },
    });

    expect(res.status).toBe(200);

    const eventRow = h.db.prepare('SELECT observation_type, episode_id FROM telemetry_event WHERE event_id = ?').get(res.body.eventId) as {
      observation_type: string;
      episode_id: string;
    };
    expect(eventRow.observation_type).toBe('fault_cleared');
    expect(eventRow.episode_id).toBe(episodeId);
  });

  it('ING-30 (MEDIUM-01): Fault observation rolls back if episode does not exist (FK enforcement)', () => {
    const h = createTestHarness(BASE_TIME);

    const faultBindingId = randomUUID();
    insert(h.db, 'telemetry_binding', {
      dataset_id: h.datasetId,
      epoch: 1,
      id: faultBindingId,
      source_id: h.sourceId,
      resource_id: h.camera,
      resource_kind: 'equipment',
      channel: 'fixture_fault_a',
      projection_field: 'fault',
      profile_id: 'FX-FIXED-v1',
      profile_version: 1,
      active: 1,
      resource_born_at_ms: BASE_TIME - 100000,
      history_allowed_from_ms: BASE_TIME - 50000,
    });

    const nonExistentEpisodeId = 'ep-missing-' + randomUUID();
    const episodeStartedAtMs = BASE_TIME - 1000;

    // Hook does NOT insert the episode into telemetry_episode table
    const negligentHook: TelemetryPipelineHook = {
      evaluateAndProject: () => ({
        disposition: 'applied',
        effects: { faultActive: true },
        reasonCode: 'FAULT_DETECTED',
        episode: {
          episodeId: nonExistentEpisodeId,
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs,
        },
      }),
      project: () => {},
    };

    const service = new CanonicalTelemetryIngestService({
      clockService: h.clockService,
      authService: h.authService,
      bindingService: h.bindingService,
      profileValidator: h.profileValidator,
      pipelineHook: negligentHook,
    });

    // Ingest must fail due to SQLite Foreign Key constraint failure and roll back
    expect(() =>
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
          occurredAt: '2026-10-26T12:00:00.000Z',
          values: {
            episodeId: nonExistentEpisodeId,
            causeCode: 'fixture_fault_a',
            episodeStartedAtMs,
          },
        },
      }),
    ).toThrow(/FOREIGN KEY/);

    expect(rows(h.db, 'telemetry_event')).toHaveLength(0);
    expect(rows(h.db, 'telemetry_sequence_slot')).toHaveLength(0);
    expect(rows(h.db, 'telemetry_command_receipt')).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // SECTION 8: Low-01 Exact Boundaries & Low-02 CausationId (ING-31 to ING-32)
  // --------------------------------------------------------------------------

  it('ING-31 (LOW-01): Exact D08 boundaries: now + 30_000ms is tolerated; now + 30_001ms is rejected', () => {
    const h = createTestHarness(BASE_TIME);

    // Boundary 1: occurredAtMs = BASE_TIME + 30_000ms (exact upper limit)
    const boundaryAcceptedMs = BASE_TIME + 30000;
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
        occurredAt: new Date(boundaryAcceptedMs).toISOString(),
        values: {},
      },
    });

    expect(res.status).toBe(200);

    const row = h.db.prepare('SELECT occurred_at_ms, observation_effective_at_ms FROM telemetry_event WHERE event_id = ?').get(res.body.eventId) as {
      occurred_at_ms: number;
      observation_effective_at_ms: number;
    };
    expect(row.occurred_at_ms).toBe(boundaryAcceptedMs);
    expect(row.observation_effective_at_ms).toBe(BASE_TIME); // Clamped to dataNow
    expect(h.clockService.getDurableWatermark(h.db)).toBeNull(); // No advance for future tolerated

    // Boundary 2: occurredAtMs = BASE_TIME + 30_001ms (1 millisecond above limit)
    const boundaryRejectedMs = BASE_TIME + 30001;
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
            sequence: 2,
            observationType: 'heartbeat',
            occurredAt: new Date(boundaryRejectedMs).toISOString(),
            values: {},
          },
        }),
      422,
      'EXCESSIVE_FUTURE',
    );

    // Confirm slot 2 and second event were not written
    expect(h.db.prepare('SELECT count(*) as n FROM telemetry_sequence_slot WHERE sequence = 2').get()).toEqual({ n: 0 });
  });

  it('ING-32 (LOW-02): causationId empty string "" is preserved in Ce and distinct from null', () => {
    const h = createTestHarness(BASE_TIME);

    const eventIdEmpty = randomUUID();
    const eventIdNull = randomUUID();

    const ceEmpty = buildCanonicalEvent({
      datasetId: h.datasetId,
      epoch: 1,
      sourceId: h.sourceId,
      sourceKind: 'fixture_source',
      resourceKind: 'equipment',
      envelope: {
        eventId: eventIdEmpty,
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: '2026-10-26T12:00:00.000Z',
        causationId: '', // Empty string
        values: {},
      },
      canonicalValues: {},
      occurredAtISO: '2026-10-26T12:00:00.000Z',
    });

    const ceNull = buildCanonicalEvent({
      datasetId: h.datasetId,
      epoch: 1,
      sourceId: h.sourceId,
      sourceKind: 'fixture_source',
      resourceKind: 'equipment',
      envelope: {
        eventId: eventIdNull,
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: '2026-10-26T12:00:00.000Z',
        causationId: null, // Explicit null
        values: {},
      },
      canonicalValues: {},
      occurredAtISO: '2026-10-26T12:00:00.000Z',
    });

    // Empty string is preserved as "" and NOT converted to null
    expect(ceEmpty.canonical.causationId).toBe('');
    expect(ceEmpty.canonicalJson).toContain('"causationId":""');

    // Null is preserved as null
    expect(ceNull.canonical.causationId).toBeNull();
    expect(ceNull.canonicalJson).toContain('"causationId":null');

    // Hashes are distinct
    expect(ceEmpty.eventHash).not.toBe(ceNull.eventHash);

    // Ingest service accepts and preserves empty string causationId
    const res = h.ingestService.ingest(h.db, {
      commandId: randomUUID(),
      rawToken: h.rawToken,
      datasetId: h.datasetId,
      epoch: 1,
      envelope: {
        eventId: eventIdEmpty,
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: '2026-10-26T12:00:00.000Z',
        causationId: '',
        values: {},
      },
    });

    expect(res.status).toBe(200);
    const eventRow = h.db.prepare('SELECT canonical_json FROM telemetry_event WHERE event_id = ?').get(eventIdEmpty) as { canonical_json: string };
    const parsedCe = JSON.parse(eventRow.canonical_json);
    expect(parsedCe.causationId).toBe('');

    // Non-string causationId is rejected
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
            sequence: 2,
            observationType: 'heartbeat',
            occurredAt: '2026-10-26T12:00:00.000Z',
            causationId: 12345 as any,
            values: {},
          },
        }),
      422,
      'INVALID_VALUE',
    );

    // causationId exceeding 256 characters is rejected
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
            sequence: 2,
            observationType: 'heartbeat',
            occurredAt: '2026-10-26T12:00:00.000Z',
            causationId: 'x'.repeat(257),
            values: {},
          },
        }),
      422,
      'INVALID_VALUE',
    );
  });
});
