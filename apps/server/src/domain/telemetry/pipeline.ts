/**
 * PROJECT IGNIS — T0007 / PKG-06
 * Default Telemetry Pipeline Hook and Two-Phase Transactional Projections.
 */

import Database from 'better-sqlite3';
import { AppError } from '../../errors.js';
import { classifyPointInDataset } from '../../operations/regions.js';
import type {
  PipelineHookContext,
  PipelineHookResult,
  TelemetryPipelineHook,
  TelemetryEffects,
  CursorEffect,
  CommunicationEffect,
  PositionEffect,
  EpisodeEffect,
} from './ingest.js';

export type {
  PipelineHookContext,
  PipelineHookResult,
  TelemetryPipelineHook,
  TelemetryEffects,
  CursorEffect,
  CommunicationEffect,
  PositionEffect,
  EpisodeEffect,
};

const ALLOWED_ROOT_KEYS = new Set(['cursor', 'communication', 'position', 'episode', 'operationalProjection']);
const ALLOWED_CURSOR_KEYS = new Set(['advanced', 'sequence', 'maxOccurredAtMs', 'projectedEffectiveAtMs']);
const ALLOWED_COMM_KEYS = new Set(['projected', 'resourceId', 'sourceId', 'eventId', 'channel', 'observedAtMs']);
const ALLOWED_POS_KEYS = new Set([
  'projected',
  'resourceId',
  'sourceId',
  'eventId',
  'channel',
  'observedAtMs',
  'latitude',
  'longitude',
  'accuracyM',
  'regionId',
]);
const ALLOWED_EPISODE_KEYS = new Set(['created', 'episodeId', 'causeCode', 'episodeStartedAtMs']);

function validateClosedKeys(obj: Record<string, unknown>, allowedKeys: Set<string>, contextName: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', `Propriedade desconhecida '${key}' em '${contextName}'.`);
    }
  }
}

/**
 * Validação rigorosa em runtime do schema fechado e campos obrigatórios de TelemetryEffects (FIX-01B, FIX-01C).
 */
