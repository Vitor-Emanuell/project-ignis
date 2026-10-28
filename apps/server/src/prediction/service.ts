import type Database from 'better-sqlite3';
import type { Authorization, Credentials } from '../auth.js';
import { TrustedClockService } from '../domain/telemetry/trusted-clock.js';
import { SystemTimeProvider } from '../domain/telemetry/time-provider.js';

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const clock = new TrustedClockService(new SystemTimeProvider());

// O corte e o instante de conhecimento são do servidor. Esta consulta é descritiva:
// a implementação ainda não comprova intervalos de cobertura nem calcula P01.
export function readPredictiveHistory(auth: Authorization, credentials: Credentials, datasetId: string, epoch: number) {
  const db: Database.Database = auth.store.db;
  return db.transaction(() => {
    const context = auth.context(credentials, datasetId, epoch, false);
    const asOfMs = clock.sampleTrustedNow(db).utcMs;
    const fromMs = asOfMs - WINDOW_MS;
    const items = db.prepare(`
      SELECT r.id, r.public_label AS label, e.criticality,
        (SELECT count(*) FROM telemetry_event t
         WHERE t.dataset_id=r.dataset_id AND t.epoch=r.epoch AND t.resource_id=r.id
           AND t.observation_effective_at_ms>=? AND t.observation_effective_at_ms<=?
           AND t.occurred_at_ms<=? AND t.recorded_at_ms<=? AND t.received_at_ms<=?) AS occurrences,
        (SELECT count(*) FROM telemetry_event t
         WHERE t.dataset_id=r.dataset_id AND t.epoch=r.epoch AND t.resource_id=r.id AND t.is_simulated=1
           AND t.observation_effective_at_ms>=? AND t.observation_effective_at_ms<=?
           AND t.occurred_at_ms<=? AND t.recorded_at_ms<=? AND t.received_at_ms<=?) AS simulatedOccurrences,
        (SELECT count(*) FROM telemetry_episode ep
         WHERE ep.dataset_id=r.dataset_id AND ep.epoch=r.epoch AND ep.resource_id=r.id
           AND ep.episode_started_at_ms>=? AND ep.episode_started_at_ms<=?
           AND ep.recorded_at_ms<=?) AS failures,
        (SELECT count(*) FROM maintenance_request m
         WHERE m.dataset_id=r.dataset_id AND m.epoch=r.epoch AND m.equipment_id=r.id
           AND m.status='open') AS maintenanceCount,
        (SELECT min(m.due_date) FROM maintenance_request m
         WHERE m.dataset_id=r.dataset_id AND m.epoch=r.epoch AND m.equipment_id=r.id
           AND m.status='open' AND m.schedule_status='dated') AS nextDueDate
      FROM resource r JOIN equipment e
        ON e.dataset_id=r.dataset_id AND e.epoch=r.epoch AND e.id=r.id
      WHERE r.dataset_id=? AND r.epoch=? AND r.kind='equipment' AND r.archived=0
      ORDER BY failures DESC, occurrences DESC, e.criticality DESC, r.id ASC
    `).all(fromMs, asOfMs, asOfMs, asOfMs, asOfMs, fromMs, asOfMs, asOfMs, asOfMs, asOfMs, fromMs, asOfMs, asOfMs, context.datasetId, context.epoch) as Array<{
      id: string; label: string; criticality: number; occurrences: number; simulatedOccurrences: number; failures: number;
      maintenanceCount: number; nextDueDate: string | null;
    }>;
    return {
      datasetId: context.datasetId, epoch: context.epoch, revision: context.revision,
      asOfMs, knowledgeCutoffMs: asOfMs, fromMs, horizonDays: 7,
      status: 'insufficient_data' as const, score: null,
      limitations: [
        'Cobertura temporal P01 não comprovada; score indisponível.',
        'Ocorrências incluem todas as disposições; o campo simulado identifica eventos marcados. Proveniência dos episódios não é classificada nesta consulta.',
        'Criticidade e agenda são dados atuais; não constituem histórico retrospectivo.',
      ],
      provenance: 'telemetry_event e telemetry_episode; períodos e registros conhecidos até o corte',
      ordering: 'falhas observadas, ocorrências e criticidade decrescentes; ID crescente',
      items: items.map(item => ({ ...item, score: null, status: 'insufficient_data' as const })),
    };
  }).deferred();
}
