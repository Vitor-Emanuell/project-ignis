/**
 * PROJECT IGNIS — T0010 / PKG-02
 * Testes Abrangentes do Motor Avaliador de Alertas e Ciclo de Vida Transacional (18 cenários + invariantes).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { Store, transaction } from '../src/persistence/store.js';
import { AppError } from '../src/errors.js';
import { AlertEvaluatorService, getCivilDateString, getCivilDayDifference } from '../src/alerts/evaluator.js';
import { SettableTimeProvider } from '../src/domain/telemetry/time-provider.js';
import { TrustedClockService } from '../src/domain/telemetry/trusted-clock.js';
import type { AlertSeverity, AlertStatus } from '../src/alerts/types.js';

type Row = Record<string, string | number | null>;
const fixtures: { directory: string; store: Store }[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const f of fixtures.splice(0)) {
    f.store.close();
    const target = resolve(f.directory);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('ignis-t0010-eval-')) {
      throw new Error('Temporary fixture cleanup outside allocated directory');
    }
    rmSync(target, { recursive: true, force: true });
  }
});

function empty() {
  const directory = mkdtempSync(join(tmpdir(), "ignis-t0010-eval-quote'-"));
  const path = join(directory, 'test.sqlite');
  const store = new Store(path, true);
  fixtures.push({ directory, store });
  return { directory, path, store, db: store.db };
}

interface TestContext {
  store: Store;
  db: Database.Database;
  datasetId: string;
  actorId: string;
  cameraCritical5: string;
  cameraCritical3: string;
  timeProvider: SettableTimeProvider;
  clockService: TrustedClockService;
  evaluator: AlertEvaluatorService;
  sourceId: string;
}

function setupEvaluatorFixture(
  initialUtcMs = 1793404800000,
  options?: {
    regTimeCritical5Ms?: number | null;
    regTimeCritical3Ms?: number | null;
  },
): TestContext {
  // 1793404800000 = 2026-10-31T00:00:00.000Z
  const f = empty();
  f.store.migrate();

  const datasetId = randomUUID();
  const actorId = `operator:${randomUUID()}`;
  const cameraCritical5 = randomUUID();
  const cameraCritical3 = randomUUID();
  const sourceId = randomUUID();

  transaction(f.db, () => {
    f.db.prepare("INSERT INTO actor(id, kind, local_key) VALUES (?, 'operator', ?)").run(actorId, `op-${actorId}`);
    f.db.prepare("INSERT INTO dataset(id, code, kind, active_epoch) VALUES (?, ?, 'demo', 1)").run(datasetId, `ds-${datasetId}`);
    f.db.prepare("INSERT INTO dataset_epoch(dataset_id, epoch, status, revision) VALUES (?, 1, 'ready', 0)").run(datasetId);
    f.db.prepare("INSERT INTO organization(dataset_id, epoch, id, code, name) VALUES (?, 1, ?, 'ORG_1', 'Org 1')").run(datasetId, randomUUID());

    // Recurso 1: Camera com criticidade 5
    f.db.prepare(
      "INSERT INTO resource(dataset_id, epoch, id, kind, organization_id, public_label, version) VALUES (?, 1, ?, 'equipment', (SELECT id FROM organization WHERE dataset_id=? LIMIT 1), 'CAM_CRIT_5', 1)"
    ).run(datasetId, cameraCritical5, datasetId);
    f.db.prepare(
      "INSERT INTO equipment(dataset_id, epoch, id, category_code, category_version, serial_normalized, brand, model, criticality, mobility, attributes_json) VALUES (?, 1, ?, 'camera', 1, 'SER_CAM_5', 'Brand', 'Model', 5, 'fixed', '{\"cameraType\":\"fixed_view\"}')"
    ).run(datasetId, cameraCritical5);
    f.db.prepare(
      `INSERT INTO resource_location(dataset_id, epoch, resource_id, role, reference_type, postal_code, neighborhood, city, uf, address, reference, latitude, longitude, region_id)
       VALUES (?, 1, ?, 'registration', 'installation', '01001000', 'Centro', 'SP', 'SP', 'Av 1', 'Ref', -23.55, -46.63, NULL)`
    ).run(datasetId, cameraCritical5);
    f.db.prepare("INSERT INTO current_state(dataset_id, epoch, resource_id, operational_state, version) VALUES (?, 1, ?, 'not_installed', 1)").run(datasetId, cameraCritical5);

    // Recurso 2: Camera com criticidade 3
    f.db.prepare(
      "INSERT INTO resource(dataset_id, epoch, id, kind, organization_id, public_label, version) VALUES (?, 1, ?, 'equipment', (SELECT id FROM organization WHERE dataset_id=? LIMIT 1), 'CAM_CRIT_3', 1)"
    ).run(datasetId, cameraCritical3, datasetId);
    f.db.prepare(
      "INSERT INTO equipment(dataset_id, epoch, id, category_code, category_version, serial_normalized, brand, model, criticality, mobility, attributes_json) VALUES (?, 1, ?, 'camera', 1, 'SER_CAM_3', 'Brand', 'Model', 3, 'fixed', '{\"cameraType\":\"fixed_view\"}')"
    ).run(datasetId, cameraCritical3);
    f.db.prepare(
      `INSERT INTO resource_location(dataset_id, epoch, resource_id, role, reference_type, postal_code, neighborhood, city, uf, address, reference, latitude, longitude, region_id)
       VALUES (?, 1, ?, 'registration', 'installation', '01001000', 'Centro', 'SP', 'SP', 'Av 2', 'Ref', -23.56, -46.64, NULL)`
    ).run(datasetId, cameraCritical3);
    f.db.prepare("INSERT INTO current_state(dataset_id, epoch, resource_id, operational_state, version) VALUES (?, 1, ?, 'not_installed', 1)").run(datasetId, cameraCritical3);

    // Eventos operacionais normativos de cadastro inicial (apenas quando solicitados pelo teste)
    let currentRev = 0;
    if (options?.regTimeCritical5Ms !== undefined && options.regTimeCritical5Ms !== null) {
      currentRev++;
      const reg5Iso = new Date(options.regTimeCritical5Ms).toISOString();
      f.db.prepare(`
        INSERT INTO operational_event (
          dataset_id, epoch, id, resource_id, action, actor_id, command_id,
          resource_version, revision, ordinal, effective_at, recorded_at, received_at, changes_json
        ) VALUES (?, 1, ?, ?, 'inventory.equipment.create.v1', ?, ?, 1, ?, 1, ?, ?, ?, '{}')
      `).run(datasetId, randomUUID(), cameraCritical5, actorId, randomUUID(), currentRev, reg5Iso, reg5Iso, reg5Iso);
    }

    if (options?.regTimeCritical3Ms !== undefined && options.regTimeCritical3Ms !== null) {
      currentRev++;
      const reg3Iso = new Date(options.regTimeCritical3Ms).toISOString();
      f.db.prepare(`
        INSERT INTO operational_event (
          dataset_id, epoch, id, resource_id, action, actor_id, command_id,
          resource_version, revision, ordinal, effective_at, recorded_at, received_at, changes_json
        ) VALUES (?, 1, ?, ?, 'inventory.equipment.create.v1', ?, ?, 1, ?, 1, ?, ?, ?, '{}')
      `).run(datasetId, randomUUID(), cameraCritical3, actorId, randomUUID(), currentRev, reg3Iso, reg3Iso, reg3Iso);
    }

    if (currentRev > 0) {
      f.db.prepare('UPDATE dataset_epoch SET revision = ? WHERE dataset_id = ? AND epoch = 1').run(currentRev, datasetId);
    }

    // Telemetria base
    f.db.prepare("INSERT INTO telemetry_source(id, source_kind, provisioned_by, active, created_at_ms) VALUES (?, 'fixture', ?, 1, ?)").run(sourceId, actorId, initialUtcMs - 100000);

    // Perfis de telemetria
    f.db.prepare(`
      INSERT INTO telemetry_profile (id, version, usage, resource_kind, category_code, category_version, emitter_expected, expected_interval_ms, position_ttl_ms, configuration_json, provenance)
      VALUES
        ('FX-FIXED-v1', 1, 'fixture', 'equipment', 'camera', 1, 1, 10000, NULL, '{}', 'fixture'),
        ('FX-NONE-v1', 1, 'fixture', 'equipment', 'camera', 1, 0, NULL, NULL, '{}', 'fixture')
    `).run();
  });

  const timeProvider = new SettableTimeProvider(initialUtcMs);
  const clockService = new TrustedClockService(timeProvider);
  const evaluator = new AlertEvaluatorService(f.db, clockService);

  return {
    ...f,
    datasetId,
    actorId,
    cameraCritical5,
    cameraCritical3,
    timeProvider,
    clockService,
    evaluator,
    sourceId,
  };
}

describe('AlertEvaluatorService — Regra A: equipment_fault (C03-S11)', () => {
  it('TC-01: detecta falha ativa e abre alerta cycle = 1, severity critical para criticidade 5', () => {
    const ctx = setupEvaluatorFixture();
    const episodeId = randomUUID();
    const faultTime = ctx.timeProvider.now() - 5000;

    // Registra episódio de falha
    ctx.db.prepare(`
      INSERT INTO telemetry_episode (dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms)
      VALUES (?, 1, ?, ?, 'sensor_blinded', ?, ?, ?)
    `).run(ctx.datasetId, ctx.cameraCritical5, episodeId, ctx.sourceId, faultTime, faultTime);

    const summary = ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summary.openedCount).toBe(1);
    expect(summary.resolvedCount).toBe(0);

    const alert = ctx.db.prepare('SELECT * FROM alert WHERE resource_id = ? AND rule_code = ?').get(ctx.cameraCritical5, 'equipment_fault') as Record<string, unknown>;
    expect(alert).toBeDefined();
    expect(alert.status).toBe('open');
    expect(alert.severity).toBe('critical'); // criticidade 5
    expect(alert.cycle).toBe(1);
    expect(alert.cause_code).toBe('sensor_blinded');
    expect(alert.acknowledged_at_ms).toBeNull();
    expect(alert.resolved_at_ms).toBeNull();

    // alert_event de abertura
    const event = ctx.db.prepare('SELECT * FROM alert_event WHERE alert_id = ?').get(alert.id) as Record<string, unknown>;
    expect(event).toBeDefined();
    expect(event.status).toBe('open');
    expect(event.previous_status).toBeNull();
    expect(event.actor_id).toBeNull(); // SPEC-02: eventos automáticos têm actor_id = NULL
  });

  it('TC-02 (C03-S11): Multicause Isolation — resolver uma causa não resolve alerta se outra causa permanecer aberta', () => {
    const ctx = setupEvaluatorFixture();
    const t0 = ctx.timeProvider.now();

    // 1. Causa A aberta em t0 - 10000
    ctx.db.prepare(`
      INSERT INTO telemetry_episode (dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms)
      VALUES (?, 1, ?, ?, 'cause_a', ?, ?, ?)
    `).run(ctx.datasetId, ctx.cameraCritical3, randomUUID(), ctx.sourceId, t0 - 10000, t0 - 10000);

    // 2. Causa B aberta em t0 - 5000
    ctx.db.prepare(`
      INSERT INTO telemetry_episode (dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms)
      VALUES (?, 1, ?, ?, 'cause_b', ?, ?, ?)
    `).run(ctx.datasetId, ctx.cameraCritical3, randomUUID(), ctx.sourceId, t0 - 5000, t0 - 5000);

    // Avalia e abre alerta
    ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });
    const alertBefore = ctx.db.prepare('SELECT status, severity FROM alert WHERE resource_id = ?').get(ctx.cameraCritical3) as Record<string, unknown>;
    expect(alertBefore.status).toBe('open');
    expect(alertBefore.severity).toBe('high'); // criticidade 3

    // 3. Resolve exclusivamente a causa B em t0 - 1000
    ctx.db.prepare(`
      INSERT INTO telemetry_cause_resolution (dataset_id, epoch, id, resource_id, cause_code, completed_at_ms, recorded_at_ms, actor_id, evidence_json)
      VALUES (?, 1, ?, ?, 'cause_b', ?, ?, ?, '{}')
    `).run(ctx.datasetId, randomUUID(), ctx.cameraCritical3, t0 - 1000, t0 - 1000, ctx.actorId);

    // 4. Reavalia: causa A ainda está aberta!
    const summaryAfterB = ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summaryAfterB.resolvedCount).toBe(0);

    const alertAfterB = ctx.db.prepare('SELECT status, resolved_at_ms FROM alert WHERE resource_id = ?').get(ctx.cameraCritical3) as Record<string, unknown>;
    expect(alertAfterB.status).toBe('open'); // Alerta permanece OPEN!
    expect(alertAfterB.resolved_at_ms).toBeNull();
  });

  it('TC-03: resolução da última causa restante encerra o alerta com resolved_by = NULL', () => {
    const ctx = setupEvaluatorFixture();
    const t0 = ctx.timeProvider.now();

    ctx.db.prepare(`
      INSERT INTO telemetry_episode (dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms)
      VALUES (?, 1, ?, ?, 'cause_single', ?, ?, ?)
    `).run(ctx.datasetId, ctx.cameraCritical3, randomUUID(), ctx.sourceId, t0 - 2000, t0 - 2000);

    ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });
    const alert = ctx.db.prepare('SELECT id, status FROM alert WHERE resource_id = ?').get(ctx.cameraCritical3) as Record<string, unknown>;
    expect(alert.status).toBe('open');

    // Resolve a causa
    ctx.db.prepare(`
      INSERT INTO telemetry_cause_resolution (dataset_id, epoch, id, resource_id, cause_code, completed_at_ms, recorded_at_ms, actor_id, evidence_json)
      VALUES (?, 1, ?, ?, 'cause_single', ?, ?, ?, '{}')
    `).run(ctx.datasetId, randomUUID(), ctx.cameraCritical3, t0 - 500, t0 - 500, ctx.actorId);

    const summary = ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summary.resolvedCount).toBe(1);

    const resolvedAlert = ctx.db.prepare('SELECT * FROM alert WHERE id = ?').get(alert.id) as Record<string, unknown>;
    expect(resolvedAlert.status).toBe('resolved');
    expect(resolvedAlert.resolved_at_ms).toBe(t0);
    expect(resolvedAlert.resolved_by).toBeNull(); // SPEC-02: resolução automática tem resolved_by = NULL

    const resolvedEvent = ctx.db.prepare('SELECT * FROM alert_event WHERE alert_id = ? AND status = ?').get(alert.id, 'resolved') as Record<string, unknown>;
    expect(resolvedEvent).toBeDefined();
    expect(resolvedEvent.previous_status).toBe('open');
    expect(resolvedEvent.actor_id).toBeNull();
  });

  it('TC-04: recorrência de falha após resolução abre novo ciclo (cycle = 2)', () => {
    const ctx = setupEvaluatorFixture();
    const t0 = ctx.timeProvider.now();

    // Ciclo 1: Abre e resolve
    ctx.db.prepare(`
      INSERT INTO telemetry_episode (dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms)
      VALUES (?, 1, ?, ?, 'recurring_fault', ?, ?, ?)
    `).run(ctx.datasetId, ctx.cameraCritical3, randomUUID(), ctx.sourceId, t0 - 5000, t0 - 5000);
    ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });

    ctx.db.prepare(`
      INSERT INTO telemetry_cause_resolution (dataset_id, epoch, id, resource_id, cause_code, completed_at_ms, recorded_at_ms, actor_id, evidence_json)
      VALUES (?, 1, ?, ?, 'recurring_fault', ?, ?, ?, '{}')
    `).run(ctx.datasetId, randomUUID(), ctx.cameraCritical3, t0 - 3000, t0 - 3000, ctx.actorId);
    ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });

    // Nova falha posterior ao cutoff da resolução (t0 - 1000 > t0 - 3000)
    ctx.timeProvider.advanceBy(10000);
    const t1 = ctx.timeProvider.now();

    ctx.db.prepare(`
      INSERT INTO telemetry_episode (dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms)
      VALUES (?, 1, ?, ?, 'recurring_fault', ?, ?, ?)
    `).run(ctx.datasetId, ctx.cameraCritical3, randomUUID(), ctx.sourceId, t1 - 1000, t1 - 1000);

    const summary = ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summary.openedCount).toBe(1);

    const alerts = ctx.db.prepare('SELECT id, cycle, status FROM alert WHERE resource_id = ? ORDER BY cycle').all(ctx.cameraCritical3) as Array<{ id: string; cycle: number; status: string }>;
    expect(alerts).toHaveLength(2);
    expect(alerts[0]!.cycle).toBe(1);
    expect(alerts[0]!.status).toBe('resolved');
    expect(alerts[1]!.cycle).toBe(2);
    expect(alerts[1]!.status).toBe('open');
  });
});

describe('AlertEvaluatorService — Regra B: communication_missing', () => {
  it('TC-06 & TC-09: stale dispara alerta warning e observação fresca resolve automaticamente', () => {
    const ctx = setupEvaluatorFixture();
    const t0 = ctx.timeProvider.now();

    // 1. Associa perfil com emissor esperado (expected_interval_ms = 10000, tolerância = 30000)
    ctx.db.prepare(`
      INSERT INTO telemetry_resource_profile (dataset_id, epoch, resource_id, resource_kind, profile_id, profile_version, active, assigned_at_ms)
      VALUES (?, 1, ?, 'equipment', 'FX-FIXED-v1', 1, 1, ?)
    `).run(ctx.datasetId, ctx.cameraCritical5, t0 - 50000);

    const bindingId = randomUUID();
    ctx.db.prepare(`
      INSERT INTO telemetry_binding (dataset_id, epoch, id, source_id, resource_id, resource_kind, channel, projection_field, profile_id, profile_version, active, resource_born_at_ms, history_allowed_from_ms)
      VALUES (?, 1, ?, ?, ?, 'equipment', 'heartbeat', 'communication', 'FX-FIXED-v1', 1, 1, ?, ?)
    `).run(ctx.datasetId, bindingId, ctx.sourceId, ctx.cameraCritical5, t0 - 50000, t0 - 50000);

    // Registra observação válida em t0 - 40000 (delta = 40000 > 30000 tolerance)
    const eventId1 = randomUUID();
    const obsTime1 = t0 - 40000;
    transaction(ctx.db, () => {
      ctx.db.prepare(`
        INSERT INTO telemetry_event (dataset_id, epoch, source_id, event_id, resource_id, channel, binding_id, sequence, observation_type, canonical_version, event_hash, canonical_json, occurred_at_ms, received_at_ms, recorded_at_ms, observation_effective_at_ms, is_simulated, disposition, effects_json, reason_code, resulting_revision, response_status, response_body)
        VALUES (?, 1, ?, ?, ?, 'heartbeat', ?, 0, 'heartbeat', 1, ?, '{}', ?, ?, ?, ?, 1, 'applied', '{}', 'ok', 1, 200, '{}')
      `).run(ctx.datasetId, ctx.sourceId, eventId1, ctx.cameraCritical5, bindingId, 'a'.repeat(64), obsTime1, obsTime1, obsTime1, obsTime1);

      ctx.db.prepare(`
        INSERT INTO telemetry_sequence_slot (dataset_id, epoch, source_id, resource_id, channel, sequence, event_id)
        VALUES (?, 1, ?, ?, 'heartbeat', 0, ?)
      `).run(ctx.datasetId, ctx.sourceId, ctx.cameraCritical5, eventId1);

      ctx.db.prepare(`
        INSERT INTO telemetry_communication_observation (dataset_id, epoch, resource_id, source_id, event_id, channel, observed_at_ms)
        VALUES (?, 1, ?, ?, ?, 'heartbeat', ?)
      `).run(ctx.datasetId, ctx.cameraCritical5, ctx.sourceId, eventId1, obsTime1);
    });

    // 2. Avalia: atraso de 40s excede tolerância de 30s -> alerta aberto
    const summary = ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summary.openedCount).toBe(1);

    const alert = ctx.db.prepare('SELECT * FROM alert WHERE resource_id = ? AND rule_code = ?').get(ctx.cameraCritical5, 'communication_missing') as Record<string, unknown>;
    expect(alert.status).toBe('open');
    expect(alert.severity).toBe('warning');
    expect(alert.cause_code).toBeNull(); // communication_missing não possui cause_code

    // 3. TC-09: Restabelecimento da comunicação com observação fresca em t0 (delta = 0 <= 30000)
    const eventId2 = randomUUID();
    transaction(ctx.db, () => {
      ctx.db.prepare(`
        INSERT INTO telemetry_event (dataset_id, epoch, source_id, event_id, resource_id, channel, binding_id, sequence, observation_type, canonical_version, event_hash, canonical_json, occurred_at_ms, received_at_ms, recorded_at_ms, observation_effective_at_ms, is_simulated, disposition, effects_json, reason_code, resulting_revision, response_status, response_body)
        VALUES (?, 1, ?, ?, ?, 'heartbeat', ?, 1, 'heartbeat', 1, ?, '{}', ?, ?, ?, ?, 1, 'applied', '{}', 'ok', 2, 200, '{}')
      `).run(ctx.datasetId, ctx.sourceId, eventId2, ctx.cameraCritical5, bindingId, 'b'.repeat(64), t0, t0, t0, t0);

      ctx.db.prepare(`
        INSERT INTO telemetry_sequence_slot (dataset_id, epoch, source_id, resource_id, channel, sequence, event_id)
        VALUES (?, 1, ?, ?, 'heartbeat', 1, ?)
      `).run(ctx.datasetId, ctx.sourceId, ctx.cameraCritical5, eventId2);

      ctx.db.prepare(`
        UPDATE telemetry_communication_observation
        SET source_id = ?, event_id = ?, observed_at_ms = ?
        WHERE resource_id = ?
      `).run(ctx.sourceId, eventId2, t0, ctx.cameraCritical5);
    });

    // 4. Reavalia: comunicação restaurada resolve o alerta automaticamente
    const summaryResolved = ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summaryResolved.resolvedCount).toBe(1);

    const resolvedAlert = ctx.db.prepare('SELECT status, resolved_at_ms, resolved_by, evidence_json FROM alert WHERE id = ?').get(alert.id) as Record<string, unknown>;
    expect(resolvedAlert.status).toBe('resolved');
    expect(resolvedAlert.resolved_at_ms).toBe(t0);
    expect(resolvedAlert.resolved_by).toBeNull();

    const ev = JSON.parse(resolvedAlert.evidence_json as string);
    expect(ev.resolutionFact.reason).toBe('communication_restored');
    expect(ev.resolutionFact.observationEventId).toBe(eventId2);
    expect(ev.resolutionFact.evidenceIds).toEqual([eventId2]);
  });

  it('TC-07: estado unknown respeita o grace period de 3x intervalo a partir de registeredAt', () => {
    const initialMs = 1793404800000;
    // Registrado há 20s (dentro da tolerância de 30s)
    const ctx = setupEvaluatorFixture(initialMs, { regTimeCritical3Ms: initialMs - 20000 });
    const t0 = ctx.timeProvider.now();

    ctx.db.prepare(`
      INSERT INTO telemetry_resource_profile (dataset_id, epoch, resource_id, resource_kind, profile_id, profile_version, active, assigned_at_ms)
      VALUES (?, 1, ?, 'equipment', 'FX-FIXED-v1', 1, 1, ?)
    `).run(ctx.datasetId, ctx.cameraCritical3, t0 - 20000);

    // Avalia: ainda em grace period, nenhum alerta abre (ambas as câmeras unchanged)
    const summary1 = ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summary1.openedCount).toBe(0);
    expect(summary1.unchangedCount).toBe(2);

    // Avança 15s (delta agora é 35s > 30s tolerance)
    ctx.timeProvider.advanceBy(15000);
    const summary2 = ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summary2.openedCount).toBe(1);

    const alert = ctx.db.prepare('SELECT status, severity, evidence_json FROM alert WHERE resource_id = ? AND rule_code = ?').get(ctx.cameraCritical3, 'communication_missing') as Record<string, unknown>;
    expect(alert.status).toBe('open');
    const ev = JSON.parse(alert.evidence_json as string);
    expect(ev.registeredAtMs).toBe(initialMs - 20000);
  });

  it('TC-08: equipamento com perfil passivo (FX-NONE-v1) nunca gera alerta de comunicação', () => {
    const ctx = setupEvaluatorFixture();
    const t0 = ctx.timeProvider.now();

    ctx.db.prepare(`
      INSERT INTO telemetry_resource_profile (dataset_id, epoch, resource_id, resource_kind, profile_id, profile_version, active, assigned_at_ms)
      VALUES (?, 1, ?, 'equipment', 'FX-NONE-v1', 1, 1, ?)
    `).run(ctx.datasetId, ctx.cameraCritical3, t0 - 100000);

    // Mesmo com 100s de atraso, perfil FX-NONE tem emitter_expected = 0 -> nenhum alerta
    const summary = ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summary.openedCount).toBe(0);
    expect(summary.unchangedCount).toBe(2);
    expect(ctx.db.prepare('SELECT count(*) as c FROM alert WHERE rule_code = ?').get('communication_missing')).toEqual({ c: 0 });
  });

  it('TC-10: simulação pausada (relógio congelado) não gera falso timeout de comunicação', () => {
    const ctx = setupEvaluatorFixture();
    const t0 = ctx.timeProvider.now();

    // Atribuído há 25s (em grace period)
    ctx.db.prepare(`
      INSERT INTO telemetry_resource_profile (dataset_id, epoch, resource_id, resource_kind, profile_id, profile_version, active, assigned_at_ms)
      VALUES (?, 1, ?, 'equipment', 'FX-FIXED-v1', 1, 1, ?)
    `).run(ctx.datasetId, ctx.cameraCritical3, t0 - 25000);

    // Múltiplos ticks de avaliação sem avanço do tempo (simulação pausada)
    for (let i = 0; i < 5; i++) {
      const summary = ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
      expect(summary.openedCount).toBe(0);
      expect(summary.unchangedCount).toBe(2);
    }
  });
});

describe('AlertEvaluatorService — Regra C: maintenance_due', () => {
  it('TC-11: cálculo de data civil em America/Sao_Paulo e classificação de severidade', () => {
    const ctx = setupEvaluatorFixture();
    // 2026-10-31T00:00:00.000Z em America/Sao_Paulo (UTC-3) corresponde à data civil '2026-10-30'
    const currentCivilDate = getCivilDateString(ctx.timeProvider.now(), 'America/Sao_Paulo');
    expect(currentCivilDate).toBe('2026-10-30');

    // 1. Solicitação a vencer em 4 dias ('2026-11-03') -> severity 'warning'
    ctx.db.prepare(`
      INSERT INTO maintenance_request (dataset_id, epoch, id, equipment_id, cause_code, status, version, reason, priority, schedule_status, due_date, not_applicable_reason)
      VALUES (?, 1, ?, ?, 'initial_camera_inspection', 'open', 1, 'Revisão periódica', 'normal', 'dated', '2026-11-03', NULL)
    `).run(ctx.datasetId, randomUUID(), ctx.cameraCritical3);

    const summary = ctx.evaluator.evaluateMaintenanceDue({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summary.openedCount).toBe(1);

    const alert = ctx.db.prepare('SELECT status, severity, cause_code FROM alert WHERE resource_id = ? AND rule_code = ?').get(ctx.cameraCritical3, 'maintenance_due') as Record<string, unknown>;
    expect(alert.status).toBe('open');
    expect(alert.severity).toBe('warning');
    expect(alert.cause_code).toBe('initial_camera_inspection');
  });

  it('TC-11 (Escalação): prioridade critical escala alerta para severity critical', () => {
    const ctx = setupEvaluatorFixture();

    ctx.db.prepare(`
      INSERT INTO maintenance_request (dataset_id, epoch, id, equipment_id, cause_code, status, version, reason, priority, schedule_status, due_date, not_applicable_reason)
      VALUES (?, 1, ?, ?, 'initial_camera_inspection', 'open', 1, 'Revisão urgente', 'critical', 'dated', '2026-11-02', NULL)
    `).run(ctx.datasetId, randomUUID(), ctx.cameraCritical5);

    ctx.evaluator.evaluateMaintenanceDue({ datasetId: ctx.datasetId, epoch: 1 });

    const alert = ctx.db.prepare('SELECT status, severity FROM alert WHERE resource_id = ? AND rule_code = ?').get(ctx.cameraCritical5, 'maintenance_due') as Record<string, unknown>;
    expect(alert.status).toBe('open');
    expect(alert.severity).toBe('critical');
  });

  it('TC-12 & TC-13: reagendamento e resolução — ajuste de severidade e encerramento determinístico', () => {
    const ctx = setupEvaluatorFixture();
    const reqId = randomUUID();

    // 1. Ordem inicialmente vencida ('2026-10-25' anterior a '2026-10-30') -> severity 'high'
    ctx.db.prepare(`
      INSERT INTO maintenance_request (dataset_id, epoch, id, equipment_id, cause_code, status, version, reason, priority, schedule_status, due_date, not_applicable_reason)
      VALUES (?, 1, ?, ?, 'initial_camera_inspection', 'open', 1, 'Manutenção vencida', 'normal', 'dated', '2026-10-25', NULL)
    `).run(ctx.datasetId, reqId, ctx.cameraCritical3);

    // Avalia: severity = 'high'
    ctx.evaluator.evaluateMaintenanceDue({ datasetId: ctx.datasetId, epoch: 1 });
    const alertBefore = ctx.db.prepare('SELECT id, status, severity FROM alert WHERE resource_id = ? AND rule_code = ?').get(ctx.cameraCritical3, 'maintenance_due') as Record<string, unknown>;
    expect(alertBefore.status).toBe('open');
    expect(alertBefore.severity).toBe('high');

    // 2. Reagenda para daqui a 5 dias ('2026-11-04')
    ctx.db.prepare("UPDATE maintenance_request SET due_date = '2026-11-04' WHERE id = ?").run(reqId);

    // Reavalia: alerta permanece open com severidade ajustada para 'warning'
    const summaryRescheduled = ctx.evaluator.evaluateMaintenanceDue({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summaryRescheduled.resolvedCount).toBe(0);
    expect(summaryRescheduled.updatedCount).toBe(1);

    const alertRescheduled = ctx.db.prepare('SELECT status, severity FROM alert WHERE id = ?').get(alertBefore.id) as Record<string, unknown>;
    expect(alertRescheduled.status).toBe('open');
    expect(alertRescheduled.severity).toBe('warning');

    // 3. Conclui a ordem de manutenção com evento operacional comprovado de encerramento
    const closeEventId = randomUUID();
    const closeIso = new Date(ctx.timeProvider.now()).toISOString();
    ctx.db.prepare(`
      INSERT INTO operational_event (
        dataset_id, epoch, id, resource_id, action, actor_id, command_id,
        resource_version, revision, ordinal, effective_at, recorded_at, received_at, changes_json
      ) VALUES (?, 1, ?, ?, 'inventory.equipment.update.v1', ?, ?, 2, 2, 1, ?, ?, ?, ?)
    `).run(
      ctx.datasetId, closeEventId, ctx.cameraCritical3, ctx.actorId, randomUUID(),
      closeIso, closeIso, closeIso, JSON.stringify({ closedMaintenanceRequestId: reqId }),
    );
    ctx.db.prepare("DELETE FROM maintenance_request WHERE id = ?").run(reqId);

    // Reavalia: sem ordens abertas elegíveis e com fechamento comprovado por evento -> alerta transiciona para 'resolved'
    const summaryResolved = ctx.evaluator.evaluateMaintenanceDue({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summaryResolved.resolvedCount).toBe(1);

    const alertResolved = ctx.db.prepare('SELECT status, resolved_at_ms, evidence_json FROM alert WHERE id = ?').get(alertBefore.id) as Record<string, unknown>;
    expect(alertResolved.status).toBe('resolved');
    expect(alertResolved.resolved_at_ms).toBeDefined();
    const ev = JSON.parse(alertResolved.evidence_json as string);
    expect(ev.resolutionFact.reason).toBe('maintenance_request_closed');
    expect(ev.resolutionFact.evidenceIds).toContain(closeEventId);
  });
});

describe('AlertEvaluatorService — Invariantes de Ciclo de Vida, Idempotência e Isolamento', () => {
  it('TC-14: preservação do status acknowledged durante avaliações subsequentes', () => {
    const ctx = setupEvaluatorFixture();
    const episodeId = randomUUID();
    const faultTime = ctx.timeProvider.now() - 5000;

    ctx.db.prepare(`
      INSERT INTO telemetry_episode (dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms)
      VALUES (?, 1, ?, ?, 'fault_ack', ?, ?, ?)
    `).run(ctx.datasetId, ctx.cameraCritical3, episodeId, ctx.sourceId, faultTime, faultTime);

    ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });
    const alert = ctx.db.prepare('SELECT id, status FROM alert WHERE resource_id = ?').get(ctx.cameraCritical3) as Record<string, unknown>;
    expect(alert.status).toBe('open');

    // Operador reconhece o alerta
    ctx.db.prepare(`
      UPDATE alert
      SET status = 'acknowledged', acknowledged_at_ms = ?, acknowledged_by = ?
      WHERE id = ?
    `).run(ctx.timeProvider.now(), ctx.actorId, alert.id);

    // Avaliador roda novamente com a falha persistente
    const summary = ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summary.openedCount).toBe(0);
    expect(summary.resolvedCount).toBe(0);
    expect(summary.unchangedCount).toBe(2); // Ambas as câmeras não sofreram mutação

    const alertAfter = ctx.db.prepare('SELECT status, acknowledged_at_ms, acknowledged_by FROM alert WHERE id = ?').get(alert.id) as Record<string, unknown>;
    expect(alertAfter.status).toBe('acknowledged'); // Status PRESERVADO! Não regride para 'open'
    expect(alertAfter.acknowledged_by).toBe(ctx.actorId);
  });

  it('TC-15: idempotência estrita anti-flooding — avaliações sucessivas sem alteração geram 0 writes e 0 novos eventos', () => {
    const ctx = setupEvaluatorFixture();
    const faultTime = ctx.timeProvider.now() - 5000;

    ctx.db.prepare(`
      INSERT INTO telemetry_episode (dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms)
      VALUES (?, 1, ?, ?, 'fault_idemp', ?, ?, ?)
    `).run(ctx.datasetId, ctx.cameraCritical3, randomUUID(), ctx.sourceId, faultTime, faultTime);

    // Primeira avaliação abre 1 alerta
    const res1 = ctx.evaluator.evaluateAll({ datasetId: ctx.datasetId, epoch: 1 });
    expect(res1.summaries.equipment_fault.openedCount).toBe(1);
    expect(res1.mutatedAlertIds).toHaveLength(1);

    const eventCountBefore = (ctx.db.prepare('SELECT count(*) as c FROM alert_event').get() as { c: number }).c;
    expect(eventCountBefore).toBe(1);

    // Múltiplas avaliações subsequentes sem mudança de estado
    for (let i = 0; i < 5; i++) {
      const res = ctx.evaluator.evaluateAll({ datasetId: ctx.datasetId, epoch: 1 });
      expect(res.summaries.equipment_fault.openedCount).toBe(0);
      expect(res.summaries.equipment_fault.updatedCount).toBe(0);
      expect(res.summaries.equipment_fault.resolvedCount).toBe(0);
      expect(res.summaries.equipment_fault.unchangedCount).toBe(2);
      expect(res.mutatedAlertIds).toHaveLength(0); // Zero mutações!
    }

    const eventCountAfter = (ctx.db.prepare('SELECT count(*) as c FROM alert_event').get() as { c: number }).c;
    expect(eventCountAfter).toBe(eventCountBefore); // Zero eventos novos!
  });

  it('TC-16: rollback atômico entre alert e alert_event em caso de falha', () => {
    const ctx = setupEvaluatorFixture();
    const faultTime = ctx.timeProvider.now() - 5000;

    ctx.db.prepare(`
      INSERT INTO telemetry_episode (dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms)
      VALUES (?, 1, ?, ?, 'fault_rollback', ?, ?, ?)
    `).run(ctx.datasetId, ctx.cameraCritical3, randomUUID(), ctx.sourceId, faultTime, faultTime);

    // Injeta gatilho de falha em alert_event
    ctx.db.exec("CREATE TEMP TRIGGER test_event_fault BEFORE INSERT ON alert_event BEGIN SELECT RAISE(ABORT, 'injected-event-fault'); END;");

    expect(() => ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 })).toThrow(/injected-event-fault/);

    // Alerta NÃO foi criado (rollback completo)
    expect(ctx.db.prepare('SELECT count(*) as c FROM alert').get()).toEqual({ c: 0 });
    expect(ctx.db.prepare('SELECT count(*) as c FROM alert_event').get()).toEqual({ c: 0 });
  });

  it('TC-17: isolamento rigoroso por dataset e epoch válidos', () => {
    const ctx = setupEvaluatorFixture();
    const faultTime = ctx.timeProvider.now() - 5000;

    // Registra falha no dataset 1
    ctx.db.prepare(`
      INSERT INTO telemetry_episode (dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms)
      VALUES (?, 1, ?, ?, 'fault_ds1', ?, ?, ?)
    `).run(ctx.datasetId, ctx.cameraCritical3, randomUUID(), ctx.sourceId, faultTime, faultTime);

    // Provisiona dataset 2 válido e vazio dentro de transação (FKs circulares deferidas)
    const otherDatasetId = randomUUID();
    transaction(ctx.db, () => {
      ctx.db.prepare("INSERT INTO dataset(id, code, kind, active_epoch) VALUES (?, ?, 'demo', 1)").run(otherDatasetId, `ds-${otherDatasetId}`);
      ctx.db.prepare("INSERT INTO dataset_epoch(dataset_id, epoch, status, revision) VALUES (?, 1, 'ready', 0)").run(otherDatasetId);
    });

    // Avalia dataset 2
    const resOther = ctx.evaluator.evaluateAll({ datasetId: otherDatasetId, epoch: 1 });
    expect(resOther.totalResourcesEvaluated).toBe(0);
    expect(resOther.mutatedAlertIds).toHaveLength(0);

    // Alertas continuam zero no dataset alternativo
    expect(ctx.db.prepare('SELECT count(*) as c FROM alert WHERE dataset_id = ?').get(otherDatasetId)).toEqual({ c: 0 });
  });

  it('TC-18 (P1-1): Isolamento Contextual — dois contextos válidos compartilhando o mesmo alert.id', () => {
    const ctx = setupEvaluatorFixture();
    const sharedAlertId = randomUUID();
    const now = ctx.timeProvider.now();

    // Dataset 2 válido com recurso próprio
    const dataset2 = randomUUID();
    const cameraDs2 = randomUUID();
    transaction(ctx.db, () => {
      ctx.db.prepare("INSERT INTO dataset(id, code, kind, active_epoch) VALUES (?, ?, 'demo', 1)").run(dataset2, `ds-${dataset2}`);
      ctx.db.prepare("INSERT INTO dataset_epoch(dataset_id, epoch, status, revision) VALUES (?, 1, 'ready', 0)").run(dataset2);
      ctx.db.prepare("INSERT INTO organization(dataset_id, epoch, id, code, name) VALUES (?, 1, ?, 'ORG_2', 'Org 2')").run(dataset2, randomUUID());
      ctx.db.prepare("INSERT INTO resource(dataset_id, epoch, id, kind, organization_id, public_label, version) VALUES (?, 1, ?, 'equipment', (SELECT id FROM organization WHERE dataset_id=? LIMIT 1), 'CAM_DS2', 1)")
        .run(dataset2, cameraDs2, dataset2);
      ctx.db.prepare("INSERT INTO equipment(dataset_id, epoch, id, category_code, category_version, serial_normalized, brand, model, criticality, mobility, attributes_json) VALUES (?, 1, ?, 'camera', 1, 'SER_DS2', 'Brand', 'Model', 3, 'fixed', '{\"cameraType\":\"fixed_view\"}')")
        .run(dataset2, cameraDs2);
      ctx.db.prepare(
        `INSERT INTO resource_location(dataset_id, epoch, resource_id, role, reference_type, postal_code, neighborhood, city, uf, address, reference, latitude, longitude, region_id)
         VALUES (?, 1, ?, 'registration', 'installation', '01001000', 'Centro', 'SP', 'SP', 'Av 2', 'Ref', -23.56, -46.64, NULL)`
      ).run(dataset2, cameraDs2);
      ctx.db.prepare("INSERT INTO current_state(dataset_id, epoch, resource_id, operational_state, version) VALUES (?, 1, ?, 'not_installed', 1)")
        .run(dataset2, cameraDs2);
    });

    // Insere alertas com o MESMO id nos dois datasets
    ctx.db.prepare(`
      INSERT INTO alert (dataset_id, epoch, id, resource_id, rule_code, rule_version, cycle, severity, status, cause_code, evidence_json, opened_at_ms)
      VALUES (?, 1, ?, ?, 'equipment_fault', 1, 1, 'high', 'open', 'shared_fault', '{}', ?)
    `).run(ctx.datasetId, sharedAlertId, ctx.cameraCritical3, now - 10000);

    ctx.db.prepare(`
      INSERT INTO alert (dataset_id, epoch, id, resource_id, rule_code, rule_version, cycle, severity, status, cause_code, evidence_json, opened_at_ms)
      VALUES (?, 1, ?, ?, 'equipment_fault', 1, 1, 'high', 'open', 'shared_fault', '{}', ?)
    `).run(dataset2, sharedAlertId, cameraDs2, now - 10000);

    // Resolução apenas no dataset 1
    ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });

    const alert1 = ctx.db.prepare('SELECT status FROM alert WHERE dataset_id = ? AND epoch = 1 AND id = ?').get(ctx.datasetId, sharedAlertId) as { status: string };
    const alert2 = ctx.db.prepare('SELECT status FROM alert WHERE dataset_id = ? AND epoch = 1 AND id = ?').get(dataset2, sharedAlertId) as { status: string };

    expect(alert1.status).toBe('resolved');
    expect(alert2.status).toBe('open'); // O alerta de mesmo ID no dataset 2 NÃO foi afetado!
  });

  it('TC-19 (P1-2 & P1-3 & P1-A): Revisão e Marco Durável — avanço único sob mutação, zero em no-op e bloqueio de bypass', () => {
    const ctx = setupEvaluatorFixture();
    const t0 = ctx.timeProvider.now();

    // 1. Avaliação sem alertas -> no-op: revisão 0 e sem avanço durável
    const noOpResult = ctx.evaluator.evaluateAll({ datasetId: ctx.datasetId, epoch: 1 });
    expect(noOpResult.revision).toBe(0);
    expect(noOpResult.mutatedAlertIds).toHaveLength(0);

    const clockBefore = ctx.db.prepare('SELECT trusted_utc_ms FROM telemetry_trusted_clock WHERE singleton = 1').get() as { trusted_utc_ms: number } | undefined;
    expect(clockBefore).toBeUndefined();

    // 2. Registra duas falhas distintas (uma em Rule A e outra em Rule C)
    ctx.db.prepare(`
      INSERT INTO telemetry_episode (dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms)
      VALUES (?, 1, ?, ?, 'fault_multi', ?, ?, ?)
    `).run(ctx.datasetId, ctx.cameraCritical3, randomUUID(), ctx.sourceId, t0 - 5000, t0 - 5000);

    ctx.db.prepare(`
      INSERT INTO maintenance_request (dataset_id, epoch, id, equipment_id, cause_code, status, version, reason, priority, schedule_status, due_date, not_applicable_reason)
      VALUES (?, 1, ?, ?, 'initial_camera_inspection', 'open', 1, 'Manutenção vencida', 'normal', 'dated', '2026-10-25', NULL)
    `).run(ctx.datasetId, randomUUID(), ctx.cameraCritical5);

    // 3. Avalia todas as regras: ambos os alertas abrem, mas a revisão do dataset é incrementada exatamente UMA vez
    const mutResult = ctx.evaluator.evaluateAll({ datasetId: ctx.datasetId, epoch: 1 });
    expect(mutResult.summaries.equipment_fault.openedCount).toBe(1);
    expect(mutResult.summaries.maintenance_due.openedCount).toBe(1);
    expect(mutResult.mutatedAlertIds).toHaveLength(2);
    expect(mutResult.revision).toBe(1); // Incrementado apenas uma vez!

    const revRow = ctx.db.prepare('SELECT revision FROM dataset_epoch WHERE dataset_id = ? AND epoch = 1').get(ctx.datasetId) as { revision: number };
    expect(revRow.revision).toBe(1);

    // Marco durável gravado
    const clockAfter = ctx.db.prepare('SELECT trusted_utc_ms FROM telemetry_trusted_clock WHERE singleton = 1').get() as { trusted_utc_ms: number };
    expect(clockAfter.trusted_utc_ms).toBe(t0);

    // 4. Bloqueio de bypass: advanceRevision=false é terminantemente proibido tanto fora quanto dentro de transação
    expect(() => {
      ctx.evaluator.evaluateAll({ datasetId: ctx.datasetId, epoch: 1, advanceRevision: false });
    }).toThrow(/advanceRevision=false is strictly prohibited/);

    // Bloqueio de composição em transação externa: fail-closed imediato
    transaction(ctx.db, () => {
      expect(() => {
        ctx.evaluator.evaluateAll({
          datasetId: ctx.datasetId,
          epoch: 1,
        });
      }).toThrow(/Alert evaluation cannot be executed within an active external transaction/);
    });

    // 5. Invariante: no-op não incrementa revisão
    const noOpResult2 = ctx.evaluator.evaluateAll({ datasetId: ctx.datasetId, epoch: 1 });
    expect(noOpResult2.mutatedAlertIds).toHaveLength(0);
    expect(noOpResult2.revision).toBe(1);
    const revAfterNoOp = ctx.db.prepare('SELECT revision FROM dataset_epoch WHERE dataset_id = ? AND epoch = 1').get(ctx.datasetId) as { revision: number };
    expect(revAfterNoOp.revision).toBe(1);
  });

  it('TC-20 (P1-4): Validação de Epoch — rejeita dataset inexistente ou epoch aposentado', () => {
    const ctx = setupEvaluatorFixture();

    // A. Dataset inexistente
    expect(() => ctx.evaluator.evaluateAll({ datasetId: randomUUID(), epoch: 1 })).toThrow(/Geração obsoleta ou indisponível/);

    // B. Epoch aposentado (retired)
    ctx.db.prepare("UPDATE dataset_epoch SET status = 'retired' WHERE dataset_id = ? AND epoch = 1").run(ctx.datasetId);
    expect(() => ctx.evaluator.evaluateAll({ datasetId: ctx.datasetId, epoch: 1 })).toThrow(/Geração obsoleta ou indisponível/);

    // C. Epoch divergente do active_epoch
    ctx.db.prepare("UPDATE dataset_epoch SET status = 'ready' WHERE dataset_id = ? AND epoch = 1").run(ctx.datasetId);
    expect(() => ctx.evaluator.evaluateAll({ datasetId: ctx.datasetId, epoch: 2 })).toThrow(/Geração obsoleta ou indisponível/);
  });

  it('TC-21 (P1-6 & P1-B): Comunicação Missing — fronteira exata de 3x intervalo e +1 ms a partir de registeredAt', () => {
    const initialMs = 1793404800000;
    // Registrado exatamente há 30000ms
    const ctx = setupEvaluatorFixture(initialMs, { regTimeCritical5Ms: initialMs - 30000 });
    const t0 = ctx.timeProvider.now();

    // Profile atribuído recentemente (t0 - 10000ms) com expected_interval_ms = 10000 -> tolerância = 30000ms
    ctx.db.prepare(`
      INSERT INTO telemetry_resource_profile (dataset_id, epoch, resource_id, resource_kind, profile_id, profile_version, active, assigned_at_ms)
      VALUES (?, 1, ?, 'equipment', 'FX-FIXED-v1', 1, 1, ?)
    `).run(ctx.datasetId, ctx.cameraCritical5, t0 - 10000);

    // 1. Limite exato (deltaMs = 30000 === toleranceMs) -> não expirou (não abre alerta)
    const summaryExact = ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summaryExact.openedCount).toBe(0);

    // 2. Limite + 1ms (deltaMs = 30001 > toleranceMs) -> expirou estritamente!
    ctx.timeProvider.advanceBy(1);
    const summaryPlus1 = ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summaryPlus1.openedCount).toBe(1);

    const alert = ctx.db.prepare('SELECT status, evidence_json FROM alert WHERE resource_id = ? AND rule_code = ?').get(ctx.cameraCritical5, 'communication_missing') as Record<string, unknown>;
    expect(alert.status).toBe('open');
    const ev = JSON.parse(alert.evidence_json as string);
    expect(ev.registeredAtMs).toBe(initialMs - 30000); // Confirmou registeredAt de operational_event!
  });

  it('TC-22 (P1-C): Desativação de perfil NÃO resolve alerta de comunicação ausente', () => {
    const initialMs = 1793404800000;
    const ctx = setupEvaluatorFixture(initialMs, { regTimeCritical5Ms: initialMs - 50000 });
    const t0 = ctx.timeProvider.now();

    ctx.db.prepare(`
      INSERT INTO telemetry_resource_profile (dataset_id, epoch, resource_id, resource_kind, profile_id, profile_version, active, assigned_at_ms)
      VALUES (?, 1, ?, 'equipment', 'FX-FIXED-v1', 1, 1, ?)
    `).run(ctx.datasetId, ctx.cameraCritical5, t0 - 50000);

    // Abre alerta por falta de batimento
    ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
    const alertBefore = ctx.db.prepare('SELECT id, status FROM alert WHERE resource_id = ? AND rule_code = ?').get(ctx.cameraCritical5, 'communication_missing') as Record<string, unknown>;
    expect(alertBefore.status).toBe('open');

    // Desativa o perfil do equipamento (torna-se inativo)
    ctx.db.prepare('UPDATE telemetry_resource_profile SET active = 0 WHERE resource_id = ?').run(ctx.cameraCritical5);

    // Reavalia: alerta NÃO deve ser resolvido! O estado é preservado sem afirmar falsamente restauração de comunicação.
    const summary = ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summary.resolvedCount).toBe(0);
    expect(summary.unchangedCount).toBe(2);

    const alertAfter = ctx.db.prepare('SELECT status, resolved_at_ms FROM alert WHERE id = ?').get(alertBefore.id) as Record<string, unknown>;
    expect(alertAfter.status).toBe('open'); // Permanece aberto!
    expect(alertAfter.resolved_at_ms).toBeNull();
  });

  it('TC-23 (Baixo Risco): Redundância eliminada — tempo decorrido sem mudança não reescreve evidência', () => {
    const initialMs = 1793404800000;
    const ctx = setupEvaluatorFixture(initialMs, { regTimeCritical5Ms: initialMs - 50000 });
    const t0 = ctx.timeProvider.now();

    ctx.db.prepare(`
      INSERT INTO telemetry_resource_profile (dataset_id, epoch, resource_id, resource_kind, profile_id, profile_version, active, assigned_at_ms)
      VALUES (?, 1, ?, 'equipment', 'FX-FIXED-v1', 1, 1, ?)
    `).run(ctx.datasetId, ctx.cameraCritical5, t0 - 50000);

    ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
    const alertId = (ctx.db.prepare('SELECT id FROM alert WHERE resource_id = ?').get(ctx.cameraCritical5) as { id: string }).id;

    // Avança o tempo 10s depois
    ctx.timeProvider.advanceBy(10000);
    const summary = ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summary.updatedCount).toBe(0); // ZERO updates!
    expect(summary.unchangedCount).toBe(2);
  });

  it('TC-24 (P1-1): chamadas dentro de transação externa são rejeitadas fail-closed sem mutações mesmo se o chamador confirmar o commit', () => {
    const ctx = setupEvaluatorFixture();
    const t0 = ctx.timeProvider.now();

    ctx.db.prepare(`
      INSERT INTO telemetry_episode (dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms)
      VALUES (?, 1, ?, ?, 'fault_tx', ?, ?, ?)
    `).run(ctx.datasetId, ctx.cameraCritical3, randomUUID(), ctx.sourceId, t0 - 5000, t0 - 5000);

    let caughtError: unknown;
    transaction(ctx.db, () => {
      try {
        ctx.evaluator.evaluateAll({ datasetId: ctx.datasetId, epoch: 1 });
      } catch (err) {
        caughtError = err;
      }
      // Chamador externo captura o erro e confirma o commit externo
    });

    expect(caughtError).toBeInstanceOf(AppError);
    expect((caughtError as AppError).code).toBe('EXTERNAL_TRANSACTION_PROHIBITED');
    expect((caughtError as AppError).statusCode).toBe(409);

    // Verificado: zero mutações em alert, alert_event ou revision mesmo após commit da transação externa
    expect(ctx.db.prepare('SELECT count(*) as c FROM alert').get()).toEqual({ c: 0 });
    expect(ctx.db.prepare('SELECT count(*) as c FROM alert_event').get()).toEqual({ c: 0 });
    const rev = (ctx.db.prepare('SELECT revision FROM dataset_epoch WHERE dataset_id = ?').get(ctx.datasetId) as { revision: number }).revision;
    expect(rev).toBe(0); // Revisão não foi incrementada
  });

  it('SPEC-01: alteração de severidade durante status open atualiza alert sem violar constraint de alert_event', () => {
    const ctx = setupEvaluatorFixture();

    // 1. Manutenção a vencer em 4 dias -> abre 'warning'
    const reqId = randomUUID();
    ctx.db.prepare(`
      INSERT INTO maintenance_request (dataset_id, epoch, id, equipment_id, cause_code, status, version, reason, priority, schedule_status, due_date, not_applicable_reason)
      VALUES (?, 1, ?, ?, 'initial_camera_inspection', 'open', 1, 'Revisão periódica', 'normal', 'dated', '2026-11-03', NULL)
    `).run(ctx.datasetId, reqId, ctx.cameraCritical3);

    ctx.evaluator.evaluateMaintenanceDue({ datasetId: ctx.datasetId, epoch: 1 });
    const alert1 = ctx.db.prepare('SELECT id, severity, status FROM alert WHERE resource_id = ?').get(ctx.cameraCritical3) as Record<string, unknown>;
    expect(alert1.severity).toBe('warning');
    expect(alert1.status).toBe('open');

    const eventsCount1 = (ctx.db.prepare('SELECT count(*) as c FROM alert_event WHERE alert_id = ?').get(alert1.id) as { c: number }).c;
    expect(eventsCount1).toBe(1);

    // 2. Data civil avança de modo que a ordem vence ('high')
    // Atualiza due_date para ontem ('2026-10-29' em relação a '2026-10-30')
    ctx.db.prepare("UPDATE maintenance_request SET due_date = '2026-10-29' WHERE id = ?").run(reqId);

    // Avalia novamente: severidade escala para 'high'
    const summary = ctx.evaluator.evaluateMaintenanceDue({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summary.updatedCount).toBe(1);

    const alert2 = ctx.db.prepare('SELECT id, severity, status FROM alert WHERE id = ?').get(alert1.id) as Record<string, unknown>;
    expect(alert2.severity).toBe('high'); // Severidade escalada na entidade alert!
    expect(alert2.status).toBe('open');

    // Nenhum evento duplicado ou inválido inserido em alert_event (respeita UNIQUE alert_id, status)
    const eventsCount2 = (ctx.db.prepare('SELECT count(*) as c FROM alert_event WHERE alert_id = ?').get(alert1.id) as { c: number }).c;
    expect(eventsCount2).toBe(1);
  });

  // ===========================================================================
  // TESTES ADVERSARIAIS DIRECIONADOS — P1-A, P1-B, P1-C
  // ===========================================================================

  it('TC-25 (P1-B): Registro anterior à atribuição de perfil usa registeredAt (não assigned_at)', () => {
    const initialMs = 1793404800000;
    // Registro ocorreu há 40s (t0 - 40000)
    const ctx = setupEvaluatorFixture(initialMs, { regTimeCritical5Ms: initialMs - 40000 });
    const t0 = ctx.timeProvider.now();

    // Atribuição de perfil ocorreu recentemente: há 10s (t0 - 10000)
    // Tolerância é 30s (3 * 10s)
    // Se usasse assigned_at_ms (delta = 10s <= 30s), NÃO abriria alerta.
    // Usando registeredAt (delta = 40s > 30s), DEVE abrir alerta!
    ctx.db.prepare(`
      INSERT INTO telemetry_resource_profile (dataset_id, epoch, resource_id, resource_kind, profile_id, profile_version, active, assigned_at_ms)
      VALUES (?, 1, ?, 'equipment', 'FX-FIXED-v1', 1, 1, ?)
    `).run(ctx.datasetId, ctx.cameraCritical5, t0 - 10000);

    const summary = ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summary.openedCount).toBe(1);

    const alert = ctx.db.prepare('SELECT status, evidence_json FROM alert WHERE resource_id = ?').get(ctx.cameraCritical5) as Record<string, unknown>;
    expect(alert.status).toBe('open');
    const ev = JSON.parse(alert.evidence_json as string);
    expect(ev.registeredAtMs).toBe(initialMs - 40000);
  });

  it('TC-26 (P1-B): Ausência total de binding — recurso com perfil ativo avalia corretamente por registeredAt', () => {
    const initialMs = 1793404800000;
    const ctx = setupEvaluatorFixture(initialMs, { regTimeCritical5Ms: initialMs - 40000 });
    const t0 = ctx.timeProvider.now();

    ctx.db.prepare(`
      INSERT INTO telemetry_resource_profile (dataset_id, epoch, resource_id, resource_kind, profile_id, profile_version, active, assigned_at_ms)
      VALUES (?, 1, ?, 'equipment', 'FX-FIXED-v1', 1, 1, ?)
    `).run(ctx.datasetId, ctx.cameraCritical5, t0 - 20000);

    // Confirma que ZERO bindings existem na tabela
    expect(ctx.db.prepare('SELECT count(*) as c FROM telemetry_binding').get()).toEqual({ c: 0 });

    // Avaliação roda sem falhas e abre alerta com base em registeredAt
    const summary = ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summary.openedCount).toBe(1);

    const alert = ctx.db.prepare('SELECT status FROM alert WHERE resource_id = ?').get(ctx.cameraCritical5) as Record<string, unknown>;
    expect(alert.status).toBe('open');
  });

  it('TC-27 (P1-B): Múltiplos bindings com resource_born_at_ms divergentes não interferem no registeredAt', () => {
    const initialMs = 1793404800000;
    const ctx = setupEvaluatorFixture(initialMs, { regTimeCritical5Ms: initialMs - 50000 });
    const t0 = ctx.timeProvider.now();

    ctx.db.prepare(`
      INSERT INTO telemetry_resource_profile (dataset_id, epoch, resource_id, resource_kind, profile_id, profile_version, active, assigned_at_ms)
      VALUES (?, 1, ?, 'equipment', 'FX-FIXED-v1', 1, 1, ?)
    `).run(ctx.datasetId, ctx.cameraCritical5, t0 - 10000);

    // Dois bindings com born_at arbitrários e divergentes
    ctx.db.prepare(`
      INSERT INTO telemetry_binding (dataset_id, epoch, id, source_id, resource_id, resource_kind, channel, projection_field, profile_id, profile_version, active, resource_born_at_ms, history_allowed_from_ms)
      VALUES
        (?, 1, ?, ?, ?, 'equipment', 'heartbeat', 'communication', 'FX-FIXED-v1', 1, 1, ?, ?),
        (?, 1, ?, ?, ?, 'equipment', 'status', 'status_channel', 'FX-FIXED-v1', 1, 1, ?, ?)
    `).run(
      ctx.datasetId, randomUUID(), ctx.sourceId, ctx.cameraCritical5, t0 - 1000, t0 - 1000,
      ctx.datasetId, randomUUID(), ctx.sourceId, ctx.cameraCritical5, t0 - 999999, t0 - 999999,
    );

    const summary = ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summary.openedCount).toBe(1);

    const alert = ctx.db.prepare('SELECT evidence_json FROM alert WHERE resource_id = ?').get(ctx.cameraCritical5) as Record<string, unknown>;
    const ev = JSON.parse(alert.evidence_json as string);
    // registeredAtMs corresponde a initialMs - 50000, e não a nenhum dos bindings
    expect(ev.registeredAtMs).toBe(initialMs - 50000);
  });

  it('TC-28 (P1-B): Ausência de operational_event (origem indeterminada) não abre alerta e não quebra', () => {
    const initialMs = 1793404800000;
    // Sem operational_event para a cameraCritical5
    const ctx = setupEvaluatorFixture(initialMs, { regTimeCritical5Ms: null });
    const t0 = ctx.timeProvider.now();

    ctx.db.prepare(`
      INSERT INTO telemetry_resource_profile (dataset_id, epoch, resource_id, resource_kind, profile_id, profile_version, active, assigned_at_ms)
      VALUES (?, 1, ?, 'equipment', 'FX-FIXED-v1', 1, 1, ?)
    `).run(ctx.datasetId, ctx.cameraCritical5, t0 - 50000);

    // Estado indeterminado: não abre alerta para o recurso sem registeredAt
    const summary = ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summary.openedCount).toBe(0);
    expect(summary.unchangedCount).toBe(2);
    expect(ctx.db.prepare('SELECT count(*) as c FROM alert WHERE resource_id = ?').get(ctx.cameraCritical5)).toEqual({ c: 0 });
  });

  it('TC-29 (P1-C): Troca de perfil para emitter_expected = 0 (FX-NONE) preserva alerta aberto', () => {
    const initialMs = 1793404800000;
    const ctx = setupEvaluatorFixture(initialMs, { regTimeCritical5Ms: initialMs - 50000 });
    const t0 = ctx.timeProvider.now();

    ctx.db.prepare(`
      INSERT INTO telemetry_resource_profile (dataset_id, epoch, resource_id, resource_kind, profile_id, profile_version, active, assigned_at_ms)
      VALUES (?, 1, ?, 'equipment', 'FX-FIXED-v1', 1, 1, ?)
    `).run(ctx.datasetId, ctx.cameraCritical5, t0 - 50000);

    // Abre alerta
    ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
    const alertBefore = ctx.db.prepare('SELECT id, status FROM alert WHERE resource_id = ?').get(ctx.cameraCritical5) as { id: string; status: string };
    expect(alertBefore.status).toBe('open');

    // Desativa o perfil antigo e ativa perfil passivo FX-NONE-v1
    transaction(ctx.db, () => {
      ctx.db.prepare('UPDATE telemetry_resource_profile SET active = 0 WHERE resource_id = ?').run(ctx.cameraCritical5);
      ctx.db.prepare(`
        INSERT INTO telemetry_resource_profile (dataset_id, epoch, resource_id, resource_kind, profile_id, profile_version, active, assigned_at_ms)
        VALUES (?, 1, ?, 'equipment', 'FX-NONE-v1', 1, 1, ?)
      `).run(ctx.datasetId, ctx.cameraCritical5, t0);
    });

    // Reavalia: alerta NÃO deve ser resolvido! Estado permanece aberto porque não houve batimento.
    const summary = ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summary.resolvedCount).toBe(0);
    expect(summary.unchangedCount).toBe(2);

    const alertAfter = ctx.db.prepare('SELECT status, resolved_at_ms FROM alert WHERE id = ?').get(alertBefore.id) as { status: string; resolved_at_ms: number | null };
    expect(alertAfter.status).toBe('open');
    expect(alertAfter.resolved_at_ms).toBeNull();
  });

  it('TC-30 (P1-C): Troca de perfil preserva alerta e subsequente reativação com observação fresca resolve', () => {
    const initialMs = 1793404800000;
    const ctx = setupEvaluatorFixture(initialMs, { regTimeCritical5Ms: initialMs - 50000 });
    const t0 = ctx.timeProvider.now();
    const obsTime = t0 - 45000;

    // Perfil FX-FIXED-v1: intervalo 10s, tolerância 30s. Observação há 45s está stale (> 30s)!
    ctx.db.prepare(`
      INSERT INTO telemetry_resource_profile (dataset_id, epoch, resource_id, resource_kind, profile_id, profile_version, active, assigned_at_ms)
      VALUES (?, 1, ?, 'equipment', 'FX-FIXED-v1', 1, 1, ?)
    `).run(ctx.datasetId, ctx.cameraCritical5, t0 - 50000);

    const bindingId = randomUUID();
    ctx.db.prepare(`
      INSERT INTO telemetry_binding (dataset_id, epoch, id, source_id, resource_id, resource_kind, channel, projection_field, profile_id, profile_version, active, resource_born_at_ms, history_allowed_from_ms)
      VALUES (?, 1, ?, ?, ?, 'equipment', 'heartbeat', 'communication', 'FX-FIXED-v1', 1, 1, ?, ?)
    `).run(ctx.datasetId, bindingId, ctx.sourceId, ctx.cameraCritical5, t0 - 50000, t0 - 50000);

    const eventId = randomUUID();
    transaction(ctx.db, () => {
      ctx.db.prepare(`
        INSERT INTO telemetry_event (dataset_id, epoch, source_id, event_id, resource_id, channel, binding_id, sequence, observation_type, canonical_version, event_hash, canonical_json, occurred_at_ms, received_at_ms, recorded_at_ms, observation_effective_at_ms, is_simulated, disposition, effects_json, reason_code, resulting_revision, response_status, response_body)
        VALUES (?, 1, ?, ?, ?, 'heartbeat', ?, 0, 'heartbeat', 1, ?, '{}', ?, ?, ?, ?, 1, 'applied', '{}', 'ok', 1, 200, '{}')
      `).run(ctx.datasetId, ctx.sourceId, eventId, ctx.cameraCritical5, bindingId, 'a'.repeat(64), obsTime, obsTime, obsTime, obsTime);

      ctx.db.prepare(`
        INSERT INTO telemetry_sequence_slot (dataset_id, epoch, source_id, resource_id, channel, sequence, event_id)
        VALUES (?, 1, ?, ?, 'heartbeat', 0, ?)
      `).run(ctx.datasetId, ctx.sourceId, ctx.cameraCritical5, eventId);

      ctx.db.prepare(`
        INSERT INTO telemetry_communication_observation (dataset_id, epoch, resource_id, source_id, event_id, channel, observed_at_ms)
        VALUES (?, 1, ?, ?, ?, 'heartbeat', ?)
      `).run(ctx.datasetId, ctx.cameraCritical5, ctx.sourceId, eventId, obsTime);
    });

    // 1. Abre alerta porque 45s > 30s
    ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
    const alertBefore = ctx.db.prepare('SELECT id, status FROM alert WHERE resource_id = ?').get(ctx.cameraCritical5) as { id: string; status: string };
    expect(alertBefore.status).toBe('open');

    // 2. Troca para FX-NONE-v1: alerta permanece aberto (não é resolvido)
    transaction(ctx.db, () => {
      ctx.db.prepare('UPDATE telemetry_binding SET active = 0 WHERE resource_id = ?').run(ctx.cameraCritical5);
      ctx.db.prepare('UPDATE telemetry_resource_profile SET active = 0 WHERE resource_id = ?').run(ctx.cameraCritical5);
      ctx.db.prepare(`
        INSERT INTO telemetry_resource_profile (dataset_id, epoch, resource_id, resource_kind, profile_id, profile_version, active, assigned_at_ms)
        VALUES (?, 1, ?, 'equipment', 'FX-NONE-v1', 1, 1, ?)
      `).run(ctx.datasetId, ctx.cameraCritical5, t0);
    });
    const summaryNone = ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summaryNone.resolvedCount).toBe(0);
    expect(summaryNone.unchangedCount).toBe(2);

    // 3. Reativa FX-FIXED-v1 e registra nova observação fresca em t0 (delta = 0 <= 30000)
    const eventId2 = randomUUID();
    transaction(ctx.db, () => {
      ctx.db.prepare('UPDATE telemetry_resource_profile SET active = 0 WHERE resource_id = ?').run(ctx.cameraCritical5);
      ctx.db.prepare('UPDATE telemetry_resource_profile SET active = 1 WHERE resource_id = ? AND profile_id = ?').run(ctx.cameraCritical5, 'FX-FIXED-v1');
      ctx.db.prepare('UPDATE telemetry_binding SET active = 1 WHERE resource_id = ?').run(ctx.cameraCritical5);

      ctx.db.prepare(`
        INSERT INTO telemetry_event (dataset_id, epoch, source_id, event_id, resource_id, channel, binding_id, sequence, observation_type, canonical_version, event_hash, canonical_json, occurred_at_ms, received_at_ms, recorded_at_ms, observation_effective_at_ms, is_simulated, disposition, effects_json, reason_code, resulting_revision, response_status, response_body)
        VALUES (?, 1, ?, ?, ?, 'heartbeat', ?, 1, 'heartbeat', 1, ?, '{}', ?, ?, ?, ?, 1, 'applied', '{}', 'ok', 2, 200, '{}')
      `).run(ctx.datasetId, ctx.sourceId, eventId2, ctx.cameraCritical5, bindingId, 'b'.repeat(64), t0, t0, t0, t0);

      ctx.db.prepare(`
        INSERT INTO telemetry_sequence_slot (dataset_id, epoch, source_id, resource_id, channel, sequence, event_id)
        VALUES (?, 1, ?, ?, 'heartbeat', 1, ?)
      `).run(ctx.datasetId, ctx.sourceId, ctx.cameraCritical5, eventId2);

      ctx.db.prepare(`
        UPDATE telemetry_communication_observation
        SET event_id = ?, observed_at_ms = ?
        WHERE resource_id = ?
      `).run(eventId2, t0, ctx.cameraCritical5);
    });

    // 4. Reavalia: agora com perfil ativo com emissor e observação fresca comprovada -> alerta RESOLVE!
    const summaryFresh = ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summaryFresh.resolvedCount).toBe(1);

    const alertAfter = ctx.db.prepare('SELECT status, resolved_at_ms FROM alert WHERE id = ?').get(alertBefore.id) as { status: string; resolved_at_ms: number | null };
    expect(alertAfter.status).toBe('resolved');
    expect(alertAfter.resolved_at_ms).toBe(t0);
  });

  it('TC-31 (P1-1): advanceRevision=false em transação externa é rejeitado fail-closed', () => {
    const ctx = setupEvaluatorFixture();

    // Bloqueio de composição em transação externa: fail-closed imediato
    transaction(ctx.db, () => {
      expect(() => {
        ctx.evaluator.evaluateAll({
          datasetId: ctx.datasetId,
          epoch: 1,
        });
      }).toThrow(/Alert evaluation cannot be executed within an active external transaction/);
    });
  });

  it('TC-32 (P1-2): estado unknown com deltaMs <= toleranceMs NUNCA resolve alerta aberto preexistente', () => {
    const initialMs = 1793404800000;
    // Registrado em t0 - 20000ms (dentro da tolerância de 30000ms: deltaMs = 20000 <= 30000)
    const ctx = setupEvaluatorFixture(initialMs, { regTimeCritical5Ms: initialMs - 20000 });
    const t0 = ctx.timeProvider.now();

    // Perfil com emissor (expected_interval_ms = 10000 -> tolerância = 30000)
    ctx.db.prepare(`
      INSERT INTO telemetry_resource_profile (dataset_id, epoch, resource_id, resource_kind, profile_id, profile_version, active, assigned_at_ms)
      VALUES (?, 1, ?, 'equipment', 'FX-FIXED-v1', 1, 1, ?)
    `).run(ctx.datasetId, ctx.cameraCritical5, t0 - 20000);

    // Pré-existência de um alerta aberto para este recurso (ex: aberto em momento anterior)
    const preExistingAlertId = randomUUID();
    ctx.db.prepare(`
      INSERT INTO alert (
        dataset_id, epoch, id, resource_id, rule_code, rule_version, cycle, severity, status, cause_code, evidence_json, opened_at_ms
      ) VALUES (?, 1, ?, ?, 'communication_missing', 1, 1, 'warning', 'open', NULL, '{"state":"unknown"}', ?)
    `).run(ctx.datasetId, preExistingAlertId, ctx.cameraCritical5, t0 - 25000);

    ctx.db.prepare(`
      INSERT INTO alert_event (
        dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version, cycle, severity, previous_status, status, evidence_json, occurred_at_ms, recorded_at_ms
      ) VALUES (?, 1, ?, ?, ?, 'communication_missing', 1, 1, 'warning', NULL, 'open', '{"state":"unknown"}', ?, ?)
    `).run(ctx.datasetId, randomUUID(), preExistingAlertId, ctx.cameraCritical5, t0 - 25000, t0 - 25000);

    // 1. Avalia: deltaMs <= toleranceMs, mas NÃO há nenhuma observação aplicada (state='unknown')!
    // P1-2: O alerta existente NÃO PODE ser resolvido com base na tolerância cadastral. Deve permanecer OPEN!
    const summaryWithinGrace = ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summaryWithinGrace.resolvedCount).toBe(0);
    expect(summaryWithinGrace.unchangedCount).toBe(2);

    const alertStillOpen = ctx.db.prepare('SELECT status, resolved_at_ms FROM alert WHERE id = ?').get(preExistingAlertId) as { status: string; resolved_at_ms: number | null };
    expect(alertStillOpen.status).toBe('open');
    expect(alertStillOpen.resolved_at_ms).toBeNull();

    // 2. Agora sim: aplica observação válida em telemetry_communication_observation
    const bindingId = randomUUID();
    ctx.db.prepare(`
      INSERT INTO telemetry_binding (dataset_id, epoch, id, source_id, resource_id, resource_kind, channel, projection_field, profile_id, profile_version, active, resource_born_at_ms, history_allowed_from_ms)
      VALUES (?, 1, ?, ?, ?, 'equipment', 'heartbeat', 'communication', 'FX-FIXED-v1', 1, 1, ?, ?)
    `).run(ctx.datasetId, bindingId, ctx.sourceId, ctx.cameraCritical5, t0 - 20000, t0 - 20000);

    const eventIdFresh = randomUUID();
    transaction(ctx.db, () => {
      ctx.db.prepare(`
        INSERT INTO telemetry_event (dataset_id, epoch, source_id, event_id, resource_id, channel, binding_id, sequence, observation_type, canonical_version, event_hash, canonical_json, occurred_at_ms, received_at_ms, recorded_at_ms, observation_effective_at_ms, is_simulated, disposition, effects_json, reason_code, resulting_revision, response_status, response_body)
        VALUES (?, 1, ?, ?, ?, 'heartbeat', ?, 0, 'heartbeat', 1, ?, '{}', ?, ?, ?, ?, 1, 'applied', '{}', 'ok', 10, 200, '{}')
      `).run(ctx.datasetId, ctx.sourceId, eventIdFresh, ctx.cameraCritical5, bindingId, 'c'.repeat(64), t0, t0, t0, t0);

      ctx.db.prepare(`
        INSERT INTO telemetry_sequence_slot (dataset_id, epoch, source_id, resource_id, channel, sequence, event_id)
        VALUES (?, 1, ?, ?, 'heartbeat', 0, ?)
      `).run(ctx.datasetId, ctx.sourceId, ctx.cameraCritical5, eventIdFresh);

      ctx.db.prepare(`
        INSERT INTO telemetry_communication_observation (dataset_id, epoch, resource_id, channel, source_id, event_id, observed_at_ms)
        VALUES (?, 1, ?, 'heartbeat', ?, ?, ?)
      `).run(ctx.datasetId, ctx.cameraCritical5, ctx.sourceId, eventIdFresh, t0);
    });

    // 3. Reavalia com observação fresca confirmada: agora SIM resolve com observationEventId legítimo
    const summaryFresh = ctx.evaluator.evaluateCommunicationMissing({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summaryFresh.resolvedCount).toBe(1);

    const alertResolved = ctx.db.prepare('SELECT status, resolved_at_ms, evidence_json FROM alert WHERE id = ?').get(preExistingAlertId) as { status: string; resolved_at_ms: number; evidence_json: string };
    expect(alertResolved.status).toBe('resolved');
    expect(alertResolved.resolved_at_ms).toBe(t0);

    const ev = JSON.parse(alertResolved.evidence_json);
    expect(ev.resolutionFact.reason).toBe('communication_restored');
    expect(ev.resolutionFact.observationEventId).toBe(eventIdFresh);
    expect(ev.resolutionFact.evidenceIds).toEqual([eventIdFresh]);
  });

  it('TC-33 (P1-3): maintenance_due distingue maintenance_rescheduled, maintenance_request_closed e temporal_window_exit', () => {
    const ctx = setupEvaluatorFixture();
    const req1Id = randomUUID();

    // 1. Cria solicitação vencida ('2026-10-25' <= 7 dias em relação a '2026-10-31')
    ctx.db.prepare(`
      INSERT INTO maintenance_request (dataset_id, epoch, id, equipment_id, cause_code, status, version, reason, priority, schedule_status, due_date, not_applicable_reason)
      VALUES (?, 1, ?, ?, 'initial_camera_inspection', 'open', 1, 'Manutenção vencida', 'normal', 'dated', '2026-10-25', NULL)
    `).run(ctx.datasetId, req1Id, ctx.cameraCritical3);

    ctx.evaluator.evaluateMaintenanceDue({ datasetId: ctx.datasetId, epoch: 1 });
    const alert = ctx.db.prepare('SELECT id, status FROM alert WHERE resource_id = ? AND rule_code = ?').get(ctx.cameraCritical3, 'maintenance_due') as { id: string; status: string };
    expect(alert.status).toBe('open');

    // 2. Reagenda para data futura além de 7 dias ('2026-11-20' > 7 dias) mantendo status='open'
    ctx.db.prepare("UPDATE maintenance_request SET due_date = '2026-11-20' WHERE id = ?").run(req1Id);

    const summaryRescheduled = ctx.evaluator.evaluateMaintenanceDue({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summaryRescheduled.resolvedCount).toBe(1);

    const alertRescheduled = ctx.db.prepare('SELECT status, evidence_json FROM alert WHERE id = ?').get(alert.id) as { status: string; evidence_json: string };
    expect(alertRescheduled.status).toBe('resolved');
    const evRescheduled = JSON.parse(alertRescheduled.evidence_json);
    expect(evRescheduled.resolutionFact.reason).toBe('maintenance_rescheduled');
    expect(evRescheduled.resolutionFact.evidenceIds).toEqual([req1Id]);

    // 3. Novo ciclo: reabre alerta trazendo a data para dentro dos 7 dias ('2026-11-02')
    ctx.db.prepare("UPDATE maintenance_request SET due_date = '2026-11-02' WHERE id = ?").run(req1Id);
    const summaryReopen = ctx.evaluator.evaluateMaintenanceDue({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summaryReopen.openedCount).toBe(1);

    const alertCycle2 = ctx.db.prepare('SELECT id, cycle, status FROM alert WHERE resource_id = ? AND rule_code = ? AND cycle = 2').get(ctx.cameraCritical3, 'maintenance_due') as { id: string; cycle: number; status: string };
    expect(alertCycle2.status).toBe('open');

    // 4. Conclui a solicitação de manutenção com evento operacional comprovatório
    const closeEventId = randomUUID();
    const closeIso = new Date(ctx.timeProvider.now()).toISOString();
    ctx.db.prepare(`
      INSERT INTO operational_event (
        dataset_id, epoch, id, resource_id, action, actor_id, command_id,
        resource_version, revision, ordinal, effective_at, recorded_at, received_at, changes_json
      ) VALUES (?, 1, ?, ?, 'inventory.equipment.update.v1', ?, ?, 2, 2, 1, ?, ?, ?, ?)
    `).run(
      ctx.datasetId, closeEventId, ctx.cameraCritical3, ctx.actorId, randomUUID(),
      closeIso, closeIso, closeIso, JSON.stringify({ closedMaintenanceRequestId: req1Id }),
    );
    ctx.db.prepare('DELETE FROM maintenance_request WHERE id = ?').run(req1Id);
    const summaryClosed = ctx.evaluator.evaluateMaintenanceDue({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summaryClosed.resolvedCount).toBe(1);

    const alertClosed = ctx.db.prepare('SELECT status, evidence_json FROM alert WHERE id = ?').get(alertCycle2.id) as { status: string; evidence_json: string };
    expect(alertClosed.status).toBe('resolved');
    const evClosed = JSON.parse(alertClosed.evidence_json);
    expect(evClosed.resolutionFact.reason).toBe('maintenance_request_closed');
    expect(evClosed.resolutionFact.evidenceIds).toContain(req1Id);
    expect(evClosed.resolutionFact.evidenceIds).toContain(closeEventId);
  });

  it('TC-34 (P1-3): equipment_fault com múltiplas causas inclui lista real de resoluções causais em resolutionFact', () => {
    const ctx = setupEvaluatorFixture();
    const t0 = ctx.timeProvider.now();
    const resId1 = randomUUID();
    const resId2 = randomUUID();

    // 1. Abre duas causas distintas para o mesmo equipamento
    ctx.db.prepare(`
      INSERT INTO telemetry_episode (dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms)
      VALUES
        (?, 1, ?, ?, 'sensor_overheat', ?, ?, ?),
        (?, 1, ?, ?, 'voltage_drop', ?, ?, ?)
    `).run(ctx.datasetId, ctx.cameraCritical5, randomUUID(), ctx.sourceId, t0 - 10000, t0 - 10000,
           ctx.datasetId, ctx.cameraCritical5, randomUUID(), ctx.sourceId, t0 - 8000, t0 - 8000);

    ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });
    const alert = ctx.db.prepare('SELECT id, status FROM alert WHERE resource_id = ? AND rule_code = ?').get(ctx.cameraCritical5, 'equipment_fault') as { id: string; status: string };
    expect(alert.status).toBe('open');

    // 2. Resolve apenas a primeira causa: alerta continua OPEN
    ctx.db.prepare(`
      INSERT INTO telemetry_cause_resolution (dataset_id, epoch, id, resource_id, cause_code, completed_at_ms, recorded_at_ms, actor_id, evidence_json)
      VALUES (?, 1, ?, ?, 'sensor_overheat', ?, ?, ?, '{}')
    `).run(ctx.datasetId, resId1, ctx.cameraCritical5, t0 - 5000, t0 - 5000, ctx.actorId);

    const summaryPartial = ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summaryPartial.resolvedCount).toBe(0);
    expect(summaryPartial.updatedCount).toBe(1); // Atualizou evidência com causas remanescentes

    // 3. Resolve a segunda causa: agora SIM encerra o alerta
    ctx.db.prepare(`
      INSERT INTO telemetry_cause_resolution (dataset_id, epoch, id, resource_id, cause_code, completed_at_ms, recorded_at_ms, actor_id, evidence_json)
      VALUES (?, 1, ?, ?, 'voltage_drop', ?, ?, ?, '{}')
    `).run(ctx.datasetId, resId2, ctx.cameraCritical5, t0 - 2000, t0 - 2000, ctx.actorId);

    const summaryFinal = ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summaryFinal.resolvedCount).toBe(1);

    const alertResolved = ctx.db.prepare('SELECT status, evidence_json FROM alert WHERE id = ?').get(alert.id) as { status: string; evidence_json: string };
    expect(alertResolved.status).toBe('resolved');

    const ev = JSON.parse(alertResolved.evidence_json);
    expect(ev.resolutionFact.reason).toBe('telemetry_cause_resolved');
    expect(ev.resolutionFact.resolutions).toHaveLength(2);
    expect(ev.resolutionFact.evidenceIds).toContain(resId1);
    expect(ev.resolutionFact.evidenceIds).toContain(resId2);
    expect(ev.resolutionFact.resolutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resolutionId: resId1, causeCode: 'sensor_overheat' }),
        expect.objectContaining({ resolutionId: resId2, causeCode: 'voltage_drop' }),
      ]),
    );
  });

  it('TC-35 (P1-2): exclusão/ausência de solicitação sem evento comprobatório preserva o alerta aberto', () => {
    const ctx = setupEvaluatorFixture();
    const reqId = randomUUID();

    // 1. Abre alerta por solicitação vencida
    ctx.db.prepare(`
      INSERT INTO maintenance_request (dataset_id, epoch, id, equipment_id, cause_code, status, version, reason, priority, schedule_status, due_date, not_applicable_reason)
      VALUES (?, 1, ?, ?, 'initial_camera_inspection', 'open', 1, 'Vencida', 'normal', 'dated', '2026-10-25', NULL)
    `).run(ctx.datasetId, reqId, ctx.cameraCritical3);

    ctx.evaluator.evaluateMaintenanceDue({ datasetId: ctx.datasetId, epoch: 1 });
    const alertBefore = ctx.db.prepare('SELECT id, status FROM alert WHERE resource_id = ? AND rule_code = ?').get(ctx.cameraCritical3, 'maintenance_due') as { id: string; status: string };
    expect(alertBefore.status).toBe('open');

    // 2. Exclui diretamente da tabela maintenance_request SEM gravar nenhum operational_event de fechamento
    ctx.db.prepare('DELETE FROM maintenance_request WHERE id = ?').run(reqId);

    // 3. Avalia: ausência indeterminada sem prova persistida -> alerta é PRESERVADO (não fecha)
    const summary = ctx.evaluator.evaluateMaintenanceDue({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summary.resolvedCount).toBe(0);
    expect(summary.unchangedCount).toBe(2);

    const alertAfter = ctx.db.prepare('SELECT status, resolved_at_ms FROM alert WHERE id = ?').get(alertBefore.id) as { status: string; resolved_at_ms: number | null };
    expect(alertAfter.status).toBe('open');
    expect(alertAfter.resolved_at_ms).toBeNull();
  });

  it('TC-36 (P1-2): múltiplas solicitações — fechamento parcial com ausência indeterminada preserva alerta; desfecho comprovado em todas resolve', () => {
    const ctx = setupEvaluatorFixture();
    const t0 = ctx.timeProvider.now();
    const req1Id = randomUUID();
    const req2Id = randomUUID();
    const alertId = randomUUID();

    // 1. Alerta aberto previamente com múltiplas solicitações em evidenceIds
    const evidenceObj = {
      activeRequests: [
        { requestId: req1Id, causeCode: 'initial_camera_inspection', dueDate: '2026-10-25', priority: 'normal', diffDays: -6, severity: 'high' },
        { requestId: req2Id, causeCode: 'initial_camera_inspection', dueDate: '2026-10-26', priority: 'high', diffDays: -5, severity: 'high' },
      ],
      effectiveSeverity: 'high',
      currentCivilDate: '2026-10-31',
      evidenceIds: [req1Id, req2Id],
    };

    ctx.db.prepare(`
      INSERT INTO alert (
        dataset_id, epoch, id, resource_id, rule_code, rule_version, cycle, severity, status, cause_code, evidence_json, opened_at_ms
      ) VALUES (?, 1, ?, ?, 'maintenance_due', 1, 1, 'high', 'open', 'initial_camera_inspection', ?, ?)
    `).run(ctx.datasetId, alertId, ctx.cameraCritical5, JSON.stringify(evidenceObj), t0 - 5000);

    ctx.db.prepare(`
      INSERT INTO alert_event (
        dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version, cycle, severity, previous_status, status, evidence_json, occurred_at_ms, recorded_at_ms
      ) VALUES (?, 1, ?, ?, ?, 'maintenance_due', 1, 1, 'high', NULL, 'open', ?, ?, ?)
    `).run(ctx.datasetId, randomUUID(), alertId, ctx.cameraCritical5, JSON.stringify(evidenceObj), t0 - 5000, t0 - 5000);

    // 2. Ordem 1 tem fechamento comprovado por operational_event
    const closeEventId = randomUUID();
    const closeIso = new Date(t0).toISOString();
    ctx.db.prepare(`
      INSERT INTO operational_event (
        dataset_id, epoch, id, resource_id, action, actor_id, command_id,
        resource_version, revision, ordinal, effective_at, recorded_at, received_at, changes_json
      ) VALUES (?, 1, ?, ?, 'inventory.equipment.update.v1', ?, ?, 2, 2, 1, ?, ?, ?, ?)
    `).run(
      ctx.datasetId, closeEventId, ctx.cameraCritical5, ctx.actorId, randomUUID(),
      closeIso, closeIso, closeIso, JSON.stringify({ closedMaintenanceRequestId: req1Id }),
    );

    // Ordem 2 NÃO possui registro em maintenance_request nem evento comprobatório (ausência indeterminada)

    // Avalia: Ordem 2 é ausência indeterminada -> política conservadora PRESERVA o alerta aberto
    const summaryIndeterminate = ctx.evaluator.evaluateMaintenanceDue({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summaryIndeterminate.resolvedCount).toBe(0);
    expect(summaryIndeterminate.unchangedCount).toBe(2);

    const alertStillOpen = ctx.db.prepare('SELECT status FROM alert WHERE id = ?').get(alertId) as { status: string };
    expect(alertStillOpen.status).toBe('open');

    // 3. Agora adiciona evento comprovatório também para a Ordem 2
    const closeEvent2Id = randomUUID();
    ctx.db.prepare(`
      INSERT INTO operational_event (
        dataset_id, epoch, id, resource_id, action, actor_id, command_id,
        resource_version, revision, ordinal, effective_at, recorded_at, received_at, changes_json
      ) VALUES (?, 1, ?, ?, 'inventory.equipment.update.v1', ?, ?, 3, 3, 1, ?, ?, ?, ?)
    `).run(
      ctx.datasetId, closeEvent2Id, ctx.cameraCritical5, ctx.actorId, randomUUID(),
      closeIso, closeIso, closeIso, JSON.stringify({ closedMaintenanceRequestId: req2Id }),
    );

    // Reavalia: agora todas as solicitações têm desfecho comprovado -> alerta RESOLVE!
    const summaryResolved = ctx.evaluator.evaluateMaintenanceDue({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summaryResolved.resolvedCount).toBe(1);

    const alertResolved = ctx.db.prepare('SELECT status, evidence_json FROM alert WHERE id = ?').get(alertId) as { status: string; evidence_json: string };
    expect(alertResolved.status).toBe('resolved');
    const ev = JSON.parse(alertResolved.evidence_json);
    expect(ev.resolutionFact.reason).toBe('maintenance_request_closed');
    expect(ev.resolutionFact.evidenceIds).toContain(closeEventId);
    expect(ev.resolutionFact.evidenceIds).toContain(closeEvent2Id);
  });

  it('TC-37 (P2): recorrência de falha exclui resoluções do ciclo anterior em resolutionFact', () => {
    const ctx = setupEvaluatorFixture();
    const t0 = ctx.timeProvider.now();
    const resIdCycle1 = randomUUID();
    const resIdCycle2 = randomUUID();

    // 1. Ciclo 1: Falha em t0 - 20000ms, resolvida em t0 - 15000ms
    ctx.db.prepare(`
      INSERT INTO telemetry_episode (dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms)
      VALUES (?, 1, ?, ?, 'recurring_cause', ?, ?, ?)
    `).run(ctx.datasetId, ctx.cameraCritical3, randomUUID(), ctx.sourceId, t0 - 20000, t0 - 20000);

    ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });

    ctx.db.prepare(`
      INSERT INTO telemetry_cause_resolution (dataset_id, epoch, id, resource_id, cause_code, completed_at_ms, recorded_at_ms, actor_id, evidence_json)
      VALUES (?, 1, ?, ?, 'recurring_cause', ?, ?, ?, '{}')
    `).run(ctx.datasetId, resIdCycle1, ctx.cameraCritical3, t0 - 15000, t0 - 15000, ctx.actorId);

    const summaryCycle1 = ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summaryCycle1.resolvedCount).toBe(1);

    // 2. Ciclo 2: Nova falha em t0 + 10000ms (posterior a t0 - 15000ms)
    ctx.timeProvider.advanceBy(10000);
    const t1 = ctx.timeProvider.now();

    ctx.db.prepare(`
      INSERT INTO telemetry_episode (dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms)
      VALUES (?, 1, ?, ?, 'recurring_cause', ?, ?, ?)
    `).run(ctx.datasetId, ctx.cameraCritical3, randomUUID(), ctx.sourceId, t1 - 5000, t1 - 5000);

    const summaryCycle2Open = ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summaryCycle2Open.openedCount).toBe(1);

    const alertCycle2 = ctx.db.prepare('SELECT id, cycle, status FROM alert WHERE resource_id = ? AND cycle = 2').get(ctx.cameraCritical3) as { id: string; cycle: number; status: string };
    expect(alertCycle2.status).toBe('open');

    // 3. Resolve falha do ciclo 2 em t1 - 1000ms
    ctx.db.prepare(`
      INSERT INTO telemetry_cause_resolution (dataset_id, epoch, id, resource_id, cause_code, completed_at_ms, recorded_at_ms, actor_id, evidence_json)
      VALUES (?, 1, ?, ?, 'recurring_cause', ?, ?, ?, '{}')
    `).run(ctx.datasetId, resIdCycle2, ctx.cameraCritical3, t1 - 1000, t1 - 1000, ctx.actorId);

    const summaryCycle2Resolve = ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summaryCycle2Resolve.resolvedCount).toBe(1);

    const alertCycle2Resolved = ctx.db.prepare('SELECT status, evidence_json FROM alert WHERE id = ?').get(alertCycle2.id) as { status: string; evidence_json: string };
    expect(alertCycle2Resolved.status).toBe('resolved');

    // P2: resolutionFact do ciclo 2 contém EXCLUSIVAMENTE a resolução do ciclo 2
    const evCycle2 = JSON.parse(alertCycle2Resolved.evidence_json);
    expect(evCycle2.resolutionFact.resolutions).toHaveLength(1);
    expect(evCycle2.resolutionFact.resolutions[0].resolutionId).toBe(resIdCycle2);
    expect(evCycle2.resolutionFact.evidenceIds).toEqual([resIdCycle2]);
    expect(evCycle2.resolutionFact.evidenceIds).not.toContain(resIdCycle1);
  });

  it('TC-38: correlação causal por causa e corte individual — resolução antiga de B após início de A é excluída', () => {
    const ctx = setupEvaluatorFixture();
    const t0 = ctx.timeProvider.now();

    const epA_id = randomUUID();
    const epB_old_id = randomUUID();
    const epB_new_id = randomUUID();

    const resB_old_id = randomUUID();
    const resA_cur_id = randomUUID();
    const resB_cur_id = randomUUID();
    const resOtherDs_id = randomUUID();

    // 1. Episódio antigo de B inicia em t0 + 50
    ctx.db.prepare(`
      INSERT INTO telemetry_episode (dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms)
      VALUES (?, 1, ?, ?, 'cause_b', ?, ?, ?)
    `).run(ctx.datasetId, ctx.cameraCritical5, epB_old_id, ctx.sourceId, t0 + 50, t0 + 50);

    // 2. Episódio A inicia antes da nova ocorrência de B: t0 + 100
    ctx.db.prepare(`
      INSERT INTO telemetry_episode (dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms)
      VALUES (?, 1, ?, ?, 'cause_a', ?, ?, ?)
    `).run(ctx.datasetId, ctx.cameraCritical5, epA_id, ctx.sourceId, t0 + 100, t0 + 100);

    // 3. Resolução antiga de B ocorre depois do início de A: t0 + 150 (150 > 100)
    ctx.db.prepare(`
      INSERT INTO telemetry_cause_resolution (dataset_id, epoch, id, resource_id, cause_code, completed_at_ms, recorded_at_ms, actor_id, evidence_json)
      VALUES (?, 1, ?, ?, 'cause_b', ?, ?, ?, '{}')
    `).run(ctx.datasetId, resB_old_id, ctx.cameraCritical5, t0 + 150, t0 + 150, ctx.actorId);

    // 4. Novo episódio de B inicia após a resolução antiga: t0 + 200 (200 > 150)
    ctx.db.prepare(`
      INSERT INTO telemetry_episode (dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms)
      VALUES (?, 1, ?, ?, 'cause_b', ?, ?, ?)
    `).run(ctx.datasetId, ctx.cameraCritical5, epB_new_id, ctx.sourceId, t0 + 200, t0 + 200);

    // 5. Inserção em outro dataset para validar estrito isolamento dataset/epoch
    const otherDatasetId = randomUUID();
    const otherOrgId = randomUUID();
    transaction(ctx.db, () => {
      ctx.db.prepare("INSERT INTO dataset(id, code, kind, active_epoch) VALUES (?, ?, 'demo', 1)").run(otherDatasetId, `ds-${otherDatasetId}`);
      ctx.db.prepare("INSERT INTO dataset_epoch(dataset_id, epoch, status, revision) VALUES (?, 1, 'ready', 0)").run(otherDatasetId);
      ctx.db.prepare("INSERT INTO organization(dataset_id, epoch, id, code, name) VALUES (?, 1, ?, 'ORG_OTHER', 'Other Org')").run(otherDatasetId, otherOrgId);
      ctx.db.prepare(
        "INSERT INTO resource(dataset_id, epoch, id, kind, organization_id, public_label, version) VALUES (?, 1, ?, 'equipment', ?, 'CAM_OTHER', 1)"
      ).run(otherDatasetId, ctx.cameraCritical5, otherOrgId);
      ctx.db.prepare(
        "INSERT INTO equipment(dataset_id, epoch, id, category_code, category_version, serial_normalized, brand, model, criticality, mobility, attributes_json) VALUES (?, 1, ?, 'camera', 1, 'SER_OTHER', 'Brand', 'Model', 5, 'fixed', '{\"cameraType\":\"fixed_view\"}')"
      ).run(otherDatasetId, ctx.cameraCritical5);
      ctx.db.prepare(
        `INSERT INTO resource_location(dataset_id, epoch, resource_id, role, reference_type, postal_code, neighborhood, city, uf, address, reference, latitude, longitude, region_id)
         VALUES (?, 1, ?, 'registration', 'installation', '01001000', 'Centro', 'SP', 'SP', 'Av 1', 'Ref', -23.55, -46.63, NULL)`
      ).run(otherDatasetId, ctx.cameraCritical5);
      ctx.db.prepare("INSERT INTO current_state(dataset_id, epoch, resource_id, operational_state, version) VALUES (?, 1, ?, 'not_installed', 1)")
        .run(otherDatasetId, ctx.cameraCritical5);
      ctx.db.prepare(`
        INSERT INTO telemetry_cause_resolution (dataset_id, epoch, id, resource_id, cause_code, completed_at_ms, recorded_at_ms, actor_id, evidence_json)
        VALUES (?, 1, ?, ?, 'cause_a', ?, ?, ?, '{}')
      `).run(otherDatasetId, resOtherDs_id, ctx.cameraCritical5, t0 + 350, t0 + 350, ctx.actorId);
    });

    // 6. Avaliação abre alerta ativo com ambas as causas (A e B)
    ctx.timeProvider.advanceBy(250);
    const summaryOpen = ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summaryOpen.openedCount).toBe(1);

    const alertOpen = ctx.db.prepare('SELECT id, status, evidence_json FROM alert WHERE resource_id = ? AND rule_code = ?').get(ctx.cameraCritical5, 'equipment_fault') as { id: string; status: string; evidence_json: string };
    expect(alertOpen.status).toBe('open');
    const evOpen = JSON.parse(alertOpen.evidence_json);
    expect(evOpen.activeCauses).toEqual(['cause_a', 'cause_b']);

    // 7. Resoluções dos episódios atuais:
    // Cause A resolvida em t0 + 300 (300 >= 100)
    ctx.db.prepare(`
      INSERT INTO telemetry_cause_resolution (dataset_id, epoch, id, resource_id, cause_code, completed_at_ms, recorded_at_ms, actor_id, evidence_json)
      VALUES (?, 1, ?, ?, 'cause_a', ?, ?, ?, '{}')
    `).run(ctx.datasetId, resA_cur_id, ctx.cameraCritical5, t0 + 300, t0 + 300, ctx.actorId);

    // Cause B resolvida em t0 + 400 (400 >= 200)
    ctx.db.prepare(`
      INSERT INTO telemetry_cause_resolution (dataset_id, epoch, id, resource_id, cause_code, completed_at_ms, recorded_at_ms, actor_id, evidence_json)
      VALUES (?, 1, ?, ?, 'cause_b', ?, ?, ?, '{}')
    `).run(ctx.datasetId, resB_cur_id, ctx.cameraCritical5, t0 + 400, t0 + 400, ctx.actorId);

    // 8. Reavalia em t0 + 450: ambos os episódios atuais resolvidos -> alerta transiciona para 'resolved'
    ctx.timeProvider.advanceBy(200);
    const summaryResolve = ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });
    expect(summaryResolve.resolvedCount).toBe(1);

    const alertResolved = ctx.db.prepare('SELECT status, evidence_json FROM alert WHERE id = ?').get(alertOpen.id) as { status: string; evidence_json: string };
    expect(alertResolved.status).toBe('resolved');

    const evResolved = JSON.parse(alertResolved.evidence_json);
    expect(evResolved.resolutionFact.reason).toBe('telemetry_cause_resolved');
    expect(evResolved.resolutionFact.resolutions).toHaveLength(2);

    // Confirmar que evidenceIds contém EXCLUSIVAMENTE as resoluções pertinentes às ocorrências atuais
    expect(evResolved.resolutionFact.evidenceIds).toContain(resA_cur_id);
    expect(evResolved.resolutionFact.evidenceIds).toContain(resB_cur_id);

    // Confirmar que a resolução antiga de B (em t0 + 150 < t0 + 200) foi estritamente excluída
    expect(evResolved.resolutionFact.evidenceIds).not.toContain(resB_old_id);

    // Confirmar isolamento contextual: resolução do outro dataset nunca vaza
    expect(evResolved.resolutionFact.evidenceIds).not.toContain(resOtherDs_id);

    // Confirmar objetos de resolução individuais
    expect(evResolved.resolutionFact.resolutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resolutionId: resA_cur_id, causeCode: 'cause_a', completedAtMs: t0 + 300 }),
        expect.objectContaining({ resolutionId: resB_cur_id, causeCode: 'cause_b', completedAtMs: t0 + 400 }),
      ]),
    );
  });

  it('TC-39: preservação de episódios intermediários no mesmo ciclo — B resolvida enquanto A ativa é mantida no ciclo e correlacionada na resolução final', () => {
    const ctx = setupEvaluatorFixture();
    const t0 = ctx.timeProvider.now();

    const epA_id = randomUUID();
    const epB_id = randomUUID();
    const epC_cycle2_id = randomUUID();

    const resB_old_id = randomUUID();
    const resB_cur_id = randomUUID();
    const resA_cur_id = randomUUID();
    const resOtherDs_id = randomUUID();

    // 0. Resolução antiga de B de um momento pretérito / ciclo anterior (t0 - 20000ms)
    ctx.db.prepare(`
      INSERT INTO telemetry_cause_resolution (dataset_id, epoch, id, resource_id, cause_code, completed_at_ms, recorded_at_ms, actor_id, evidence_json)
      VALUES (?, 1, ?, ?, 'cause_b', ?, ?, ?, '{}')
    `).run(ctx.datasetId, resB_old_id, ctx.cameraCritical5, t0 - 20000, t0 - 20000, ctx.actorId);

    // 1. Causa A inicia e abre alerta (t0 - 10000ms)
    ctx.db.prepare(`
      INSERT INTO telemetry_episode (dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms)
      VALUES (?, 1, ?, ?, 'cause_a', ?, ?, ?)
    `).run(ctx.datasetId, ctx.cameraCritical5, epA_id, ctx.sourceId, t0 - 10000, t0 - 10000);

    const s1 = ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });
    expect(s1.openedCount).toBe(1);

    const alertCycle1 = ctx.db.prepare('SELECT id, cycle, status, evidence_json FROM alert WHERE resource_id = ? AND rule_code = ?').get(ctx.cameraCritical5, 'equipment_fault') as {
      id: string;
      cycle: number;
      status: string;
      evidence_json: string;
    };
    expect(alertCycle1.status).toBe('open');
    expect(alertCycle1.cycle).toBe(1);
    const ev1 = JSON.parse(alertCycle1.evidence_json);
    expect(ev1.activeCauses).toEqual(['cause_a']);
    expect(ev1.cycleEpisodes).toEqual([
      expect.objectContaining({ episodeId: epA_id, causeCode: 'cause_a', episodeStartedAtMs: t0 - 10000 }),
    ]);

    // 2. Causa B inicia e é observada em uma avaliação intermediária (t0 - 8000ms)
    ctx.db.prepare(`
      INSERT INTO telemetry_episode (dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms)
      VALUES (?, 1, ?, ?, 'cause_b', ?, ?, ?)
    `).run(ctx.datasetId, ctx.cameraCritical5, epB_id, ctx.sourceId, t0 - 8000, t0 - 8000);

    const s2 = ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });
    expect(s2.updatedCount).toBe(1);
    expect(s2.resolvedCount).toBe(0);

    const alertStep2 = ctx.db.prepare('SELECT id, status, evidence_json FROM alert WHERE id = ?').get(alertCycle1.id) as { id: string; status: string; evidence_json: string };
    expect(alertStep2.status).toBe('open');
    const ev2 = JSON.parse(alertStep2.evidence_json);
    expect(ev2.activeCauses).toEqual(['cause_a', 'cause_b']);
    expect(ev2.cycleEpisodes).toHaveLength(2);
    expect(ev2.cycleEpisodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ episodeId: epA_id, causeCode: 'cause_a' }),
        expect.objectContaining({ episodeId: epB_id, causeCode: 'cause_b' }),
      ]),
    );

    // 3. Causa B é resolvida enquanto A continua ativa (t0 - 6000ms)
    ctx.db.prepare(`
      INSERT INTO telemetry_cause_resolution (dataset_id, epoch, id, resource_id, cause_code, completed_at_ms, recorded_at_ms, actor_id, evidence_json)
      VALUES (?, 1, ?, ?, 'cause_b', ?, ?, ?, '{}')
    `).run(ctx.datasetId, resB_cur_id, ctx.cameraCritical5, t0 - 6000, t0 - 6000, ctx.actorId);

    const s3 = ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });
    expect(s3.resolvedCount).toBe(0);
    expect(s3.updatedCount).toBe(1); // activeCauses atualizado de volta para ['cause_a']

    const alertStep3 = ctx.db.prepare('SELECT id, status, evidence_json FROM alert WHERE id = ?').get(alertCycle1.id) as { id: string; status: string; evidence_json: string };
    expect(alertStep3.status).toBe('open');
    const ev3 = JSON.parse(alertStep3.evidence_json);
    expect(ev3.activeCauses).toEqual(['cause_a']); // B não está mais ativa!
    // Confirmar que B PERMANECE registrada no histórico do ciclo:
    expect(ev3.cycleEpisodes).toHaveLength(2);
    expect(ev3.cycleEpisodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ episodeId: epA_id, causeCode: 'cause_a' }),
        expect.objectContaining({ episodeId: epB_id, causeCode: 'cause_b' }),
      ]),
    );

    // Inserção em outro dataset/epoch para validar isolamento de contexto (t0 - 5000ms)
    const otherDatasetId = randomUUID();
    const otherOrgId = randomUUID();
    transaction(ctx.db, () => {
      ctx.db.prepare("INSERT INTO dataset(id, code, kind, active_epoch) VALUES (?, ?, 'demo', 1)").run(otherDatasetId, `ds-${otherDatasetId}`);
      ctx.db.prepare("INSERT INTO dataset_epoch(dataset_id, epoch, status, revision) VALUES (?, 1, 'ready', 0)").run(otherDatasetId);
      ctx.db.prepare("INSERT INTO organization(dataset_id, epoch, id, code, name) VALUES (?, 1, ?, 'ORG_OTHER', 'Other Org')").run(otherDatasetId, otherOrgId);
      ctx.db.prepare(
        "INSERT INTO resource(dataset_id, epoch, id, kind, organization_id, public_label, version) VALUES (?, 1, ?, 'equipment', ?, 'CAM_OTHER', 1)"
      ).run(otherDatasetId, ctx.cameraCritical5, otherOrgId);
      ctx.db.prepare(
        "INSERT INTO equipment(dataset_id, epoch, id, category_code, category_version, serial_normalized, brand, model, criticality, mobility, attributes_json) VALUES (?, 1, ?, 'camera', 1, 'SER_OTHER', 'Brand', 'Model', 5, 'fixed', '{\"cameraType\":\"fixed_view\"}')"
      ).run(otherDatasetId, ctx.cameraCritical5);
      ctx.db.prepare(
        `INSERT INTO resource_location(dataset_id, epoch, resource_id, role, reference_type, postal_code, neighborhood, city, uf, address, reference, latitude, longitude, region_id)
         VALUES (?, 1, ?, 'registration', 'installation', '01001000', 'Centro', 'SP', 'SP', 'Av 1', 'Ref', -23.55, -46.63, NULL)`
      ).run(otherDatasetId, ctx.cameraCritical5);
      ctx.db.prepare("INSERT INTO current_state(dataset_id, epoch, resource_id, operational_state, version) VALUES (?, 1, ?, 'not_installed', 1)")
        .run(otherDatasetId, ctx.cameraCritical5);
      ctx.db.prepare(`
        INSERT INTO telemetry_cause_resolution (dataset_id, epoch, id, resource_id, cause_code, completed_at_ms, recorded_at_ms, actor_id, evidence_json)
        VALUES (?, 1, ?, ?, 'cause_a', ?, ?, ?, '{}')
      `).run(otherDatasetId, resOtherDs_id, ctx.cameraCritical5, t0 - 5000, t0 - 5000, ctx.actorId);
    });

    // 4. Causa A é resolvida (t0 - 4000ms)
    ctx.db.prepare(`
      INSERT INTO telemetry_cause_resolution (dataset_id, epoch, id, resource_id, cause_code, completed_at_ms, recorded_at_ms, actor_id, evidence_json)
      VALUES (?, 1, ?, ?, 'cause_a', ?, ?, ?, '{}')
    `).run(ctx.datasetId, resA_cur_id, ctx.cameraCritical5, t0 - 4000, t0 - 4000, ctx.actorId);

    const s4 = ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });
    expect(s4.resolvedCount).toBe(1);

    const alertResolved = ctx.db.prepare('SELECT id, status, evidence_json FROM alert WHERE id = ?').get(alertCycle1.id) as { id: string; status: string; evidence_json: string };
    expect(alertResolved.status).toBe('resolved');
    const evResolved = JSON.parse(alertResolved.evidence_json);

    // Confirmar que resolutionFact contém resoluções de A e B:
    expect(evResolved.resolutionFact.reason).toBe('telemetry_cause_resolved');
    expect(evResolved.resolutionFact.resolutions).toHaveLength(2);
    expect(evResolved.resolutionFact.evidenceIds).toContain(resA_cur_id);
    expect(evResolved.resolutionFact.evidenceIds).toContain(resB_cur_id);

    // Confirmar que não inclui resoluções de ciclos anteriores:
    expect(evResolved.resolutionFact.evidenceIds).not.toContain(resB_old_id);

    // Confirmar que não inclui registros de outro dataset/epoch:
    expect(evResolved.resolutionFact.evidenceIds).not.toContain(resOtherDs_id);

    // 5. Confirmar que um novo ciclo começa sem herdar episódios anteriores
    ctx.timeProvider.advanceBy(20000);
    const t1 = ctx.timeProvider.now();

    ctx.db.prepare(`
      INSERT INTO telemetry_episode (dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms)
      VALUES (?, 1, ?, ?, 'cause_c', ?, ?, ?)
    `).run(ctx.datasetId, ctx.cameraCritical5, epC_cycle2_id, ctx.sourceId, t1 - 1000, t1 - 1000);

    const s5 = ctx.evaluator.evaluateEquipmentFaults({ datasetId: ctx.datasetId, epoch: 1 });
    expect(s5.openedCount).toBe(1);

    const alertCycle2 = ctx.db.prepare('SELECT id, cycle, status, evidence_json FROM alert WHERE resource_id = ? AND cycle = 2').get(ctx.cameraCritical5) as {
      id: string;
      cycle: number;
      status: string;
      evidence_json: string;
    };
    expect(alertCycle2.status).toBe('open');
    expect(alertCycle2.cycle).toBe(2);
    const evCycle2 = JSON.parse(alertCycle2.evidence_json);
    expect(evCycle2.activeCauses).toEqual(['cause_c']);
    expect(evCycle2.cycleEpisodes).toHaveLength(1);
    expect(evCycle2.cycleEpisodes[0].episodeId).toBe(epC_cycle2_id);
    expect(evCycle2.cycleEpisodes[0].causeCode).toBe('cause_c');

    // Estrita comprovação de que o novo ciclo não herdou episódios de A ou B do ciclo anterior
    const cycle2EpisodeIds = evCycle2.cycleEpisodes.map((e: { episodeId: string }) => e.episodeId);
    expect(cycle2EpisodeIds).not.toContain(epA_id);
    expect(cycle2EpisodeIds).not.toContain(epB_id);
  });
});
