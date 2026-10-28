/**
 * PROJECT IGNIS — T0007 / PKG-05
 * Serviço de Ingestão Telemétrica Canônica e Deduplicação (C03, C02, D08).
 * Orquestra autenticação atômica, resolução de bindings, deduplicação em 3 níveis (Kc, Ke, Ks),
 * amostragem temporal única e coordenação de transação com hook interno confiável.
 */

import type Database from 'better-sqlite3';
import { AppError } from '../../errors.js';
import { canonicalJson, parseJson } from '../../idempotency/json.js';
import { transaction } from '../../persistence/store.js';
import {
  type AuthenticatedSourceContext,
  TelemetryAuthService,
} from './auth.js';
import {
  type ActiveTelemetryBinding,
  TelemetryBindingService,
} from './binding.js';
import {
  type CanonicalEvent,
  buildCanonicalCommand,
  buildCanonicalEvent,
  extractCanonicalValues,
  normalizeOccurredAt,
} from './canonical.js';
import {
  type RawObservationEnvelope,
  type TrustedResourceMetadata,
  type ValidatedTelemetryObservation,
  TelemetryProfileValidator,
} from './profile.js';
import {
  type ObservationWindowEvaluation,
  TrustedClockService,
  WindowEvaluationStatus,
} from './trusted-clock.js';

export interface IngestTelemetryEnvelope {
  readonly eventId: string;
  readonly eventType?: string;
  readonly schemaVersion?: number;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly resourceId: string;
  readonly channel: string;
  readonly sequence: number;
  readonly observationType: string;
  readonly occurredAt: string | number;
  readonly causationId?: string | null;
  readonly units?: string | null;
  readonly values: Record<string, unknown>;
}

export interface IngestTelemetryInput {
  readonly commandId: string;
  readonly rawToken: string;
  readonly datasetId: string;
  readonly epoch: number;
  readonly envelope: IngestTelemetryEnvelope;
}

export interface PipelineHookContext {
  readonly db: Database.Database;
  readonly datasetId: string;
  readonly epoch: number;
  readonly auth: AuthenticatedSourceContext;
  readonly binding: ActiveTelemetryBinding;
  readonly canonicalEvent: CanonicalEvent;
  readonly windowEvaluation: ObservationWindowEvaluation;
  readonly rawObservation: RawObservationEnvelope;
  readonly validatedObservation: ValidatedTelemetryObservation;
}

export interface CursorEffect {
  readonly advanced: boolean;
  readonly sequence: number;
  readonly maxOccurredAtMs?: number | null;
  readonly projectedEffectiveAtMs?: number | null;
}

export interface CommunicationEffect {
  readonly projected: true;
  readonly resourceId: string;
  readonly sourceId: string;
  readonly eventId: string;
  readonly channel: string;
  readonly observedAtMs: number;
}

export interface PositionEffect {
  readonly projected: true;
  readonly resourceId: string;
  readonly sourceId: string;
  readonly eventId: string;
  readonly channel: string;
  readonly observedAtMs: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyM: number | null;
  readonly regionId: string | null;
}

export interface EpisodeEffect {
  readonly created: boolean;
  readonly episodeId: string;
  readonly causeCode: string;
  readonly episodeStartedAtMs: number;
}

export interface TelemetryEffects {
  readonly cursor: CursorEffect;
  readonly communication?: CommunicationEffect;
  readonly position?: PositionEffect;
  readonly episode?: EpisodeEffect;
  readonly operationalProjection: boolean;
}

export interface PipelineHookResult {
  readonly disposition: 'applied' | 'historical' | 'ignored';
  readonly effects: TelemetryEffects | Record<string, unknown>;
  readonly reasonCode: string;
  readonly episode?: {
    readonly episodeId: string;
    readonly causeCode: string;
    readonly episodeStartedAtMs: number;
  };
  readonly additionalResponseBody?: Record<string, unknown>;
}

export interface TelemetryPipelineHook {
  evaluateAndProject(context: PipelineHookContext): PipelineHookResult;
  project(context: PipelineHookContext, result: PipelineHookResult): void;
}

export interface IngestTelemetryResult {
  readonly status: 200;
  readonly replayed: boolean;
  readonly body: {
    readonly eventId: string;
    readonly disposition: 'applied' | 'historical' | 'ignored';
    readonly resultingRevision: number;
    readonly appliedAt?: string;
    [key: string]: unknown;
  };
  readonly headers: Record<string, string>;
}

