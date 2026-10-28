/**
 * PROJECT IGNIS — T0007 / PKG-05
 * Construção, normalização JCS (RFC 8785) e hashing SHA-256 de Ce e Cc conforme C02 e C03.
 */

import { AppError } from '../../errors.js';
import { canonicalJson, hashJson } from '../../idempotency/json.js';
import type { ValidatedObservationValues } from './profile.js';
import { C02_MAX_TIMESTAMP_MS, C02_MIN_TIMESTAMP_MS } from './trusted-clock.js';

export interface CanonicalEventPayload {
  readonly channel: string;
  readonly observationType: string;
  readonly resourceId: string;
  readonly sequence: number;
  readonly units: string | null;
  readonly values: Record<string, unknown>;
}

export interface CanonicalEventSource {
  readonly id: string;
  readonly kind: string;
}

export interface CanonicalEvent {
  readonly canonicalVersion: 1;
  readonly datasetId: string;
  readonly epoch: number;
  readonly eventId: string;
  readonly eventType: string;
  readonly schemaVersion: number;
  readonly entityType: string;
  readonly entityId: string;
  readonly source: CanonicalEventSource;
  readonly occurredAt: string;
  readonly causationId: string | null;
  readonly payload: CanonicalEventPayload;
}

export interface CanonicalCommandBody {
  readonly eventId: string;
  readonly eventType: string;
  readonly schemaVersion: number;
  readonly entityType: string;
  readonly entityId: string;
  readonly source: CanonicalEventSource;
  readonly occurredAt: string;
  readonly causationId: string | null;
  readonly payload: CanonicalEventPayload;
}

export interface CanonicalCommand {
  readonly canonicalVersion: 1;
  readonly datasetId: string;
  readonly epoch: number;
  readonly actorId: string;
  readonly operation: 'telemetry.ingest.v1';
  readonly target: null;
  readonly body: CanonicalCommandBody;
}

/**
 * Normaliza e substitui -0 por 0 recursivamente.
 */
export function normalizeNegativeZeros<T>(val: T): T {
  if (typeof val === 'number') {
    return (Object.is(val, -0) ? 0 : val) as T;
  }
  if (Array.isArray(val)) {
    return val.map(normalizeNegativeZeros) as unknown as T;
  }
  if (val !== null && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = normalizeNegativeZeros(v);
    }
    return out as T;
  }
  return val;
}

/**
 * Extrai os valores canônicos expurgando o discriminador interno 'kind'.
 */
export function extractCanonicalValues(values: ValidatedObservationValues | Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (k !== 'kind') {
      clean[k] = normalizeNegativeZeros(v);
    }
  }
  return clean;
}

/**
 * Normaliza timestamp de ocorrência para milissegundos UTC e string canônica ISO 8601 UTC.
 */
export function normalizeOccurredAt(occurredAt: string | number): { occurredAtMs: number; occurredAtISO: string } {
  let ms: number;
  if (typeof occurredAt === 'number') {
    if (!Number.isSafeInteger(occurredAt)) {
      throw new AppError(422, 'INVALID_VALUE', 'Timestamp occurredAt numérico deve ser inteiro seguro.');
    }
    ms = occurredAt;
  } else if (typeof occurredAt === 'string') {
    const trimmed = occurredAt.trim();
    if (trimmed.length === 0) {
      throw new AppError(422, 'INVALID_VALUE', 'Timestamp occurredAt não pode ser vazio.');
    }
    ms = Date.parse(trimmed);
    if (Number.isNaN(ms)) {
      throw new AppError(422, 'INVALID_VALUE', `Timestamp occurredAt inválido: ${occurredAt}`);
    }
  } else {
    throw new AppError(422, 'INVALID_VALUE', 'Timestamp occurredAt deve ser string ISO ou número em milissegundos.');
  }

  if (ms < C02_MIN_TIMESTAMP_MS || ms > C02_MAX_TIMESTAMP_MS) {
    throw new AppError(422, 'INVALID_VALUE', `Timestamp occurredAt fora dos limites normativos C02 (${ms}).`);
  }

  return {
    occurredAtMs: ms,
    occurredAtISO: new Date(ms).toISOString(),
  };
}

export interface BuildCanonicalEventInput {
  readonly datasetId: string;
  readonly epoch: number;
  readonly sourceId: string;
  readonly sourceKind: string;
  readonly resourceKind: string;
  readonly envelope: {
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
  };
  readonly canonicalValues: Record<string, unknown>;
  readonly occurredAtISO: string;
}

export function buildCanonicalEvent(input: BuildCanonicalEventInput): {
  canonical: CanonicalEvent;
  canonicalJson: string;
  eventHash: string;
} {
  const { datasetId, epoch, sourceId, sourceKind, resourceKind, envelope, canonicalValues, occurredAtISO } = input;

  const payload: CanonicalEventPayload = {
    channel: envelope.channel,
    observationType: envelope.observationType,
    resourceId: envelope.resourceId,
    sequence: envelope.sequence,
    units: envelope.units ?? null,
    values: normalizeNegativeZeros(canonicalValues),
  };

  const canonical: CanonicalEvent = {
    canonicalVersion: 1,
    datasetId,
    epoch,
    eventId: envelope.eventId,
    eventType: envelope.eventType ?? 'TelemetryEvent',
    schemaVersion: envelope.schemaVersion ?? 1,
    entityType: envelope.entityType ?? resourceKind,
    entityId: envelope.entityId ?? envelope.resourceId,
    source: {
      id: sourceId,
      kind: sourceKind,
    },
    occurredAt: occurredAtISO,
    causationId: envelope.causationId ?? null,
    payload,
  };

  const hashed = hashJson(canonical);
  return {
    canonical,
    canonicalJson: hashed.canonical,
    eventHash: hashed.hash,
  };
}

export interface BuildCanonicalCommandInput {
  readonly datasetId: string;
  readonly epoch: number;
  readonly actorId: string;
  readonly canonicalEvent: CanonicalEvent;
}

export function buildCanonicalCommand(input: BuildCanonicalCommandInput): {
  canonical: CanonicalCommand;
  canonicalJson: string;
  requestHash: string;
} {
  const { datasetId, epoch, actorId, canonicalEvent } = input;

  const body: CanonicalCommandBody = {
    eventId: canonicalEvent.eventId,
    eventType: canonicalEvent.eventType,
    schemaVersion: canonicalEvent.schemaVersion,
    entityType: canonicalEvent.entityType,
    entityId: canonicalEvent.entityId,
    source: canonicalEvent.source,
    occurredAt: canonicalEvent.occurredAt,
    causationId: canonicalEvent.causationId,
    payload: canonicalEvent.payload,
  };

  const canonical: CanonicalCommand = {
    canonicalVersion: 1,
    datasetId,
    epoch,
    actorId,
    operation: 'telemetry.ingest.v1',
    target: null,
    body,
  };

  const hashed = hashJson(canonical);
  return {
    canonical,
    canonicalJson: hashed.canonical,
    requestHash: hashed.hash,
  };
}
