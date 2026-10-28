/**
 * PROJECT IGNIS — T0010 / PKG-03
 * Serviços de consulta e reconhecimento de alertas HTTP (F02, R06, C02).
 * Garante isolamento contextual por (dataset_id, epoch), idempotência com command_receipt,
 * incremento monotônico de revisão e integridade transacional atômica.
 */

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Authorization, Context, Credentials } from '../auth.js';
import { AppError } from '../errors.js';
import { executeCommand, type CommandResult } from '../idempotency/command.js';
import { parseJson, type Json } from '../idempotency/json.js';
import { uuid } from '../idempotency/normalize.js';
import type { TrustedClockService } from '../domain/telemetry/trusted-clock.js';

export type AlertView = {
  readonly id: string;
  readonly resourceId: string;
  readonly ruleCode: string;
  readonly ruleVersion: number;
  readonly cycle: number;
  readonly severity: string;
  readonly status: string;
  readonly causeCode: string | null;
  readonly evidence: Json;
  readonly evidenceJson: string;
  readonly openedAtMs: number;
  readonly acknowledgedAtMs: number | null;
  readonly acknowledgedBy: string | null;
  readonly resolvedAtMs: number | null;
  readonly resolvedBy: string | null;
  readonly [key: string]: Json;
};

interface RawAlertRow {
  id: string;
  resource_id: string;
  rule_code: string;
  rule_version: number;
  cycle: number;
  severity: string;
  status: string;
  cause_code: string | null;
  evidence_json: string;
  opened_at_ms: number;
  acknowledged_at_ms: number | null;
  acknowledged_by: string | null;
  resolved_at_ms: number | null;
  resolved_by: string | null;
}

export interface AlertQueryFilter {
  readonly page?: number | undefined;
  readonly pageSize?: number | undefined;
  readonly status?: string | undefined;
  readonly severity?: string | undefined;
  readonly ruleCode?: string | undefined;
  readonly resourceId?: string | undefined;
}

export interface AlertListResult {
  readonly datasetId: string;
  readonly epoch: number;
  readonly revision: number;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly items: readonly AlertView[];
}

export interface AlertDetailResult {
  readonly datasetId: string;
  readonly epoch: number;
  readonly revision: number;
  readonly alert: AlertView;
}

export function formatAlertView(row: RawAlertRow): AlertView {
  let evidence: Json = {};
  try {
    evidence = parseJson(row.evidence_json);
  } catch {
    evidence = {};
  }

  return {
    id: row.id,
    resourceId: row.resource_id,
    ruleCode: row.rule_code,
    ruleVersion: row.rule_version,
    cycle: row.cycle,
    severity: row.severity,
    status: row.status,
    causeCode: row.cause_code,
    evidence,
    evidenceJson: row.evidence_json,
    openedAtMs: row.opened_at_ms,
    acknowledgedAtMs: row.acknowledged_at_ms,
    acknowledgedBy: row.acknowledged_by,
    resolvedAtMs: row.resolved_at_ms,
    resolvedBy: row.resolved_by,
  };
}

/**
 * Consulta paginada e filtrada de alertas no contexto autorizado.
 */
export function listAlerts(
  auth: Authorization,
  credentials: Credentials,
  datasetId: string,
  epoch: number,
  filter: AlertQueryFilter,
): AlertListResult {
  return auth.store.db.transaction(() => {
    const context = auth.context(credentials, datasetId, epoch, false);
    const db = auth.store.db;

    const conditions: string[] = ['dataset_id = ?', 'epoch = ?'];
    const params: unknown[] = [context.datasetId, context.epoch];

    if (filter.status !== undefined) {
      conditions.push('status = ?');
      params.push(filter.status);
    }
    if (filter.severity !== undefined) {
      conditions.push('severity = ?');
      params.push(filter.severity);
    }
    if (filter.ruleCode !== undefined) {
      conditions.push('rule_code = ?');
      params.push(filter.ruleCode);
    }
    if (filter.resourceId !== undefined) {
      conditions.push('resource_id = ?');
      params.push(filter.resourceId);
    }

    const whereClause = conditions.join(' AND ');

    const countRow = db
      .prepare(`SELECT count(*) AS total FROM alert WHERE ${whereClause}`)
      .get(...params) as { total: number };
    const total = countRow.total;

    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 50;
    const offset = (page - 1) * pageSize;

    const rows = (
      offset >= total
        ? []
        : db
            .prepare(
              `SELECT id, resource_id, rule_code, rule_version, cycle, severity, status, cause_code,
                      evidence_json, opened_at_ms, acknowledged_at_ms, acknowledged_by, resolved_at_ms, resolved_by
               FROM alert
               WHERE ${whereClause}
               ORDER BY opened_at_ms DESC, id ASC
               LIMIT ? OFFSET ?`,
            )
            .all(...params, pageSize, offset)
    ) as RawAlertRow[];

    return {
      datasetId: context.datasetId,
      epoch: context.epoch,
      revision: context.revision,
      page,
      pageSize,
      total,
      items: rows.map(formatAlertView),
    };
  }).deferred();
}

/**
 * Consulta detalhada de um alerta individual no contexto autorizado.
 */