export function validateEffectsStrict(
  effects: unknown,
  disposition: 'applied' | 'historical' | 'ignored',
  observationType: string,
): TelemetryEffects {
  if (!effects || typeof effects !== 'object' || Array.isArray(effects)) {
    throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'Efeitos de telemetria ausentes ou não são objeto.');
  }

  const raw = effects as Record<string, unknown>;
  validateClosedKeys(raw, ALLOWED_ROOT_KEYS, 'effects');

  // 1. operationalProjection obrigatório e booleano
  if (typeof raw.operationalProjection !== 'boolean') {
    throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'operationalProjection obrigatório e deve ser booleano.');
  }

  // 2. cursor obrigatório e estruturalmente válido
  if (!raw.cursor || typeof raw.cursor !== 'object' || Array.isArray(raw.cursor)) {
    throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'Efeito de cursor obrigatório e deve ser objeto.');
  }

  const cursor = raw.cursor as Record<string, unknown>;
  validateClosedKeys(cursor, ALLOWED_CURSOR_KEYS, 'effects.cursor');

  if (typeof cursor.advanced !== 'boolean') {
    throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'cursor.advanced deve ser booleano.');
  }
  if (typeof cursor.sequence !== 'number' || !Number.isSafeInteger(cursor.sequence) || cursor.sequence < 0) {
    throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'cursor.sequence deve ser inteiro não negativo.');
  }
  if (
    cursor.maxOccurredAtMs !== undefined &&
    cursor.maxOccurredAtMs !== null &&
    (typeof cursor.maxOccurredAtMs !== 'number' || !Number.isSafeInteger(cursor.maxOccurredAtMs))
  ) {
    throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'cursor.maxOccurredAtMs inválido.');
  }
  if (
    cursor.projectedEffectiveAtMs !== undefined &&
    cursor.projectedEffectiveAtMs !== null &&
    (typeof cursor.projectedEffectiveAtMs !== 'number' || !Number.isSafeInteger(cursor.projectedEffectiveAtMs))
  ) {
    throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'cursor.projectedEffectiveAtMs inválido.');
  }

  // 3. Projeção de Comunicação
  if (raw.communication !== undefined) {
    if (!raw.communication || typeof raw.communication !== 'object' || Array.isArray(raw.communication)) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'effects.communication deve ser objeto.');
    }
    const comm = raw.communication as Record<string, unknown>;
    validateClosedKeys(comm, ALLOWED_COMM_KEYS, 'effects.communication');
    if (comm.projected !== true) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'communication.projected deve ser true.');
    }
    if (typeof comm.resourceId !== 'string' || !comm.resourceId.trim()) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'communication.resourceId inválido.');
    }
    if (typeof comm.sourceId !== 'string' || !comm.sourceId.trim()) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'communication.sourceId inválido.');
    }
    if (typeof comm.eventId !== 'string' || !comm.eventId.trim()) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'communication.eventId inválido.');
    }
    if (typeof comm.channel !== 'string' || !comm.channel.trim()) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'communication.channel inválido.');
    }
    if (typeof comm.observedAtMs !== 'number' || !Number.isSafeInteger(comm.observedAtMs)) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'communication.observedAtMs inválido.');
    }
  }

  // 4. Projeção de Posição
  if (raw.position !== undefined) {
    if (!raw.position || typeof raw.position !== 'object' || Array.isArray(raw.position)) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'effects.position deve ser objeto.');
    }
    const pos = raw.position as Record<string, unknown>;
    validateClosedKeys(pos, ALLOWED_POS_KEYS, 'effects.position');
    if (pos.projected !== true) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'position.projected deve ser true.');
    }
    if (typeof pos.resourceId !== 'string' || !pos.resourceId.trim()) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'position.resourceId inválido.');
    }
    if (typeof pos.sourceId !== 'string' || !pos.sourceId.trim()) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'position.sourceId inválido.');
    }
    if (typeof pos.eventId !== 'string' || !pos.eventId.trim()) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'position.eventId inválido.');
    }
    if (typeof pos.channel !== 'string' || !pos.channel.trim()) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'position.channel inválido.');
    }
    if (typeof pos.observedAtMs !== 'number' || !Number.isSafeInteger(pos.observedAtMs)) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'position.observedAtMs inválido.');
    }
    if (typeof pos.latitude !== 'number' || pos.latitude < -90 || pos.latitude > 90) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'position.latitude inválido.');
    }
    if (typeof pos.longitude !== 'number' || pos.longitude < -180 || pos.longitude > 180) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'position.longitude inválido.');
    }
    if (
      pos.accuracyM !== undefined &&
      pos.accuracyM !== null &&
      (typeof pos.accuracyM !== 'number' || pos.accuracyM < 0)
    ) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'position.accuracyM inválido.');
    }
    if (pos.regionId !== undefined && pos.regionId !== null && typeof pos.regionId !== 'string') {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'position.regionId inválido.');
    }
  }

  // 5. Projeção de Episódio
  if (raw.episode !== undefined) {
    if (!raw.episode || typeof raw.episode !== 'object' || Array.isArray(raw.episode)) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'effects.episode deve ser objeto.');
    }
    const ep = raw.episode as Record<string, unknown>;
    validateClosedKeys(ep, ALLOWED_EPISODE_KEYS, 'effects.episode');
    if (typeof ep.created !== 'boolean') {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'episode.created deve ser booleano.');
    }
    if (typeof ep.episodeId !== 'string' || !ep.episodeId.trim()) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'episode.episodeId inválido.');
    }
    if (typeof ep.causeCode !== 'string' || !ep.causeCode.trim()) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'episode.causeCode inválido.');
    }
    if (typeof ep.episodeStartedAtMs !== 'number' || !Number.isSafeInteger(ep.episodeStartedAtMs)) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'episode.episodeStartedAtMs inválido.');
    }
  }

  // 6. Regras de correspondência entre disposition e efeitos operacionais
  if (disposition === 'applied') {
    if (observationType === 'heartbeat' && !raw.communication) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'Observação heartbeat aplicada exige efeito de comunicação.');
    }
    if (observationType === 'position' && !raw.position) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'Observação de posição aplicada exige efeito de posição.');
    }
    if (['fault_detected', 'fault_cleared'].includes(observationType) && !raw.episode) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'Observação de falha aplicada exige efeito de episódio.');
    }
  } else {
    if (raw.communication !== undefined) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', `Disposição '${disposition}' não pode projetar comunicação.`);
    }
    if (raw.position !== undefined) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', `Disposição '${disposition}' não pode projetar posição.`);
    }
    if (raw.operationalProjection !== false) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', `Disposição '${disposition}' exige operationalProjection = false.`);
    }
  }

  return raw as unknown as TelemetryEffects;
}

