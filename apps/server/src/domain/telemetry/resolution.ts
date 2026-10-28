/**
 * PROJECT IGNIS — T0007 / PKG-07
 * Serviço de Resolução Causal, CAS, Avaliação Multicausa e Idempotência (C03-S01..S17).
 */

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { AppError } from '../../errors.js';
import { canonicalJson, hashJson, parseJson } from '../../idempotency/json.js';
import {
  type TrustedClockService,
  C02_MIN_TIMESTAMP_MS,
  C02_MAX_TIMESTAMP_MS,
} from './trusted-clock.js';

export interface ResolveCauseInput {
  readonly commandId: string;
  readonly datasetId: string;
  readonly epoch: number;
  readonly actorId: string;
  readonly resourceId: string;
  readonly causeCode: string;
  readonly completedAtMs: number;
  readonly expectedVersion?: number;
  readonly evidence?: Record<string, unknown>;
}

export interface ResolveCauseBody {
  readonly resolutionId: string;
  readonly resourceId: string;
  readonly causeCode: string;
  readonly completedAtMs: number;
  readonly resultingRevision: number;
  readonly previousOperationalState: string;
  readonly resultingOperationalState: string;
  readonly activeCausesRemaining: string[];
}

export interface ResolveCauseResult {
  readonly status: 200;
  readonly replayed: boolean;
  readonly body: ResolveCauseBody;
  readonly headers: Record<string, string>;
}

export interface TelemetryCauseResolutionServiceOptions {
  readonly clockService: TrustedClockService;
}

export class TelemetryCauseResolutionService {
  private readonly clockService: TrustedClockService;

  constructor(options: TelemetryCauseResolutionServiceOptions) {
    this.clockService = options.clockService;
  }

