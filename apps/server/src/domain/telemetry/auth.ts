/**
 * PROJECT IGNIS — T0007 / PKG-03
 * Autenticação e autorização de fontes de telemetria conforme C03 e D07.
 */

import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { AppError, storageError } from '../../errors.js';
import { SystemTimeProvider, type TimeProvider } from './time-provider.js';
import { TrustedClockService, type TrustedTimeSample } from './trusted-clock.js';

export interface AuthenticatedSourceContext {
  readonly sourceId: string;
  readonly principalId: string; // Formato estrito: 'source:' || sourceId
  readonly sourceKind: string;
  readonly datasetId: string;
  readonly epoch: number;
}

export interface TelemetryAuthServiceOptions {
  readonly clockService?: TrustedClockService;
  readonly timeProvider?: TimeProvider;
}

export type TelemetryAuthFailureReason =
  | 'TOKEN_MISSING'
  | 'TOKEN_NOT_FOUND'
  | 'TOKEN_REVOKED'
  | 'TOKEN_EXPIRED'
  | 'SOURCE_INACTIVE'
  | 'SOURCE_NOT_FOUND'
  | 'EPOCH_MISMATCH'
  | 'EPOCH_NOT_READY'
  | 'IDENTITY_TAMPERED'
  | 'TRANSACTION_REQUIRED';

const issuedSourceContexts = new WeakSet<object>();

/**
 * Computa o hash SHA-256 do token bruto para consulta na tabela telemetry_credential.
 */
export function telemetryTokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Verifica em runtime a proveniência e imutabilidade de um AuthenticatedSourceContext.
 */
export function isValidSourceContext(context: unknown): context is AuthenticatedSourceContext {
  return typeof context === 'object' && context !== null && issuedSourceContexts.has(context);
}

/**
 * Salvaguarda que impede que objetos forjados ou não emitidos pelo serviço operem como identidade.
 */
export function assertValidSourceContext(context: unknown): asserts context is AuthenticatedSourceContext {
  if (!isValidSourceContext(context)) {
    throw new AppError(401, 'UNAUTHORIZED', 'Identidade não autenticada ou forjada.');
  }
}

export class TelemetryAuthService {
  readonly clockService: TrustedClockService;

  constructor(options?: TelemetryAuthServiceOptions) {
    this.clockService =
      options?.clockService ??
      new TrustedClockService(options?.timeProvider ?? new SystemTimeProvider());
  }

  /**
   * Autentica uma credencial na borda da requisição.
   * Valida vigência em tempo físico (salvaguarda D08), status da fonte e do dataset.
   * Emite um AuthenticatedSourceContext imutável e com proveniência registrada.
   * Suporta validação de proveniência de amostra existente para amostragem temporal única (D08).
   */
  authenticateSource(
    db: Database.Database,
    rawToken: string | undefined,
    datasetId: string,
    epoch: number,
    existingSample?: TrustedTimeSample,
  ): AuthenticatedSourceContext {
    if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
      throw new AppError(401, 'UNAUTHORIZED', 'Credencial de telemetria inválida ou ausente.');
    }

    // Amostragem temporal confiável ou validação de proveniência de amostra fornecida
    let nowMs: number;
    try {
      if (existingSample !== undefined) {
        this.clockService.assertValidSample(db, existingSample);
        nowMs = existingSample.utcMs;
      } else {
        const sample = this.clockService.sampleTrustedNow(db);
        nowMs = sample.utcMs;
      }
    } catch (error) {
      return storageError(error);
    }

    const hash = telemetryTokenHash(rawToken);

    let row:
      | {
          source_id: string;
          issued_at_ms: number;
          expires_at_ms: number;
          revoked_at_ms: number | null;
          source_kind: string;
          source_active: number;
        }
      | undefined;

    try {
      row = db
        .prepare(
          `SELECT c.source_id, c.issued_at_ms, c.expires_at_ms, c.revoked_at_ms,
                  s.source_kind, s.active AS source_active
           FROM telemetry_credential c
           JOIN telemetry_source s ON s.id = c.source_id
           WHERE c.token_hash = ?`,
        )
        .get(hash) as typeof row;
    } catch (error) {
      return storageError(error);
    }

    if (!row) {
      throw new AppError(401, 'UNAUTHORIZED', 'Credencial de telemetria inválida ou ausente.');
    }

    if (row.revoked_at_ms !== null) {
      throw new AppError(401, 'UNAUTHORIZED', 'Credencial de telemetria inválida ou ausente.');
    }

    if (row.expires_at_ms <= nowMs || row.issued_at_ms > nowMs) {
      throw new AppError(401, 'UNAUTHORIZED', 'Credencial de telemetria inválida ou ausente.');
    }