/**
 * Validação rigorosa em transação da consistência entre efeitos declarados e estado físico no SQLite (GATE-02).
 * Lança AppError(500, 'PROJECTION_INCONSISTENCY') ao menor descompasso, provocando ROLLBACK integral.
 */
export function assertProjectedStateConsistent(
  db: Database.Database,
  context: PipelineHookContext,
  result: PipelineHookResult,
): void {
  const { datasetId, epoch, auth, canonicalEvent } = context;
  const effects = validateEffectsStrict(
    result.effects,
    result.disposition,
    canonicalEvent.payload.observationType,
  );

  const { resourceId, channel } = canonicalEvent.payload;

  // 1. Verificação do Cursor do Canal
  const curRow = db
    .prepare(
      `SELECT max_sequence_seen, max_occurred_at_ms, projected_effective_at_ms
       FROM telemetry_channel_cursor
       WHERE dataset_id = ? AND epoch = ? AND source_id = ? AND resource_id = ? AND channel = ?`,
    )
    .get(datasetId, epoch, auth.sourceId, resourceId, channel) as
    | {
        max_sequence_seen: number;
        max_occurred_at_ms: number | null;
        projected_effective_at_ms: number | null;
      }
    | undefined;

  if (!curRow) {
    throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'Linha de cursor esperada não existe no SQLite.');
  }

  if (effects.cursor.advanced) {
    if (curRow.max_sequence_seen < effects.cursor.sequence) {
      throw new AppError(
        500,
        'PROJECTION_INCONSISTENCY',
        'max_sequence_seen no cursor menor que a sequência declarada.',
      );
    }
    if (effects.cursor.maxOccurredAtMs !== null && effects.cursor.maxOccurredAtMs !== undefined) {
      if (curRow.max_occurred_at_ms === null || curRow.max_occurred_at_ms < effects.cursor.maxOccurredAtMs) {
        throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'max_occurred_at_ms no cursor inconsistente com efeito.');
      }
    }
    if (effects.cursor.projectedEffectiveAtMs !== null && effects.cursor.projectedEffectiveAtMs !== undefined) {
      if (
        curRow.projected_effective_at_ms === null ||
        curRow.projected_effective_at_ms < effects.cursor.projectedEffectiveAtMs
      ) {
        throw new AppError(
          500,
          'PROJECTION_INCONSISTENCY',
          'projected_effective_at_ms no cursor inconsistente com efeito.',
        );
      }
    }
  }

  // 2. Verificação de Projeção de Comunicação
  if (effects.communication) {
    const commRow = db
      .prepare(
        `SELECT source_id, event_id, channel, observed_at_ms
         FROM telemetry_communication_observation
         WHERE dataset_id = ? AND epoch = ? AND resource_id = ?`,
      )
      .get(datasetId, epoch, effects.communication.resourceId) as
      | {
          source_id: string;
          event_id: string;
          channel: string;
          observed_at_ms: number;
        }
      | undefined;

    if (
      !commRow ||
      commRow.event_id !== effects.communication.eventId ||
      commRow.observed_at_ms !== effects.communication.observedAtMs
    ) {
      throw new AppError(
        500,
        'PROJECTION_INCONSISTENCY',
        'Projeção física de comunicação não corresponde ao efeito declarado.',
      );
    }
  } else {
    // Garantir que nenhuma observação de comunicação aponte para este evento
    const commRow = db
      .prepare(
        `SELECT resource_id FROM telemetry_communication_observation
         WHERE dataset_id = ? AND epoch = ? AND event_id = ?`,
      )
      .get(datasetId, epoch, canonicalEvent.eventId);
    if (commRow) {
      throw new AppError(
        500,
        'PROJECTION_INCONSISTENCY',
        'Projeção fantasma de comunicação detectada no SQLite sem efeito declarado.',
      );
    }
  }

  // 3. Verificação de Projeção de Posição
  if (effects.position) {
    const posRow = db
      .prepare(
        `SELECT source_id, event_id, channel, observed_at_ms, latitude, longitude, accuracy_m, region_id
         FROM telemetry_position_observation
         WHERE dataset_id = ? AND epoch = ? AND resource_id = ?`,
      )
      .get(datasetId, epoch, effects.position.resourceId) as
      | {
          source_id: string;
          event_id: string;
          channel: string;
          observed_at_ms: number;
          latitude: number;
          longitude: number;
          accuracy_m: number | null;
          region_id: string | null;
        }
      | undefined;

    if (
      !posRow ||
      posRow.event_id !== effects.position.eventId ||
      posRow.latitude !== effects.position.latitude ||
      posRow.longitude !== effects.position.longitude ||
      posRow.region_id !== effects.position.regionId
    ) {
      throw new AppError(
        500,
        'PROJECTION_INCONSISTENCY',
        'Projeção física de posição não corresponde ao efeito declarado.',
      );
    }
  } else {
    // Garantir que nenhuma observação de posição aponte para este evento
    const posRow = db
      .prepare(
        `SELECT resource_id FROM telemetry_position_observation
         WHERE dataset_id = ? AND epoch = ? AND event_id = ?`,
      )
      .get(datasetId, epoch, canonicalEvent.eventId);
    if (posRow) {
      throw new AppError(
        500,
        'PROJECTION_INCONSISTENCY',
        'Projeção fantasma de posição detectada no SQLite sem efeito declarado.',
      );
    }
  }

  // 4. Verificação de Criação/Existência de Episódio Causal
  if (effects.episode) {
    const epRow = db
      .prepare(
        `SELECT episode_id, cause_code, episode_started_at_ms
         FROM telemetry_episode
         WHERE dataset_id = ? AND epoch = ? AND resource_id = ? AND episode_id = ?`,
      )
      .get(datasetId, epoch, canonicalEvent.payload.resourceId, effects.episode.episodeId) as
      | {
          episode_id: string;
          cause_code: string;
          episode_started_at_ms: number;
        }
      | undefined;

    if (
      !epRow ||
      epRow.cause_code !== effects.episode.causeCode ||
      epRow.episode_started_at_ms !== effects.episode.episodeStartedAtMs
    ) {
      throw new AppError(500, 'PROJECTION_INCONSISTENCY', 'Episódio causal físico não corresponde ao efeito declarado.');
    }
  }
}

