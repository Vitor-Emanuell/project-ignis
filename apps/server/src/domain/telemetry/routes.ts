/**
 * PROJECT IGNIS — T0007 / PKG-08
 * Ponto de entrada HTTP para Ingestão Telemétrica Canônica (C03-D01..D12, C02).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Store } from '../../persistence/store.js';
import { AppError } from '../../errors.js';
import { uuid, normalize } from '../../idempotency/normalize.js';
import { telemetryTokenHash, TelemetryAuthService } from './auth.js';
import { TelemetryBindingService } from './binding.js';
import { TelemetryProfileValidator } from './profile.js';
import { DefaultTelemetryPipelineHook } from './pipeline.js';
import { TrustedClockService } from './trusted-clock.js';
import { SystemTimeProvider } from './time-provider.js';
import {
  CanonicalTelemetryIngestService,
  type IngestTelemetryEnvelope,
} from './ingest.js';

export interface TelemetryRouteOptions {
  readonly clockService?: TrustedClockService;
  readonly ingestService?: CanonicalTelemetryIngestService;
}

interface TelemetryParams {
  datasetId: string;
  epoch: string;
}

interface RateLimitEntry {
  windowStartMs: number;
  count: number;
}

export function registerTelemetry(
  app: FastifyInstance,
  store: Store,
  options?: TelemetryRouteOptions,
): void {
  const clockService =
    options?.clockService ??
    new TrustedClockService(new SystemTimeProvider());

  const ingestService =
    options?.ingestService ??
    new CanonicalTelemetryIngestService({
      clockService,
      authService: new TelemetryAuthService({ clockService }),
      bindingService: new TelemetryBindingService(),
      profileValidator: new TelemetryProfileValidator(),
      pipelineHook: new DefaultTelemetryPipelineHook(),
    });

  // Rate limiter in-memory de 20 req/s por fonte autenticada
  const sourceRateLimits = new Map<string, RateLimitEntry>();

  const checkSourceRateLimit = (sourceKey: string, reply: FastifyReply): void => {
    const now = Date.now();

    // Limpeza periódica se a tabela de rate limit crescer além do limite seguro
    if (sourceRateLimits.size > 1000) {
      for (const [key, entry] of sourceRateLimits) {
        if (now - entry.windowStartMs >= 1000) {
          sourceRateLimits.delete(key);
        }
      }
    }

    if (!sourceRateLimits.has(sourceKey) && sourceRateLimits.size >= 1000) {
      reply.header('Retry-After', '1');
      throw new AppError(429, 'RATE_LIMITED', 'Limite de capacidade do limiter atingido.');
    }

    const current = sourceRateLimits.get(sourceKey);
    if (!current || now - current.windowStartMs >= 1000) {
      sourceRateLimits.set(sourceKey, { windowStartMs: now, count: 1 });
    } else {
      current.count++;
      if (current.count > 20) {
        reply.header('Retry-After', '1');
        throw new AppError(
          429,
          'RATE_LIMITED',
          'Limite de 20 requisições por segundo por fonte atingido.',
        );
      }
    }
  };

  const routeUrl = '/api/v1/datasets/:datasetId/epochs/:epoch/telemetry';

  app.post<{ Params: TelemetryParams }>(routeUrl, async (request, reply) => {
    // 1. Validação estrita dos parâmetros da URL
    if (!/^\d+$/.test(request.params.epoch)) {
      throw new AppError(400, 'INVALID_REQUEST', 'Geração inválida.');
    }
    const datasetId = uuid(request.params.datasetId);
    const epoch = normalize(Number(request.params.epoch), { type: 'integer', min: 1 }) as number;

    // 2. Extração e validação exclusiva da credencial via cabeçalho Authorization: Bearer <token>
    const authHeader = request.headers.authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, 'UNAUTHORIZED', 'Credencial de telemetria ausente ou inválida.');
    }
    const rawToken = authHeader.slice(7).trim();
    if (!rawToken) {
      throw new AppError(401, 'UNAUTHORIZED', 'Credencial de telemetria ausente ou inválida.');
    }

    // Proibição expressa de token no corpo JSON
    const body = request.body as Record<string, unknown> | null | undefined;
    if (!body || typeof body !== 'object') {
      throw new AppError(400, 'INVALID_REQUEST', 'Corpo da requisição inválido.');
    }
    if ('rawToken' in body) {
      throw new AppError(
        400,
        'INVALID_REQUEST',
        'Credencial não é permitida no corpo da requisição; utilize o cabeçalho Authorization: Bearer.',
      );
    }

    // 3. Validação preliminar da credencial e resolução de identidade da fonte para rate limiting
    const tokenHash = telemetryTokenHash(rawToken);
    const credRow = store.db
      .prepare(
        `SELECT c.source_id, c.expires_at_ms, c.issued_at_ms, c.revoked_at_ms, s.active AS source_active
         FROM telemetry_credential c
         JOIN telemetry_source s ON s.id = c.source_id
         WHERE c.token_hash = ?`,
      )
      .get(tokenHash) as
      | {
          source_id: string;
          expires_at_ms: number;
          issued_at_ms: number;
          revoked_at_ms: number | null;
          source_active: number;
        }
      | undefined;

    if (!credRow) {
      throw new AppError(401, 'UNAUTHORIZED', 'Credencial de telemetria ausente ou inválida.');
    }
    if (credRow.revoked_at_ms !== null) {
      throw new AppError(401, 'UNAUTHORIZED', 'Credencial de telemetria ausente ou inválida.');
    }

    // Amostragem de relógio confiável para verificação temporal da credencial (C03 D08)
    const sample = clockService.sampleTrustedNow(store.db);
    if (credRow.expires_at_ms <= sample.utcMs || credRow.issued_at_ms > sample.utcMs) {
      throw new AppError(401, 'UNAUTHORIZED', 'Credencial de telemetria ausente ou inválida.');
    }
    if (credRow.source_active !== 1) {
      throw new AppError(403, 'FORBIDDEN', 'Fonte telemétrica desativada.');
    }

    // Validação contextual do dataset e geração ativa
    const datasetContext = store.db
      .prepare(
        `SELECT d.active_epoch, e.status
         FROM dataset d
         JOIN dataset_epoch e ON e.dataset_id = d.id AND e.epoch = ?
         WHERE d.id = ?`,
      )
      .get(epoch, datasetId) as { active_epoch: number; status: string } | undefined;

    if (
      !datasetContext ||
      datasetContext.active_epoch !== epoch ||
      datasetContext.status !== 'ready'
    ) {
      throw new AppError(409, 'EPOCH_CONFLICT', 'Geração obsoleta ou indisponível.');
    }

    // Aplicação da cota de rate limit exclusivamente para a fonte autenticada e autorizada
    checkSourceRateLimit(credRow.source_id, reply);

    // 4. Execução transacional atômica pelo serviço canônico de ingestão
    const result = ingestService.ingest(store.db, {
      commandId: body.commandId as string,
      rawToken,
      datasetId,
      epoch,
      envelope: body.envelope as IngestTelemetryEnvelope,
    });

    // 5. Construção e entrega da resposta HTTP
    reply.header('Cache-Control', 'no-store');
    if (result.headers) {
      for (const [headerName, headerValue] of Object.entries(result.headers)) {
        reply.header(headerName, headerValue);
      }
    }

    return reply.code(200).send(result.body);
  });
}
