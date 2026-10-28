/**
 * PROJECT IGNIS — T0010 / PKG-02
 * Motor de Avaliação Determinística de Alertas e Ciclo de Vida Transacional (F02, R06, C03-S11).
 */

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { AppError } from '../errors.js';
import { canonicalJson } from '../idempotency/json.js';
import { transaction } from '../persistence/store.js';
import type { TrustedClockService } from '../domain/telemetry/trusted-clock.js';
import type { AlertRuleCode, AlertSeverity, AlertStatus } from './types.js';

export interface AlertEvaluationContext {
  readonly datasetId: string;
  readonly epoch: number;
  readonly timeZone?: string;
  readonly advanceRevision?: boolean;
}

export interface RuleEvaluationSummary {
  readonly ruleCode: AlertRuleCode;
  readonly openedCount: number;
  readonly updatedCount: number;
  readonly resolvedCount: number;
  readonly unchangedCount: number;
  readonly revision?: number;
}

export interface AlertEvaluationResult {
  readonly datasetId: string;
  readonly epoch: number;
  readonly revision: number;
  readonly evaluatedAtMs: number;
  readonly totalResourcesEvaluated: number;
  readonly summaries: Record<AlertRuleCode, RuleEvaluationSummary>;
  readonly mutatedAlertIds: readonly string[];
}

interface ActiveAlertRow {
  readonly id: string;
  readonly resource_id: string;
  readonly rule_code: AlertRuleCode;
  readonly cycle: number;
  readonly severity: AlertSeverity;
  readonly status: AlertStatus;
  readonly cause_code: string | null;
  readonly evidence_json: string;
  readonly opened_at_ms: number;
}

interface EquipmentResourceRow {
  readonly resource_id: string;
  readonly criticality: number;
}

interface TelemetryProfileEquipmentRow {
  readonly resource_id: string;
  readonly assigned_at_ms: number | null;
  readonly registered_at_iso: string | null;
  readonly profile_id: string | null;
  readonly emitter_expected: number | null;
  readonly expected_interval_ms: number | null;
  readonly observed_at_ms: number | null;
  readonly observation_event_id: string | null;
}

interface MaintenanceRequestRow {
  readonly id: string;
  readonly equipment_id: string;
  readonly cause_code: string;
  readonly priority: 'low' | 'normal' | 'high' | 'critical';
  readonly due_date: string;
}

export function getCivilDateString(utcMs: number, timeZone: string = 'America/Sao_Paulo'): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date(utcMs));
}

export function getCivilDayDifference(targetDueDate: string, currentCivilDate: string): number {
  const [y1, m1, d1] = targetDueDate.split('-').map(Number);
  const [y2, m2, d2] = currentCivilDate.split('-').map(Number);
  const utc1 = Date.UTC(y1!, m1! - 1, d1!);
  const utc2 = Date.UTC(y2!, m2! - 1, d2!);
  return Math.round((utc1 - utc2) / (24 * 60 * 60 * 1000));
}

export class AlertEvaluatorService {
  constructor(
    private readonly db: Database.Database,
    private readonly clockService: TrustedClockService,
  ) {}

  /**
   * Valida políticas de avanço de revisão contextual.
   * Delegações externas inseguras (advanceRevision=false) são expressamente proibidas.
   */
  private assertRevisionPolicy(context: AlertEvaluationContext): void {
    if (context.advanceRevision === false) {
      throw new AppError(
        400,
        'REVISION_DELEGATION_PROHIBITED',
        'advanceRevision=false is strictly prohibited: every evaluation unit with mutations must atomically advance dataset revision.',
      );
    }
  }

  /**
   * Rejeita estritamente chamadas executadas dentro de uma transação externa ativa.
   * O avaliador exige sua própria fronteira transacional exclusiva para garantir
   * atomicidade estrita entre mutações de alerta, avanço do relógio confiável e incremento de revisão.
   */
  private assertTransactionBoundary(): void {
    if (this.db.inTransaction) {
      throw new AppError(
        409,
        'EXTERNAL_TRANSACTION_PROHIBITED',
        'Alert evaluation cannot be executed within an active external transaction: evaluator requires exclusive transactional boundary.',
      );
    }
  }

  /**
   * Revalida o estado do dataset e epoch dentro da fronteira transacional.
   */
  private validateEpoch(context: AlertEvaluationContext): { revision: number } {
    const row = this.db
      .prepare(
        `SELECT d.active_epoch, e.status, e.revision
         FROM dataset d
         JOIN dataset_epoch e ON e.dataset_id = d.id AND e.epoch = ?
         WHERE d.id = ?`,
      )
      .get(context.epoch, context.datasetId) as
      | { active_epoch: number; status: string; revision: number }
      | undefined;

    if (!row || row.active_epoch !== context.epoch || row.status !== 'ready') {
      throw new AppError(409, 'EPOCH_CONFLICT', 'Geração obsoleta ou indisponível.');
    }

    return { revision: row.revision };
  }

