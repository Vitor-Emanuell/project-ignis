/**
 * PROJECT IGNIS — T0007 / PKG-02
 * Serviço de Relógio Lógico Confiável (D08).
 * Garante monotonicidade de hardware e banco, avaliação de tolerância temporal e persistência transacional.
 */

import type Database from 'better-sqlite3';
import { AppError } from '../../errors.js';
import type { TimeProvider } from './time-provider.js';

export const C02_MIN_TIMESTAMP_MS = -62135596800000; // 0001-01-01T00:00:00.000Z
export const C02_MAX_TIMESTAMP_MS = 253402300799999;  // 9999-12-31T23:59:59.999Z
export const CLOCK_TOLERANCE_MAX_FUTURE_MS = 30000;   // Skew tolerado até +30s inclusivo

/**
 * Erros tipados do domínio de relógio lógico.
 */
export class ClockUntrustedError extends AppError {
  constructor(message: string) {
    super(503, 'CLOCK_UNTRUSTED', message);
    this.name = 'ClockUntrustedError';
  }
}

export class ClockStaleSampleError extends AppError {
  constructor(message: string) {
    super(409, 'STALE_SAMPLE', message);
    this.name = 'ClockStaleSampleError';
  }
}

export class ClockTransactionRequiredError extends AppError {
  constructor(message: string) {
    super(500, 'TRANSACTION_REQUIRED', message);
    this.name = 'ClockTransactionRequiredError';
  }
}

export class ClockInvalidTimestampError extends AppError {
  constructor(message: string) {
    super(422, 'INVALID_TIMESTAMP', message);
    this.name = 'ClockInvalidTimestampError';
  }
}

export class ClockTamperedSampleError extends AppError {
  constructor(message: string) {
    super(400, 'TAMPERED_SAMPLE', message);
    this.name = 'ClockTamperedSampleError';
  }
}

export enum WindowEvaluationStatus {
  VALID_ACCEPTED = 'VALID_ACCEPTED',
  TOLERATED_FUTURE = 'TOLERATED_FUTURE',
  EXCESSIVE_FUTURE_REJECTED = 'EXCESSIVE_FUTURE_REJECTED',
}

/**
 * Token representativo de amostra temporal emitido unicamente por TrustedClockService.
 * Protegido em runtime contra falsificação, adulteração e reutilização entre instâncias.
 */
export interface TrustedTimeSample {
  readonly utcMs: number;
  readonly sampledAtUtcMs: number;
}

interface SampleMetadata {
  readonly utcMs: number;
  readonly sampledAtUtcMs: number;
  readonly dbPath: string;
  consumed: boolean;
}

export interface ObservationWindowEvaluation {
  readonly status: WindowEvaluationStatus;
  readonly occurredAtMs: number;
  readonly processingDataNowMs: number;
  readonly deltaMs: number;
  readonly observationEffectiveAtMs: number | null;
  readonly message?: string;
}

export class TrustedClockService {
  private readonly timeProvider: TimeProvider;
  private inProcessObservedWatermark: number = -Infinity;
  private readonly issuedSamples = new WeakSet<TrustedTimeSample>();
  private readonly sampleMetadata = new WeakMap<TrustedTimeSample, SampleMetadata>();

  constructor(timeProvider: TimeProvider) {
    this.timeProvider = timeProvider;
  }

  /**
   * Sanitização e validação estrita C02 / Safe Integer.
   */
  isValidTimestamp(ts: unknown): ts is number {
    return (
      typeof ts === 'number' &&
      Number.isSafeInteger(ts) &&
      ts >= C02_MIN_TIMESTAMP_MS &&
      ts <= C02_MAX_TIMESTAMP_MS
    );
  }

  /**
   * Consulta o marco durável confirmado na tabela singleton do SQLite.
   * Retorna null caso a tabela esteja vazia (ausência de sentinela numérico).
   */
  getDurableWatermark(db: Database.Database): number | null {
    const row = db.prepare('SELECT trusted_utc_ms FROM telemetry_trusted_clock WHERE singleton = 1').get() as
      | { trusted_utc_ms: number }
      | undefined;
    return row ? row.trusted_utc_ms : null;
  }

