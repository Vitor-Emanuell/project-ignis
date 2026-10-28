/**
 * PROJECT IGNIS — T0010 / PKG-03
 * Rotas HTTP Fastify para consulta e reconhecimento de alertas.
 * Prefixo: /api/v1/datasets/:datasetId/epochs/:epoch
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Authorization } from '../auth.js';
import { credentials } from '../foundation-routes.js';
import { AppError } from '../errors.js';
import { normalize, normalizeBody, uuid } from '../idempotency/normalize.js';
import { TrustedClockService } from '../domain/telemetry/trusted-clock.js';
import { SystemTimeProvider } from '../domain/telemetry/time-provider.js';
import {
  listAlerts,
  getAlert,
  acknowledgeAlert,
  type AlertQueryFilter,
} from './service.js';

export interface AlertsRouteOptions {
  readonly clockService?: TrustedClockService | undefined;
}

interface AlertParams {
  datasetId: string;
  epoch: string;
  alertId?: string;
}

const prefix = '/api/v1/datasets/:datasetId/epochs/:epoch';

const VALID_STATUSES = new Set(['open', 'acknowledged', 'resolved']);
const VALID_SEVERITIES = new Set(['warning', 'high', 'critical']);
const VALID_RULE_CODES = new Set(['equipment_fault', 'communication_missing', 'maintenance_due']);

function parseParams(request: FastifyRequest<{ Params: AlertParams }>) {
  if (!/^\d+$/.test(request.params.epoch)) {
    throw new AppError(400, 'INVALID_REQUEST', 'Geração inválida.');
  }
  return {
    datasetId: uuid(request.params.datasetId),
    epoch: normalize(Number(request.params.epoch), { type: 'integer', min: 1 }) as number,
  };
}

function parseAlertQuery(queryInput: unknown): AlertQueryFilter {
  const query = normalizeBody(
    { ...(queryInput as Record<string, unknown>) },
    {
      page: { type: 'string', optional: true },
      pageSize: { type: 'string', optional: true },
      status: { type: 'string', optional: true },
      severity: { type: 'string', optional: true },
      ruleCode: { type: 'string', optional: true },
      resourceId: { type: 'string', optional: true },
    },
  );

  const pageNumber = (key: string, fallback: number, max = Number.MAX_SAFE_INTEGER) => {
    if (query[key] === undefined) return fallback;
    const str = String(query[key]);
    if (!/^\d+$/.test(str) || Number(str) < 1) {
      throw new AppError(400, 'INVALID_REQUEST', 'Paginação inválida.');
    }
    return normalize(Number(str), { type: 'integer', min: 1, max }) as number;
  };

  const page = pageNumber('page', 1);
  const pageSize = pageNumber('pageSize', 50, 200);

  let status: string | undefined;
  if (query.status !== undefined) {
    status = String(query.status);
    if (!VALID_STATUSES.has(status)) {
      throw new AppError(400, 'INVALID_REQUEST', `Status de alerta inválido: ${status}`);
    }
  }

  let severity: string | undefined;
  if (query.severity !== undefined) {
    severity = String(query.severity);
    if (!VALID_SEVERITIES.has(severity)) {
      throw new AppError(400, 'INVALID_REQUEST', `Severidade de alerta inválida: ${severity}`);
    }
  }

  let ruleCode: string | undefined;
  if (query.ruleCode !== undefined) {
    ruleCode = String(query.ruleCode);
    if (!VALID_RULE_CODES.has(ruleCode)) {
      throw new AppError(400, 'INVALID_REQUEST', `Regra de alerta inválida: ${ruleCode}`);
    }
  }

  let resourceId: string | undefined;
  if (query.resourceId !== undefined) {
    resourceId = uuid(query.resourceId);
  }

  return {
    page,
    pageSize,
    status,
    severity,
    ruleCode,
    resourceId,
  };
}

export function registerAlerts(
  app: FastifyInstance,
  auth: Authorization,
  options?: AlertsRouteOptions,
): void {
  const clockService =
    options?.clockService ?? new TrustedClockService(new SystemTimeProvider());

  // 1. GET /alerts — Listagem paginada e filtrada
  app.get<{ Params: AlertParams }>(`${prefix}/alerts`, async (request, reply) => {
    const p = parseParams(request);
    const filter = parseAlertQuery(request.query);
    const result = listAlerts(auth, credentials(request), p.datasetId, p.epoch, filter);
    return reply.header('Cache-Control', 'no-store').send(result);
  });

  // 2. GET /alerts/:alertId — Detalhes do alerta
  app.get<{ Params: AlertParams }>(`${prefix}/alerts/:alertId`, async (request, reply) => {
    normalizeBody(request.query, {});
    const p = parseParams(request);
    const alertId = uuid(request.params.alertId);
    const result = getAlert(auth, credentials(request), p.datasetId, p.epoch, alertId);
    return reply.header('Cache-Control', 'no-store').send(result);
  });

  // 3. POST /alerts/:alertId/acknowledge — Reconhecimento autenticado e idempotente
  app.post<{ Params: AlertParams; Body: unknown }>(
    `${prefix}/alerts/:alertId/acknowledge`,
    async (request, reply) => {
      const p = parseParams(request);
      const alertId = uuid(request.params.alertId);
      const result = acknowledgeAlert(
        auth,
        credentials(request),
        p.datasetId,
        p.epoch,
        alertId,
        request.body,
        clockService,
      );
      return reply
        .header('Cache-Control', 'no-store')
        .headers(result.headers)
        .code(result.status)
        .send(result.body);
    },
  );
}