  /**
   * Avalia atomicamente as 3 regras dentro de uma transação BEGIN IMMEDIATE.
   */
  public evaluateAll(context: AlertEvaluationContext): AlertEvaluationResult {
    this.assertRevisionPolicy(context);
    this.assertTransactionBoundary();
    const action = () => {
      // 1. Revalidação contextual sob lock
      const { revision: initialRevision } = this.validateEpoch(context);

      // 2. Amostragem confiável sob lock
      const timeSample = this.clockService.sampleTrustedNow(this.db);
      const dataNowMs = timeSample.utcMs;
      const mutatedAlertIds: string[] = [];

      // 3. Avaliação das regras de domínio
      const faultSummary = this.evaluateEquipmentFaultsInternal(context, dataNowMs, mutatedAlertIds);
      const commSummary = this.evaluateCommunicationMissingInternal(context, dataNowMs, mutatedAlertIds);
      const maintSummary = this.evaluateMaintenanceDueInternal(context, dataNowMs, mutatedAlertIds);

      let resultingRevision = initialRevision;

      // 4. Se houve alteração de domínio, persistir avanço durável do relógio e incremento de revisão
      if (mutatedAlertIds.length > 0) {
        this.clockService.advanceDurable(this.db, timeSample);

        const revRow = this.db
          .prepare(
            `UPDATE dataset_epoch
             SET revision = revision + 1
             WHERE dataset_id = ? AND epoch = ?
             RETURNING revision`,
          )
          .get(context.datasetId, context.epoch) as { revision: number } | undefined;
        if (revRow) {
          resultingRevision = revRow.revision;
        }
      }

      // Total de recursos únicos avaliados
      const totalRow = this.db
        .prepare(
          `SELECT COUNT(id) AS count
           FROM resource
           WHERE dataset_id = ? AND epoch = ? AND kind = 'equipment' AND archived = 0`,
        )
        .get(context.datasetId, context.epoch) as { count: number } | undefined;

      return {
        datasetId: context.datasetId,
        epoch: context.epoch,
        revision: resultingRevision,
        evaluatedAtMs: dataNowMs,
        totalResourcesEvaluated: totalRow ? totalRow.count : 0,
        summaries: {
          equipment_fault: faultSummary,
          communication_missing: commSummary,
          maintenance_due: maintSummary,
        },
        mutatedAlertIds: Object.freeze(mutatedAlertIds),
      };
    };

    return transaction(this.db, action);
  }

  public evaluateEquipmentFaults(context: AlertEvaluationContext): RuleEvaluationSummary {
    this.assertRevisionPolicy(context);
    this.assertTransactionBoundary();
    const action = () => {
      const { revision: initialRevision } = this.validateEpoch(context);
      const timeSample = this.clockService.sampleTrustedNow(this.db);
      const dataNowMs = timeSample.utcMs;
      const mutated: string[] = [];

      const summary = this.evaluateEquipmentFaultsInternal(context, dataNowMs, mutated);
      let resultingRevision = initialRevision;

      if (mutated.length > 0) {
        this.clockService.advanceDurable(this.db, timeSample);
        const revRow = this.db
          .prepare(
            `UPDATE dataset_epoch
             SET revision = revision + 1
             WHERE dataset_id = ? AND epoch = ?
             RETURNING revision`,
          )
          .get(context.datasetId, context.epoch) as { revision: number } | undefined;
        if (revRow) {
          resultingRevision = revRow.revision;
        }
      }

      return {
        ...summary,
        revision: resultingRevision,
      };
    };

    return transaction(this.db, action);
  }

  public evaluateCommunicationMissing(context: AlertEvaluationContext): RuleEvaluationSummary {
    this.assertRevisionPolicy(context);
    this.assertTransactionBoundary();
    const action = () => {
      const { revision: initialRevision } = this.validateEpoch(context);
      const timeSample = this.clockService.sampleTrustedNow(this.db);
      const dataNowMs = timeSample.utcMs;
      const mutated: string[] = [];

      const summary = this.evaluateCommunicationMissingInternal(context, dataNowMs, mutated);
      let resultingRevision = initialRevision;

      if (mutated.length > 0) {
        this.clockService.advanceDurable(this.db, timeSample);
        const revRow = this.db
          .prepare(
            `UPDATE dataset_epoch
             SET revision = revision + 1
             WHERE dataset_id = ? AND epoch = ?
             RETURNING revision`,
          )
          .get(context.datasetId, context.epoch) as { revision: number } | undefined;
        if (revRow) {
          resultingRevision = revRow.revision;
        }
      }

      return {
        ...summary,
        revision: resultingRevision,
      };
    };

    return transaction(this.db, action);
  }

  public evaluateMaintenanceDue(context: AlertEvaluationContext): RuleEvaluationSummary {
    this.assertRevisionPolicy(context);
    this.assertTransactionBoundary();
    const action = () => {
      const { revision: initialRevision } = this.validateEpoch(context);
      const timeSample = this.clockService.sampleTrustedNow(this.db);
      const dataNowMs = timeSample.utcMs;
      const mutated: string[] = [];

      const summary = this.evaluateMaintenanceDueInternal(context, dataNowMs, mutated);
      let resultingRevision = initialRevision;

      if (mutated.length > 0) {
        this.clockService.advanceDurable(this.db, timeSample);
        const revRow = this.db
          .prepare(
            `UPDATE dataset_epoch
             SET revision = revision + 1
             WHERE dataset_id = ? AND epoch = ?
             RETURNING revision`,
          )
          .get(context.datasetId, context.epoch) as { revision: number } | undefined;
        if (revRow) {
          resultingRevision = revRow.revision;
        }
      }

      return {
        ...summary,
        revision: resultingRevision,
      };
    };

    return transaction(this.db, action);
  }

  // ===========================================================================
  // IMPLEMENTAÇÃO INTERNA DAS REGRAS
  // ===========================================================================