  /**
   * Amostragem confiável do relógio UTC.
   * Valida hardware local e integridade em relação ao banco durável SQLite.
   * Não executa nenhum DML (seguro para requisições GET e transações read-only).
   */
  sampleTrustedNow(db: Database.Database): TrustedTimeSample {
    const rawNow = this.timeProvider.now();

    if (!this.isValidTimestamp(rawNow)) {
      throw new ClockInvalidTimestampError(`Timestamp de hardware inválido: ${rawNow}`);
    }

    // 1. Sincroniza o maior marco durável já confirmado no SQLite (se existir)
    const durable = this.getDurableWatermark(db);
    if (durable !== null) {
      this.inProcessObservedWatermark = Math.max(this.inProcessObservedWatermark, durable);
    }

    // 2. Verificação de memória de processo: hardware não pode retroceder durante a vida do processo
    if (rawNow < this.inProcessObservedWatermark) {
      throw new ClockUntrustedError(
        `Relógio do host retrocedeu no processo. Observado: ${this.inProcessObservedWatermark}, Lido: ${rawNow}`,
      );
    }

    // 3. Verificação de banco durável (Read-Only via SELECT sem DML)
    if (durable !== null && rawNow < durable) {
      throw new ClockUntrustedError(
        `Relógio do host está defasado em relação ao marco durável comitado no banco. Durável: ${durable}, Lido: ${rawNow}`,
      );
    }

    this.inProcessObservedWatermark = Math.max(this.inProcessObservedWatermark, rawNow);

    const sample: TrustedTimeSample = Object.freeze({
      utcMs: rawNow,
      sampledAtUtcMs: rawNow,
    });

    this.issuedSamples.add(sample);
    this.sampleMetadata.set(sample, {
      utcMs: rawNow,
      sampledAtUtcMs: rawNow,
      dbPath: db.name,
      consumed: false,
    });

    return sample;
  }

  /**
   * Valida autenticidade, proveniência e integridade de um TrustedTimeSample sem consumi-lo.
   */
  assertValidSample(db: Database.Database, sample: unknown): asserts sample is TrustedTimeSample {
    if (!sample || typeof sample !== 'object' || !this.issuedSamples.has(sample as TrustedTimeSample)) {
      throw new ClockTamperedSampleError('Amostra de tempo não foi emitida por esta instância do serviço confiável.');
    }

    const s = sample as TrustedTimeSample;
    const meta = this.sampleMetadata.get(s);
    if (!meta || meta.utcMs !== s.utcMs || meta.sampledAtUtcMs !== s.sampledAtUtcMs) {
      throw new ClockTamperedSampleError('Amostra de tempo foi adulterada após a emissão.');
    }

    if (meta.dbPath !== db.name) {
      throw new ClockTamperedSampleError('Amostra de tempo emitida para outra base de dados.');
    }

    if (meta.consumed) {
      throw new ClockTamperedSampleError('Amostra de tempo já foi consumida em avanço prévio.');
    }

    if (!this.isValidTimestamp(s.utcMs)) {
      throw new ClockInvalidTimestampError(`Timestamp da amostra inválido: ${s.utcMs}`);
    }
  }