  /**
   * Executa a resolução causal atômica sob serialização imediata SQLite (BEGIN IMMEDIATE).
   */
  resolveCause(db: Database.Database, input: ResolveCauseInput): ResolveCauseResult {
    // 1. Validação estática dos parâmetros de entrada
    if (!input.commandId || typeof input.commandId !== 'string') {
      throw new AppError(400, 'INVALID_COMMAND_ID', 'commandId é obrigatório.');
    }
    if (!input.datasetId || typeof input.datasetId !== 'string') {
      throw new AppError(400, 'INVALID_DATASET_ID', 'datasetId é obrigatório.');
    }
    if (!Number.isSafeInteger(input.epoch) || input.epoch < 1) {
      throw new AppError(400, 'INVALID_EPOCH', 'epoch deve ser inteiro positivo.');
    }
    if (!input.actorId || typeof input.actorId !== 'string') {
      throw new AppError(400, 'INVALID_ACTOR_ID', 'actorId é obrigatório.');
    }
    if (!input.resourceId || typeof input.resourceId !== 'string') {
      throw new AppError(400, 'INVALID_RESOURCE_ID', 'resourceId é obrigatório.');
    }
    if (
      !input.causeCode ||
      typeof input.causeCode !== 'string' ||
      input.causeCode.length > 256 ||
      input.causeCode.startsWith('initial_')
    ) {
      throw new AppError(
        422,
        'INVALID_CAUSE_CODE',
        'causeCode inválido ou proibido (causas initial_* pertencem exclusivamente ao baseline cadastral).',
      );
    }
    if (
      !Number.isSafeInteger(input.completedAtMs) ||
      input.completedAtMs < C02_MIN_TIMESTAMP_MS ||
      input.completedAtMs > C02_MAX_TIMESTAMP_MS
    ) {
      throw new AppError(422, 'INVALID_TIMESTAMP', 'completedAtMs fora dos limites aceitos.');
    }
    if (
      input.expectedVersion !== undefined &&
      (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1)
    ) {
      throw new AppError(422, 'INVALID_VERSION', 'expectedVersion deve ser inteiro positivo.');
    }

    // 2. Construção canônica RFC 8785 e Hashing SHA-256 para Idempotência Kc
    const canonicalCommand = {
      canonicalVersion: 1,
      datasetId: input.datasetId,
      epoch: input.epoch,
      actorId: input.actorId,
      operation: 'telemetry.cause_resolution.v1',
      target: { type: 'equipment', id: input.resourceId },
      body: {
        causeCode: input.causeCode,
        completedAtMs: input.completedAtMs,
        ...(input.expectedVersion !== undefined ? { expectedVersion: input.expectedVersion } : {}),
        evidence: input.evidence ?? {},
      },
    };
    const { hash: requestHash } = hashJson(canonicalCommand);

    // 3. Execução Atômica serializada (BEGIN IMMEDIATE)
    const runTransaction = db.transaction(() => {
      // 3.1. Deduplicação Kc (command_receipt)
      const existingReceipt = db
        .prepare(
          `SELECT request_hash, response_status, response_body, resulting_revision
           FROM command_receipt
           WHERE dataset_id = ? AND epoch = ? AND actor_id = ? AND operation = 'telemetry.cause_resolution.v1' AND command_id = ?`,
        )
        .get(input.datasetId, input.epoch, input.actorId, input.commandId) as
        | {
            request_hash: string;
            response_status: number;
            response_body: string | null;
            resulting_revision: number | null;
          }
        | undefined;

      if (existingReceipt) {
        if (existingReceipt.request_hash !== requestHash) {
          throw new AppError(
            409,
            'IDEMPOTENCY_CONFLICT',
            'commandId já utilizado com conteúdo divergente.',
          );
        }
        return {
          status: 200 as const,
          replayed: true,
          body: (existingReceipt.response_body
            ? (parseJson(existingReceipt.response_body) as unknown as ResolveCauseBody)
            : ({} as unknown as ResolveCauseBody)),
          headers: { 'Idempotency-Replayed': 'true' },
        };
      }

      // 3.2. Validação contextual do dataset e epoch
      const epochRow = db
        .prepare(
          `SELECT status, revision
           FROM dataset_epoch
           WHERE dataset_id = ? AND epoch = ?`,
        )
        .get(input.datasetId, input.epoch) as { status: string; revision: number } | undefined;

      if (!epochRow || epochRow.status !== 'ready') {
        throw new AppError(409, 'EPOCH_CONFLICT', 'Epoch do dataset não está em estado ready.');
      }

      // 3.3. Validação do ator
      const actorRow = db.prepare('SELECT id FROM actor WHERE id = ?').get(input.actorId);
      if (!actorRow) {
        throw new AppError(500, 'STORAGE_ERROR', 'Ator solicitante não encontrado.');
      }

      // 3.4. Consulta e validação de estado do recurso (CAS)
      const resourceState = db
        .prepare(
          `SELECT r.id, r.kind, s.operational_state, s.version
           FROM resource r
           JOIN current_state s ON s.dataset_id = r.dataset_id AND s.epoch = r.epoch AND s.resource_id = r.id
           WHERE r.dataset_id = ? AND r.epoch = ? AND r.id = ?`,
        )
        .get(input.datasetId, input.epoch, input.resourceId) as
        | { id: string; kind: string; operational_state: string; version: number }
        | undefined;

      if (!resourceState) {
        throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Recurso não encontrado no contexto.');
      }
      if (resourceState.kind !== 'equipment') {
        throw new AppError(422, 'INVALID_RESOURCE_KIND', 'Resolução de causas aplica-se somente a equipamentos.');
      }

      // Guarda CAS: se expectedVersion foi informado, deve bater com o SQLite
      if (
        input.expectedVersion !== undefined &&
        resourceState.version !== input.expectedVersion
      ) {
        throw new AppError(
          409,
          'VERSION_CONFLICT',
          `Versão do estado do recurso (${resourceState.version}) diverge da esperada (${input.expectedVersion}).`,
        );
      }

      // 3.5. Verificação de Monotonia de Corte e Proteção contra Duplicação (C03-S16)
      const maxCutoffRow = db
        .prepare(
          `SELECT max(completed_at_ms) as max_completed_at_ms
           FROM telemetry_cause_resolution
           WHERE dataset_id = ? AND epoch = ? AND resource_id = ? AND cause_code = ?`,
        )
        .get(input.datasetId, input.epoch, input.resourceId, input.causeCode) as
        | { max_completed_at_ms: number | null }
        | undefined;

      if (maxCutoffRow?.max_completed_at_ms !== null && maxCutoffRow?.max_completed_at_ms !== undefined) {
        if (input.completedAtMs < maxCutoffRow.max_completed_at_ms) {
          throw new AppError(
            422,
            'INVALID_RESOLUTION_CUTOFF',
            'Corte de resolução causal não pode retroceder.',
          );
        }
        if (input.completedAtMs === maxCutoffRow.max_completed_at_ms) {
          throw new AppError(
            409,
            'CAUSE_ALREADY_RESOLVED',
            'Causa já se encontra resolvida para este corte temporal.',
          );
        }
      }

      // 3.6. Amostragem Confiável do Relógio Lógico
      const sample = this.clockService.sampleTrustedNow(db);

      // 3.7. Persistência do Fato Causal Imutável em telemetry_cause_resolution
      const resolutionId = randomUUID();
      const evidenceJson = canonicalJson(input.evidence ?? {});

      db.prepare(
        `INSERT INTO telemetry_cause_resolution (
           dataset_id, epoch, id, resource_id, cause_code,
           completed_at_ms, recorded_at_ms, actor_id, evidence_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        input.datasetId,
        input.epoch,
        resolutionId,
        input.resourceId,
        input.causeCode,
        input.completedAtMs,
        sample.utcMs,
        input.actorId,
        evidenceJson,
      );

      // 3.8. Predicado Multicausa: Avaliação de Causas Ativas Remanescentes
      const activeEpisodes = db
        .prepare(
          `SELECT ep.episode_id, ep.cause_code, ep.episode_started_at_ms
           FROM telemetry_episode ep
           LEFT JOIN (
             SELECT cause_code, max(completed_at_ms) AS max_completed_at_ms
             FROM telemetry_cause_resolution
             WHERE dataset_id = ? AND epoch = ? AND resource_id = ?
             GROUP BY cause_code
           ) res ON res.cause_code = ep.cause_code
           WHERE ep.dataset_id = ? AND ep.epoch = ? AND ep.resource_id = ?
             AND (res.max_completed_at_ms IS NULL OR ep.episode_started_at_ms > res.max_completed_at_ms)`,
        )
        .all(input.datasetId, input.epoch, input.resourceId, input.datasetId, input.epoch, input.resourceId) as {
        episode_id: string;
        cause_code: string;
        episode_started_at_ms: number;
      }[];

      const activeCausesRemaining = [...new Set(activeEpisodes.map((r) => r.cause_code))];

      // 3.9. Transição e Preservação de Estado Operacional
      const previousOperationalState = resourceState.operational_state;
      let resultingOperationalState = previousOperationalState;

      // Equipamentos em estados administrativos bloqueantes nunca são desbloqueados por resolução causal (C03-S17)
      if (['not_installed', 'disabled', 'stolen'].includes(previousOperationalState)) {
        resultingOperationalState = previousOperationalState;
      } else if (
        previousOperationalState === 'malfunction' ||
        previousOperationalState === 'maintenance'
      ) {
        // Retorna a operational exclusivamente se não restar nenhuma causa ativa (C03-S11)
        if (activeCausesRemaining.length === 0) {
          resultingOperationalState = 'operational';
          db.prepare(
            `UPDATE current_state
             SET operational_state = 'operational', version = version + 1
             WHERE dataset_id = ? AND epoch = ? AND resource_id = ?`,
          ).run(input.datasetId, input.epoch, input.resourceId);
        } else {
          resultingOperationalState = previousOperationalState;
        }
      }

      // 3.10. Avanço Atômico de Revisão do Dataset
      const revRow = db
        .prepare(
          `UPDATE dataset_epoch
           SET revision = revision + 1
           WHERE dataset_id = ? AND epoch = ?
           RETURNING revision`,
        )
        .get(input.datasetId, input.epoch) as { revision: number } | undefined;

      if (!revRow) {
        throw new AppError(500, 'STORAGE_ERROR', 'Falha ao avançar revisão do dataset.');
      }
      const resultingRevision = revRow.revision;

      // 3.11. Avanço Durável do Relógio Confiável
      this.clockService.advanceDurable(db, sample);

      // 3.12. Construção Canônica da Resposta e Gravação em command_receipt
      const responseBody: ResolveCauseBody = {
        resolutionId,
        resourceId: input.resourceId,
        causeCode: input.causeCode,
        completedAtMs: input.completedAtMs,
        resultingRevision,
        previousOperationalState,
        resultingOperationalState,
        activeCausesRemaining,
      };
      const responseJson = canonicalJson(responseBody);

      db.prepare(
        `INSERT INTO command_receipt (
           dataset_id, epoch, actor_id, operation, command_id,
           canonical_version, request_hash, response_status,
           response_body, resulting_revision
         ) VALUES (?, ?, ?, 'telemetry.cause_resolution.v1', ?, 1, ?, 200, ?, ?)`,
      ).run(
        input.datasetId,
        input.epoch,
        input.actorId,
        input.commandId,
        requestHash,
        responseJson,
        resultingRevision,
      );

      return {
        status: 200 as const,
        replayed: false,
        body: responseBody,
        headers: {},
      };
    });

    return runTransaction.immediate();
  }
}