  private evaluateEquipmentFaultsInternal(
    context: AlertEvaluationContext,
    dataNowMs: number,
    mutatedAlertIds: string[],
  ): RuleEvaluationSummary {
    let openedCount = 0;
    let updatedCount = 0;
    let resolvedCount = 0;
    let unchangedCount = 0;

    const equipments = this.db
      .prepare(
        `SELECT r.id AS resource_id, eq.criticality
         FROM resource r
         JOIN equipment eq ON eq.dataset_id = r.dataset_id AND eq.epoch = r.epoch AND eq.id = r.id
         WHERE r.dataset_id = ? AND r.epoch = ? AND r.kind = 'equipment' AND r.archived = 0
         ORDER BY r.id ASC`,
      )
      .all(context.datasetId, context.epoch) as EquipmentResourceRow[];

    for (const eq of equipments) {
      // C03-S11: Resolução causal estritamente particionada por causa (cause_code)
      const activeEpisodes = this.db
        .prepare(
          `SELECT ep.episode_id, ep.cause_code, ep.episode_started_at_ms
           FROM telemetry_episode ep
           LEFT JOIN (
             SELECT cause_code, MAX(completed_at_ms) AS max_completed_at_ms
             FROM telemetry_cause_resolution
             WHERE dataset_id = ? AND epoch = ? AND resource_id = ?
             GROUP BY cause_code
           ) res ON res.cause_code = ep.cause_code
           WHERE ep.dataset_id = ? AND ep.epoch = ? AND ep.resource_id = ?
             AND (res.max_completed_at_ms IS NULL OR ep.episode_started_at_ms > res.max_completed_at_ms)
           ORDER BY ep.episode_started_at_ms ASC, ep.episode_id ASC`,
        )
        .all(
          context.datasetId,
          context.epoch,
          eq.resource_id,
          context.datasetId,
          context.epoch,
          eq.resource_id,
        ) as Array<{ episode_id: string; cause_code: string; episode_started_at_ms: number }>;

      const existingAlert = this.db
        .prepare(
          `SELECT id, resource_id, rule_code, cycle, severity, status, cause_code, evidence_json, opened_at_ms
           FROM alert
           WHERE dataset_id = ? AND epoch = ? AND resource_id = ? AND rule_code = 'equipment_fault'
             AND status IN ('open', 'acknowledged')`,
        )
        .get(context.datasetId, context.epoch, eq.resource_id) as ActiveAlertRow | undefined;

      const isConditionActive = activeEpisodes.length > 0;
      const targetSeverity: AlertSeverity = eq.criticality === 5 ? 'critical' : 'high';
      const triggerCauseCode = isConditionActive ? activeEpisodes[0]!.cause_code : null;

      const activeCauses = isConditionActive
        ? [...new Set(activeEpisodes.map((e) => e.cause_code))].sort()
        : [];

      // Preservar e acumular episódios observados durante todo o ciclo do alerta
      let prevCycleEpisodes: Array<{ episodeId: string; causeCode: string; episodeStartedAtMs: number }> = [];
      if (existingAlert) {
        try {
          const parsed = JSON.parse(existingAlert.evidence_json);
          if (Array.isArray(parsed.cycleEpisodes)) {
            prevCycleEpisodes = parsed.cycleEpisodes;
          } else if (Array.isArray(parsed.episodes)) {
            prevCycleEpisodes = parsed.episodes;
          }
        } catch {
          // fallback
        }
      }

      const episodeMap = new Map<string, { episodeId: string; causeCode: string; episodeStartedAtMs: number }>();
      for (const ep of prevCycleEpisodes) {
        if (ep && typeof ep.causeCode === 'string' && typeof ep.episodeStartedAtMs === 'number') {
          const key = ep.episodeId || `${ep.causeCode}:${ep.episodeStartedAtMs}`;
          episodeMap.set(key, ep);
        }
      }
      for (const ep of activeEpisodes) {
        const key = ep.episode_id || `${ep.cause_code}:${ep.episode_started_at_ms}`;
        if (!episodeMap.has(key)) {
          episodeMap.set(key, {
            episodeId: ep.episode_id,
            causeCode: ep.cause_code,
            episodeStartedAtMs: ep.episode_started_at_ms,
          });
        }
      }

      const cycleEpisodes = Array.from(episodeMap.values()).sort(
        (a, b) =>
          a.episodeStartedAtMs - b.episodeStartedAtMs ||
          a.causeCode.localeCompare(b.causeCode) ||
          a.episodeId.localeCompare(b.episodeId),
      );

      const targetEvidenceJson = isConditionActive
        ? canonicalJson({
            activeCauses,
            cycleEpisodes,
            episodes: cycleEpisodes,
            evidenceIds: cycleEpisodes.map((e) => e.episodeId),
          })
        : '';

      if (isConditionActive) {
        if (!existingAlert) {
          const alertId = this.createAlert(
            context,
            eq.resource_id,
            'equipment_fault',
            targetSeverity,
            triggerCauseCode,
            targetEvidenceJson,
            dataNowMs,
          );
          openedCount++;
          mutatedAlertIds.push(alertId);
        } else {
          // Condição ativa persiste: verificar se evidência ou severidade mudou
          if (
            existingAlert.severity === targetSeverity &&
            existingAlert.evidence_json === targetEvidenceJson
          ) {
            unchangedCount++;
          } else {
            this.db
              .prepare(
                `UPDATE alert
                 SET severity = ?, evidence_json = ?
                 WHERE dataset_id = ? AND epoch = ? AND id = ?`,
              )
              .run(targetSeverity, targetEvidenceJson, context.datasetId, context.epoch, existingAlert.id);
            updatedCount++;
            mutatedAlertIds.push(existingAlert.id);
          }
        }
      } else {
        if (existingAlert) {
          // Correção causal rigorosa: correlacionar resoluções por (dataset, epoch, resource, cause_code)
          // respeitando o limite temporal (episodeStartedAtMs) individual de cada causa pertinente a este ciclo.
          const causeStartMap = new Map<string, number>();

          // Inspeciona todos os eventos deste alerta (abertura e atualizações) para capturar todas as causas que ocorreram neste ciclo
          const alertEvents = this.db
            .prepare(
              `SELECT evidence_json FROM alert_event
               WHERE dataset_id = ? AND epoch = ? AND alert_id = ?
               ORDER BY occurred_at_ms ASC`,
            )
            .all(context.datasetId, context.epoch, existingAlert.id) as Array<{ evidence_json: string }>;

          const allEvidences = [
            ...alertEvents.map((ae) => ae.evidence_json),
            existingAlert.evidence_json,
          ];

          for (const evJson of allEvidences) {
            try {
              const parsed = JSON.parse(evJson);
              if (Array.isArray(parsed.cycleEpisodes)) {
                for (const ep of parsed.cycleEpisodes) {
                  if (ep && typeof ep.causeCode === 'string' && typeof ep.episodeStartedAtMs === 'number') {
                    const currentMin = causeStartMap.get(ep.causeCode);
                    if (currentMin === undefined || ep.episodeStartedAtMs < currentMin) {
                      causeStartMap.set(ep.causeCode, ep.episodeStartedAtMs);
                    }
                  }
                }
              }
              if (Array.isArray(parsed.episodes)) {
                for (const ep of parsed.episodes) {
                  if (ep && typeof ep.causeCode === 'string' && typeof ep.episodeStartedAtMs === 'number') {
                    const currentMin = causeStartMap.get(ep.causeCode);
                    if (currentMin === undefined || ep.episodeStartedAtMs < currentMin) {
                      causeStartMap.set(ep.causeCode, ep.episodeStartedAtMs);
                    }
                  }
                }
              }
              if (Array.isArray(parsed.activeCauses)) {
                for (const c of parsed.activeCauses) {
                  if (typeof c === 'string' && !causeStartMap.has(c)) {
                    causeStartMap.set(c, existingAlert.opened_at_ms);
                  }
                }
              }
            } catch {
              // fallback
            }
          }

          if (existingAlert.cause_code && !causeStartMap.has(existingAlert.cause_code)) {
            causeStartMap.set(existingAlert.cause_code, existingAlert.opened_at_ms);
          }

          let causalResolutions: Array<{
            id: string;
            cause_code: string;
            completed_at_ms: number;
            actor_id: string;
          }> = [];

          if (causeStartMap.size > 0) {
            for (const [causeCode, causeStartedAtMs] of causeStartMap.entries()) {
              const rows = this.db
                .prepare(
                  `SELECT id, cause_code, completed_at_ms, actor_id
                   FROM telemetry_cause_resolution
                   WHERE dataset_id = ? AND epoch = ? AND resource_id = ?
                     AND cause_code = ?
                     AND completed_at_ms >= ?
                   ORDER BY completed_at_ms DESC, id ASC`,
                )
                .all(context.datasetId, context.epoch, eq.resource_id, causeCode, causeStartedAtMs) as Array<{
                  id: string;
                  cause_code: string;
                  completed_at_ms: number;
                  actor_id: string;
                }>;
              causalResolutions.push(...rows);
            }
          } else if (existingAlert.cause_code) {
            causalResolutions = this.db
              .prepare(
                `SELECT id, cause_code, completed_at_ms, actor_id
                 FROM telemetry_cause_resolution
                 WHERE dataset_id = ? AND epoch = ? AND resource_id = ?
                   AND cause_code = ?
                   AND completed_at_ms >= ?
                 ORDER BY completed_at_ms DESC, id ASC`,
              )
              .all(context.datasetId, context.epoch, eq.resource_id, existingAlert.cause_code, existingAlert.opened_at_ms) as Array<{
                id: string;
                cause_code: string;
                completed_at_ms: number;
                actor_id: string;
              }>;
          } else {
            causalResolutions = [];
          }

          causalResolutions.sort((a, b) => b.completed_at_ms - a.completed_at_ms || a.id.localeCompare(b.id));

          const resolutionFact = {
            reason: causalResolutions.length > 0 ? 'telemetry_cause_resolved' : 'fault_condition_cleared',
            resolvedAtMs: dataNowMs,
            resolutions: causalResolutions.map((r) => ({
              resolutionId: r.id,
              causeCode: r.cause_code,
              completedAtMs: r.completed_at_ms,
              actorId: r.actor_id,
            })),
            evidenceIds: causalResolutions.map((r) => r.id),
          };

          this.resolveAlert(context, existingAlert, dataNowMs, resolutionFact);
          resolvedCount++;
          mutatedAlertIds.push(existingAlert.id);
        } else {
          unchangedCount++;
        }
      }
    }

    return {
      ruleCode: 'equipment_fault',
      openedCount,
      updatedCount,
      resolvedCount,
      unchangedCount,
    };
  }

