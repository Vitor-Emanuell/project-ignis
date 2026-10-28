/**
 * PROJECT IGNIS — T0010 / PKG-03
 * Testes normativos e de segurança transacional dos endpoints HTTP de alertas:
 * - GET /api/v1/datasets/:datasetId/epochs/:epoch/alerts
 * - GET /api/v1/datasets/:datasetId/epochs/:epoch/alerts/:alertId
 * - POST /api/v1/datasets/:datasetId/epochs/:epoch/alerts/:alertId/acknowledge
 */

import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { inventoryFixture, base } from './support/inventory-fixture.js';
import { OPERATIONAL_ID, ORGANIZATION_ID } from '../src/inventory/contract.js';
import { ORIGIN, SECRET } from './support/foundation-fixture.js';
import { Store, transaction } from '../src/persistence/store.js';
import { prepareOperational } from '../src/inventory/prepare.js';
import { buildApp } from '../src/app.js';
import { SettableTimeProvider } from '../src/domain/telemetry/time-provider.js';
import {
  TrustedClockService,
  ClockUntrustedError,
} from '../src/domain/telemetry/trusted-clock.js';

const fixtures: Array<{ cleanup(): Promise<void> }> = [];
afterEach(async () => {
  for (const f of fixtures.splice(0)) await f.cleanup();
});

async function setup() {
  const f = await inventoryFixture(true);
  fixtures.push(f);
  return f;
}