export interface CanonicalTelemetryIngestServiceOptions {
  readonly clockService?: TrustedClockService | undefined;
  readonly authService?: TelemetryAuthService | undefined;
  readonly bindingService?: TelemetryBindingService | undefined;
  readonly profileValidator?: TelemetryProfileValidator | undefined;
  readonly pipelineHook?: TelemetryPipelineHook | undefined;
}

export class CanonicalTelemetryIngestService {
  private readonly clockService: TrustedClockService;
  private readonly authService: TelemetryAuthService;
  private readonly bindingService: TelemetryBindingService;
  private readonly profileValidator: TelemetryProfileValidator;
  private readonly pipelineHook: TelemetryPipelineHook | undefined;

  constructor(options?: CanonicalTelemetryIngestServiceOptions) {
    this.clockService = options?.clockService ?? new TrustedClockService({ now: () => Date.now() });
    this.authService = options?.authService ?? new TelemetryAuthService({ clockService: this.clockService });
    this.bindingService = options?.bindingService ?? new TelemetryBindingService();
    this.profileValidator = options?.profileValidator ?? new TelemetryProfileValidator();
    if (options?.pipelineHook && typeof options.pipelineHook.project !== 'function') {
      throw new AppError(500, 'PIPELINE_HOOK_INCOMPLETE', 'Pipeline hook deve implementar o método obrigatório project.');
    }
    this.pipelineHook = options?.pipelineHook;
  }

  /**
   * Ingestão transacional atômica de telemetria.
   */
  ingest(db: Database.Database, input: IngestTelemetryInput): IngestTelemetryResult {
    // 1. Validação estrutural de entrada (pré-transação)
    if (!input || typeof input !== 'object') {
      throw new AppError(400, 'INVALID_REQUEST', 'Corpo da requisição de ingestão inválido.');
    }
    const { commandId, rawToken, datasetId, epoch, envelope } = input;
    if (!commandId || typeof commandId !== 'string' || commandId.trim().length === 0) {
      throw new AppError(400, 'INVALID_REQUEST', 'commandId inválido ou ausente.');
    }
    if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
      throw new AppError(401, 'UNAUTHORIZED', 'rawToken inválido ou ausente.');
    }
    if (!datasetId || typeof datasetId !== 'string') {
      throw new AppError(400, 'INVALID_REQUEST', 'datasetId inválido.');
    }
    if (typeof epoch !== 'number' || !Number.isSafeInteger(epoch) || epoch < 1) {
      throw new AppError(400, 'INVALID_REQUEST', 'epoch inválido.');
    }
    if (!envelope || typeof envelope !== 'object') {
      throw new AppError(422, 'INVALID_VALUE', 'Envelope de telemetria ausente ou inválido.');
    }
    if (!envelope.eventId || typeof envelope.eventId !== 'string') {
      throw new AppError(422, 'INVALID_VALUE', 'eventId inválido.');
    }
    if (typeof envelope.sequence !== 'number' || !Number.isSafeInteger(envelope.sequence) || envelope.sequence < 0) {
      throw new AppError(422, 'INVALID_VALUE', 'sequence deve ser inteiro não negativo.');
    }
    if (!envelope.resourceId || typeof envelope.resourceId !== 'string') {
      throw new AppError(422, 'INVALID_VALUE', 'resourceId inválido.');
    }
    if (!envelope.channel || typeof envelope.channel !== 'string') {
      throw new AppError(422, 'INVALID_VALUE', 'channel inválido.');
    }
    if (envelope.entityId !== undefined && envelope.entityId !== envelope.resourceId) {
      throw new AppError(422, 'INVALID_VALUE', 'entityId diverge do resourceId.');
    }
    if (envelope.schemaVersion !== undefined && envelope.schemaVersion !== 1) {
      throw new AppError(422, 'INVALID_VALUE', `schemaVersion não suportada: ${envelope.schemaVersion}`);
    }
    if (envelope.eventType !== undefined && envelope.eventType !== 'TelemetryEvent') {
      throw new AppError(422, 'INVALID_VALUE', `eventType inválido: ${envelope.eventType}`);
    }
    if (envelope.causationId !== undefined && envelope.causationId !== null && typeof envelope.causationId !== 'string') {
      throw new AppError(422, 'INVALID_VALUE', 'causationId deve ser string ou null.');
    }
    if (typeof envelope.causationId === 'string' && envelope.causationId.length > 256) {
      throw new AppError(422, 'INVALID_VALUE', 'causationId excede 256 caracteres.');
    }
    if (envelope.units !== undefined && envelope.units !== null && typeof envelope.units !== 'string') {
      throw new AppError(422, 'INVALID_VALUE', 'units deve ser string ou null.');
    }
    if (typeof envelope.units === 'string' && envelope.units.length > 256) {
      throw new AppError(422, 'INVALID_VALUE', 'units excede 256 caracteres.');
    }