  private evaluateCommunicationMissingInternal(
    context: AlertEvaluationContext,
    dataNowMs: number,
    mutatedAlertIds: string[],
  ): RuleEvaluationSummary {
    let openedCount = 0;
    let updatedCount = 0;
    let resolvedCount = 0;
    let unchangedCount = 0;

    const equipments = this.db
      .prepare(
        `SELECT
           r.id AS resource_id,
           rp.assigned_at_ms,
           oe.effective_at AS registered_at_iso,
           p.id AS profile_id,
           p.emitter_expected,
           p.expected_interval_ms,
           co.observed_at_ms,
           co.event_id AS observation_event_id
         FROM resource r
         JOIN equipment eq ON eq.dataset_id = r.dataset_id AND eq.epoch = r.epoch AND eq.id = r.id
         LEFT JOIN telemetry_resource_profile rp
           ON rp.dataset_id = r.dataset_id AND rp.epoch = r.epoch AND rp.resource_id = r.id AND rp.active = 1
         LEFT JOIN telemetry_profile p
           ON p.id = rp.profile_id AND p.version = rp.profile_version
         LEFT JOIN (
           SELECT resource_id, MIN(effective_at) AS effective_at
           FROM operational_event
           WHERE dataset_id = ? AND epoch = ? AND action = 'inventory.equipment.create.v1'
           GROUP BY resource_id
         ) oe ON oe.resource_id = r.id
         LEFT JOIN telemetry_communication_observation co
           ON co.dataset_id = r.dataset_id AND co.epoch = r.epoch AND co.resource_id = r.id
         WHERE r.dataset_id = ? AND r.epoch = ? AND r.kind = 'equipment' AND r.archived = 0
         ORDER BY r.id ASC`,
      )
      .all(context.datasetId, context.epoch, context.datasetId, context.epoch) as TelemetryProfileEquipmentRow[];

    for (const eq of equipments) {
      const existingAlert = this.db
        .prepare(
          `SELECT id, resource_id, rule_code, cycle, severity, status, cause_code, evidence_json
           FROM alert
           WHERE dataset_id = ? AND epoch = ? AND resource_id = ? AND rule_code = 'communication_missing'
             AND status IN ('open', 'acknowledged')`,
        )
        .get(context.datasetId, context.epoch, eq.resource_id) as ActiveAlertRow | undefined;

      // Distinguir explicitamente:
      // 1. Perfil ativo com emitter_expected = 1
      // 2. Perfil ativo com emitter_expected = 0
      // 3. Nenhum perfil ativo

      // Caso 3: Nenhum perfil ativo
      if (!eq.profile_id) {
        // NÃO resolver automaticamente communication_missing quando o perfil estiver ausente.
        // Preservar estado ou sinalizar indeterminação. Não afirmar que a comunicação foi restabelecida sem evidência.
        unchangedCount++;
        continue;
      }

      // Caso 2: Perfil ativo com emitter_expected != 1 (ex: FX-NONE-v1 com emitter_expected = 0)
      if (eq.emitter_expected !== 1 || !eq.expected_interval_ms) {
        // Equipamento sem expectativa de emissor não gera novo alerta de ausência.
        // Preservar estado existente se já houver alerta (sem observação real de restabelecimento).
        unchangedCount++;
        continue;
      }

      // Caso 1: Perfil ativo com emitter_expected === 1
      const toleranceMs = 3 * eq.expected_interval_ms;
      const targetSeverity: AlertSeverity = 'warning';

      if (eq.observed_at_ms !== null) {
        // Observação confirmada existe
        const deltaMs = dataNowMs - eq.observed_at_ms;
        const isStale = deltaMs > toleranceMs;

        if (isStale) {
          // Condição ativa: observação desatualizada (stale)
          const targetEvidenceJson = canonicalJson({
            state: 'stale',
            expectedIntervalMs: eq.expected_interval_ms,
            toleranceMs,
            observedAtMs: eq.observed_at_ms,
            evidenceIds: eq.observation_event_id ? [eq.observation_event_id] : [],
          });

          if (!existingAlert) {
            const alertId = this.createAlert(
              context,
              eq.resource_id,
              'communication_missing',
              targetSeverity,
              null,
              targetEvidenceJson,
              dataNowMs,
            );
            openedCount++;
            mutatedAlertIds.push(alertId);
          } else {
            if (
              existingAlert.severity === targetSeverity &&
              existingAlert.evidence_json === targetEvidenceJson
            ) {
              unchangedCount++;
            } else {
              this.db
                .prepare(
                  `UPDATE alert
                   SET severity = ?, evidence_json = ?
                   WHERE dataset_id = ? AND epoch = ? AND id = ?`,
                )
                .run(targetSeverity, targetEvidenceJson, context.datasetId, context.epoch, existingAlert.id);
              updatedCount++;
              mutatedAlertIds.push(existingAlert.id);
            }
          }
        } else {
          // Observação fresca e recente (deltaMs <= toleranceMs)
          // Condição de resolução: exige observação válida, contextual e recente
          if (existingAlert) {
            this.resolveAlert(context, existingAlert, dataNowMs, {
              reason: 'communication_restored',
              resolvedAtMs: dataNowMs,
              observedAtMs: eq.observed_at_ms,
              observationEventId: eq.observation_event_id,
              evidenceIds: eq.observation_event_id ? [eq.observation_event_id] : [],
            });
            resolvedCount++;
            mutatedAlertIds.push(existingAlert.id);
          } else {
            unchangedCount++;
          }
        }
      } else {
        // eq.observed_at_ms === null: Estado unknown (nenhuma observação cadastrada)
        const registeredAtMs = eq.registered_at_iso ? Date.parse(eq.registered_at_iso) : null;
        if (registeredAtMs === null || isNaN(registeredAtMs)) {
          // Lacuna cadastral: sem registro normativo, preserva estado sem mutação
          unchangedCount++;
          continue;
        }

        const deltaMs = dataNowMs - registeredAtMs;
        const isGraceExpired = deltaMs > toleranceMs;

        if (isGraceExpired) {
          // Grace period cadastral expirou sem qualquer observação: abre ou mantém alerta
          const targetEvidenceJson = canonicalJson({
            state: 'unknown',
            expectedIntervalMs: eq.expected_interval_ms,
            toleranceMs,
            registeredAtMs,
            evidenceIds: [],
          });

          if (!existingAlert) {
            const alertId = this.createAlert(
              context,
              eq.resource_id,
              'communication_missing',
              targetSeverity,
              null,
              targetEvidenceJson,
              dataNowMs,
            );
            openedCount++;
            mutatedAlertIds.push(alertId);
          } else {
            if (
              existingAlert.severity === targetSeverity &&
              existingAlert.evidence_json === targetEvidenceJson
            ) {
              unchangedCount++;
            } else {
              this.db
                .prepare(
                  `UPDATE alert
                   SET severity = ?, evidence_json = ?
                   WHERE dataset_id = ? AND epoch = ? AND id = ?`,
                )
                .run(targetSeverity, targetEvidenceJson, context.datasetId, context.epoch, existingAlert.id);
              updatedCount++;
              mutatedAlertIds.push(existingAlert.id);
            }
          }
        } else {
          // P1-2: Ainda dentro da tolerância cadastral (deltaMs <= toleranceMs).
          // NUNCA resolver um alerta já existente com base em tolerância cadastral.
          // Alerta prévio permanece aberto até haver uma observação real confirmada.
          unchangedCount++;
        }
      }
    }

    return {
      ruleCode: 'communication_missing',
      openedCount,
      updatedCount,
      resolvedCount,
      unchangedCount,
    };
  }