    if (row.source_active !== 1) {
      throw new AppError(403, 'FORBIDDEN', 'Fonte telemétrica desativada.');
    }

    let datasetContext:
      | {
          active_epoch: number;
          status: string;
        }
      | undefined;

    try {
      datasetContext = db
        .prepare(
          `SELECT d.active_epoch, e.status
           FROM dataset d
           JOIN dataset_epoch e ON e.dataset_id = d.id AND e.epoch = ?
           WHERE d.id = ?`,
        )
        .get(epoch, datasetId) as typeof datasetContext;
    } catch (error) {
      return storageError(error);
    }

    if (
      !datasetContext ||
      datasetContext.active_epoch !== epoch ||
      datasetContext.status !== 'ready'
    ) {
      throw new AppError(409, 'EPOCH_CONFLICT', 'Geração obsoleta ou indisponível.');
    }

    const context: AuthenticatedSourceContext = Object.freeze({
      sourceId: row.source_id,
      principalId: `source:${row.source_id}`,
      sourceKind: row.source_kind,
      datasetId,
      epoch,
    });

    issuedSourceContexts.add(context);
    return context;
  }

  /**
   * Revalidação atômica e estrita a ser executada obrigatoriamente dentro de transaction(db, ...).
   * Previne TOCTOU entre a amostragem de borda e o commit de ingestão.
   * Suporta validação de proveniência de amostra existente para amostragem temporal única (D08).
   */
  assertSourceAuthorizedInTx(
    db: Database.Database,
    auth: AuthenticatedSourceContext,
    rawToken: string,
    existingSample?: TrustedTimeSample,
  ): TrustedTimeSample {
    if (!db.inTransaction) {
      throw new AppError(
        500,
        'TRANSACTION_REQUIRED',
        'Revalidação de segurança exige transação ativa.',
      );
    }

    assertValidSourceContext(auth);

    if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
      throw new AppError(401, 'UNAUTHORIZED', 'Credencial de telemetria inválida ou ausente.');
    }

    // Validação de proveniência ou reamostragem temporal confiável sob transação
    let sample: TrustedTimeSample;
    try {
      if (existingSample !== undefined) {
        this.clockService.assertValidSample(db, existingSample);
        sample = existingSample;
      } else {
        sample = this.clockService.sampleTrustedNow(db);
      }
    } catch (error) {
      return storageError(error);
    }
    const nowMs = sample.utcMs;

    const hash = telemetryTokenHash(rawToken);

    let row:
      | {
          source_id: string;
          issued_at_ms: number;
          expires_at_ms: number;
          revoked_at_ms: number | null;
          source_active: number;
        }
      | undefined;

    try {
      row = db
        .prepare(
          `SELECT c.source_id, c.issued_at_ms, c.expires_at_ms, c.revoked_at_ms,
                  s.active AS source_active
           FROM telemetry_credential c
           JOIN telemetry_source s ON s.id = c.source_id
           WHERE c.token_hash = ?`,
        )
        .get(hash) as typeof row;
    } catch (error) {
      return storageError(error);
    }

    if (!row) {
      throw new AppError(401, 'UNAUTHORIZED', 'Credencial de telemetria inválida ou ausente.');
    }

    if (row.source_id !== auth.sourceId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Credencial não corresponde à fonte autenticada.');
    }

    if (row.revoked_at_ms !== null) {
      throw new AppError(401, 'UNAUTHORIZED', 'Credencial de telemetria inválida ou ausente.');
    }

    if (row.expires_at_ms <= nowMs || row.issued_at_ms > nowMs) {
      throw new AppError(401, 'UNAUTHORIZED', 'Credencial de telemetria inválida ou ausente.');
    }

    if (row.source_active !== 1) {
      throw new AppError(403, 'FORBIDDEN', 'Fonte telemétrica desativada.');
    }

    let datasetContext:
      | {
          active_epoch: number;
          status: string;
        }
      | undefined;

    try {
      datasetContext = db
        .prepare(
          `SELECT d.active_epoch, e.status
           FROM dataset d
           JOIN dataset_epoch e ON e.dataset_id = d.id AND e.epoch = ?
           WHERE d.id = ?`,
        )
        .get(auth.epoch, auth.datasetId) as typeof datasetContext;
    } catch (error) {
      return storageError(error);
    }

    if (
      !datasetContext ||
      datasetContext.active_epoch !== auth.epoch ||
      datasetContext.status !== 'ready'
    ) {
      throw new AppError(409, 'EPOCH_CONFLICT', 'Geração obsoleta ou indisponível.');
    }

    return sample;
  }
}
