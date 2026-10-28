/**
 * PROJECT IGNIS — T0007 / PKG-08
 * Suíte de Testes de Integração HTTP da Ingestão Telemétrica (C03-D01..D12, C02).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

import { Store } from '../src/persistence/store.js';
import { buildApp } from '../src/app.js';
import { generateDemo } from '../src/demo/service.js';
import { authorization, sessionFor } from './support/foundation-fixture.js';
import { generation } from './support/t0005-fixture.js';
import {
  SettableTimeProvider,
  TrustedClockService,
  telemetryTokenHash,
  TelemetryCauseResolutionService,
} from '../src/domain/telemetry/index.js';

const BASE_TIME = 1700000000000;

interface TestFixture {
  directory: string;
  store: Store;
  app: FastifyInstance;
}

const fixtures: TestFixture[] = [];

afterEach(async () => {
  while (fixtures.length > 0) {
    const f = fixtures.pop()!;
    try {
      await f.app.close();
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

async function createHttpHarness(options: {
  timeProvider?: SettableTimeProvider;
  clockService?: TrustedClockService;
} = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'ignis-t0007-http-'));
  const path = join(directory, 'test.sqlite');
  const store = new Store(path, true);

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

  const rawToken = 'tok-nominal-' + randomUUID();
  insert(store.db, 'telemetry_credential', {
    token_hash: telemetryTokenHash(rawToken),
    source_id: sourceId,
    issued_at_ms: sourceCreated,
    expires_at_ms: BASE_TIME + 86400000,
    revoked_at_ms: null,
  });

  // Provision second source for isolation tests
  const secondSourceId = randomUUID();
  insert(store.db, 'telemetry_source', {
    id: secondSourceId,
    source_kind: 'fixture_source',
    provisioned_by: actorId,
    active: 1,
    created_at_ms: sourceCreated,
  });

  const secondRawToken = 'tok-second-' + randomUUID();
  insert(store.db, 'telemetry_credential', {
    token_hash: telemetryTokenHash(secondRawToken),
    source_id: secondSourceId,
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

  insert(store.db, 'telemetry_resource_profile', {
    dataset_id: datasetId,
    epoch: 1,
    resource_id: mobile,
    resource_kind: 'equipment',
    profile_id: 'FX-MOBILE-v1',
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
    channel: 'heartbeat',
    projection_field: 'communication',
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
    channel: 'fixture_fault_a',
    projection_field: 'fault',
    profile_id: 'FX-FIXED-v1',
    profile_version: 1,
    active: 1,
    resource_born_at_ms: sourceCreated,
    history_allowed_from_ms: sourceCreated,
  });

  // Binding for second source on mobile equipment
  insert(store.db, 'telemetry_binding', {
    dataset_id: datasetId,
    epoch: 1,
    id: randomUUID(),
    source_id: secondSourceId,
    resource_id: mobile,
    resource_kind: 'equipment',
    channel: 'heartbeat',
    projection_field: 'communication',
    profile_id: 'FX-MOBILE-v1',
    profile_version: 1,
    active: 1,
    resource_born_at_ms: sourceCreated,
    history_allowed_from_ms: sourceCreated,
  });

  const timeProvider = options.timeProvider ?? new SettableTimeProvider(BASE_TIME);
  const clockService = options.clockService ?? new TrustedClockService(timeProvider);

  const app = await buildApp({
    foundation: {
      store,
      host: '127.0.0.1',
    },
    telemetry: {
      clockService,
    },
  });

  fixtures.push({ directory, store, app });

  const resolutionService = new TelemetryCauseResolutionService({
    clockService,
  });

  return {
    app,
    store,
    db: store.db,
    datasetId,
    actorId,
    sourceId,
    rawToken,
    secondSourceId,
    secondRawToken,
    camera,
    mobile,
    timeProvider,
    clockService,
    resolutionService,
  };
}

describe('PROJECT IGNIS — T0007 / PKG-08: HTTP Telemetry Ingest Integration Suite', () => {
  it('HTTP-01: Nominal authenticated telemetry ingest via POST returns 200 with disposition and revision', async () => {
    const h = await createHttpHarness();
    const commandId = randomUUID();
    const eventId = randomUUID();

    const response = await h.app.inject({
      method: 'POST',
      url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
      headers: {
        authorization: `Bearer ${h.rawToken}`,
      },
      payload: {
        commandId,
        envelope: {
          eventId,
          resourceId: h.camera,
          channel: 'heartbeat',
          sequence: 1,
          observationType: 'heartbeat',
          occurredAt: new Date(BASE_TIME).toISOString(),
          values: {},
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.json();
    expect(body.eventId).toBe(eventId);
    expect(body.disposition).toBe('applied');
    expect(body.resultingRevision).toBeGreaterThanOrEqual(1);

    // Verify row persisted in telemetry_event
    const eventRow = h.db.prepare('SELECT event_id, disposition FROM telemetry_event WHERE dataset_id = ? AND event_id = ?')
      .get(h.datasetId, eventId) as any;
    expect(eventRow).toBeDefined();
    expect(eventRow.disposition).toBe('applied');
  });

  it('HTTP-02: Idempotent replay with same commandId and equivalent body returns original receipt with Idempotency-Replayed header', async () => {
    const h = await createHttpHarness();
    const commandId = randomUUID();
    const eventId = randomUUID();

    const payload = {
      commandId,
      envelope: {
        eventId,
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: new Date(BASE_TIME).toISOString(),
        values: {},
      },
    };

    const res1 = await h.app.inject({
      method: 'POST',
      url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
      headers: { authorization: `Bearer ${h.rawToken}` },
      payload,
    });
    expect(res1.statusCode).toBe(200);
    expect(res1.headers['idempotency-replayed']).toBeUndefined();
    const rev1 = res1.json().resultingRevision;

    const res2 = await h.app.inject({
      method: 'POST',
      url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
      headers: { authorization: `Bearer ${h.rawToken}` },
      payload,
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.headers['idempotency-replayed']).toBe('true');
    expect(res2.json().eventId).toBe(eventId);
    expect(res2.json().resultingRevision).toBe(rev1);
  });

  it('HTTP-03: CommandId replay with divergent payload returns 409 IDEMPOTENCY_CONFLICT without side effects', async () => {
    const h = await createHttpHarness();
    const commandId = randomUUID();

    const res1 = await h.app.inject({
      method: 'POST',
      url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
      headers: { authorization: `Bearer ${h.rawToken}` },
      payload: {
        commandId,
        envelope: {
          eventId: randomUUID(),
          resourceId: h.camera,
          channel: 'heartbeat',
          sequence: 1,
          observationType: 'heartbeat',
          occurredAt: new Date(BASE_TIME).toISOString(),
          values: {},
        },
      },
    });
    expect(res1.statusCode).toBe(200);

    const res2 = await h.app.inject({
      method: 'POST',
      url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
      headers: { authorization: `Bearer ${h.rawToken}` },
      payload: {
        commandId,
        envelope: {
          eventId: randomUUID(),
          resourceId: h.camera,
          channel: 'heartbeat',
          sequence: 2, // Divergent sequence!
          observationType: 'heartbeat',
          occurredAt: new Date(BASE_TIME).toISOString(),
          values: {},
        },
      },
    });
    expect(res2.statusCode).toBe(409);
    expect(res2.json().code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('HTTP-04: Missing Authorization header returns 401 UNAUTHORIZED', async () => {
    const h = await createHttpHarness();

    const res = await h.app.inject({
      method: 'POST',
      url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
      payload: {
        commandId: randomUUID(),
        envelope: {
          eventId: randomUUID(),
          resourceId: h.camera,
          channel: 'heartbeat',
          sequence: 1,
          observationType: 'heartbeat',
          occurredAt: new Date(BASE_TIME).toISOString(),
          values: {},
        },
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
  });

  it('HTTP-04B: rawToken in JSON body is strictly rejected with 400 INVALID_REQUEST', async () => {
    const h = await createHttpHarness();

    const res = await h.app.inject({
      method: 'POST',
      url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
      headers: { authorization: `Bearer ${h.rawToken}` },
      payload: {
        commandId: randomUUID(),
        rawToken: h.rawToken, // FORBIDDEN IN BODY!
        envelope: {
          eventId: randomUUID(),
          resourceId: h.camera,
          channel: 'heartbeat',
          sequence: 1,
          observationType: 'heartbeat',
          occurredAt: new Date(BASE_TIME).toISOString(),
          values: {},
        },
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_REQUEST');
  });

  it('HTTP-05: Expired token returns 401 UNAUTHORIZED', async () => {
    const h = await createHttpHarness();
    const expiredToken = 'tok-expired-' + randomUUID();

    insert(h.db, 'telemetry_credential', {
      token_hash: telemetryTokenHash(expiredToken),
      source_id: h.sourceId,
      issued_at_ms: BASE_TIME - 200000,
      expires_at_ms: BASE_TIME - 1000, // Expired!
      revoked_at_ms: null,
    });

    const res = await h.app.inject({
      method: 'POST',
      url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
      headers: { authorization: `Bearer ${expiredToken}` },
      payload: {
        commandId: randomUUID(),
        envelope: {
          eventId: randomUUID(),
          resourceId: h.camera,
          channel: 'heartbeat',
          sequence: 1,
          observationType: 'heartbeat',
          occurredAt: new Date(BASE_TIME).toISOString(),
          values: {},
        },
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
  });

  it('HTTP-06: Inactive telemetry source (active = 0) returns 403 FORBIDDEN', async () => {
    const h = await createHttpHarness();

    // Deactivate source
    h.db.prepare('UPDATE telemetry_source SET active = 0 WHERE id = ?').run(h.sourceId);

    const res = await h.app.inject({
      method: 'POST',
      url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
      headers: { authorization: `Bearer ${h.rawToken}` },
      payload: {
        commandId: randomUUID(),
        envelope: {
          eventId: randomUUID(),
          resourceId: h.camera,
          channel: 'heartbeat',
          sequence: 1,
          observationType: 'heartbeat',
          occurredAt: new Date(BASE_TIME).toISOString(),
          values: {},
        },
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
  });

  it('HTTP-07: Divergent or retired epoch returns 409 EPOCH_CONFLICT', async () => {
    const h = await createHttpHarness();

    const res = await h.app.inject({
      method: 'POST',
      url: `/api/v1/datasets/${h.datasetId}/epochs/99/telemetry`, // epoch 99 does not exist
      headers: { authorization: `Bearer ${h.rawToken}` },
      payload: {
        commandId: randomUUID(),
        envelope: {
          eventId: randomUUID(),
          resourceId: h.camera,
          channel: 'heartbeat',
          sequence: 1,
          observationType: 'heartbeat',
          occurredAt: new Date(BASE_TIME).toISOString(),
          values: {},
        },
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('EPOCH_CONFLICT');
  });

  it('HTTP-08: fault_detected observation inserts causal episode and links telemetry event', async () => {
    const h = await createHttpHarness();
    const episodeId = 'ep-fault-' + randomUUID();

    const res = await h.app.inject({
      method: 'POST',
      url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
      headers: { authorization: `Bearer ${h.rawToken}` },
      payload: {
        commandId: randomUUID(),
        envelope: {
          eventId: randomUUID(),
          resourceId: h.camera,
          channel: 'fixture_fault_a',
          sequence: 1,
          observationType: 'fault_detected',
          occurredAt: new Date(BASE_TIME).toISOString(),
          values: {
            episodeId,
            causeCode: 'fixture_fault_a',
            episodeStartedAtMs: BASE_TIME - 1000,
          },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().disposition).toBe('applied');

    // Confirm episode inserted in telemetry_episode
    const ep = h.db.prepare('SELECT episode_id, cause_code FROM telemetry_episode WHERE dataset_id = ? AND resource_id = ? AND episode_id = ?')
      .get(h.datasetId, h.camera, episodeId) as any;
    expect(ep).toBeDefined();
    expect(ep.cause_code).toBe('fixture_fault_a');

    // Confirm linked in telemetry_event
    const evt = h.db.prepare('SELECT episode_id, cause_code FROM telemetry_event WHERE dataset_id = ? AND event_id = ?')
      .get(h.datasetId, res.json().eventId) as any;
    expect(evt).toBeDefined();
    expect(evt.episode_id).toBe(episodeId);
    expect(evt.cause_code).toBe('fixture_fault_a');

    // Confirm current_state is preserved untouched as required by migration 0006 and C03 (SEC-07)
    const state = h.db.prepare('SELECT operational_state FROM current_state WHERE dataset_id = ? AND resource_id = ?')
      .get(h.datasetId, h.camera) as any;
    expect(state).toBeDefined();
    expect(state.operational_state).toBe('not_installed');
  });

  it('HTTP-09: Observation covered by prior PKG-07 cause resolution returns historical with COVERED_BY_CAUSE_RESOLUTION', async () => {
    const h = await createHttpHarness();

    // 1. Resolve cause up to BASE_TIME via PKG-07 resolution service
    h.resolutionService.resolveCause(h.db, {
      commandId: randomUUID(),
      datasetId: h.datasetId,
      epoch: 1,
      actorId: h.actorId,
      resourceId: h.camera,
      causeCode: 'fixture_fault_a',
      completedAtMs: BASE_TIME,
    });

    // 2. Incoming fault observation for episode starting BEFORE cutoff (BASE_TIME - 5000)
    const eventId = randomUUID();
    const res = await h.app.inject({
      method: 'POST',
      url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
      headers: { authorization: `Bearer ${h.rawToken}` },
      payload: {
        commandId: randomUUID(),
        envelope: {
          eventId,
          resourceId: h.camera,
          channel: 'fixture_fault_a',
          sequence: 1,
          observationType: 'fault_detected',
          occurredAt: new Date(BASE_TIME - 4000).toISOString(),
          values: {
            episodeId: 'ep-covered-' + randomUUID(),
            causeCode: 'fixture_fault_a',
            episodeStartedAtMs: BASE_TIME - 5000,
          },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.disposition).toBe('historical');

    const evt = h.db.prepare('SELECT disposition, reason_code FROM telemetry_event WHERE dataset_id = ? AND event_id = ?')
      .get(h.datasetId, eventId) as any;
    expect(evt.disposition).toBe('historical');
    expect(evt.reason_code).toBe('COVERED_BY_CAUSE_RESOLUTION');
  });

  it('HTTP-10 (SEC-04 & SEC-05): Rate limit enforces max 20 req/s per source, returns 429 with Retry-After, and isolates sources', async () => {
    const h = await createHttpHarness();

    // Source 1 executes 20 requests in the current window
    for (let i = 1; i <= 20; i++) {
      const res = await h.app.inject({
        method: 'POST',
        url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
        headers: { authorization: `Bearer ${h.rawToken}` },
        payload: {
          commandId: randomUUID(),
          envelope: {
            eventId: randomUUID(),
            resourceId: h.camera,
            channel: 'heartbeat',
            sequence: i,
            observationType: 'heartbeat',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: {},
          },
        },
      });
      expect(res.statusCode).toBe(200);
    }

    // 21st request from Source 1 in the same 1s window must fail with 429
    const resOverLimit = await h.app.inject({
      method: 'POST',
      url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
      headers: { authorization: `Bearer ${h.rawToken}` },
      payload: {
        commandId: randomUUID(),
        envelope: {
          eventId: randomUUID(),
          resourceId: h.camera,
          channel: 'heartbeat',
          sequence: 21,
          observationType: 'heartbeat',
          occurredAt: new Date(BASE_TIME).toISOString(),
          values: {},
        },
      },
    });

    expect(resOverLimit.statusCode).toBe(429);
    expect(resOverLimit.json().code).toBe('RATE_LIMITED');
    expect(resOverLimit.headers['retry-after']).toBe('1');

    // Source 2 must NOT be throttled (quota isolation per source)
    const resSource2 = await h.app.inject({
      method: 'POST',
      url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
      headers: { authorization: `Bearer ${h.secondRawToken}` },
      payload: {
        commandId: randomUUID(),
        envelope: {
          eventId: randomUUID(),
          resourceId: h.mobile,
          channel: 'heartbeat',
          sequence: 1,
          observationType: 'heartbeat',
          occurredAt: new Date(BASE_TIME).toISOString(),
          values: {},
        },
      },
    });
    expect(resSource2.statusCode).toBe(200);
  });

  it('HTTP-11: Payload exceeding 64 KiB returns 413 BODY_TOO_LARGE', async () => {
    const h = await createHttpHarness();
    const largeNote = 'x'.repeat(65 * 1024); // 65 KiB

    const res = await h.app.inject({
      method: 'POST',
      url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
      headers: { authorization: `Bearer ${h.rawToken}` },
      payload: {
        commandId: randomUUID(),
        envelope: {
          eventId: randomUUID(),
          resourceId: h.camera,
          channel: 'heartbeat',
          sequence: 1,
          observationType: 'heartbeat',
          occurredAt: new Date(BASE_TIME).toISOString(),
          values: { largeNote },
        },
      },
    });

    expect(res.statusCode).toBe(413);
  });

  it('HTTP-12: Malformed or invalid JSON returns 400 INVALID_REQUEST', async () => {
    const h = await createHttpHarness();

    const res = await h.app.inject({
      method: 'POST',
      url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
      headers: {
        authorization: `Bearer ${h.rawToken}`,
        'content-type': 'application/json',
      },
      payload: '{"commandId": "incomplete-json',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_REQUEST');
  });

  it('HTTP-13: Preserves human session restrictions on other routes without leaking machine access', async () => {
    const h = await createHttpHarness();

    // Trying to access human context endpoint with machine bearer token fails 401
    const res = await h.app.inject({
      method: 'GET',
      url: `/api/v1/datasets/${h.datasetId}/context`,
      headers: { authorization: `Bearer ${h.rawToken}` },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
  });

  it('SEC-01: Non-existent tokens return 401 and do not saturate or pollute rate limiter map (>1000 requests)', async () => {
    const h = await createHttpHarness();

    const dummyPayload = {
      commandId: randomUUID(),
      envelope: {
        eventId: randomUUID(),
        resourceId: h.camera,
        channel: 'heartbeat',
        sequence: 1,
        observationType: 'heartbeat',
        occurredAt: new Date(BASE_TIME).toISOString(),
        values: {},
      },
    };

    // Send 1050 requests with distinct non-existent tokens
    for (let i = 0; i < 1050; i++) {
      const res = await h.app.inject({
        method: 'POST',
        url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
        headers: { authorization: `Bearer tok-invalid-${i}-${randomUUID()}` },
        payload: dummyPayload,
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('UNAUTHORIZED');
    }

    // After 1050 invalid tokens, a legitimate authenticated source must STILL succeed with 200
    // (Proves that invalid tokens did not enter the rate limiter map and did not trigger the 1000 capacity cap)
    const nominalRes = await h.app.inject({
      method: 'POST',
      url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
      headers: { authorization: `Bearer ${h.rawToken}` },
      payload: {
        commandId: randomUUID(),
        envelope: {
          eventId: randomUUID(),
          resourceId: h.camera,
          channel: 'heartbeat',
          sequence: 1,
          observationType: 'heartbeat',
          occurredAt: new Date(BASE_TIME).toISOString(),
          values: {},
        },
      },
    });

    expect(nominalRes.statusCode).toBe(200);
    expect(nominalRes.json().disposition).toBe('applied');
  });

  it('SEC-02: Revoked token fails 401 and does not consume quota of active credential for same source', async () => {
    const h = await createHttpHarness();
    const revokedToken = 'tok-revoked-' + randomUUID();

    // Insert a revoked credential belonging to h.sourceId
    insert(h.db, 'telemetry_credential', {
      token_hash: telemetryTokenHash(revokedToken),
      source_id: h.sourceId,
      issued_at_ms: BASE_TIME - 100000,
      expires_at_ms: BASE_TIME + 86400000,
      revoked_at_ms: BASE_TIME - 50000, // Revoked!
    });

    // Send 25 requests using the revoked token
    for (let i = 1; i <= 25; i++) {
      const resRevoked = await h.app.inject({
        method: 'POST',
        url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
        headers: { authorization: `Bearer ${revokedToken}` },
        payload: {
          commandId: randomUUID(),
          envelope: {
            eventId: randomUUID(),
            resourceId: h.camera,
            channel: 'heartbeat',
            sequence: i,
            observationType: 'heartbeat',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: {},
          },
        },
      });
      expect(resRevoked.statusCode).toBe(401);
      expect(resRevoked.json().code).toBe('UNAUTHORIZED');
    }

    // Legitimate active token for h.sourceId must still have its full quota available (returns 200, NOT 429)
    const resActive = await h.app.inject({
      method: 'POST',
      url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
      headers: { authorization: `Bearer ${h.rawToken}` },
      payload: {
        commandId: randomUUID(),
        envelope: {
          eventId: randomUUID(),
          resourceId: h.camera,
          channel: 'heartbeat',
          sequence: 1,
          observationType: 'heartbeat',
          occurredAt: new Date(BASE_TIME).toISOString(),
          values: {},
        },
      },
    });

    expect(resActive.statusCode).toBe(200);
    expect(resActive.json().disposition).toBe('applied');
  });

  it('SEC-03: Expired token fails 401 and does not consume quota of active credential for same source', async () => {
    const h = await createHttpHarness();
    const expiredToken = 'tok-expired-same-src-' + randomUUID();

    // Insert an expired credential belonging to h.sourceId
    insert(h.db, 'telemetry_credential', {
      token_hash: telemetryTokenHash(expiredToken),
      source_id: h.sourceId,
      issued_at_ms: BASE_TIME - 100000,
      expires_at_ms: BASE_TIME - 1000, // Expired!
      revoked_at_ms: null,
    });

    // Send 25 requests using the expired token
    for (let i = 1; i <= 25; i++) {
      const resExpired = await h.app.inject({
        method: 'POST',
        url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
        headers: { authorization: `Bearer ${expiredToken}` },
        payload: {
          commandId: randomUUID(),
          envelope: {
            eventId: randomUUID(),
            resourceId: h.camera,
            channel: 'heartbeat',
            sequence: i,
            observationType: 'heartbeat',
            occurredAt: new Date(BASE_TIME).toISOString(),
            values: {},
          },
        },
      });
      expect(resExpired.statusCode).toBe(401);
      expect(resExpired.json().code).toBe('UNAUTHORIZED');
    }

    // Legitimate active token for h.sourceId must still have its full quota available (returns 200, NOT 429)
    const resActive = await h.app.inject({
      method: 'POST',
      url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
      headers: { authorization: `Bearer ${h.rawToken}` },
      payload: {
        commandId: randomUUID(),
        envelope: {
          eventId: randomUUID(),
          resourceId: h.camera,
          channel: 'heartbeat',
          sequence: 1,
          observationType: 'heartbeat',
          occurredAt: new Date(BASE_TIME).toISOString(),
          values: {},
        },
      },
    });

    expect(resActive.statusCode).toBe(200);
    expect(resActive.json().disposition).toBe('applied');
  });

  it('SEC-06: Trusted clock regression returns 503 CLOCK_UNTRUSTED and performs full rollback on HTTP ingest', async () => {
    const timeProvider = new SettableTimeProvider(BASE_TIME);
    const clockService = new TrustedClockService(timeProvider);
    const h = await createHttpHarness({ timeProvider, clockService });

    // Request 1 at BASE_TIME succeeds
    const commandId1 = randomUUID();
    const eventId1 = randomUUID();
    const res1 = await h.app.inject({
      method: 'POST',
      url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
      headers: { authorization: `Bearer ${h.rawToken}` },
      payload: {
        commandId: commandId1,
        envelope: {
          eventId: eventId1,
          resourceId: h.camera,
          channel: 'heartbeat',
          sequence: 1,
          observationType: 'heartbeat',
          occurredAt: new Date(BASE_TIME).toISOString(),
          values: {},
        },
      },
    });
    expect(res1.statusCode).toBe(200);

    // Simulate clock regression: move timeProvider back by 5000 ms (< BASE_TIME)
    timeProvider.setTime(BASE_TIME - 5000);

    const commandId2 = randomUUID();
    const eventId2 = randomUUID();
    const res2 = await h.app.inject({
      method: 'POST',
      url: `/api/v1/datasets/${h.datasetId}/epochs/1/telemetry`,
      headers: { authorization: `Bearer ${h.rawToken}` },
      payload: {
        commandId: commandId2,
        envelope: {
          eventId: eventId2,
          resourceId: h.camera,
          channel: 'heartbeat',
          sequence: 2,
          observationType: 'heartbeat',
          occurredAt: new Date(BASE_TIME - 5000).toISOString(),
          values: {},
        },
      },
    });

    // HTTP layer must return 503 CLOCK_UNTRUSTED
    expect(res2.statusCode).toBe(503);
    expect(res2.json().code).toBe('CLOCK_UNTRUSTED');

    // Confirm complete rollback: eventId2 and commandId2 were NOT persisted in SQLite
    const eventRow = h.db.prepare('SELECT event_id FROM telemetry_event WHERE dataset_id = ? AND event_id = ?')
      .get(h.datasetId, eventId2);
    expect(eventRow).toBeUndefined();

    const receiptRow = h.db.prepare('SELECT command_id FROM telemetry_command_receipt WHERE dataset_id = ? AND command_id = ?')
      .get(h.datasetId, commandId2);
    expect(receiptRow).toBeUndefined();
  });
});
