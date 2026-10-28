/**
 * PROJECT IGNIS — T0010 / PKG-01
 * Tipos e interfaces estritamente necessários para persistência de alertas (T0010, F02, R06).
 */

export type AlertRuleCode = 'equipment_fault' | 'communication_missing' | 'maintenance_due';

export type AlertSeverity = 'warning' | 'high' | 'critical';

export type AlertStatus = 'open' | 'acknowledged' | 'resolved';

export interface AlertEvidence {
  readonly evidenceSummary?: string;
  readonly episodeIds?: readonly string[];
  readonly activeCauses?: readonly string[];
  readonly causeCode?: string;
  readonly requestId?: string;
  readonly dueDate?: string | null;
  readonly lastObservedAtMs?: number | null;
  readonly expectedIntervalMs?: number | null;
  readonly [key: string]: unknown;
}

export interface AlertRecord {
  readonly datasetId: string;
  readonly epoch: number;
  readonly id: string;
  readonly resourceId: string;
  readonly ruleCode: AlertRuleCode;
  readonly ruleVersion: 1;
  readonly cycle: number;
  readonly severity: AlertSeverity;
  readonly status: AlertStatus;
  readonly causeCode: string | null;
  readonly evidenceJson: string;
  readonly openedAtMs: number;
  readonly acknowledgedAtMs: number | null;
  readonly acknowledgedBy: string | null;
  readonly resolvedAtMs: number | null;
  readonly resolvedBy: string | null;
}

export interface AlertEventRecord {
  readonly datasetId: string;
  readonly epoch: number;
  readonly id: string;
  readonly alertId: string;
  readonly resourceId: string;
  readonly ruleCode: AlertRuleCode;
  readonly ruleVersion: 1;
  readonly cycle: number;
  readonly severity: AlertSeverity;
  readonly previousStatus: 'open' | 'acknowledged' | null;
  readonly status: AlertStatus;
  readonly evidenceJson: string;
  readonly occurredAtMs: number;
  readonly recordedAtMs: number;
  readonly actorId: string | null;
}