export function getAlert(
  auth: Authorization,
  credentials: Credentials,
  datasetId: string,
  epoch: number,
  alertId: string,
): AlertDetailResult {
  return auth.store.db.transaction(() => {
    const context = auth.context(credentials, datasetId, epoch, false);
    const db = auth.store.db;

    const row = db
      .prepare(
        `SELECT id, resource_id, rule_code, rule_version, cycle, severity, status, cause_code,
                evidence_json, opened_at_ms, acknowledged_at_ms, acknowledged_by, resolved_at_ms, resolved_by
         FROM alert
         WHERE dataset_id = ? AND epoch = ? AND id = ?`,
      )
      .get(context.datasetId, context.epoch, alertId) as RawAlertRow | undefined;

    if (!row) {
      throw new AppError(404, 'NOT_FOUND', 'Alerta não encontrado neste contexto.');
    }

    return {
      datasetId: context.datasetId,
      epoch: context.epoch,
      revision: context.revision,
      alert: formatAlertView(row),
    };
  }).deferred();
}

/**
 * Reconhecimento autenticado de um alerta aberto (open -> acknowledged).
 * Persiste atomicamente: alert, alert_event, incremento de revisão e command_receipt.
 */
export function acknowledgeAlert(
  auth: Authorization,
  credentials: Credentials,
  datasetId: string,
  epoch: number,
  alertId: string,
  body: unknown,
  clockService: TrustedClockService,
) {
  const normalizedAlertId = uuid(alertId);
  const commandId = typeof body === 'object' && body !== null && 'commandId' in body
    ? String((body as Record<string, unknown>).commandId)
    : '';

  return executeCommand(
    auth,
    credentials,
    {
      operation: 'alerts.acknowledge.v1',
      fields: {
        commandId: { type: 'uuid' },
      },
      apply: (db: Database.Database, context: Context): CommandResult => {
        // Validação contra reutilização conflitante de command_id em outra operação
        const conflictOtherOp = db
          .prepare(
            `SELECT operation FROM command_receipt
             WHERE dataset_id = ? AND epoch = ? AND actor_id = ? AND command_id = ? AND operation != 'alerts.acknowledge.v1'`,
          )
          .get(context.datasetId, context.epoch, context.actorId, commandId) as { operation: string } | undefined;

        if (conflictOtherOp) {
          throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Chave já utilizada em outra operação.');
        }

        // 1. Busca alerta no contexto autorizado
        const alert = db
          .prepare(
            `SELECT id, resource_id, rule_code, rule_version, cycle, severity, status, cause_code,
                    evidence_json, opened_at_ms, acknowledged_at_ms, acknowledged_by, resolved_at_ms, resolved_by
             FROM alert
             WHERE dataset_id = ? AND epoch = ? AND id = ?`,
          )
          .get(context.datasetId, context.epoch, normalizedAlertId) as RawAlertRow | undefined;

        if (!alert) {
          throw new AppError(404, 'NOT_FOUND', 'Alerta não encontrado neste contexto.');
        }

        // 2. Validação estrita de transição: apenas open -> acknowledged
        if (alert.status === 'acknowledged') {
          throw new AppError(409, 'STATUS_CONFLICT', 'Alerta já reconhecido.');
        }
        if (alert.status === 'resolved') {
          throw new AppError(409, 'STATUS_CONFLICT', 'Alerta já resolvido.');
        }
        if (alert.status !== 'open') {
          throw new AppError(
            409,
            'STATUS_CONFLICT',
            `Transição não permitida para alerta com status '${alert.status}'.`,
          );
        }

        // 3. Obtenção do relógio lógico confiável e avanço do marco durável
        const timeSample = clockService.sampleTrustedNow(db);
        const nowMs = timeSample.utcMs;

        // Avanço durável do relógio no SQLite sob a transação ativa de executeCommand
        clockService.advanceDurable(db, timeSample);

        // 4. Atualização de estado para acknowledged
        db.prepare(
          `UPDATE alert
           SET status = 'acknowledged', acknowledged_at_ms = ?, acknowledged_by = ?
           WHERE dataset_id = ? AND epoch = ? AND id = ?`,
        ).run(nowMs, context.actorId, context.datasetId, context.epoch, alert.id);

        // 5. Inserção de evento auditável em alert_event
        const eventId = randomUUID();
        db.prepare(
          `INSERT INTO alert_event (
             dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
             cycle, severity, previous_status, status, evidence_json,
             occurred_at_ms, recorded_at_ms, actor_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 'acknowledged', ?, ?, ?, ?)`,
        ).run(
          context.datasetId,
          context.epoch,
          eventId,
          alert.id,
          alert.resource_id,
          alert.rule_code,
          alert.rule_version,
          alert.cycle,
          alert.severity,
          alert.evidence_json,
          nowMs,
          nowMs,
          context.actorId,
        );

        // 6. Avanço estrito e monotônico da revisão em dataset_epoch
        db.prepare(
          `UPDATE dataset_epoch
           SET revision = revision + 1
           WHERE dataset_id = ? AND epoch = ?`,
        ).run(context.datasetId, context.epoch);

        const revRow = db
          .prepare(`SELECT revision FROM dataset_epoch WHERE dataset_id = ? AND epoch = ?`)
          .get(context.datasetId, context.epoch) as { revision: number };
        const resultingRevision = revRow.revision;

        const updatedAlert = db
          .prepare(
            `SELECT id, resource_id, rule_code, rule_version, cycle, severity, status, cause_code,
                    evidence_json, opened_at_ms, acknowledged_at_ms, acknowledged_by, resolved_at_ms, resolved_by
             FROM alert
             WHERE dataset_id = ? AND epoch = ? AND id = ?`,
          )
          .get(context.datasetId, context.epoch, alert.id) as RawAlertRow;

        return {
          status: 200,
          resultingRevision,
          body: {
            datasetId: context.datasetId,
            epoch: context.epoch,
            revision: resultingRevision,
            alert: formatAlertView(updatedAlert),
          },
        };
      },
    },
    {
      datasetId,
      epoch,
      commandId,
      target: { type: 'alert', id: normalizedAlertId },
      body,
    },
  );
}