  /**
   * Executa o avanço atômico durável no SQLite sob transação ativa BEGIN IMMEDIATE.
   * Aceita exclusivamente um TrustedTimeSample certificado, bloqueando timestamps arbitrários.
   */
  advanceDurable(db: Database.Database, sample: TrustedTimeSample): void {
    if (!db.inTransaction) {
      throw new ClockTransactionRequiredError(
        'Avanço durável do relógio exige uma transação ativa no SQLite (Store.transaction).',
      );
    }

    // Salvaguarda A: Verificação de autenticidade e proveniência de runtime
    this.assertValidSample(db, sample);

    const meta = this.sampleMetadata.get(sample)!;

    // HIGH-01: Consulta novamente o relógio físico para detectar regressões antes ou durante a escrita
    const currentNow = this.timeProvider.now();
    if (!this.isValidTimestamp(currentNow)) {
      throw new ClockInvalidTimestampError(`Timestamp do provedor de tempo inválido: ${currentNow}`);
    }

    // Leitura sob lock de escrita da transação atual (BEGIN IMMEDIATE)
    const currentDurable = this.getDurableWatermark(db);

    // HIGH-01: Detecção de regressão física real do hardware
    if (
      currentNow < this.inProcessObservedWatermark ||
      currentNow < sample.utcMs ||
      (currentDurable !== null && currentNow < currentDurable)
    ) {
      throw new ClockUntrustedError(
        `Relógio físico retrocedeu antes do avanço durável. Físico: ${currentNow}, Observado: ${this.inProcessObservedWatermark}, Amostra: ${sample.utcMs}`,
      );
    }

    // Atualiza o relógio observado no processo com a leitura física mais recente
    this.inProcessObservedWatermark = Math.max(this.inProcessObservedWatermark, currentNow);

    // Amostra estagnada em relação ao marco durável comitado
    if (currentDurable !== null && sample.utcMs < currentDurable) {
      throw new ClockStaleSampleError(
        `Amostra temporal estagnada. Durável atual é ${currentDurable}, amostra é ${sample.utcMs}`,
      );
    }

    // MEDIUM-02: UPSERT monotônico atômico com verificação de resultado
    const stmt = db.prepare(`
      INSERT INTO telemetry_trusted_clock (singleton, trusted_utc_ms)
      VALUES (1, ?)
      ON CONFLICT(singleton) DO UPDATE SET
        trusted_utc_ms = excluded.trusted_utc_ms
      WHERE excluded.trusted_utc_ms >= telemetry_trusted_clock.trusted_utc_ms;
    `);

    const result = stmt.run(sample.utcMs);
    if (result.changes === 0) {
      throw new ClockStaleSampleError(
        `Conflito temporal no avanço durável. Watermark existente no banco é superior a ${sample.utcMs}.`,
      );
    }

    // Marca amostra como consumida
    meta.consumed = true;
  }

  /**
   * Avalia a conformidade temporal de uma observação de telemetria conforme D08 e C03 §4.
   * Calcula observationEffectiveAtMs = min(occurredAtMs, processingDataNowMs) para observações aceitas.
   */
  evaluateObservationWindow(occurredAtMs: number, processingDataNowMs: number): ObservationWindowEvaluation {
    if (!this.isValidTimestamp(occurredAtMs)) {
      throw new ClockInvalidTimestampError(`occurredAtMs inválido: ${occurredAtMs}`);
    }
    if (!this.isValidTimestamp(processingDataNowMs)) {
      throw new ClockInvalidTimestampError(`processingDataNowMs inválido: ${processingDataNowMs}`);
    }

    const deltaMs = occurredAtMs - processingDataNowMs;

    if (occurredAtMs <= processingDataNowMs) {
      return {
        status: WindowEvaluationStatus.VALID_ACCEPTED,
        occurredAtMs,
        processingDataNowMs,
        deltaMs,
        observationEffectiveAtMs: occurredAtMs, // min(occurredAtMs, processingDataNowMs)
      };
    }

    if (deltaMs <= CLOCK_TOLERANCE_MAX_FUTURE_MS) {
      return {
        status: WindowEvaluationStatus.TOLERATED_FUTURE,
        occurredAtMs,
        processingDataNowMs,
        deltaMs,
        observationEffectiveAtMs: processingDataNowMs, // Clamped: min(occurredAtMs, processingDataNowMs)
        message: 'Evento em futuro tolerado (<= 30s). Corte projetado em dataNow; relógio não avança.',
      };
    }

    return {
      status: WindowEvaluationStatus.EXCESSIVE_FUTURE_REJECTED,
      occurredAtMs,
      processingDataNowMs,
      deltaMs,
      observationEffectiveAtMs: null,
      message: `Evento excede tolerância de futuro de ${CLOCK_TOLERANCE_MAX_FUTURE_MS}ms (delta: ${deltaMs}ms). Rejeitado.`,
    };
  }
}