  private evaluateMaintenanceDueInternal(
    context: AlertEvaluationContext,
    dataNowMs: number,
    mutatedAlertIds: string[],
  ): RuleEvaluationSummary {
    let openedCount = 0;
    let updatedCount = 0;
    let resolvedCount = 0;
    let unchangedCount = 0;

    const timeZone = context.timeZone ?? 'America/Sao_Paulo';
    const currentCivilDate = getCivilDateString(dataNowMs, timeZone);

    const equipments = this.db
      .prepare(
        `SELECT r.id AS resource_id
         FROM resource r
         JOIN equipment eq ON eq.dataset_id = r.dataset_id AND eq.epoch = r.epoch AND eq.id = r.id
         WHERE r.dataset_id = ? AND r.epoch = ? AND r.kind = 'equipment' AND r.archived = 0
         ORDER BY r.id ASC`,
      )
      .all(context.datasetId, context.epoch) as Array<{ resource_id: string }>;

    for (const eq of equipments) {
      const requests = this.db
        .prepare(
          `SELECT id, equipment_id, cause_code, priority, due_date
           FROM maintenance_request
           WHERE dataset_id = ? AND epoch = ? AND equipment_id = ?
             AND status = 'open' AND schedule_status = 'dated' AND due_date IS NOT NULL
           ORDER BY due_date ASC, id ASC`,
        )
        .all(context.datasetId, context.epoch, eq.resource_id) as MaintenanceRequestRow[];

      const activeRequests: Array<{
        requestId: string;
        causeCode: string;
        dueDate: string;
        priority: string;
        diffDays: number;
        severity: AlertSeverity;
      }> = [];

      for (const req of requests) {
        const diffDays = getCivilDayDifference(req.due_date, currentCivilDate);
        if (diffDays <= 7) {
          let reqSeverity: AlertSeverity;
          if (req.priority === 'critical') {
            reqSeverity = 'critical';
          } else if (diffDays < 0) {
            reqSeverity = 'high';
          } else {
            reqSeverity = 'warning';
          }
          activeRequests.push({
            requestId: req.id,
            causeCode: req.cause_code,
            dueDate: req.due_date,
            priority: req.priority,
            diffDays,
            severity: reqSeverity,
          });
        }
      }

      const isConditionActive = activeRequests.length > 0;

      const existingAlert = this.db
        .prepare(
          `SELECT id, resource_id, rule_code, cycle, severity, status, cause_code, evidence_json
           FROM alert
           WHERE dataset_id = ? AND epoch = ? AND resource_id = ? AND rule_code = 'maintenance_due'
             AND status IN ('open', 'acknowledged')`,
        )
        .get(context.datasetId, context.epoch, eq.resource_id) as ActiveAlertRow | undefined;

      if (isConditionActive) {
        // Severidade agregada: max entre as solicitações ativas
        let effectiveSeverity: AlertSeverity = 'warning';
        if (activeRequests.some((r) => r.severity === 'critical')) {
          effectiveSeverity = 'critical';
        } else if (activeRequests.some((r) => r.severity === 'high')) {
          effectiveSeverity = 'high';
        }

        // Causa primária determinística: solicitação mais antiga (menor due_date)
        const primaryCauseCode = activeRequests[0]!.causeCode;

        // Evidência normativa estável (sem timestamps transitórios voláteis que forçam updates a cada tick)
        const evidenceObj = {
          activeRequests: activeRequests.map((r) => ({
            requestId: r.requestId,
            causeCode: r.causeCode,
            dueDate: r.dueDate,
            priority: r.priority,
            diffDays: r.diffDays,
            severity: r.severity,
          })),
          effectiveSeverity,
          currentCivilDate,
          evidenceIds: activeRequests.map((r) => r.requestId),
        };
        const targetEvidenceJson = canonicalJson(evidenceObj);

        if (!existingAlert) {
          const alertId = this.createAlert(
            context,
            eq.resource_id,
            'maintenance_due',
            effectiveSeverity,
            primaryCauseCode,
            targetEvidenceJson,
            dataNowMs,
          );
          openedCount++;
          mutatedAlertIds.push(alertId);
        } else {
          if (
            existingAlert.severity === effectiveSeverity &&
            existingAlert.evidence_json === targetEvidenceJson
          ) {
            unchangedCount++;
          } else {
            this.db
              .prepare(
                `UPDATE alert
                 SET severity = ?, evidence_json = ?
                 WHERE dataset_id = ? AND epoch = ? AND id = ?`,
              )
              .run(effectiveSeverity, targetEvidenceJson, context.datasetId, context.epoch, existingAlert.id);
            updatedCount++;
            mutatedAlertIds.push(existingAlert.id);
          }
        }
      } else {
        if (existingAlert) {
          let previousRequestIds: string[] = [];
          try {
            const parsed = JSON.parse(existingAlert.evidence_json);
            if (Array.isArray(parsed.evidenceIds)) {
              previousRequestIds = parsed.evidenceIds.filter((id: unknown) => typeof id === 'string');
            } else if (Array.isArray(parsed.activeRequests)) {
              previousRequestIds = parsed.activeRequests
                .map((r: { requestId?: string }) => r.requestId)
                .filter((id: unknown) => typeof id === 'string');
            }
          } catch {
            previousRequestIds = [];
          }

          if (previousRequestIds.length === 0) {
            // Ausência indeterminada sem IDs correlacionados: política conservadora preserva o alerta
            unchangedCount++;
            continue;
          }

          const placeholders = previousRequestIds.map(() => '?').join(',');
          const matchedRequests = this.db
            .prepare(
              `SELECT id, status, schedule_status, due_date
               FROM maintenance_request
               WHERE dataset_id = ? AND epoch = ? AND equipment_id = ? AND id IN (${placeholders})`,
            )
            .all(context.datasetId, context.epoch, eq.resource_id, ...previousRequestIds) as Array<{
              id: string;
              status: string;
              schedule_status: string;
              due_date: string | null;
            }>;
          const matchedMap = new Map(matchedRequests.map((r) => [r.id, r]));

          const opEvents = this.db
            .prepare(
              `SELECT id, effective_at, changes_json
               FROM operational_event
               WHERE dataset_id = ? AND epoch = ? AND resource_id = ?
               ORDER BY effective_at DESC`,
            )
            .all(context.datasetId, context.epoch, eq.resource_id) as Array<{
              id: string;
              effective_at: string;
              changes_json: string;
            }>;

          interface RequestDisposition {
            requestId: string;
            disposition: 'rescheduled' | 'closed_by_state' | 'closed_by_event' | 'indeterminate_absence';
            dueDate?: string | null;
            diffDays?: number | null;
            closedByEventId?: string;
          }

          const dispositions: RequestDisposition[] = [];

          for (const reqId of previousRequestIds) {
            const matched = matchedMap.get(reqId);
            if (matched) {
              if (matched.status !== 'open') {
                // 1. Fechamento comprovado por estado persistido
                dispositions.push({
                  requestId: reqId,
                  disposition: 'closed_by_state',
                });
              } else if (matched.schedule_status === 'dated' && matched.due_date) {
                const diffDays = getCivilDayDifference(matched.due_date, currentCivilDate);
                if (diffDays > 7) {
                  // 2. Reagendamento comprovado para fora da janela
                  dispositions.push({
                    requestId: reqId,
                    disposition: 'rescheduled',
                    dueDate: matched.due_date,
                    diffDays,
                  });
                } else {
                  // Data ainda na janela: ausência indeterminada de motivo de resolução
                  dispositions.push({
                    requestId: reqId,
                    disposition: 'indeterminate_absence',
                  });
                }
              } else {
                // Reagendado para status não datado
                dispositions.push({
                  requestId: reqId,
                  disposition: 'rescheduled',
                  dueDate: matched.due_date,
                });
              }
            } else {
              // Registro não encontrado em maintenance_request: verificar fechamento comprovado por evento persistido
              let closureEventId: string | undefined;
              for (const ev of opEvents) {
                if (ev.changes_json.includes(reqId)) {
                  try {
                    const parsedEv = JSON.parse(ev.changes_json);
                    if (
                      parsedEv.closedMaintenanceRequestId === reqId ||
                      parsedEv.closedMaintenanceId === reqId ||
                      parsedEv.closedRequestId === reqId ||
                      (Array.isArray(parsedEv.closedRequestIds) && parsedEv.closedRequestIds.includes(reqId)) ||
                      (Array.isArray(parsedEv.closedMaintenanceRequests) && parsedEv.closedMaintenanceRequests.includes(reqId)) ||
                      (parsedEv.maintenanceRequest?.id === reqId && (parsedEv.maintenanceRequest?.status === 'closed' || parsedEv.maintenanceRequest?.status === 'completed')) ||
                      (parsedEv.status === 'closed' && (parsedEv.requestId === reqId || parsedEv.id === reqId)) ||
                      (parsedEv.maintenanceClosed === true && (parsedEv.requestId === reqId || parsedEv.id === reqId))
                    ) {
                      closureEventId = ev.id;
                      break;
                    }
                  } catch {
                    // ignorar
                  }
                }
              }

              if (closureEventId) {
                // 1. Fechamento comprovado por evento persistido
                dispositions.push({
                  requestId: reqId,
                  disposition: 'closed_by_event',
                  closedByEventId: closureEventId,
                });
              } else {
                // 3. Ausência de registro sem prova de fechamento (ausência indeterminada)
                dispositions.push({
                  requestId: reqId,
                  disposition: 'indeterminate_absence',
                });
              }
            }
          }

          // Se qualquer solicitação possuir ausência indeterminada sem prova cabal:
          // Política contratual conservadora: PRESERVAR O ALERTA (não resolve, não inventa desfecho)
          const hasIndeterminate = dispositions.some((d) => d.disposition === 'indeterminate_absence');
          if (hasIndeterminate) {
            unchangedCount++;
            continue;
          }

          // Todas as solicitações possuem desfecho comprovado
          const anyRescheduled = dispositions.some((d) => d.disposition === 'rescheduled');
          const determinedReason = anyRescheduled ? 'maintenance_rescheduled' : 'maintenance_request_closed';

          const resolutionEvidenceIds = [
            ...previousRequestIds,
            ...dispositions
              .map((d) => d.closedByEventId)
              .filter((id): id is string => typeof id === 'string'),
          ];

          const resolutionFact = {
            reason: determinedReason,
            resolvedAtMs: dataNowMs,
            requests: dispositions.map((d) => ({
              requestId: d.requestId,
              disposition: d.disposition,
              dueDate: d.dueDate ?? null,
              closedByEventId: d.closedByEventId ?? null,
            })),
            evidenceIds: resolutionEvidenceIds,
          };

          this.resolveAlert(context, existingAlert, dataNowMs, resolutionFact);
          resolvedCount++;
          mutatedAlertIds.push(existingAlert.id);
        } else {
          unchangedCount++;
        }
      }
    }

    return {
      ruleCode: 'maintenance_due',
      openedCount,
      updatedCount,
      resolvedCount,
      unchangedCount,
    };
  }