async function setupWithClock(timeProvider: SettableTimeProvider) {
  const directory = mkdtempSync(join(tmpdir(), 'ignis-t0010-clock-'));
  const path = join(directory, 'test.sqlite');
  const store = new Store(path, true);
  store.migrate();
  prepareOperational(store);
  const clockService = new TrustedClockService(timeProvider);
  const app = await buildApp({
    foundation: { store, host: '127.0.0.1', dev: true, operatorSecret: SECRET },
    alerts: { clockService },
  });
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/session',
    headers: { origin: ORIGIN },
    payload: { secret: SECRET },
  });
  if (response.statusCode !== 200) throw new Error(response.body);
  const cookie = String(response.headers['set-cookie']).split(';')[0]!;
  const csrf = response.json<{ csrfToken: string }>().csrfToken;
  const f = {
    directory,
    path,
    store,
    app,
    clockService,
    timeProvider,
    cookie,
    csrf,
    headers: { cookie, origin: ORIGIN, 'x-csrf-token': csrf },
    call(method: 'GET' | 'POST' | 'PATCH', route: string, payload?: object) {
      return f.app.inject({
        method,
        url: `${base}${route}`,
        headers: f.headers,
        ...(payload ? { payload } : {}),
      });
    },
    revision() {
      return (
        f.store.db
          .prepare('SELECT revision FROM dataset_epoch WHERE dataset_id = ? AND epoch = 1')
          .get(OPERATIONAL_ID) as { revision: number }
      ).revision;
    },
    async cleanup() {
      await f.app.close();
      f.store.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
  fixtures.push(f);
  return f;
}

function insertEquipment(
  db: Database.Database,
  datasetId: string,
  epoch: number,
  equipmentId: string,
  orgId: string = ORGANIZATION_ID,
) {
  transaction(db, () => {
    db.prepare(`
      INSERT INTO resource(dataset_id, epoch, id, kind, organization_id, public_label, version)
      VALUES (?, ?, ?, 'equipment', ?, 'CAM_TEST', 1)
    `).run(datasetId, epoch, equipmentId, orgId);

    db.prepare(`
      INSERT INTO equipment(dataset_id, epoch, id, category_code, category_version, serial_normalized, brand, model, criticality, mobility, attributes_json)
      VALUES (?, ?, ?, 'fixed_speed_radar', 1, ?, 'Brand', 'Model', 5, 'fixed', '{"regulatedSpeedLimitKmh":60}')
    `).run(datasetId, epoch, equipmentId, `SER-${equipmentId}`);

    db.prepare(`
      INSERT INTO resource_location(dataset_id, epoch, resource_id, role, reference_type, postal_code, neighborhood, city, uf, address, reference, latitude, longitude, region_id)
      VALUES (?, ?, ?, 'registration', 'installation', '01001000', 'Centro', 'SP', 'SP', 'Av 1', 'Ref', -23.55, -46.63, NULL)
    `).run(datasetId, epoch, equipmentId);

    db.prepare(`
      INSERT INTO current_state(dataset_id, epoch, resource_id, operational_state, version)
      VALUES (?, ?, ?, 'not_installed', 1)
    `).run(datasetId, epoch, equipmentId);
  });
}

function insertAlert(
  db: Database.Database,
  datasetId: string,
  epoch: number,
  alert: {
    id: string;
    resourceId: string;
    ruleCode: string;
    ruleVersion?: number;
    cycle?: number;
    severity?: string;
    status?: string;
    causeCode?: string | null;
    evidenceJson?: string;
    openedAtMs?: number;
    acknowledgedAtMs?: number | null;
    acknowledgedBy?: string | null;
    resolvedAtMs?: number | null;
    resolvedBy?: string | null;
  },
) {
  transaction(db, () => {
    db.prepare(`
      INSERT INTO alert (
        dataset_id, epoch, id, resource_id, rule_code, rule_version,
        cycle, severity, status, cause_code, evidence_json,
        opened_at_ms, acknowledged_at_ms, acknowledged_by, resolved_at_ms, resolved_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      datasetId,
      epoch,
      alert.id,
      alert.resourceId,
      alert.ruleCode,
      alert.ruleVersion ?? 1,
      alert.cycle ?? 1,
      alert.severity ?? 'high',
      alert.status ?? 'open',
      alert.causeCode ?? null,
      alert.evidenceJson ?? '{}',
      alert.openedAtMs ?? Date.now() - 10000,
      alert.acknowledgedAtMs ?? null,
      alert.acknowledgedBy ?? null,
      alert.resolvedAtMs ?? null,
      alert.resolvedBy ?? null,
    );

    db.prepare(`
      INSERT INTO alert_event (
        dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
        cycle, severity, previous_status, status, evidence_json,
        occurred_at_ms, recorded_at_ms, actor_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'open', ?, ?, ?, NULL)
    `).run(
      datasetId,
      epoch,
      randomUUID(),
      alert.id,
      alert.resourceId,
      alert.ruleCode,
      alert.ruleVersion ?? 1,
      alert.cycle ?? 1,
      alert.severity ?? 'high',
      alert.evidenceJson ?? '{}',
      alert.openedAtMs ?? Date.now() - 10000,
      alert.openedAtMs ?? Date.now() - 10000,
    );
  });
}

describe('Alerts HTTP API (T0010 / PKG-03)', () => {
  it('1. GET /alerts — autenticado retorna 200 e lista; não autenticado retorna 401 UNAUTHORIZED', async () => {
    const f = await setup();
    const equipmentId = randomUUID();
    const alertId = randomUUID();

    insertEquipment(f.store.db, OPERATIONAL_ID, 1, equipmentId);
    insertAlert(f.store.db, OPERATIONAL_ID, 1, {
      id: alertId,
      resourceId: equipmentId,
      ruleCode: 'equipment_fault',
      severity: 'critical',
      status: 'open',
      causeCode: 'sensor_blinded',
      evidenceJson: JSON.stringify({ activeCauses: ['sensor_blinded'] }),
    });

    // Requisição não autenticada (sem cookie)
    const unauth = await f.app.inject({
      method: 'GET',
      url: `${base}/alerts`,
    });
    expect(unauth.statusCode).toBe(401);
    expect(unauth.json().code).toBe('UNAUTHORIZED');

    // Requisição autenticada
    const auth = await f.call('GET', '/alerts');
    expect(auth.statusCode).toBe(200);
    const body = auth.json();
    expect(body.datasetId).toBe(OPERATIONAL_ID);
    expect(body.epoch).toBe(1);
    expect(body.total).toBe(1);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe(alertId);
    expect(body.items[0].severity).toBe('critical');
    expect(body.items[0].status).toBe('open');
    expect(body.items[0].evidence).toEqual({ activeCauses: ['sensor_blinded'] });
  });

  it('2. GET /alerts — isolamento contextual estrito por dataset e epoch', async () => {
    const f = await setup();
    const equipmentId = randomUUID();
    const alertId = randomUUID();
    insertEquipment(f.store.db, OPERATIONAL_ID, 1, equipmentId);
    insertAlert(f.store.db, OPERATIONAL_ID, 1, {
      id: alertId,
      resourceId: equipmentId,
      ruleCode: 'equipment_fault',
      severity: 'high',
      status: 'open',
    });

    // Cria outro dataset autorizado no mesmo SQLite
    const otherDatasetId = randomUUID();
    const otherOrgId = randomUUID();
    const otherEquipmentId = randomUUID();
    const otherAlertId = randomUUID();
    const actorId = (f.store.db.prepare("SELECT id FROM actor WHERE local_key = 'local-operator'").get() as { id: string }).id;

    transaction(f.store.db, () => {
      f.store.db.prepare("INSERT INTO dataset(id, code, kind, active_epoch) VALUES (?, ?, 'demo', 1)").run(otherDatasetId, `ds-${otherDatasetId}`);
      f.store.db.prepare("INSERT INTO dataset_epoch(dataset_id, epoch, status, revision) VALUES (?, 1, 'ready', 0)").run(otherDatasetId);
      f.store.db.prepare('INSERT INTO dataset_grant(dataset_id, actor_id, can_write) VALUES (?, ?, 1)').run(otherDatasetId, actorId);
      f.store.db.prepare("INSERT INTO organization(dataset_id, epoch, id, code, name) VALUES (?, 1, ?, 'ORG_OTHER', 'Other Org')").run(otherDatasetId, otherOrgId);
    });

    insertEquipment(f.store.db, otherDatasetId, 1, otherEquipmentId, otherOrgId);
    insertAlert(f.store.db, otherDatasetId, 1, {
      id: otherAlertId,
      resourceId: otherEquipmentId,
      ruleCode: 'maintenance_due',
      severity: 'warning',
      status: 'open',
    });

    // Consulta no dataset operacional: vê APENAS seu alerta
    const resOper = await f.call('GET', '/alerts');
    expect(resOper.statusCode).toBe(200);
    const bodyOper = resOper.json();
    expect(bodyOper.total).toBe(1);
    expect(bodyOper.items[0].id).toBe(alertId);

    // Consulta no outro dataset: vê APENAS o outro alerta
    const resOther = await f.app.inject({
      method: 'GET',
      url: `/api/v1/datasets/${otherDatasetId}/epochs/1/alerts`,
      headers: f.headers,
    });
    expect(resOther.statusCode).toBe(200);
    const bodyOther = resOther.json();
    expect(bodyOther.total).toBe(1);
    expect(bodyOther.items[0].id).toBe(otherAlertId);
  });

  it('3. GET /alerts — paginação com ordenação determinística (opened_at_ms DESC, id ASC)', async () => {
    const f = await setup();
    const equipmentId = randomUUID();
    insertEquipment(f.store.db, OPERATIONAL_ID, 1, equipmentId);

    const now = Date.now();
    const alert1 = randomUUID();
    const alert2 = randomUUID();
    const alert3 = randomUUID();

    insertAlert(f.store.db, OPERATIONAL_ID, 1, {
      id: alert1,
      resourceId: equipmentId,
      ruleCode: 'equipment_fault',
      openedAtMs: now - 30000,
    });
    insertAlert(f.store.db, OPERATIONAL_ID, 1, {
      id: alert2,
      resourceId: equipmentId,
      ruleCode: 'communication_missing',
      openedAtMs: now - 20000,
    });
    insertAlert(f.store.db, OPERATIONAL_ID, 1, {
      id: alert3,
      resourceId: equipmentId,
      ruleCode: 'maintenance_due',
      openedAtMs: now - 10000,
    });

    // Página 1 com pageSize=2
    const page1 = await f.call('GET', '/alerts?page=1&pageSize=2');
    expect(page1.statusCode).toBe(200);
    const b1 = page1.json();
    expect(b1.total).toBe(3);
    expect(b1.page).toBe(1);
    expect(b1.pageSize).toBe(2);
    expect(b1.items).toHaveLength(2);
    expect(b1.items[0].id).toBe(alert3); // Mais recente (openedAtMs = now - 10000)
    expect(b1.items[1].id).toBe(alert2); // Intermediário (openedAtMs = now - 20000)

    // Página 2 com pageSize=2
    const page2 = await f.call('GET', '/alerts?page=2&pageSize=2');
    expect(page2.statusCode).toBe(200);
    const b2 = page2.json();
    expect(b2.total).toBe(3);
    expect(b2.page).toBe(2);
    expect(b2.pageSize).toBe(2);
    expect(b2.items).toHaveLength(1);
    expect(b2.items[0].id).toBe(alert1); // Mais antigo (openedAtMs = now - 30000)
  });

  it('4. GET /alerts — filtros por status, severity, ruleCode e resourceId', async () => {
    const f = await setup();
    const eq1 = randomUUID();
    const eq2 = randomUUID();
    insertEquipment(f.store.db, OPERATIONAL_ID, 1, eq1);
    insertEquipment(f.store.db, OPERATIONAL_ID, 1, eq2);

    const a1 = randomUUID();
    const a2 = randomUUID();
    const a3 = randomUUID();

    const actorId = (f.store.db.prepare("SELECT id FROM actor WHERE local_key = 'local-operator'").get() as { id: string }).id;

    // a1: open, critical, equipment_fault, eq1
    insertAlert(f.store.db, OPERATIONAL_ID, 1, {
      id: a1,
      resourceId: eq1,
      ruleCode: 'equipment_fault',
      severity: 'critical',
      status: 'open',
    });
    // a2: acknowledged, high, communication_missing, eq1
    insertAlert(f.store.db, OPERATIONAL_ID, 1, {
      id: a2,
      resourceId: eq1,
      ruleCode: 'communication_missing',
      severity: 'high',
      status: 'acknowledged',
      acknowledgedAtMs: Date.now() - 5000,
      acknowledgedBy: actorId,
    });
    // a3: resolved, warning, maintenance_due, eq2
    insertAlert(f.store.db, OPERATIONAL_ID, 1, {
      id: a3,
      resourceId: eq2,
      ruleCode: 'maintenance_due',
      severity: 'warning',
      status: 'resolved',
      resolvedAtMs: Date.now() - 1000,
    });

    // Filtro status=open
    const resStatus = await f.call('GET', '/alerts?status=open');
    expect(resStatus.json().total).toBe(1);
    expect(resStatus.json().items[0].id).toBe(a1);

    // Filtro severity=high
    const resSev = await f.call('GET', '/alerts?severity=high');
    expect(resSev.json().total).toBe(1);
    expect(resSev.json().items[0].id).toBe(a2);

    // Filtro ruleCode=maintenance_due
    const resRule = await f.call('GET', '/alerts?ruleCode=maintenance_due');
    expect(resRule.json().total).toBe(1);
    expect(resRule.json().items[0].id).toBe(a3);

    // Filtro resourceId=eq1
    const resRes = await f.call('GET', `/alerts?resourceId=${eq1}`);
    expect(resRes.json().total).toBe(2);

    // Filtros combinados: status=acknowledged&resourceId=eq1
    const resComb = await f.call('GET', `/alerts?status=acknowledged&resourceId=${eq1}`);
    expect(resComb.json().total).toBe(1);
    expect(resComb.json().items[0].id).toBe(a2);

    // Filtro sem correspondência
    const resNone = await f.call('GET', '/alerts?status=resolved&severity=critical');
    expect(resNone.json().total).toBe(0);
    expect(resNone.json().items).toHaveLength(0);
  });

  it('5. GET /alerts — validação de parâmetros de consulta inválidos e campos extras (400)', async () => {
    const f = await setup();

    // status inválido
    const r1 = await f.call('GET', '/alerts?status=invalid_status');
    expect(r1.statusCode).toBe(400);

    // severity inválida
    const r2 = await f.call('GET', '/alerts?severity=extreme');
    expect(r2.statusCode).toBe(400);

    // ruleCode inválido
    const r3 = await f.call('GET', '/alerts?ruleCode=unknown_rule');
    expect(r3.statusCode).toBe(400);

    // resourceId não-UUID
    const r4 = await f.call('GET', '/alerts?resourceId=not-a-uuid');
    expect(r4.statusCode).toBe(422);

    // page não-numérica
    const r5 = await f.call('GET', '/alerts?page=zero');
    expect(r5.statusCode).toBe(400);

    // campo extra desconhecido
    const r6 = await f.call('GET', '/alerts?unexpectedParam=true');
    expect(r6.statusCode).toBe(400);
  });

  it('6. GET /alerts/:alertId — detalhamento do alerta e 404 NOT_FOUND para inexistência', async () => {
    const f = await setup();
    const equipmentId = randomUUID();
    const alertId = randomUUID();
    insertEquipment(f.store.db, OPERATIONAL_ID, 1, equipmentId);
    insertAlert(f.store.db, OPERATIONAL_ID, 1, {
      id: alertId,
      resourceId: equipmentId,
      ruleCode: 'equipment_fault',
      severity: 'critical',
      status: 'open',
      evidenceJson: JSON.stringify({ activeCauses: ['sensor_failure'], toleranceMs: 5000 }),
    });

    // Consulta alerta existente
    const resExist = await f.call('GET', `/alerts/${alertId}`);
    expect(resExist.statusCode).toBe(200);
    const body = resExist.json();
    expect(body.datasetId).toBe(OPERATIONAL_ID);
    expect(body.epoch).toBe(1);
    expect(body.alert.id).toBe(alertId);
    expect(body.alert.resourceId).toBe(equipmentId);
    expect(body.alert.evidence).toEqual({ activeCauses: ['sensor_failure'], toleranceMs: 5000 });
    expect(body.alert.evidenceJson).toBeDefined();

    // Consulta alerta inexistente
    const missingId = randomUUID();
    const resMissing = await f.call('GET', `/alerts/${missingId}`);
    expect(resMissing.statusCode).toBe(404);
    expect(resMissing.json().code).toBe('NOT_FOUND');
  });

  it('7. POST /alerts/:alertId/acknowledge — reconhecimento válido: open -> acknowledged, actor_id e tempo confiável', async () => {
    const f = await setup();
    const equipmentId = randomUUID();
    const alertId = randomUUID();
    insertEquipment(f.store.db, OPERATIONAL_ID, 1, equipmentId);
    const openedAt = 1793140000000;
    insertAlert(f.store.db, OPERATIONAL_ID, 1, {
      id: alertId,
      resourceId: equipmentId,
      ruleCode: 'equipment_fault',
      severity: 'high',
      status: 'open',
      openedAtMs: openedAt,
    });

    const initialRevision = f.revision();
    const commandId = randomUUID();

    const res = await f.call('POST', `/alerts/${alertId}/acknowledge`, { commandId });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.datasetId).toBe(OPERATIONAL_ID);
    expect(body.epoch).toBe(1);
    expect(body.revision).toBe(initialRevision + 1);
    expect(body.alert.id).toBe(alertId);
    expect(body.alert.status).toBe('acknowledged');
    expect(body.alert.acknowledgedAtMs).toBeGreaterThanOrEqual(openedAt);
    expect(body.alert.acknowledgedBy).toMatch(/^operator:/);

    // Validação direta no SQLite
    const row = f.store.db.prepare('SELECT status, acknowledged_at_ms, acknowledged_by FROM alert WHERE id = ?').get(alertId) as {
      status: string;
      acknowledged_at_ms: number;
      acknowledged_by: string;
    };
    expect(row.status).toBe('acknowledged');
    expect(row.acknowledged_at_ms).toBe(body.alert.acknowledgedAtMs);
    expect(row.acknowledged_by).toBe(body.alert.acknowledgedBy);

    // Validação do evento gravado em alert_event
    const event = f.store.db.prepare('SELECT * FROM alert_event WHERE alert_id = ? AND status = ?').get(alertId, 'acknowledged') as Record<string, unknown>;
    expect(event).toBeDefined();
    expect(event.previous_status).toBe('open');
    expect(event.actor_id).toBe(row.acknowledged_by);
    expect(event.occurred_at_ms).toBe(row.acknowledged_at_ms);
  });

  it('8. POST /alerts/:alertId/acknowledge — replay idempotente devolve resposta original com Idempotency-Replayed: true', async () => {
    const f = await setup();
    const equipmentId = randomUUID();
    const alertId = randomUUID();
    insertEquipment(f.store.db, OPERATIONAL_ID, 1, equipmentId);
    insertAlert(f.store.db, OPERATIONAL_ID, 1, {
      id: alertId,
      resourceId: equipmentId,
      ruleCode: 'communication_missing',
      status: 'open',
    });

    const commandId = randomUUID();

    // Primeira execução
    const first = await f.call('POST', `/alerts/${alertId}/acknowledge`, { commandId });
    expect(first.statusCode).toBe(200);
    expect(first.headers['idempotency-replayed']).toBeUndefined();
    const revAfterFirst = f.revision();

    // Replay do mesmo comando exatamente com os mesmos parâmetros
    const replay = await f.call('POST', `/alerts/${alertId}/acknowledge`, { commandId });
    expect(replay.statusCode).toBe(200);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.json()).toEqual(first.json());

    // Nenhuma nova revisão foi gerada no replay
    expect(f.revision()).toBe(revAfterFirst);

    // Apenas um alert_event de acknowledged existe
    const eventCount = (f.store.db.prepare("SELECT count(*) AS n FROM alert_event WHERE alert_id = ? AND status = 'acknowledged'").get(alertId) as { n: number }).n;
    expect(eventCount).toBe(1);
  });

  it('9. POST /alerts/:alertId/acknowledge — conflito de commandId retorna 409 IDEMPOTENCY_CONFLICT', async () => {
    const f = await setup();
    const equipmentId = randomUUID();
    const alert1 = randomUUID();
    const alert2 = randomUUID();
    insertEquipment(f.store.db, OPERATIONAL_ID, 1, equipmentId);
    insertAlert(f.store.db, OPERATIONAL_ID, 1, { id: alert1, resourceId: equipmentId, ruleCode: 'equipment_fault', status: 'open' });
    insertAlert(f.store.db, OPERATIONAL_ID, 1, { id: alert2, resourceId: equipmentId, ruleCode: 'maintenance_due', status: 'open' });

    const sharedCommandId = randomUUID();

    // Executa no alerta 1
    const res1 = await f.call('POST', `/alerts/${alert1}/acknowledge`, { commandId: sharedCommandId });
    expect(res1.statusCode).toBe(200);

    // Tenta reutilizar o mesmo commandId no alerta 2 (alvo conflitante)
    const resConflictTarget = await f.call('POST', `/alerts/${alert2}/acknowledge`, { commandId: sharedCommandId });
    expect(resConflictTarget.statusCode).toBe(409);
    expect(resConflictTarget.json().code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('10. POST /alerts/:alertId/acknowledge — reconhecimento duplicado com NOVO commandId retorna 409 STATUS_CONFLICT', async () => {
    const f = await setup();
    const equipmentId = randomUUID();
    const alertId = randomUUID();
    insertEquipment(f.store.db, OPERATIONAL_ID, 1, equipmentId);
    insertAlert(f.store.db, OPERATIONAL_ID, 1, {
      id: alertId,
      resourceId: equipmentId,
      ruleCode: 'equipment_fault',
      status: 'open',
    });

    // 1. Reconhece com commandId 1
    const res1 = await f.call('POST', `/alerts/${alertId}/acknowledge`, { commandId: randomUUID() });
    expect(res1.statusCode).toBe(200);

    // 2. Tenta reconhecer novamente o mesmo alerta já acknowledged com NOVO commandId
    const resDup = await f.call('POST', `/alerts/${alertId}/acknowledge`, { commandId: randomUUID() });
    expect(resDup.statusCode).toBe(409);
    expect(resDup.json().code).toBe('STATUS_CONFLICT');

    // 3. Alerta resolvido também rejeita reconhecimento com 409 STATUS_CONFLICT
    const alertResolvedId = randomUUID();
    insertAlert(f.store.db, OPERATIONAL_ID, 1, {
      id: alertResolvedId,
      resourceId: equipmentId,
      ruleCode: 'maintenance_due',
      status: 'resolved',
      resolvedAtMs: Date.now(),
    });

    const resResolved = await f.call('POST', `/alerts/${alertResolvedId}/acknowledge`, { commandId: randomUUID() });
    expect(resResolved.statusCode).toBe(409);
    expect(resResolved.json().code).toBe('STATUS_CONFLICT');
  });

  it('11. POST /alerts/:alertId/acknowledge — revisão incrementada exatamente uma vez e persistência atômica', async () => {
    const f = await setup();
    const equipmentId = randomUUID();
    const alertId = randomUUID();
    insertEquipment(f.store.db, OPERATIONAL_ID, 1, equipmentId);
    insertAlert(f.store.db, OPERATIONAL_ID, 1, { id: alertId, resourceId: equipmentId, ruleCode: 'equipment_fault', status: 'open' });

    const revBefore = f.revision();
    const cmdId = randomUUID();

    const res = await f.call('POST', `/alerts/${alertId}/acknowledge`, { commandId: cmdId });
    expect(res.statusCode).toBe(200);

    // Incremento exato de 1
    const revAfter = f.revision();
    expect(revAfter).toBe(revBefore + 1);

    // command_receipt gravado com resulting_revision correspondente
    const receipt = f.store.db.prepare(
      'SELECT resulting_revision, response_status FROM command_receipt WHERE command_id = ?',
    ).get(cmdId) as { resulting_revision: number; response_status: number };
    expect(receipt.response_status).toBe(200);
    expect(receipt.resulting_revision).toBe(revAfter);
  });

  it('12. POST /alerts/:alertId/acknowledge — rollback atômico em caso de falha', async () => {
    const f = await setup();
    const equipmentId = randomUUID();
    const alertId = randomUUID();
    insertEquipment(f.store.db, OPERATIONAL_ID, 1, equipmentId);
    insertAlert(f.store.db, OPERATIONAL_ID, 1, { id: alertId, resourceId: equipmentId, ruleCode: 'equipment_fault', status: 'open' });

    const revBefore = f.revision();
    const cmdId = randomUUID();

    // Injeta um trigger temporário que aborta a transação durante o UPDATE em dataset_epoch
    f.store.db.exec(`
      CREATE TRIGGER fail_revision_abort BEFORE UPDATE ON dataset_epoch
      BEGIN
        SELECT RAISE(FAIL, 'Falha simulada na transação de acknowledge');
      END;
    `);

    const res = await f.call('POST', `/alerts/${alertId}/acknowledge`, { commandId: cmdId });
    expect(res.statusCode).toBe(500);

    // Rollback atômico: o alerta permanece OPEN
    const alertState = f.store.db.prepare('SELECT status, acknowledged_at_ms FROM alert WHERE id = ?').get(alertId) as { status: string; acknowledged_at_ms: number | null };
    expect(alertState.status).toBe('open');
    expect(alertState.acknowledged_at_ms).toBeNull();

    // Nenhum alert_event persistido
    const events = f.store.db.prepare('SELECT count(*) AS n FROM alert_event WHERE alert_id = ?').get(alertId) as { n: number };
    expect(events.n).toBe(1); // Apenas o de abertura original

    // Revisão inalterada
    expect(f.revision()).toBe(revBefore);

    // Nenhum recibo foi gravado
    const receipt = f.store.db.prepare('SELECT 1 FROM command_receipt WHERE command_id = ?').get(cmdId);
    expect(receipt).toBeUndefined();
  });

  it('13. POST e GET — epoch inativo/aposentado retorna 409 EPOCH_CONFLICT', async () => {
    const f = await setup();
    const equipmentId = randomUUID();
    const alertId = randomUUID();
    insertEquipment(f.store.db, OPERATIONAL_ID, 1, equipmentId);
    insertAlert(f.store.db, OPERATIONAL_ID, 1, { id: alertId, resourceId: equipmentId, ruleCode: 'equipment_fault', status: 'open' });

    // Avança para epoch 2 e aposenta epoch 1
    transaction(f.store.db, () => {
      f.store.db.prepare("UPDATE dataset_epoch SET status = 'retired' WHERE dataset_id = ? AND epoch = 1").run(OPERATIONAL_ID);
      f.store.db.prepare("INSERT INTO dataset_epoch(dataset_id, epoch, status, revision) VALUES (?, 2, 'ready', 0)").run(OPERATIONAL_ID);
      f.store.db.prepare('UPDATE dataset SET active_epoch = 2 WHERE id = ?').run(OPERATIONAL_ID);
    });

    // GET no epoch aposentado
    const getRes = await f.call('GET', '/alerts');
    expect(getRes.statusCode).toBe(409);
    expect(getRes.json().code).toBe('EPOCH_CONFLICT');

    // POST no epoch aposentado
    const postRes = await f.call('POST', `/alerts/${alertId}/acknowledge`, { commandId: randomUUID() });
    expect(postRes.statusCode).toBe(409);
    expect(postRes.json().code).toBe('EPOCH_CONFLICT');
  });

  it('14. POST /alerts/:alertId/acknowledge — proteção Origin e CSRF (403 ORIGIN_FORBIDDEN e 403 CSRF_FORBIDDEN)', async () => {
    const f = await setup();
    const equipmentId = randomUUID();
    const alertId = randomUUID();
    insertEquipment(f.store.db, OPERATIONAL_ID, 1, equipmentId);
    insertAlert(f.store.db, OPERATIONAL_ID, 1, { id: alertId, resourceId: equipmentId, ruleCode: 'equipment_fault', status: 'open' });

    // 1. Sem Origin
    const noOrigin = await f.app.inject({
      method: 'POST',
      url: `${base}/alerts/${alertId}/acknowledge`,
      headers: { cookie: f.cookie, 'x-csrf-token': f.csrf },
      payload: { commandId: randomUUID() },
    });
    expect(noOrigin.statusCode).toBe(403);
    expect(noOrigin.json().code).toBe('ORIGIN_FORBIDDEN');

    // 2. Origin inválida
    const badOrigin = await f.app.inject({
      method: 'POST',
      url: `${base}/alerts/${alertId}/acknowledge`,
      headers: { cookie: f.cookie, origin: 'http://malicious.site', 'x-csrf-token': f.csrf },
      payload: { commandId: randomUUID() },
    });
    expect(badOrigin.statusCode).toBe(403);
    expect(badOrigin.json().code).toBe('ORIGIN_FORBIDDEN');

    // 3. Sem CSRF
    const noCsrf = await f.app.inject({
      method: 'POST',
      url: `${base}/alerts/${alertId}/acknowledge`,
      headers: { cookie: f.cookie, origin: ORIGIN },
      payload: { commandId: randomUUID() },
    });
    expect(noCsrf.statusCode).toBe(403);
    expect(noCsrf.json().code).toBe('CSRF_FORBIDDEN');

    // 4. CSRF divergente
    const badCsrf = await f.app.inject({
      method: 'POST',
      url: `${base}/alerts/${alertId}/acknowledge`,
      headers: { cookie: f.cookie, origin: ORIGIN, 'x-csrf-token': 'token-falso-adulterado' },
      payload: { commandId: randomUUID() },
    });
    expect(badCsrf.statusCode).toBe(403);
    expect(badCsrf.json().code).toBe('CSRF_FORBIDDEN');
  });

  it('15. TC-API-15 — avanço durável do relógio confiável em acknowledge e recusa de regressão temporal (503 CLOCK_UNTRUSTED)', async () => {
    // Provedor com relógio inicial em 200
    const timeProvider = new SettableTimeProvider(200);
    const f = await setupWithClock(timeProvider);

    // Inicializa telemetry_trusted_clock com watermark inicial 100
    f.store.db.prepare(`
      INSERT INTO telemetry_trusted_clock(singleton, trusted_utc_ms)
      VALUES (1, 100)
      ON CONFLICT(singleton) DO UPDATE SET trusted_utc_ms = 100
    `).run();

    const equipmentId = randomUUID();
    const alertId = randomUUID();
    insertEquipment(f.store.db, OPERATIONAL_ID, 1, equipmentId);
    insertAlert(f.store.db, OPERATIONAL_ID, 1, {
      id: alertId,
      resourceId: equipmentId,
      ruleCode: 'equipment_fault',
      status: 'open',
      openedAtMs: 50,
    });

    const cmdId = randomUUID();
    const res = await f.call('POST', `/alerts/${alertId}/acknowledge`, { commandId: cmdId });
    expect(res.statusCode).toBe(200);
    expect(res.json().alert.status).toBe('acknowledged');

    // 1. Comprova que o marco durável foi persistido no banco >= 200
    const durableRow = f.store.db.prepare(
      'SELECT trusted_utc_ms FROM telemetry_trusted_clock WHERE singleton = 1',
    ).get() as { trusted_utc_ms: number };
    expect(durableRow.trusted_utc_ms).toBeGreaterThanOrEqual(200);
    expect(durableRow.trusted_utc_ms).toBe(200);

    // Replay idempotente não deve reavançar o relógio nem produzir novas mutações
    timeProvider.advanceBy(5000); // relógio agora em 5200
    const replayRes = await f.call('POST', `/alerts/${alertId}/acknowledge`, { commandId: cmdId });
    expect(replayRes.statusCode).toBe(200);
    expect(replayRes.headers['idempotency-replayed']).toBe('true');
    const durableAfterReplay = f.store.db.prepare(
      'SELECT trusted_utc_ms FROM telemetry_trusted_clock WHERE singleton = 1',
    ).get() as { trusted_utc_ms: number };
    expect(durableAfterReplay.trusted_utc_ms).toBe(200);

    // 2. Reinicia o serviço/instância com o relógio do host em 150 (regressão temporal)
    await f.app.close();
    const restartedStore = new Store(f.path);
    const regressedTimeProvider = new SettableTimeProvider(150);
    const restartedClock = new TrustedClockService(regressedTimeProvider);
    const restartedApp = await buildApp({
      foundation: { store: restartedStore, host: '127.0.0.1', dev: true, operatorSecret: SECRET },
      alerts: { clockService: restartedClock },
    });

    try {
      // Autenticação na nova instância
      const sessionRes = await restartedApp.inject({
        method: 'POST',
        url: '/api/v1/session',
        headers: { origin: ORIGIN },
        payload: { secret: SECRET },
      });
      const cookie = String(sessionRes.headers['set-cookie']).split(';')[0]!;
      const csrf = sessionRes.json<{ csrfToken: string }>().csrfToken;

      // Cria um novo alerta para tentar reconhecer
      const alertId2 = randomUUID();
      insertAlert(restartedStore.db, OPERATIONAL_ID, 1, {
        id: alertId2,
        resourceId: equipmentId,
        ruleCode: 'communication_missing',
        status: 'open',
        openedAtMs: 60,
      });

      // Tentativa de reconhecimento com o relógio em regressão
      const resRegressed = await restartedApp.inject({
        method: 'POST',
        url: `${base}/alerts/${alertId2}/acknowledge`,
        headers: { cookie, origin: ORIGIN, 'x-csrf-token': csrf },
        payload: { commandId: randomUUID() },
      });

      // 3. Comprova recusa obrigatória por regressão temporal: 503 / CLOCK_UNTRUSTED
      expect(resRegressed.statusCode).toBe(503);
      expect(resRegressed.json().code).toBe('CLOCK_UNTRUSTED');

      // Comprova também a rejeição direta em nível de serviço
      expect(() => restartedClock.sampleTrustedNow(restartedStore.db)).toThrow(ClockUntrustedError);
    } finally {
      await restartedApp.close();
      restartedStore.close();
    }
  });

  it('16. TC-API-16 — falha injetada no avanço durável provoca rollback integral atômico', async () => {
    const f = await setup();
    const equipmentId = randomUUID();
    const alertId = randomUUID();
    insertEquipment(f.store.db, OPERATIONAL_ID, 1, equipmentId);
    insertAlert(f.store.db, OPERATIONAL_ID, 1, {
      id: alertId,
      resourceId: equipmentId,
      ruleCode: 'equipment_fault',
      status: 'open',
    });

    const revBefore = f.revision();
    const cmdId = randomUUID();

    // Injeta trigger no SQLite que aborta o avanço durável em telemetry_trusted_clock
    f.store.db.exec(`
      CREATE TRIGGER fail_durable_insert BEFORE INSERT ON telemetry_trusted_clock
      BEGIN
        SELECT RAISE(FAIL, 'Falha injetada no avanço durável (INSERT)');
      END;
      CREATE TRIGGER fail_durable_update BEFORE UPDATE ON telemetry_trusted_clock
      BEGIN
        SELECT RAISE(FAIL, 'Falha injetada no avanço durável (UPDATE)');
      END;
    `);

    try {
      const res = await f.call('POST', `/alerts/${alertId}/acknowledge`, { commandId: cmdId });
      expect(res.statusCode).toBe(500);

      // Comprovação de ROLLBACK INTEGRAL:
      // 1. O alerta permanece 'open' e sem timestamp/operador de reconhecimento
      const alertRow = f.store.db.prepare(
        'SELECT status, acknowledged_at_ms, acknowledged_by FROM alert WHERE id = ?',
      ).get(alertId) as {
        status: string;
        acknowledged_at_ms: number | null;
        acknowledged_by: string | null;
      };
      expect(alertRow.status).toBe('open');
      expect(alertRow.acknowledged_at_ms).toBeNull();
      expect(alertRow.acknowledged_by).toBeNull();

      // 2. Nenhum alert_event de 'acknowledged' foi persistido (apenas o de abertura)
      const eventCount = (f.store.db.prepare(
        "SELECT count(*) AS n FROM alert_event WHERE alert_id = ? AND status = 'acknowledged'",
      ).get(alertId) as { n: number }).n;
      expect(eventCount).toBe(0);

      const totalEvents = (f.store.db.prepare(
        'SELECT count(*) AS n FROM alert_event WHERE alert_id = ?',
      ).get(alertId) as { n: number }).n;
      expect(totalEvents).toBe(1);

      // 3. Revisão do dataset_epoch permanece inalterada
      expect(f.revision()).toBe(revBefore);

      // 4. Ausência estrita de command_receipt para o comando abortado
      const receipt = f.store.db.prepare(
        'SELECT 1 FROM command_receipt WHERE command_id = ?',
      ).get(cmdId);
      expect(receipt).toBeUndefined();
    } finally {
      f.store.db.exec(`
        DROP TRIGGER IF EXISTS fail_durable_insert;
        DROP TRIGGER IF EXISTS fail_durable_update;
      `);
    }
  });
});