interface ExistingEpisodeRow {
  episode_id: string;
  cause_code: string;
  source_id: string;
  episode_started_at_ms: number;
}

function resolveOrInsertEpisode(
  db: Database.Database,
  datasetId: string,
  epoch: number,
  resourceId: string,
  sourceId: string,
  episodeId: string,
  causeCode: string,
  episodeStartedAtMs: number,
  processingDataNowMs: number,
): { created: boolean } {
  // 1. Consultar existência por chave primária (datasetId, epoch, resourceId, episodeId)
  const existingEp = db
    .prepare(
      `SELECT episode_id, cause_code, source_id, episode_started_at_ms
       FROM telemetry_episode
       WHERE dataset_id = ? AND epoch = ? AND resource_id = ? AND episode_id = ?`,
    )
    .get(datasetId, epoch, resourceId, episodeId) as ExistingEpisodeRow | undefined;

  if (existingEp) {
    // 3 & 4. Validar compatibilidade estrita conforme C03-S07
    if (
      existingEp.cause_code !== causeCode ||
      existingEp.episode_started_at_ms !== episodeStartedAtMs ||
      existingEp.source_id !== sourceId
    ) {
      throw new AppError(409, 'EPISODE_CONFLICT', 'Episódio causal já existe com atributos conflitantes.');
    }
    return { created: false };
  }

  // 2. Verificar colisão de alias conforme C03-S08: outro episodeId com mesma causa e início
  const aliasEp = db
    .prepare(
      `SELECT episode_id
       FROM telemetry_episode
       WHERE dataset_id = ? AND epoch = ? AND resource_id = ? AND cause_code = ? AND episode_started_at_ms = ?`,
    )
    .get(datasetId, epoch, resourceId, causeCode, episodeStartedAtMs) as { episode_id: string } | undefined;

  if (aliasEp) {
    throw new AppError(409, 'EPISODE_CONFLICT', 'Outro episódio com mesma causa e início já registrado.');
  }

  // 2. Criar novo episódio
  db.prepare(
    `INSERT INTO telemetry_episode (
       dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    datasetId,
    epoch,
    resourceId,
    episodeId,
    causeCode,
    sourceId,
    episodeStartedAtMs,
    processingDataNowMs,
  );

  return { created: true };
}

/**
 * Implementação padrão de referência do Hook de Pipeline Transacional da PKG-06.
 */
export class DefaultTelemetryPipelineHook implements TelemetryPipelineHook {
  /**
   * Fase 1: Avaliação do evento, determinação da disposição, efeitos planejados e mutações pré-evento necessárias.
   */
  evaluateAndProject(context: PipelineHookContext): PipelineHookResult {
    const { db, datasetId, epoch, auth, canonicalEvent, windowEvaluation, validatedObservation } = context;
    const { resourceId, channel, sequence, observationType } = canonicalEvent.payload;

    const occurredAtMs = new Date(canonicalEvent.occurredAt).getTime();
    const effectiveAtMs = windowEvaluation.observationEffectiveAtMs;

    // 1. Consulta ao estado administrativo corrente do recurso
    const stateRow = db
      .prepare(
        `SELECT operational_state, activity, version
         FROM current_state
         WHERE dataset_id = ? AND epoch = ? AND resource_id = ?`,
      )
      .get(datasetId, epoch, resourceId) as
      | { operational_state?: string; activity?: string; version: number }
      | undefined;

    const operationalState = stateRow?.operational_state;

    // Recurso com estado administrativo desabilitado: observações são ignoradas
    if (operationalState === 'disabled') {
      const existingCursor = db
        .prepare(
          `SELECT max_sequence_seen, max_occurred_at_ms, projected_effective_at_ms
           FROM telemetry_channel_cursor
           WHERE dataset_id = ? AND epoch = ? AND source_id = ? AND resource_id = ? AND channel = ?`,
        )
        .get(datasetId, epoch, auth.sourceId, resourceId, channel) as
        | {
            max_sequence_seen: number;
            max_occurred_at_ms: number | null;
            projected_effective_at_ms: number | null;
          }
        | undefined;

      const advancesSequence = !existingCursor || sequence > existingCursor.max_sequence_seen;
      const cursorEffect: CursorEffect = {
        advanced: advancesSequence,
        sequence,
        maxOccurredAtMs: existingCursor?.max_occurred_at_ms ?? null,
        projectedEffectiveAtMs: existingCursor?.projected_effective_at_ms ?? null,
      };

      const effects: TelemetryEffects = {
        cursor: cursorEffect,
        operationalProjection: false,
      };
      validateEffectsStrict(effects, 'ignored', observationType);

      return {
        disposition: 'ignored',
        effects,
        reasonCode: 'ADMIN_DISABLED_RESOURCE',
      };
    }

    // 2. Consulta ao cursor durável existente do fluxo/canal
    const existingCursor = db
      .prepare(
        `SELECT max_sequence_seen, max_occurred_at_ms, projected_effective_at_ms
         FROM telemetry_channel_cursor
         WHERE dataset_id = ? AND epoch = ? AND source_id = ? AND resource_id = ? AND channel = ?`,
      )
      .get(datasetId, epoch, auth.sourceId, resourceId, channel) as
      | {
          max_sequence_seen: number;
          max_occurred_at_ms: number | null;
          projected_effective_at_ms: number | null;
        }
      | undefined;

    // 3. Avaliação de condições históricas / fora de ordem
    // 3a. Regressão temporal em relação ao tempo já projetado pelo cursor
    if (
      existingCursor &&
      existingCursor.projected_effective_at_ms !== null &&
      effectiveAtMs !== null &&
      effectiveAtMs < existingCursor.projected_effective_at_ms
    ) {
      const advancesSequence = sequence > existingCursor.max_sequence_seen;
      const cursorEffect: CursorEffect = {
        advanced: advancesSequence,
        sequence: Math.max(existingCursor.max_sequence_seen, sequence),
        maxOccurredAtMs: existingCursor.max_occurred_at_ms,
        projectedEffectiveAtMs: existingCursor.projected_effective_at_ms,
      };

      const effects: TelemetryEffects = {
        cursor: cursorEffect,
        operationalProjection: false,
      };
      validateEffectsStrict(effects, 'historical', observationType);

      return {
        disposition: 'historical',
        effects,
        reasonCode: 'OUT_OF_ORDER_HISTORICAL',
      };
    }

    // 3b. Regressão de sequência (sequência inferior inédita)
    if (existingCursor && sequence < existingCursor.max_sequence_seen) {
      const cursorEffect: CursorEffect = {
        advanced: false,
        sequence,
        maxOccurredAtMs: existingCursor.max_occurred_at_ms,
        projectedEffectiveAtMs: existingCursor.projected_effective_at_ms,
      };

      const effects: TelemetryEffects = {
        cursor: cursorEffect,
        operationalProjection: false,
      };
      validateEffectsStrict(effects, 'historical', observationType);

      return {
        disposition: 'historical',
        effects,
        reasonCode: 'OUT_OF_ORDER_HISTORICAL',
      };
    }

    // 3c. Sequência superior com ocorrência original regressiva (C03 linha 149)
    if (
      existingCursor &&
      sequence > existingCursor.max_sequence_seen &&
      existingCursor.max_occurred_at_ms !== null &&
      occurredAtMs < existingCursor.max_occurred_at_ms
    ) {
      const cursorEffect: CursorEffect = {
        advanced: true,
        sequence,
        maxOccurredAtMs: existingCursor.max_occurred_at_ms,
        projectedEffectiveAtMs: existingCursor.projected_effective_at_ms,
      };

      const effects: TelemetryEffects = {
        cursor: cursorEffect,
        operationalProjection: false,
      };
      validateEffectsStrict(effects, 'historical', observationType);

      return {
        disposition: 'historical',
        effects,
        reasonCode: 'OUT_OF_ORDER_HISTORICAL',
      };
    }

    // 3d. Verificação de cobertura causal para episódios de falha (C03 linhas 231-236)
    if (observationType === 'fault_detected') {
      const { episodeId, causeCode, episodeStartedAtMs } = validatedObservation.values as {
        episodeId: string;
        causeCode: string;
        episodeStartedAtMs: number;
      };

      const resolutionRow = db
        .prepare(
          `SELECT max(completed_at_ms) as max_completed_at_ms
           FROM telemetry_cause_resolution
           WHERE dataset_id = ? AND epoch = ? AND resource_id = ? AND cause_code = ?`,
        )
        .get(datasetId, epoch, resourceId, causeCode) as { max_completed_at_ms: number | null } | undefined;

      if (
        resolutionRow?.max_completed_at_ms !== null &&
        resolutionRow?.max_completed_at_ms !== undefined &&
        episodeStartedAtMs <= resolutionRow.max_completed_at_ms
      ) {
        // Coberto por resolução causal: histórico sem reabertura
        resolveOrInsertEpisode(
          db,
          datasetId,
          epoch,
          resourceId,
          auth.sourceId,
          episodeId,
          causeCode,
          episodeStartedAtMs,
          windowEvaluation.processingDataNowMs,
        );

        const cursorEffect: CursorEffect = {
          advanced: true,
          sequence,
          maxOccurredAtMs: existingCursor
            ? Math.max(existingCursor.max_occurred_at_ms ?? occurredAtMs, occurredAtMs)
            : occurredAtMs,
          projectedEffectiveAtMs: existingCursor?.projected_effective_at_ms ?? null,
        };

        const effects: TelemetryEffects = {
          cursor: cursorEffect,
          operationalProjection: false,
        };
        validateEffectsStrict(effects, 'historical', observationType);

        return {
          disposition: 'historical',
          effects,
          reasonCode: 'COVERED_BY_CAUSE_RESOLUTION',
          episode: {
            episodeId,
            causeCode,
            episodeStartedAtMs,
          },
        };
      }
    }

    // 4. Observação elegível para a disposição aplicada!
    let communicationEffect: CommunicationEffect | undefined = undefined;
    let positionEffect: PositionEffect | undefined = undefined;
    let episodeEffect: EpisodeEffect | undefined = undefined;
    let operationalProjection = false;
    let reasonCode = 'NOMINAL';

    // 4a. Projeção de Batimento Cardíaco (Heartbeat)
    if (observationType === 'heartbeat') {
      communicationEffect = {
        projected: true,
        resourceId,
        sourceId: auth.sourceId,
        eventId: canonicalEvent.eventId,
        channel,
        observedAtMs: effectiveAtMs!,
      };
      operationalProjection = true;
      if (operationalState === 'stolen') {
        reasonCode = 'COMMUNICATION_OBSERVED_IN_RESTRICTED_STATE';
      }
    }

    // 4b. Projeção de Posição com Resolução Espacial Ponto-em-Polígono
    if (observationType === 'position') {
      const { latitude, longitude, accuracyM } = validatedObservation.values as {
        latitude: number;
        longitude: number;
        accuracyM?: number | null;
      };

      const regionId = classifyPointInDataset(db, datasetId, epoch, latitude, longitude);

      positionEffect = {
        projected: true,
        resourceId,
        sourceId: auth.sourceId,
        eventId: canonicalEvent.eventId,
        channel,
        observedAtMs: effectiveAtMs!,
        latitude,
        longitude,
        accuracyM: accuracyM ?? null,
        regionId,
      };
      operationalProjection = true;
      if (operationalState === 'stolen') {
        reasonCode = 'COMMUNICATION_OBSERVED_IN_RESTRICTED_STATE';
      }
    }

    // 4c. Registro e Projeção de Falha Detectada (FIX-01A: Reutilização sem colisão de PRIMARY KEY)
    if (observationType === 'fault_detected') {
      const { episodeId, causeCode, episodeStartedAtMs } = validatedObservation.values as {
        episodeId: string;
        causeCode: string;
        episodeStartedAtMs: number;
      };

      const epResolution = resolveOrInsertEpisode(
        db,
        datasetId,
        epoch,
        resourceId,
        auth.sourceId,
        episodeId,
        causeCode,
        episodeStartedAtMs,
        windowEvaluation.processingDataNowMs,
      );

      episodeEffect = {
        created: epResolution.created,
        episodeId,
        causeCode,
        episodeStartedAtMs,
      };
      operationalProjection = true;
      reasonCode = 'FAULT_DETECTED';
    }

    // 4d. Registro e Projeção de Falha Esclarecida (Cleared)
    if (observationType === 'fault_cleared') {
      const { episodeId, causeCode, episodeStartedAtMs } = validatedObservation.values as {
        episodeId: string;
        causeCode: string;
        episodeStartedAtMs: number;
      };

      const epRow = db
        .prepare(
          `SELECT episode_id, cause_code, source_id, episode_started_at_ms
           FROM telemetry_episode
           WHERE dataset_id = ? AND epoch = ? AND resource_id = ? AND episode_id = ?`,
        )
        .get(datasetId, epoch, resourceId, episodeId) as ExistingEpisodeRow | undefined;

      if (!epRow) {
        throw new AppError(422, 'UNKNOWN_EPISODE', 'Episódio causal não encontrado para encerramento.');
      }

      if (
        epRow.cause_code !== causeCode ||
        epRow.episode_started_at_ms !== episodeStartedAtMs
      ) {
        throw new AppError(409, 'EPISODE_CONFLICT', 'Atributos do episódio divergem do registro causal existente.');
      }

      episodeEffect = {
        created: false,
        episodeId,
        causeCode,
        episodeStartedAtMs,
      };
      operationalProjection = true;
      reasonCode = 'FAULT_CLEARED';
    }

    // Cálculo do novo estado do cursor durável
    const newMaxOccurred = existingCursor
      ? Math.max(existingCursor.max_occurred_at_ms ?? occurredAtMs, occurredAtMs)
      : occurredAtMs;

    const newProjectedEffective = operationalProjection
      ? existingCursor?.projected_effective_at_ms !== null && existingCursor?.projected_effective_at_ms !== undefined
        ? Math.max(existingCursor.projected_effective_at_ms, effectiveAtMs!)
        : effectiveAtMs!
      : existingCursor?.projected_effective_at_ms ?? null;

    const cursorEffect: CursorEffect = {
      advanced: true,
      sequence,
      maxOccurredAtMs: newMaxOccurred,
      projectedEffectiveAtMs: newProjectedEffective,
    };

    const effects: TelemetryEffects = {
      cursor: cursorEffect,
      ...(communicationEffect ? { communication: communicationEffect } : {}),
      ...(positionEffect ? { position: positionEffect } : {}),
      ...(episodeEffect ? { episode: episodeEffect } : {}),
      operationalProjection,
    };

    validateEffectsStrict(effects, 'applied', observationType);

    return {
      disposition: 'applied',
      effects,
      reasonCode,
      ...(episodeEffect
        ? {
            episode: {
              episodeId: episodeEffect.episodeId,
              causeCode: episodeEffect.causeCode,
              episodeStartedAtMs: episodeEffect.episodeStartedAtMs,
            },
          }
        : {}),
    };
  }

  /**
   * Fase 2: Projeção física pós-evento no SQLite e verificação de integridade transacional (GATE-01 e GATE-02).
   */
  project(context: PipelineHookContext, result: PipelineHookResult): void {
    const { db, datasetId, epoch, auth, canonicalEvent } = context;
    const { effects } = result;

    if (!effects || typeof effects !== 'object') {
      throw new AppError(500, 'INVALID_HOOK_RESULT', 'Pipeline hook effects ausente ou inválido.');
    }

    const telEffects = effects as TelemetryEffects;
    const cursor = telEffects.cursor;
    const { resourceId, channel } = canonicalEvent.payload;

    // 1. UPSERT no telemetry_channel_cursor com CASE WHEN estrito (sem COALESCE(..., 0))
    if (cursor) {
      db.prepare(
        `INSERT INTO telemetry_channel_cursor (
           dataset_id, epoch, source_id, resource_id, channel,
           max_sequence_seen, max_occurred_at_ms, projected_effective_at_ms
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(dataset_id, epoch, source_id, resource_id, channel) DO UPDATE SET
           max_sequence_seen = CASE
             WHEN excluded.max_sequence_seen > telemetry_channel_cursor.max_sequence_seen
               THEN excluded.max_sequence_seen
             ELSE telemetry_channel_cursor.max_sequence_seen
           END,
           max_occurred_at_ms = CASE
             WHEN excluded.max_sequence_seen > telemetry_channel_cursor.max_sequence_seen
               AND (telemetry_channel_cursor.max_occurred_at_ms IS NULL OR excluded.max_occurred_at_ms > telemetry_channel_cursor.max_occurred_at_ms)
               THEN excluded.max_occurred_at_ms
             ELSE telemetry_channel_cursor.max_occurred_at_ms
           END,
           projected_effective_at_ms = CASE
             WHEN excluded.projected_effective_at_ms IS NOT NULL
               AND (telemetry_channel_cursor.projected_effective_at_ms IS NULL OR excluded.projected_effective_at_ms > telemetry_channel_cursor.projected_effective_at_ms)
               THEN excluded.projected_effective_at_ms
             ELSE telemetry_channel_cursor.projected_effective_at_ms
           END`,
      ).run(
        datasetId,
        epoch,
        auth.sourceId,
        resourceId,
        channel,
        cursor.sequence,
        cursor.maxOccurredAtMs ?? null,
        cursor.projectedEffectiveAtMs ?? null,
      );
    }

    // 2. Projeção de Observação de Comunicação
    if (telEffects.communication) {
      const comm = telEffects.communication;
      db.prepare(
        `INSERT INTO telemetry_communication_observation (
           dataset_id, epoch, resource_id, source_id, event_id, channel, observed_at_ms
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(dataset_id, epoch, resource_id) DO UPDATE SET
           source_id = excluded.source_id,
           event_id = excluded.event_id,
           channel = excluded.channel,
           observed_at_ms = excluded.observed_at_ms
         WHERE excluded.observed_at_ms >= telemetry_communication_observation.observed_at_ms`,
      ).run(datasetId, epoch, comm.resourceId, comm.sourceId, comm.eventId, comm.channel, comm.observedAtMs);
    }

    // 3. Projeção de Observação de Posição
    if (telEffects.position) {
      const pos = telEffects.position;
      db.prepare(
        `INSERT INTO telemetry_position_observation (
           dataset_id, epoch, resource_id, source_id, event_id, channel,
           observed_at_ms, latitude, longitude, accuracy_m, region_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(dataset_id, epoch, resource_id) DO UPDATE SET
           source_id = excluded.source_id,
           event_id = excluded.event_id,
           channel = excluded.channel,
           observed_at_ms = excluded.observed_at_ms,
           latitude = excluded.latitude,
           longitude = excluded.longitude,
           accuracy_m = excluded.accuracy_m,
           region_id = excluded.region_id
         WHERE excluded.observed_at_ms >= telemetry_position_observation.observed_at_ms`,
      ).run(
        datasetId,
        epoch,
        pos.resourceId,
        pos.sourceId,
        pos.eventId,
        pos.channel,
        pos.observedAtMs,
        pos.latitude,
        pos.longitude,
        pos.accuracyM,
        pos.regionId,
      );
    }

    // 4. Verificação de integridade pós-projeção (GATE-02)
    assertProjectedStateConsistent(db, context, result);
  }
}