  // ===========================================================================
  // MUTAÇÕES TRANSACIONAIS DE PERSISTÊNCIA E EVENTOS
  // ===========================================================================

  private createAlert(
    context: AlertEvaluationContext,
    resourceId: string,
    ruleCode: AlertRuleCode,
    severity: AlertSeverity,
    causeCode: string | null,
    evidenceJson: string,
    openedAtMs: number,
  ): string {
    const alertId = randomUUID();
    const eventId = randomUUID();

    // Cálculo transacional e monotônico do ciclo (cycle >= 1)
    const cycleRow = this.db
      .prepare(
        `SELECT COALESCE(MAX(cycle), 0) + 1 AS next_cycle
         FROM alert
         WHERE dataset_id = ? AND epoch = ? AND resource_id = ? AND rule_code = ?`,
      )
      .get(context.datasetId, context.epoch, resourceId, ruleCode) as { next_cycle: number };
    const nextCycle = cycleRow.next_cycle;

    // 1. Inserção na entidade alert
    this.db
      .prepare(
        `INSERT INTO alert (
           dataset_id, epoch, id, resource_id, rule_code, rule_version,
           cycle, severity, status, cause_code, evidence_json,
           opened_at_ms, acknowledged_at_ms, acknowledged_by, resolved_at_ms, resolved_by
         ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, 'open', ?, ?, ?, NULL, NULL, NULL, NULL)`,
      )
      .run(
        context.datasetId,
        context.epoch,
        alertId,
        resourceId,
        ruleCode,
        nextCycle,
        severity,
        causeCode,
        evidenceJson,
        openedAtMs,
      );

    // 2. Inserção atômica no histórico alert_event (evento de abertura: status='open', previous_status=NULL, actor_id=NULL)
    this.db
      .prepare(
        `INSERT INTO alert_event (
           dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
           cycle, severity, previous_status, status, evidence_json,
           occurred_at_ms, recorded_at_ms, actor_id
         ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, NULL, 'open', ?, ?, ?, NULL)`,
      )
      .run(
        context.datasetId,
        context.epoch,
        eventId,
        alertId,
        resourceId,
        ruleCode,
        nextCycle,
        severity,
        evidenceJson,
        openedAtMs,
        openedAtMs,
      );

    return alertId;
  }

