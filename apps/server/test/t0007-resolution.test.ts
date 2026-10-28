/**
 * PROJECT IGNIS — T0007 / PKG-07
 * Suíte de Testes do Núcleo de Resolução Causal, CAS, Idempotência e Multicausa (C03-S01..S17).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

import { Store } from '../src/persistence/store.js';
import { generateDemo } from '../src/demo/service.js';
import { authorization, sessionFor } from './support/foundation-fixture.js';
import { generation } from './support/t0005-fixture.js';
import { AppError } from '../src/errors.js';
import {
  SettableTimeProvider,
  TrustedClockService,
  TelemetryAuthService,
  TelemetryBindingService,
  TelemetryProfileValidator,
  DefaultTelemetryPipelineHook,
  CanonicalTelemetryIngestService,
} from '../src/domain/telemetry/index.js';
import {
  TelemetryCauseResolutionService,
  type ResolveCauseInput,
} from '../src/domain/telemetry/resolution.js';

const BASE_TIME = 1700000000000;

interface TestFixture {
  directory: string;
  store: Store;
}

const fixtures: TestFixture[] = [];

afterEach(() => {
  while (fixtures.length > 0) {
    const f = fixtures.pop()!;
    try {
      f.store.close();
      rmSync(f.directory, { recursive: true, force: true });
    } catch {
      // Ignora falhas de cleanup temporário
    }
  }
});

function insert(db: Database.Database, table: string, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  const placeholders = cols.map(() => '?').join(', ');
  db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`).run(...Object.values(row));
}

function expectAppError(fn: () => unknown, statusCode: number, code: string): void {
  try {
    fn();
    expect.unreachable(`Deveria ter lançado AppError(${statusCode}, '${code}')`);
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

function createResolutionHarness() {
  const directory = mkdtempSync(join(tmpdir(), 'ignis-t0007-res-'));
  const path = join(directory, 'test.sqlite');
  const store = new Store(path, true);
  fixtures.push({ directory, store });

  const installation = store.migrate();
  const { datasetId, actorId } = installation;
  expect(
    generateDemo(
      authorization(store),
      sessionFor(store, actorId),
      datasetId,
      1,
      generation(),
    ).status,
  ).toBe(201);

  const camera = (
    store.db.prepare("SELECT id FROM equipment WHERE category_code='camera' LIMIT 1").get() as { id: string }
  ).id;
  const mobile = (
    store.db
      .prepare("SELECT id FROM equipment WHERE category_code='inspection_vehicle' LIMIT 1")
      .get() as { id: string }
  ).id;

  const sourceCreated = BASE_TIME - 100000;
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

  insert(store.db, 'telemetry_resource_profile', {
    dataset_id: datasetId,
    epoch: 1,
    resource_id: camera,
    resource_kind: 'equipment',
    profile_id: 'FX-FIXED-v1',
    profile_version: 1,
    active: 1,
    assigned_at_ms: sourceCreated,
  });

  insert(store.db, 'telemetry_binding', {
    dataset_id: datasetId,
    epoch: 1,
    id: randomUUID(),
    source_id: sourceId,
    resource_id: camera,
    resource_kind: 'equipment',
    channel: 'fixture_fault_a',
    projection_field: 'fault',
    profile_id: 'FX-FIXED-v1',
    profile_version: 1,
    active: 1,
    resource_born_at_ms: sourceCreated,
    history_allowed_from_ms: sourceCreated,
  });

  insert(store.db, 'telemetry_binding', {
    dataset_id: datasetId,
    epoch: 1,
    id: randomUUID(),
    source_id: sourceId,
    resource_id: camera,
    resource_kind: 'equipment',
    channel: 'fixture_fault_b',
    projection_field: 'communication', // channel secundário
    profile_id: 'FX-FIXED-v1',
    profile_version: 1,
    active: 1,
    resource_born_at_ms: sourceCreated,
    history_allowed_from_ms: sourceCreated,
  });

  const timeProvider = new SettableTimeProvider(BASE_TIME);
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

  const resolutionService = new TelemetryCauseResolutionService({ clockService });

  return {
    db: store.db,
    datasetId,
    actorId,
    sourceId,
    rawToken,
    camera,
    mobile,
    clockService,
    ingestService,
    resolutionService,
  };
}

describe('PROJECT IGNIS — T0007 / PKG-07: Causal Resolution Core, CAS & Multi-cause Suite', () => {
  it('RES-01: Nominal cause resolution records resolution, advances revision, creates receipt', () => {
    const h = createResolutionHarness();

    // Initial state: set camera to malfunction with version 1
    h.db.prepare("UPDATE current_state SET operational_state = 'malfunction', version = 1 WHERE dataset_id = ? AND epoch = 1 AND resource_id = ?")
      .run(h.datasetId, h.camera);

    const initialRevision = (h.db.prepare('SELECT revision FROM dataset_epoch WHERE dataset_id = ? AND epoch = 1').get(h.datasetId) as any).revision;

    const commandId = randomUUID();
    const cutoff = BASE_TIME;

    const res = h.resolutionService.resolveCause(h.db, {
      commandId,
      datasetId: h.datasetId,
      epoch: 1,
      actorId: h.actorId,
      resourceId: h.camera,
      causeCode: 'fixture_fault_a',
      completedAtMs: cutoff,
      expectedVersion: 1,
      evidence: { notes: 'Reparo elétrico concluído com sucesso.' },
    });

    expect(res.status).toBe(200);
    expect(res.replayed).toBe(false);
    expect(res.body.causeCode).toBe('fixture_fault_a');
    expect(res.body.completedAtMs).toBe(cutoff);
    expect(res.body.resultingOperationalState).toBe('operational');

    // Verify row in telemetry_cause_resolution
    const row = h.db.prepare('SELECT * FROM telemetry_cause_resolution WHERE dataset_id = ? AND resource_id = ? AND cause_code = ?')
      .get(h.datasetId, h.camera, 'fixture_fault_a') as any;
    expect(row).toBeDefined();
    expect(row.completed_at_ms).toBe(cutoff);
    expect(row.actor_id).toBe(h.actorId);

    // Verify revision advanced by exactly 1
    const newRevision = (h.db.prepare('SELECT revision FROM dataset_epoch WHERE dataset_id = ? AND epoch = 1').get(h.datasetId) as any).revision;
    expect(newRevision).toBe(initialRevision + 1);

    // Verify command_receipt
    const receipt = h.db.prepare('SELECT * FROM command_receipt WHERE dataset_id = ? AND command_id = ?')
      .get(h.datasetId, commandId) as any;
    expect(receipt).toBeDefined();
    expect(receipt.response_status).toBe(200);
    expect(receipt.resulting_revision).toBe(newRevision);

    // Verify current_state updated to operational and version incremented to 2
    const state = h.db.prepare('SELECT operational_state, version FROM current_state WHERE dataset_id = ? AND resource_id = ?')
      .get(h.datasetId, h.camera) as any;
    expect(state.operational_state).toBe('operational');
    expect(state.version).toBe(2);
  });

  it('RES-02: Idempotent replay with same commandId and equivalent payload returns original receipt without duplicate effect', () => {
    const h = createResolutionHarness();

    h.db.prepare("UPDATE current_state SET operational_state = 'malfunction', version = 1 WHERE dataset_id = ? AND epoch = 1 AND resource_id = ?")
      .run(h.datasetId, h.camera);

    const commandId = randomUUID();
    const cutoff = BASE_TIME;

    const input: ResolveCauseInput = {
      commandId,
      datasetId: h.datasetId,
      epoch: 1,
      actorId: h.actorId,
      resourceId: h.camera,
      causeCode: 'fixture_fault_a',
      completedAtMs: cutoff,
      expectedVersion: 1,
      evidence: { notes: 'Reparo nominal' },
    };

    const res1 = h.resolutionService.resolveCause(h.db, input);
    expect(res1.replayed).toBe(false);

    const revisionAfterRes1 = (h.db.prepare('SELECT revision FROM dataset_epoch WHERE dataset_id = ? AND epoch = 1').get(h.datasetId) as any).revision;

    // Second call with same commandId and equivalent body
    const res2 = h.resolutionService.resolveCause(h.db, input);
    expect(res2.status).toBe(200);
    expect(res2.replayed).toBe(true);
    expect(res2.headers['Idempotency-Replayed']).toBe('true');
    expect(res2.body.resolutionId).toBe(res1.body.resolutionId);

    // Verify no second row in telemetry_cause_resolution
    const count = (h.db.prepare('SELECT count(*) as count FROM telemetry_cause_resolution WHERE dataset_id = ? AND resource_id = ?').get(h.datasetId, h.camera) as any).count;
    expect(count).toBe(1);

    // Verify revision did NOT advance on replay
    const revisionAfterRes2 = (h.db.prepare('SELECT revision FROM dataset_epoch WHERE dataset_id = ? AND epoch = 1').get(h.datasetId) as any).revision;
    expect(revisionAfterRes2).toBe(revisionAfterRes1);
  });

  it('RES-03: Conflicting payload with reused commandId throws 409 IDEMPOTENCY_CONFLICT', () => {
    const h = createResolutionHarness();

    h.db.prepare("UPDATE current_state SET operational_state = 'malfunction', version = 1 WHERE dataset_id = ? AND epoch = 1 AND resource_id = ?")
      .run(h.datasetId, h.camera);

    const commandId = randomUUID();

    h.resolutionService.resolveCause(h.db, {
      commandId,
      datasetId: h.datasetId,
      epoch: 1,
      actorId: h.actorId,
      resourceId: h.camera,
      causeCode: 'fixture_fault_a',
      completedAtMs: BASE_TIME,
      expectedVersion: 1,
    });

    // Same commandId but different causeCode
    expectAppError(
      () =>
        h.resolutionService.resolveCause(h.db, {
          commandId,
          datasetId: h.datasetId,
          epoch: 1,
          actorId: h.actorId,
          resourceId: h.camera,
          causeCode: 'fixture_fault_b', // conflicting!
          completedAtMs: BASE_TIME,
          expectedVersion: 1,
        }),
      409,
      'IDEMPOTENCY_CONFLICT',
    );
  });

  it('RES-04: Stale expectedVersion fails CAS with 409 VERSION_CONFLICT and rolls back', () => {
    const h = createResolutionHarness();

    // current_state version is 5
    h.db.prepare("UPDATE current_state SET operational_state = 'malfunction', version = 5 WHERE dataset_id = ? AND epoch = 1 AND resource_id = ?")
      .run(h.datasetId, h.camera);

    const initialRevision = (h.db.prepare('SELECT revision FROM dataset_epoch WHERE dataset_id = ? AND epoch = 1').get(h.datasetId) as any).revision;

    expectAppError(
      () =>
        h.resolutionService.resolveCause(h.db, {
          commandId: randomUUID(),
          datasetId: h.datasetId,
          epoch: 1,
          actorId: h.actorId,
          resourceId: h.camera,
          causeCode: 'fixture_fault_a',
          completedAtMs: BASE_TIME,
          expectedVersion: 4, // stale version!
        }),
      409,
      'VERSION_CONFLICT',
    );

    // Verify nothing persisted in telemetry_cause_resolution
    const resCount = (h.db.prepare('SELECT count(*) as count FROM telemetry_cause_resolution WHERE dataset_id = ? AND resource_id = ?').get(h.datasetId, h.camera) as any).count;
    expect(resCount).toBe(0);

    // Verify revision did NOT advance
    const currentRevision = (h.db.prepare('SELECT revision FROM dataset_epoch WHERE dataset_id = ? AND epoch = 1').get(h.datasetId) as any).revision;
    expect(currentRevision).toBe(initialRevision);
  });

  it('RES-05: Regressive cutoff completedAtMs < max(completed_at_ms) fails with 422 INVALID_RESOLUTION_CUTOFF', () => {
    const h = createResolutionHarness();

    // First resolution at BASE_TIME
    h.resolutionService.resolveCause(h.db, {
      commandId: randomUUID(),
      datasetId: h.datasetId,
      epoch: 1,
      actorId: h.actorId,
      resourceId: h.camera,
      causeCode: 'fixture_fault_a',
      completedAtMs: BASE_TIME,
      expectedVersion: 1,
    });

    // Attempt second resolution for same cause at BASE_TIME - 1000
    expectAppError(
      () =>
        h.resolutionService.resolveCause(h.db, {
          commandId: randomUUID(),
          datasetId: h.datasetId,
          epoch: 1,
          actorId: h.actorId,
          resourceId: h.camera,
          causeCode: 'fixture_fault_a',
          completedAtMs: BASE_TIME - 1000, // regressive!
          expectedVersion: 1,
        }),
      422,
      'INVALID_RESOLUTION_CUTOFF',
    );
  });

  it('RES-06 (C03-S16): Duplicate resolution with different commandId for already-resolved cause and cutoff fails with 409 CAUSE_ALREADY_RESOLVED', () => {
    const h = createResolutionHarness();

    h.db.prepare("UPDATE current_state SET operational_state = 'malfunction', version = 1 WHERE dataset_id = ? AND epoch = 1 AND resource_id = ?")
      .run(h.datasetId, h.camera);

    h.resolutionService.resolveCause(h.db, {
      commandId: randomUUID(),
      datasetId: h.datasetId,
      epoch: 1,
      actorId: h.actorId,
      resourceId: h.camera,
      causeCode: 'fixture_fault_a',
      completedAtMs: BASE_TIME,
      expectedVersion: 1,
    });

    // Another command trying to resolve same cause up to same cutoff
    expectAppError(
      () =>
        h.resolutionService.resolveCause(h.db, {
          commandId: randomUUID(), // different commandId!
          datasetId: h.datasetId,
          epoch: 1,
          actorId: h.actorId,
          resourceId: h.camera,
          causeCode: 'fixture_fault_a',
          completedAtMs: BASE_TIME, // identical cutoff, already covered
          expectedVersion: 2,
        }),
      409,
      'CAUSE_ALREADY_RESOLVED',
    );
  });

  it('RES-07 (C03-S01 & C03-S02): Observation followed by resolution covers episode; retroactive observation <= cutoff is historical', () => {
    const h = createResolutionHarness();

    h.db.prepare("UPDATE current_state SET operational_state = 'malfunction', version = 1 WHERE dataset_id = ? AND epoch = 1 AND resource_id = ?")
      .run(h.datasetId, h.camera);

    const episodeId = 'ep-s01-' + randomUUID();
    const episodeStartedAtMs = BASE_TIME - 5000;

    // 1. Ingest fault_detected observation (C03-S01)
    const ingestRes1 = h.ingestService.ingest(h.db, {
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
    expect(ingestRes1.body.disposition).toBe('applied');

    // 2. Resolve cause up to BASE_TIME (cutoff > episodeStartedAtMs)
    const resRes = h.resolutionService.resolveCause(h.db, {
      commandId: randomUUID(),
      datasetId: h.datasetId,
      epoch: 1,
      actorId: h.actorId,
      resourceId: h.camera,
      causeCode: 'fixture_fault_a',
      completedAtMs: BASE_TIME,
      expectedVersion: 1,
    });
    expect(resRes.body.resultingOperationalState).toBe('operational');

    // 3. Late arriving observation for an episode that started at BASE_TIME - 3000 (<= cutoff) (C03-S02)
    const lateEpisodeId = 'ep-s02-' + randomUUID();
    const ingestRes2 = h.ingestService.ingest(h.db, {
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
          episodeId: lateEpisodeId,
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs: BASE_TIME - 3000,
        },
      },
    });

    // Must be classified as historical without reopening fault!
    expect(ingestRes2.body.disposition).toBe('historical');
    const state = h.db.prepare('SELECT operational_state FROM current_state WHERE dataset_id = ? AND resource_id = ?')
      .get(h.datasetId, h.camera) as any;
    expect(state.operational_state).toBe('operational');
  });

  it('RES-08 (C03-S03): Episode starting exactly at completedAtMs is covered by inclusive resolution', () => {
    const h = createResolutionHarness();

    const cutoff = BASE_TIME;

    // Resolve up to cutoff
    h.resolutionService.resolveCause(h.db, {
      commandId: randomUUID(),
      datasetId: h.datasetId,
      epoch: 1,
      actorId: h.actorId,
      resourceId: h.camera,
      causeCode: 'fixture_fault_a',
      completedAtMs: cutoff,
      expectedVersion: 1,
    });

    // Ingest episode starting exactly at cutoff
    const epId = 'ep-s03-' + randomUUID();
    const ingestRes = h.ingestService.ingest(h.db, {
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
        occurredAt: new Date(cutoff).toISOString(),
        values: {
          episodeId: epId,
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs: cutoff, // exact match
        },
      },
    });

    expect(ingestRes.body.disposition).toBe('historical');
  });

  it('RES-09 (C03-S04): Episode starting after cutoff (completedAtMs + 1ms) remains eligible and applied', () => {
    const h = createResolutionHarness();

    const cutoff = BASE_TIME;

    // Resolve up to cutoff
    h.resolutionService.resolveCause(h.db, {
      commandId: randomUUID(),
      datasetId: h.datasetId,
      epoch: 1,
      actorId: h.actorId,
      resourceId: h.camera,
      causeCode: 'fixture_fault_a',
      completedAtMs: cutoff,
      expectedVersion: 1,
    });

    // Ingest episode starting strictly after cutoff (cutoff + 1)
    const epId = 'ep-s04-' + randomUUID();
    const ingestRes = h.ingestService.ingest(h.db, {
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
        occurredAt: new Date(cutoff + 10).toISOString(),
        values: {
          episodeId: epId,
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs: cutoff + 1,
        },
      },
    });

    expect(ingestRes.body.disposition).toBe('applied');
  });

  it('RES-10 (C03-S05): Posterior episode arriving before older resolution keeps posterior episode active; does not clear it', () => {
    const h = createResolutionHarness();

    h.db.prepare("UPDATE current_state SET operational_state = 'malfunction', version = 1 WHERE dataset_id = ? AND epoch = 1 AND resource_id = ?")
      .run(h.datasetId, h.camera);

    const oldEpisodeId = 'ep-old-' + randomUUID();
    const newEpisodeId = 'ep-new-' + randomUUID();

    // 1. Ingest old episode starting at BASE_TIME - 10000
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
        occurredAt: new Date(BASE_TIME - 9000).toISOString(),
        values: {
          episodeId: oldEpisodeId,
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs: BASE_TIME - 10000,
        },
      },
    });

    // 2. Ingest posterior episode starting at BASE_TIME + 2000
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
        occurredAt: new Date(BASE_TIME + 3000).toISOString(),
        values: {
          episodeId: newEpisodeId,
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs: BASE_TIME + 2000,
        },
      },
    });

    // 3. Resolve old episode with cutoff = BASE_TIME (covers old, does NOT cover new)
    const res = h.resolutionService.resolveCause(h.db, {
      commandId: randomUUID(),
      datasetId: h.datasetId,
      epoch: 1,
      actorId: h.actorId,
      resourceId: h.camera,
      causeCode: 'fixture_fault_a',
      completedAtMs: BASE_TIME,
      expectedVersion: 1,
    });

    // Because new episode remains active, equipment remains in malfunction!
    expect(res.body.activeCausesRemaining).toContain('fixture_fault_a');
    expect(res.body.resultingOperationalState).toBe('malfunction');

    const state = h.db.prepare('SELECT operational_state FROM current_state WHERE dataset_id = ? AND resource_id = ?')
      .get(h.datasetId, h.camera) as any;
    expect(state.operational_state).toBe('malfunction');
  });

  it('RES-11 (C03-S06): Repeated message for covered episode does not become recurrence', () => {
    const h = createResolutionHarness();

    const episodeId = 'ep-s06-' + randomUUID();
    const episodeStartedAtMs = BASE_TIME - 5000;

    // First fault observation
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
        values: { episodeId, causeCode: 'fixture_fault_a', episodeStartedAtMs },
      },
    });

    // Resolve cause
    h.resolutionService.resolveCause(h.db, {
      commandId: randomUUID(),
      datasetId: h.datasetId,
      epoch: 1,
      actorId: h.actorId,
      resourceId: h.camera,
      causeCode: 'fixture_fault_a',
      completedAtMs: BASE_TIME,
      expectedVersion: 1,
    });

    // Repeated message for same episode arriving after resolution (sequence 2)
    const repRes = h.ingestService.ingest(h.db, {
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
        occurredAt: new Date(BASE_TIME + 2000).toISOString(),
        values: { episodeId, causeCode: 'fixture_fault_a', episodeStartedAtMs },
      },
    });

    expect(repRes.body.disposition).toBe('historical');
  });

  it('RES-12 (C03-S11): Resolving electrical cause with mechanical cause open preserves malfunction state', () => {
    const h = createResolutionHarness();

    h.db.prepare("UPDATE current_state SET operational_state = 'malfunction', version = 1 WHERE dataset_id = ? AND epoch = 1 AND resource_id = ?")
      .run(h.datasetId, h.camera);

    // Two active episodes: electrical (fixture_fault_a) and mechanical (fixture_fault_b)
    insert(h.db, 'telemetry_episode', {
      dataset_id: h.datasetId,
      epoch: 1,
      resource_id: h.camera,
      episode_id: 'ep-elec-' + randomUUID(),
      cause_code: 'fixture_fault_a',
      source_id: h.sourceId,
      episode_started_at_ms: BASE_TIME - 5000,
      recorded_at_ms: BASE_TIME - 4000,
    });

    insert(h.db, 'telemetry_episode', {
      dataset_id: h.datasetId,
      epoch: 1,
      resource_id: h.camera,
      episode_id: 'ep-mech-' + randomUUID(),
      cause_code: 'fixture_fault_b',
      source_id: h.sourceId,
      episode_started_at_ms: BASE_TIME - 4000,
      recorded_at_ms: BASE_TIME - 3000,
    });

    // Resolve electrical cause
    const res = h.resolutionService.resolveCause(h.db, {
      commandId: randomUUID(),
      datasetId: h.datasetId,
      epoch: 1,
      actorId: h.actorId,
      resourceId: h.camera,
      causeCode: 'fixture_fault_a',
      completedAtMs: BASE_TIME,
      expectedVersion: 1,
    });

    // Mechanical cause remains! Equipment cannot transition to operational
    expect(res.body.resultingOperationalState).toBe('malfunction');
    expect(res.body.activeCausesRemaining).toContain('fixture_fault_b');

    const state = h.db.prepare('SELECT operational_state FROM current_state WHERE dataset_id = ? AND resource_id = ?')
      .get(h.datasetId, h.camera) as any;
    expect(state.operational_state).toBe('malfunction');
  });

  it('RES-13 (C03-S17): Equipment in stolen state retains stolen state when cause is resolved', () => {
    const h = createResolutionHarness();

    // Equipment is stolen
    h.db.prepare("UPDATE current_state SET operational_state = 'stolen', version = 3 WHERE dataset_id = ? AND epoch = 1 AND resource_id = ?")
      .run(h.datasetId, h.camera);

    insert(h.db, 'telemetry_episode', {
      dataset_id: h.datasetId,
      epoch: 1,
      resource_id: h.camera,
      episode_id: 'ep-stolen-' + randomUUID(),
      cause_code: 'fixture_fault_a',
      source_id: h.sourceId,
      episode_started_at_ms: BASE_TIME - 5000,
      recorded_at_ms: BASE_TIME - 4000,
    });

    const res = h.resolutionService.resolveCause(h.db, {
      commandId: randomUUID(),
      datasetId: h.datasetId,
      epoch: 1,
      actorId: h.actorId,
      resourceId: h.camera,
      causeCode: 'fixture_fault_a',
      completedAtMs: BASE_TIME,
      expectedVersion: 3,
    });

    // Resolution recorded, but stolen state is preserved!
    expect(res.body.resultingOperationalState).toBe('stolen');

    const state = h.db.prepare('SELECT operational_state, version FROM current_state WHERE dataset_id = ? AND resource_id = ?')
      .get(h.datasetId, h.camera) as any;
    expect(state.operational_state).toBe('stolen');
    expect(state.version).toBe(3); // version did not advance since state was preserved
  });

  it('RES-14: Open preventive maintenance_request without physical fault allows operational state', () => {
    const h = createResolutionHarness();

    // Confirm pre-existing open initial maintenance request from generateDemo
    const openMaint = h.db.prepare("SELECT id, cause_code FROM maintenance_request WHERE dataset_id = ? AND equipment_id = ? AND status = 'open'")
      .get(h.datasetId, h.camera) as any;
    expect(openMaint).toBeDefined();
    expect(openMaint.cause_code).toBe('initial_camera_inspection');

    h.db.prepare("UPDATE current_state SET operational_state = 'malfunction', version = 1 WHERE dataset_id = ? AND epoch = 1 AND resource_id = ?")
      .run(h.datasetId, h.camera);

    insert(h.db, 'telemetry_episode', {
      dataset_id: h.datasetId,
      epoch: 1,
      resource_id: h.camera,
      episode_id: 'ep-prev-test-' + randomUUID(),
      cause_code: 'fixture_fault_a',
      source_id: h.sourceId,
      episode_started_at_ms: BASE_TIME - 5000,
      recorded_at_ms: BASE_TIME - 4000,
    });

    // Resolve the physical fault
    const res = h.resolutionService.resolveCause(h.db, {
      commandId: randomUUID(),
      datasetId: h.datasetId,
      epoch: 1,
      actorId: h.actorId,
      resourceId: h.camera,
      causeCode: 'fixture_fault_a',
      completedAtMs: BASE_TIME,
      expectedVersion: 1,
    });

    // Preventive check does not block operational return (C03-§6)
    expect(res.body.resultingOperationalState).toBe('operational');
    const state = h.db.prepare('SELECT operational_state FROM current_state WHERE dataset_id = ? AND resource_id = ?')
      .get(h.datasetId, h.camera) as any;
    expect(state.operational_state).toBe('operational');
  });

  it('RES-15: Transactional rollback leaves no partial state, no revision advance, and no receipt on failure', () => {
    const h = createResolutionHarness();

    const initialRevision = (h.db.prepare('SELECT revision FROM dataset_epoch WHERE dataset_id = ? AND epoch = 1').get(h.datasetId) as any).revision;

    // Non-existent actorId will fail foreign key constraint to actor(id)
    const badActorId = randomUUID();
    const commandId = randomUUID();

    expectAppError(
      () =>
        h.resolutionService.resolveCause(h.db, {
          commandId,
          datasetId: h.datasetId,
          epoch: 1,
          actorId: badActorId, // FK violation!
          resourceId: h.camera,
          causeCode: 'fixture_fault_a',
          completedAtMs: BASE_TIME,
          expectedVersion: 1,
        }),
      500,
      'STORAGE_ERROR',
    );

    // Verify nothing persisted
    const resCount = (h.db.prepare('SELECT count(*) as count FROM telemetry_cause_resolution WHERE dataset_id = ? AND resource_id = ?').get(h.datasetId, h.camera) as any).count;
    expect(resCount).toBe(0);

    const receipt = h.db.prepare('SELECT * FROM command_receipt WHERE dataset_id = ? AND command_id = ?').get(h.datasetId, commandId);
    expect(receipt).toBeUndefined();

    const currentRevision = (h.db.prepare('SELECT revision FROM dataset_epoch WHERE dataset_id = ? AND epoch = 1').get(h.datasetId) as any).revision;
    expect(currentRevision).toBe(initialRevision);
  });
});