    // Normalização estrita do timestamp de ocorrência
    const { occurredAtMs, occurredAtISO } = normalizeOccurredAt(envelope.occurredAt);

    // 2. Execução sob transação atômica
    const executeInTransaction = (): IngestTelemetryResult => {
      // 2.1. Amostragem temporal confiável única (D08)
      const sample = this.clockService.sampleTrustedNow(db);

      // 2.2. Autenticação e revalidação de segurança sob lock com amostra única
      const auth = this.authService.authenticateSource(db, rawToken, datasetId, epoch, sample);
      this.authService.assertSourceAuthorizedInTx(db, auth, rawToken, sample);

      // 2.3. Resolução e revalidação de binding sob lock
      const binding = this.bindingService.assertBindingActiveInTx(db, auth, envelope.resourceId, envelope.channel);
      if (envelope.entityType !== undefined && envelope.entityType !== binding.resourceKind) {
        throw new AppError(422, 'INVALID_VALUE', 'entityType diverge do resourceKind do binding.');
      }

      // 2.4. Consulta de metadados relacionais para ACH-001
      let trustedResource: TrustedResourceMetadata;
      if (binding.resourceKind === 'equipment') {
        const equipRow = db
          .prepare(
            `SELECT category_code, category_version, mobility
             FROM equipment
             WHERE dataset_id = ? AND epoch = ? AND id = ?`,
          )
          .get(auth.datasetId, auth.epoch, binding.resourceId) as
          | { category_code: string; category_version: number; mobility: 'fixed' | 'mobile' }
          | undefined;

        if (!equipRow) {
          throw new AppError(422, 'INVALID_VALUE', 'Equipamento referenciado no binding não encontrado.');
        }

        trustedResource = {
          resourceId: binding.resourceId,
          resourceKind: 'equipment',
          categoryCode: equipRow.category_code,
          categoryVersion: equipRow.category_version,
          mobility: equipRow.mobility,
        };
      } else {
        const agentRow = db
          .prepare(
            `SELECT id
             FROM agent
             WHERE dataset_id = ? AND epoch = ? AND id = ?`,
          )
          .get(auth.datasetId, auth.epoch, binding.resourceId) as { id: string } | undefined;

        if (!agentRow) {
          throw new AppError(422, 'INVALID_VALUE', 'Agente referenciado no binding não encontrado.');
        }

        trustedResource = {
          resourceId: binding.resourceId,
          resourceKind: 'agent',
        };
      }

      // Validação pura e estrita de perfil telemétrico
      const rawEnv: RawObservationEnvelope = {
        channel: envelope.channel,
        observationType: envelope.observationType,
        occurredAtMs,
        values: envelope.values,
      };
      const validatedObs = this.profileValidator.validate(binding, rawEnv, trustedResource);

      // 2.5. Construção dos objetos canônicos e hashes
      const canonicalValues = extractCanonicalValues(validatedObs.values);
      const ce = buildCanonicalEvent({
        datasetId: auth.datasetId,
        epoch: auth.epoch,
        sourceId: auth.sourceId,
        sourceKind: auth.sourceKind,
        resourceKind: binding.resourceKind,
        envelope,
        canonicalValues,
        occurredAtISO,
      });

      const cc = buildCanonicalCommand({
        datasetId: auth.datasetId,
        epoch: auth.epoch,
        actorId: auth.principalId,
        canonicalEvent: ce.canonical,
      });

      // 2.6. Deduplicação — Verificação 1: Kc (telemetry_command_receipt)
      const existingReceipt = db
        .prepare(
          `SELECT request_hash, event_id, response_status, response_body, resulting_revision
           FROM telemetry_command_receipt
           WHERE dataset_id = ? AND epoch = ? AND actor_id = ? AND operation = 'telemetry.ingest.v1' AND command_id = ?`,
        )
        .get(auth.datasetId, auth.epoch, auth.principalId, commandId) as
        | {
            request_hash: string;
            event_id: string;
            response_status: number;
            response_body: string;
            resulting_revision: number;
          }
        | undefined;

      if (existingReceipt) {
        if (existingReceipt.request_hash !== cc.requestHash) {
          throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Chave de comando já utilizada com conteúdo divergente.');
        }
        return {
          status: 200,
          replayed: true,
          body: parseJson(existingReceipt.response_body) as IngestTelemetryResult['body'],
          headers: { 'Idempotency-Replayed': 'true' },
        };
      }

      // 2.7. Deduplicação — Verificação 2: Ke (telemetry_event)
      const existingEvent = db
        .prepare(
          `SELECT event_hash, response_status, response_body, resulting_revision
           FROM telemetry_event
           WHERE dataset_id = ? AND epoch = ? AND source_id = ? AND event_id = ?`,
        )
        .get(auth.datasetId, auth.epoch, auth.sourceId, envelope.eventId) as
        | {
            event_hash: string;
            response_status: number;
            response_body: string;
            resulting_revision: number;
          }
        | undefined;

      if (existingEvent) {
        if (existingEvent.event_hash !== ce.eventHash) {
          throw new AppError(409, 'EVENT_CONFLICT', 'Identificador de evento já utilizado com conteúdo divergente.');
        }

        // Ke equivalente com novo commandId: persiste apenas novo recibo Kc
        db.prepare(
          `INSERT INTO telemetry_command_receipt (
             dataset_id, epoch, actor_id, operation, command_id,
             source_id, event_id, canonical_version, request_hash,
             response_status, response_body, resulting_revision
           ) VALUES (?, ?, ?, 'telemetry.ingest.v1', ?, ?, ?, 1, ?, ?, ?, ?)`,
        ).run(
          auth.datasetId,
          auth.epoch,
          auth.principalId,
          commandId,
          auth.sourceId,
          envelope.eventId,
          cc.requestHash,
          existingEvent.response_status,
          existingEvent.response_body,
          existingEvent.resulting_revision,
        );

        return {
          status: 200,
          replayed: true,
          body: parseJson(existingEvent.response_body) as IngestTelemetryResult['body'],
          headers: {},
        };
      }

      // 2.8. Deduplicação — Verificação 3: Ks (telemetry_sequence_slot)
      const existingSlot = db
        .prepare(
          `SELECT event_id
           FROM telemetry_sequence_slot
           WHERE dataset_id = ? AND epoch = ? AND source_id = ? AND resource_id = ? AND channel = ? AND sequence = ?`,
        )
        .get(auth.datasetId, auth.epoch, auth.sourceId, envelope.resourceId, envelope.channel, envelope.sequence) as
        | { event_id: string }
        | undefined;

      if (existingSlot) {
        throw new AppError(409, 'SEQUENCE_SLOT_COLLISION', 'Slot de sequência já ocupado por outro evento.');
      }

      // 2.9. Avaliação da janela temporal de observação (D08)
      const windowEval = this.clockService.evaluateObservationWindow(occurredAtMs, sample.utcMs);
      if (windowEval.status === WindowEvaluationStatus.EXCESSIVE_FUTURE_REJECTED) {
        throw new AppError(422, 'EXCESSIVE_FUTURE', windowEval.message ?? 'Evento excede tolerância de futuro.');
      }

      // 2.10. Execução obrigatória do Hook de Pipeline Transacional
      if (!this.pipelineHook) {
        throw new AppError(500, 'PIPELINE_HOOK_REQUIRED', 'Pipeline hook transacional obrigatório não configurado.');
      }
      if (typeof this.pipelineHook.project !== 'function') {
        throw new AppError(500, 'PIPELINE_HOOK_INCOMPLETE', 'Pipeline hook deve implementar o método obrigatório project.');
      }

      const hookContext: PipelineHookContext = {
        db,
        datasetId: auth.datasetId,
        epoch: auth.epoch,
        auth,
        binding,
        canonicalEvent: ce.canonical,
        windowEvaluation: windowEval,
        rawObservation: rawEnv,
        validatedObservation: validatedObs,
      };

      const hookResult = this.pipelineHook.evaluateAndProject(hookContext);

      if (
        !hookResult ||
        typeof hookResult !== 'object' ||
        !['applied', 'historical', 'ignored'].includes(hookResult.disposition) ||
        !hookResult.effects ||
        typeof hookResult.effects !== 'object' ||
        !hookResult.reasonCode ||
        typeof hookResult.reasonCode !== 'string'
      ) {
        throw new AppError(500, 'INVALID_HOOK_RESULT', 'Resultado do pipeline hook inválido.');
      }

      // 2.11. Coordenação de revisão do dataset
      const revRow = db
        .prepare(
          `UPDATE dataset_epoch
           SET revision = revision + 1
           WHERE dataset_id = ? AND epoch = ?
           RETURNING revision`,
        )
        .get(auth.datasetId, auth.epoch) as { revision: number } | undefined;

      if (!revRow) {
        throw new AppError(500, 'STORAGE_ERROR', 'Falha ao incrementar revisão do dataset.');
      }
      const resultingRevision = revRow.revision;

      // 2.12. Construção do corpo canônico de resposta
      const responsePayload: Record<string, unknown> = {
        eventId: envelope.eventId,
        disposition: hookResult.disposition,
        resultingRevision,
        ...(hookResult.disposition === 'applied' && windowEval.observationEffectiveAtMs !== null
          ? { appliedAt: new Date(windowEval.observationEffectiveAtMs).toISOString() }
          : {}),
        ...(hookResult.additionalResponseBody ?? {}),
      };
      const responseJson = canonicalJson(responsePayload);

      // Determinação de is_simulated baseada no kind do dataset
      const datasetRow = db.prepare('SELECT kind FROM dataset WHERE id = ?').get(auth.datasetId) as { kind: string };
      const isSimulated = datasetRow?.kind === 'demo' ? 1 : 0;

      // 2.13. Persistência atômica na ordem relacional de integridade
      // DML 1: telemetry_sequence_slot (FK para telemetry_event é diferida)
      db.prepare(
        `INSERT INTO telemetry_sequence_slot (
           dataset_id, epoch, source_id, resource_id, channel, sequence, event_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        auth.datasetId,
        auth.epoch,
        auth.sourceId,
        envelope.resourceId,
        envelope.channel,
        envelope.sequence,
        envelope.eventId,
      );

      // Tratamento de campos de episódio causal para falhas
      const isFault = ['fault_detected', 'fault_cleared'].includes(envelope.observationType);
      const episodeId = isFault ? (hookResult.episode?.episodeId ?? (validatedObs.values as any).episodeId) : null;
      const causeCode = isFault ? (hookResult.episode?.causeCode ?? (validatedObs.values as any).causeCode) : null;
      const episodeStartedAtMs = isFault
        ? (hookResult.episode?.episodeStartedAtMs ?? (validatedObs.values as any).episodeStartedAtMs)
        : null;

      // DML 2: telemetry_event
      db.prepare(
        `INSERT INTO telemetry_event (
           dataset_id, epoch, source_id, event_id, resource_id, channel, binding_id,
           sequence, observation_type, canonical_version, event_hash, canonical_json,
           occurred_at_ms, received_at_ms, recorded_at_ms, observation_effective_at_ms,
           is_simulated, episode_id, cause_code, episode_started_at_ms,
           disposition, effects_json, reason_code, resulting_revision,
           response_status, response_body
         ) VALUES (
           ?, ?, ?, ?, ?, ?, ?,
           ?, ?, 1, ?, ?,
           ?, ?, ?, ?,
           ?, ?, ?, ?,
           ?, ?, ?, ?,
           200, ?
         )`,
      ).run(
        auth.datasetId,
        auth.epoch,
        auth.sourceId,
        envelope.eventId,
        envelope.resourceId,
        envelope.channel,
        binding.bindingId,
        envelope.sequence,
        envelope.observationType,
        ce.eventHash,
        ce.canonicalJson,
        occurredAtMs,
        sample.utcMs,
        sample.utcMs,
        windowEval.observationEffectiveAtMs!,
        isSimulated,
        episodeId,
        causeCode,
        episodeStartedAtMs,
        hookResult.disposition,
        canonicalJson(hookResult.effects),
        hookResult.reasonCode,
        resultingRevision,
        responseJson,
      );

      // DML 3: telemetry_command_receipt (trigger verifica que telemetry_event existe com mesmo response_body)
      db.prepare(
        `INSERT INTO telemetry_command_receipt (
           dataset_id, epoch, actor_id, operation, command_id,
           source_id, event_id, canonical_version, request_hash,
           response_status, response_body, resulting_revision
         ) VALUES (
           ?, ?, ?, 'telemetry.ingest.v1', ?,
           ?, ?, 1, ?,
           200, ?, ?
         )`,
      ).run(
        auth.datasetId,
        auth.epoch,
        auth.principalId,
        commandId,
        auth.sourceId,
        envelope.eventId,
        cc.requestHash,
        responseJson,
        resultingRevision,
      );

      // DML 4 (Fase 2): Execução obrigatória das projeções pós-evento
      this.pipelineHook.project(hookContext, hookResult);

      // 2.14. Avanço durável do relógio lógico (D08)
      // Somente avança se status for VALID_ACCEPTED; suprime se TOLERATED_FUTURE
      if (windowEval.status === WindowEvaluationStatus.VALID_ACCEPTED) {
        this.clockService.advanceDurable(db, sample);
      }

      return {
        status: 200,
        replayed: false,
        body: responsePayload as IngestTelemetryResult['body'],
        headers: {},
      };
    };

    if (db.inTransaction) {
      return executeInTransaction();
    }
    return transaction(db, executeInTransaction);
  }
}