  private resolveAlert(
    context: AlertEvaluationContext,
    existingAlert: ActiveAlertRow,
    resolvedAtMs: number,
    resolutionFact?: Record<string, unknown>,
  ): void {
    const eventId = randomUUID();
    let resolvedEvidenceJson = existingAlert.evidence_json;
    if (resolutionFact) {
      try {
        const parsed = JSON.parse(existingAlert.evidence_json);
        resolvedEvidenceJson = canonicalJson({
          ...parsed,
          ...(existingAlert.rule_code === 'equipment_fault' ? { activeCauses: [] } : {}),
          resolutionFact,
        });
      } catch {
        resolvedEvidenceJson = canonicalJson({ resolutionFact });
      }
    }

    // 1. Atualização para status='resolved' com resolved_by=NULL (resolução causal automática)
    this.db
      .prepare(
        `UPDATE alert
         SET status = 'resolved', resolved_at_ms = ?, resolved_by = NULL, evidence_json = ?
         WHERE dataset_id = ? AND epoch = ? AND id = ?`,
      )
      .run(resolvedAtMs, resolvedEvidenceJson, context.datasetId, context.epoch, existingAlert.id);

    // 2. Inserção atômica no histórico alert_event (evento de resolução: status='resolved', actor_id=NULL)
    this.db
      .prepare(
        `INSERT INTO alert_event (
           dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
           cycle, severity, previous_status, status, evidence_json,
           occurred_at_ms, recorded_at_ms, actor_id
         ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'resolved', ?, ?, ?, NULL)`,
      )
      .run(
        context.datasetId,
        context.epoch,
        eventId,
        existingAlert.id,
        existingAlert.resource_id,
        existingAlert.rule_code,
        existingAlert.cycle,
        existingAlert.severity,
        existingAlert.status, // 'open' ou 'acknowledged'
        resolvedEvidenceJson,
        resolvedAtMs,
        resolvedAtMs,
      );
  }
}
