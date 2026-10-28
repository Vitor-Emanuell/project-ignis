import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { Store, transaction } from '../src/persistence/store.js';
import {
  C02_MAX_TIMESTAMP_MS,
  C02_MIN_TIMESTAMP_MS,
  CLOCK_TOLERANCE_MAX_FUTURE_MS,
  ClockInvalidTimestampError,
  ClockStaleSampleError,
  ClockTamperedSampleError,
  ClockTransactionRequiredError,
  ClockUntrustedError,
  SettableTimeProvider,
  SystemTimeProvider,
  TrustedClockService,
  type TrustedTimeSample,
  WindowEvaluationStatus,
} from '../src/domain/telemetry/index.js';

const fixtures: { directory: string; store: Store }[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  const items = fixtures.splice(0);
  for (const f of items) {
    f.store.close();
  }
  const dirs = new Set(items.map(f => resolve(f.directory)));
  for (const target of dirs) {
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('ignis-t0007-clock-')) {
      throw new Error('Temporary fixture cleanup outside allocated directory');
    }
    rmSync(target, { recursive: true, force: true });
  }
});

function createTestDb() {
  const directory = mkdtempSync(join(tmpdir(), 'ignis-t0007-clock-'));
  const path = join(directory, 'test.sqlite');
  const store = new Store(path, true);
  store.migrate();
  fixtures.push({ directory, store });
  return { directory, path, store, db: store.db };
}

describe('PKG-02: Trusted Clock Service (D08)', () => {
  // CLK-01: watermark inicialmente null
  it('CLK-01: watermark inicialmente null em banco recém-migrado', () => {
    const { db } = createTestDb();
    const provider = new SettableTimeProvider(1_700_000_000_000);
    const service = new TrustedClockService(provider);

    const watermark = service.getDurableWatermark(db);
    expect(watermark).toBeNull();
  });

  // CLK-02: primeira persistência
  it('CLK-02: primeira persistência inicializa o singleton telemetry_trusted_clock', () => {
    const { db } = createTestDb();
    const now = 1_700_000_000_000;
    const provider = new SettableTimeProvider(now);
    const service = new TrustedClockService(provider);

    const sample = service.sampleTrustedNow(db);
    expect(sample.utcMs).toBe(now);

    transaction(db, () => {
      service.advanceDurable(db, sample);
    });

    expect(service.getDurableWatermark(db)).toBe(now);

    const row = db.prepare('SELECT singleton, trusted_utc_ms FROM telemetry_trusted_clock WHERE singleton = 1').get() as {
      singleton: number;
      trusted_utc_ms: number;
    };
    expect(row).toEqual({ singleton: 1, trusted_utc_ms: now });
  });

  // CLK-03: avanço monotônico
  it('CLK-03: avanço monotônico sucessivo (T1 < T2 < T3)', () => {
    const { db } = createTestDb();
    const provider = new SettableTimeProvider(1_700_000_000_000);
    const service = new TrustedClockService(provider);

    const t1 = service.sampleTrustedNow(db);
    transaction(db, () => service.advanceDurable(db, t1));
    expect(service.getDurableWatermark(db)).toBe(1_700_000_000_000);

    provider.advanceBy(1_000);
    const t2 = service.sampleTrustedNow(db);
    transaction(db, () => service.advanceDurable(db, t2));
    expect(service.getDurableWatermark(db)).toBe(1_700_000_001_000);

    provider.advanceBy(5_000);
    const t3 = service.sampleTrustedNow(db);
    transaction(db, () => service.advanceDurable(db, t3));
    expect(service.getDurableWatermark(db)).toBe(1_700_000_006_000);
  });

  // CLK-04: rollback sem persistência
  it('CLK-04: rollback transacional anula o avanço durável no SQLite', () => {
    const { db } = createTestDb();
    const provider = new SettableTimeProvider(1_700_000_000_000);
    const service = new TrustedClockService(provider);

    const t1 = service.sampleTrustedNow(db);
    transaction(db, () => service.advanceDurable(db, t1));
    expect(service.getDurableWatermark(db)).toBe(1_700_000_000_000);

    provider.advanceBy(10_000);
    const t2 = service.sampleTrustedNow(db);

    expect(() => {
      transaction(db, () => {
        service.advanceDurable(db, t2);
        throw new Error('Simulated transactional failure');
      });
    }).toThrow('Simulated transactional failure');

    // Watermark durável deve permanecer em t1
    expect(service.getDurableWatermark(db)).toBe(1_700_000_000_000);
  });

  // CLK-05: amostragem read-only
  it('CLK-05: sampleTrustedNow executa amostragem estritamente read-only sem DML', () => {
    const { db } = createTestDb();
    const provider = new SettableTimeProvider(1_700_000_000_000);
    const service = new TrustedClockService(provider);

    const sample1 = service.sampleTrustedNow(db);
    provider.advanceBy(500);
    const sample2 = service.sampleTrustedNow(db);

    expect(sample1.utcMs).toBe(1_700_000_000_000);
    expect(sample2.utcMs).toBe(1_700_000_000_500);

    // Banco de dados deve continuar sem linhas na tabela de relógio
    expect(service.getDurableWatermark(db)).toBeNull();
    const count = db.prepare('SELECT count(*) as count FROM telemetry_trusted_clock').get() as { count: number };
    expect(count.count).toBe(0);
  });

  // CLK-06: regressão em relação ao marco durável
  it('CLK-06: rejeição fail-closed quando relógio do host regride em relação ao marco durável', () => {
    const { db } = createTestDb();
    const provider = new SettableTimeProvider(1_700_000_010_000);
    const service = new TrustedClockService(provider);

    const t1 = service.sampleTrustedNow(db);
    transaction(db, () => service.advanceDurable(db, t1));
    expect(service.getDurableWatermark(db)).toBe(1_700_000_010_000);

    // Host clock dá um passo para trás (NTP step ou erro do SO) para antes do marco durável
    provider.setTime(1_700_000_005_000);

    expect(() => service.sampleTrustedNow(db)).toThrow(ClockUntrustedError);
    try {
      service.sampleTrustedNow(db);
    } catch (err) {
      expect(err).toBeInstanceOf(ClockUntrustedError);
      expect((err as ClockUntrustedError).statusCode).toBe(503);
      expect((err as ClockUntrustedError).code).toBe('CLOCK_UNTRUSTED');
    }
  });

  // CLK-07: regressão em memória
  it('CLK-07: rejeição fail-closed quando relógio do host regride durante a vida do processo', () => {
    const { db } = createTestDb();
    const provider = new SettableTimeProvider(1_700_000_000_000);
    const service = new TrustedClockService(provider);

    service.sampleTrustedNow(db); // Observado 1_700_000_000_000

    provider.setTime(1_699_999_999_000); // Recuo de 1s

    expect(() => service.sampleTrustedNow(db)).toThrow(ClockUntrustedError);
  });

  // CLK-08: rejeição fora de transação
  it('CLK-08: advanceDurable exige transação ativa da Store (db.inTransaction)', () => {
    const { db } = createTestDb();
    const provider = new SettableTimeProvider(1_700_000_000_000);
    const service = new TrustedClockService(provider);

    const sample = service.sampleTrustedNow(db);
    expect(db.inTransaction).toBe(false);

    expect(() => service.advanceDurable(db, sample)).toThrow(ClockTransactionRequiredError);
  });

  // CLK-09: token forjado
  it('CLK-09: rejeição em runtime de token de amostra forjado manualmente', () => {
    const { db } = createTestDb();
    const provider = new SettableTimeProvider(1_700_000_000_000);
    const service = new TrustedClockService(provider);

    // Objeto forjado imitando os campos públicos
    const forgedSample = {
      utcMs: 1_700_000_000_000,
      sampledAtUtcMs: 1_700_000_000_000,
      _brand: 'IGNIS_TRUSTED_TIME_SAMPLE',
    } as unknown as TrustedTimeSample;

    expect(() => {
      transaction(db, () => {
        service.advanceDurable(db, forgedSample);
      });
    }).toThrow(ClockTamperedSampleError);
  });

  // CLK-10: amostra obsoleta entre conexões
  it('CLK-10: amostra obsoleta entre conexões concorrentes é abortada com ClockStaleSampleError', () => {
    const { path, db: db1 } = createTestDb();
    const store2 = new Store(path, false);
    fixtures.push({ directory: dirname(path), store: store2 });
    const db2 = store2.db;

    const provider = new SettableTimeProvider(1_700_000_000_000);
    const service = new TrustedClockService(provider);

    // Conexão 1 obtém amostra T1
    const sampleConn1 = service.sampleTrustedNow(db1);
    expect(sampleConn1.utcMs).toBe(1_700_000_000_000);

    // Conexão 2 avança relógio para T2 = T1 + 5000
    provider.advanceBy(5_000);
    const sampleConn2 = service.sampleTrustedNow(db2);
    transaction(db2, () => {
      service.advanceDurable(db2, sampleConn2);
    });
    expect(service.getDurableWatermark(db2)).toBe(1_700_000_005_000);

    // Conexão 1 tenta comitar a amostra obsoleta sampleConn1
    expect(() => {
      transaction(db1, () => {
        service.advanceDurable(db1, sampleConn1);
      });
    }).toThrow(ClockStaleSampleError);

    expect(service.getDurableWatermark(db1)).toBe(1_700_000_005_000);
  });

  // CLK-11: timestamps inválidos
  it('CLK-11: rejeição estrita de NaN, infinitos, frações, não inteiros e overflow', () => {
    const { db } = createTestDb();
    const provider = new SettableTimeProvider(0);
    const service = new TrustedClockService(provider);

    const invalids = [
      NaN,
      Infinity,
      -Infinity,
      1_700_000_000_000.5,
      -0.1,
      Number.MAX_SAFE_INTEGER + 1,
      '1700000000000',
      null,
      undefined,
      {},
    ];

    for (const invalid of invalids) {
      expect(service.isValidTimestamp(invalid)).toBe(false);

      expect(() => service.evaluateObservationWindow(invalid as number, 1_700_000_000_000)).toThrow(
        ClockInvalidTimestampError,
      );

      expect(() => service.evaluateObservationWindow(1_700_000_000_000, invalid as number)).toThrow(
        ClockInvalidTimestampError,
      );
    }
  });

  // CLK-12: limites C02
  it('CLK-12: limites extremos de timestamp C02 (-62135596800000 a 253402300799999)', () => {
    const provider = new SettableTimeProvider(0);
    const service = new TrustedClockService(provider);

    // Válidos no limite exato
    expect(service.isValidTimestamp(C02_MIN_TIMESTAMP_MS)).toBe(true);
    expect(service.isValidTimestamp(C02_MAX_TIMESTAMP_MS)).toBe(true);
    expect(service.isValidTimestamp(0)).toBe(true);

    // Inválidos além do limite
    expect(service.isValidTimestamp(C02_MIN_TIMESTAMP_MS - 1)).toBe(false);
    expect(service.isValidTimestamp(C02_MAX_TIMESTAMP_MS + 1)).toBe(false);

    // Avaliação de janela nos limites
    const evalMin = service.evaluateObservationWindow(C02_MIN_TIMESTAMP_MS, C02_MIN_TIMESTAMP_MS);
    expect(evalMin.status).toBe(WindowEvaluationStatus.VALID_ACCEPTED);
    expect(evalMin.observationEffectiveAtMs).toBe(C02_MIN_TIMESTAMP_MS);

    const evalMax = service.evaluateObservationWindow(C02_MAX_TIMESTAMP_MS, C02_MAX_TIMESTAMP_MS);
    expect(evalMax.status).toBe(WindowEvaluationStatus.VALID_ACCEPTED);
    expect(evalMax.observationEffectiveAtMs).toBe(C02_MAX_TIMESTAMP_MS);
  });

  // CLK-13: observações passadas/presentes
  it('CLK-13: observações passadas ou presentes (occurredAtMs <= processingDataNowMs)', () => {
    const provider = new SettableTimeProvider(0);
    const service = new TrustedClockService(provider);
    const now = 1_700_000_000_000;

    // Presente exato
    const present = service.evaluateObservationWindow(now, now);
    expect(present.status).toBe(WindowEvaluationStatus.VALID_ACCEPTED);
    expect(present.deltaMs).toBe(0);
    expect(present.observationEffectiveAtMs).toBe(now);

    // Passado recente (5s atrás)
    const past = service.evaluateObservationWindow(now - 5_000, now);
    expect(past.status).toBe(WindowEvaluationStatus.VALID_ACCEPTED);
    expect(past.deltaMs).toBe(-5_000);
    expect(past.observationEffectiveAtMs).toBe(now - 5_000);

    // Passado distante (10 dias atrás)
    const distantPast = service.evaluateObservationWindow(now - 864_000_000, now);
    expect(distantPast.status).toBe(WindowEvaluationStatus.VALID_ACCEPTED);
    expect(distantPast.deltaMs).toBe(-864_000_000);
    expect(distantPast.observationEffectiveAtMs).toBe(now - 864_000_000);
  });

  // CLK-14: futuro tolerado até +30.000 ms
  it('CLK-14: futuro tolerado até +30.000 ms projeta em dataNow (clamped)', () => {
    const provider = new SettableTimeProvider(0);
    const service = new TrustedClockService(provider);
    const now = 1_700_000_000_000;

    // +1 ms
    const eval1 = service.evaluateObservationWindow(now + 1, now);
    expect(eval1.status).toBe(WindowEvaluationStatus.TOLERATED_FUTURE);
    expect(eval1.deltaMs).toBe(1);
    expect(eval1.observationEffectiveAtMs).toBe(now); // Clamped em now

    // +15.000 ms
    const eval15k = service.evaluateObservationWindow(now + 15_000, now);
    expect(eval15k.status).toBe(WindowEvaluationStatus.TOLERATED_FUTURE);
    expect(eval15k.deltaMs).toBe(15_000);
    expect(eval15k.observationEffectiveAtMs).toBe(now);

    // +30.000 ms (limite inclusivo exato)
    const eval30k = service.evaluateObservationWindow(now + CLOCK_TOLERANCE_MAX_FUTURE_MS, now);
    expect(eval30k.status).toBe(WindowEvaluationStatus.TOLERATED_FUTURE);
    expect(eval30k.deltaMs).toBe(30_000);
    expect(eval30k.observationEffectiveAtMs).toBe(now);
  });

  // CLK-15: futuro excessivo a partir de +30.001 ms
  it('CLK-15: futuro excessivo a partir de +30.001 ms é sumariamente rejeitado', () => {
    const provider = new SettableTimeProvider(0);
    const service = new TrustedClockService(provider);
    const now = 1_700_000_000_000;

    // +30.001 ms
    const eval30001 = service.evaluateObservationWindow(now + 30_001, now);
    expect(eval30001.status).toBe(WindowEvaluationStatus.EXCESSIVE_FUTURE_REJECTED);
    expect(eval30001.deltaMs).toBe(30_001);
    expect(eval30001.observationEffectiveAtMs).toBeNull();

    // +1 hora
    const evalHour = service.evaluateObservationWindow(now + 3_600_000, now);
    expect(evalHour.status).toBe(WindowEvaluationStatus.EXCESSIVE_FUTURE_REJECTED);
    expect(evalHour.deltaMs).toBe(3_600_000);
    expect(evalHour.observationEffectiveAtMs).toBeNull();
  });

  // CLK-16: adulteração de token após emissão
  it('CLK-16: tentativa de adulteração de token após emissão é impedida ou rejeitada', () => {
    const { db } = createTestDb();
    const provider = new SettableTimeProvider(1_700_000_000_000);
    const service = new TrustedClockService(provider);

    const sample = service.sampleTrustedNow(db);

    // Object.freeze deve impedir mutação direta
    expect(Object.isFrozen(sample)).toBe(true);
    expect(() => {
      // @ts-expect-error teste de tentativa de mutação em runtime
      sample.utcMs = 1_700_000_999_999;
    }).toThrow();

    // Tentativa com objeto derivado adulterado
    const tamperedSample = Object.create(sample, {
      utcMs: { value: 1_700_000_999_999, writable: false, enumerable: true },
    });

    expect(() => {
      transaction(db, () => {
        service.advanceDurable(db, tamperedSample);
      });
    }).toThrow(ClockTamperedSampleError);
  });

  // CLK-17: rejeição de token de outra instância
  it('CLK-17: token emitido por outra instância do serviço é rejeitado', () => {
    const { db } = createTestDb();
    const provider1 = new SettableTimeProvider(1_700_000_000_000);
    const service1 = new TrustedClockService(provider1);

    const provider2 = new SettableTimeProvider(1_700_000_000_000);
    const service2 = new TrustedClockService(provider2);

    const sampleFromService1 = service1.sampleTrustedNow(db);

    // service2 tenta usar a amostra emitida por service1
    expect(() => {
      transaction(db, () => {
        service2.advanceDurable(db, sampleFromService1);
      });
    }).toThrow(ClockTamperedSampleError);
  });

  // CLK-18: rollback de outras escritas da mesma transação quando ocorrer erro de relógio
  it('CLK-18: falha no relógio causa rollback de todas as outras escritas da mesma transação', () => {
    const { db } = createTestDb();
    const provider = new SettableTimeProvider(1_700_000_000_000);
    const service = new TrustedClockService(provider);

    // Subcaso 1: ClockTamperedSampleError causa rollback
    const fakeSample = { utcMs: 1_700_000_000_000, sampledAtUtcMs: 1_700_000_000_000 } as TrustedTimeSample;
    expect(() => {
      transaction(db, () => {
        db.prepare("INSERT INTO actor(id, kind, local_key) VALUES (?, 'operator', ?)").run(
          'operator:rollback-tamper',
          'local-rollback-tamper',
        );
        service.advanceDurable(db, fakeSample);
      });
    }).toThrow(ClockTamperedSampleError);
    expect(db.prepare("SELECT * FROM actor WHERE local_key = 'local-rollback-tamper'").get()).toBeUndefined();

    // Subcaso 2: ClockStaleSampleError causa rollback
    const sInitial = service.sampleTrustedNow(db);
    transaction(db, () => service.advanceDurable(db, sInitial));
    expect(service.getDurableWatermark(db)).toBe(1_700_000_000_000);

    // sOld é emitido em 1_700_000_001_000 mas NÃO é consumido ainda
    provider.advanceBy(1_000);
    const sOld = service.sampleTrustedNow(db);

    // O banco avança para 1_700_000_010_000 com sNew
    provider.advanceBy(9_000);
    const sNew = service.sampleTrustedNow(db);
    transaction(db, () => service.advanceDurable(db, sNew));
    expect(service.getDurableWatermark(db)).toBe(1_700_000_010_000);

    expect(() => {
      transaction(db, () => {
        db.prepare("INSERT INTO actor(id, kind, local_key) VALUES (?, 'operator', ?)").run(
          'operator:rollback-stale',
          'local-rollback-stale',
        );
        service.advanceDurable(db, sOld); // sOld (1001) é genuíno mas obsoleto contra durável 1010
      });
    }).toThrow(ClockStaleSampleError);
    expect(db.prepare("SELECT * FROM actor WHERE local_key = 'local-rollback-stale'").get()).toBeUndefined();

    // Subcaso 3: ClockUntrustedError (regressão de relógio durante escrita) causa rollback
    provider.advanceBy(5_000); // 1_700_000_015_000
    const s3 = service.sampleTrustedNow(db);

    // Relógio físico recua para 1_700_000_008_000 antes do advanceDurable
    provider.setTime(1_700_000_008_000);
    expect(() => {
      transaction(db, () => {
        db.prepare("INSERT INTO actor(id, kind, local_key) VALUES (?, 'operator', ?)").run(
          'operator:rollback-untrusted',
          'local-rollback-untrusted',
        );
        service.advanceDurable(db, s3);
      });
    }).toThrow(ClockUntrustedError);
    expect(db.prepare("SELECT * FROM actor WHERE local_key = 'local-rollback-untrusted'").get()).toBeUndefined();
  });

  // CLK-19: igualdade exata ao watermark persistido
  it('CLK-19: igualdade exata ao watermark persistido não causa erro nem regressão', () => {
    const { db } = createTestDb();
    const provider = new SettableTimeProvider(1_700_000_000_000);
    const service = new TrustedClockService(provider);

    const s1 = service.sampleTrustedNow(db);
    transaction(db, () => service.advanceDurable(db, s1));
    expect(service.getDurableWatermark(db)).toBe(1_700_000_000_000);

    // Amostra no mesmo exato timestamp
    const s2 = service.sampleTrustedNow(db);
    expect(s2.utcMs).toBe(1_700_000_000_000);

    transaction(db, () => {
      service.advanceDurable(db, s2);
    });

    expect(service.getDurableWatermark(db)).toBe(1_700_000_000_000);
  });

  // CLK-20: reinicialização do serviço com watermark persistido superior ao relógio atual
  it('CLK-20: nova instância do serviço com relógio de hardware inferior ao watermark persistido falha imediatamente', () => {
    const { db } = createTestDb();

    // Primeira execução persiste marco T = 5_000
    const p1 = new SettableTimeProvider(1_700_000_005_000);
    const s1 = new TrustedClockService(p1);
    const sample1 = s1.sampleTrustedNow(db);
    transaction(db, () => s1.advanceDurable(db, sample1));
    expect(s1.getDurableWatermark(db)).toBe(1_700_000_005_000);

    // Novo processo / instância inicia, mas relógio da máquina foi ajustado para T = 4_000
    const p2 = new SettableTimeProvider(1_700_000_004_000);
    const s2 = new TrustedClockService(p2);

    expect(() => s2.sampleTrustedNow(db)).toThrow(ClockUntrustedError);
  });

  // CLK-21: avaliação temporal sem mutação de watermark nem de memória observada
  it('CLK-21: evaluateObservationWindow não contamina watermark durável nem memória observada', () => {
    const { db } = createTestDb();
    const now = 1_700_000_000_000;
    const provider = new SettableTimeProvider(now);
    const service = new TrustedClockService(provider);

    const sample = service.sampleTrustedNow(db);
    transaction(db, () => service.advanceDurable(db, sample));

    // Executa várias avaliações com tempos futuros distantes (ex: +50s)
    service.evaluateObservationWindow(now + 20_000, now);
    service.evaluateObservationWindow(now + 50_000, now);
    service.evaluateObservationWindow(now - 1_000_000, now);

    // O watermark durável permanece exatamente inalterado
    expect(service.getDurableWatermark(db)).toBe(now);

    // Prova que inProcessObservedWatermark NÃO foi elevado para now + 50_000:
    // Uma amostragem subsequente no tempo físico 'now' (inferior a now + 50_000) deve suceder perfeitamente
    const sampleAfter = service.sampleTrustedNow(db);
    expect(sampleAfter.utcMs).toBe(now);
  });

  // CLK-22: amostra temporal anterior ao marco confirmado por outra conexão
  it('CLK-22: amostra anterior ao marco já confirmado por outra conexão é rejeitada sob lock', () => {
    const { path, db: conn1 } = createTestDb();
    const store2 = new Store(path, false);
    fixtures.push({ directory: dirname(path), store: store2 });
    const conn2 = store2.db;

    const provider = new SettableTimeProvider(1_700_000_000_000);
    const service = new TrustedClockService(provider);

    const oldSample = service.sampleTrustedNow(conn1);

    // Conexão 2 avança para frente
    provider.advanceBy(20_000);
    const newSample = service.sampleTrustedNow(conn2);
    transaction(conn2, () => service.advanceDurable(conn2, newSample));

    // Conexão 1 tenta usar sua amostra antiga
    expect(() => {
      transaction(conn1, () => {
        service.advanceDurable(conn1, oldSample);
      });
    }).toThrow(ClockStaleSampleError);
  });

  // CLK-23: operação GET/read-only sem qualquer escrita SQLite (C03-S25 comprovado com query_only)
  it('CLK-23: leitura em rota GET via sampleTrustedNow passa em query_only=ON e não altera marco persistido (C03-S25)', () => {
    const { path, db } = createTestDb();
    const provider = new SettableTimeProvider(1_700_000_000_000);
    const service = new TrustedClockService(provider);

    // 1. Inicializa o marco durável em T = 1_700_000_000_000
    const sampleInit = service.sampleTrustedNow(db);
    transaction(db, () => service.advanceDurable(db, sampleInit));
    expect(service.getDurableWatermark(db)).toBe(1_700_000_000_000);

    // 2. Abre segunda conexão para verificar data_version externo
    const storeObserver = new Store(path, false);
    fixtures.push({ directory: dirname(path), store: storeObserver });
    const observerDb = storeObserver.db;
    const observerDataVersionBefore = observerDb.pragma('data_version', { simple: true }) as number;

    // 3. Força conexão principal em modo QUERY_ONLY = ON (qualquer tentativa de DML causa erro fatal no SQLite)
    db.pragma('query_only = ON');

    // 4. Avança tempo físico para T = 1_700_000_002_000 e executa amostragem simulando GET
    provider.advanceBy(2_000);
    const sampleGet = service.sampleTrustedNow(db);
    expect(sampleGet.utcMs).toBe(1_700_000_002_000);

    // Desativa query_only para verificações adicionais
    db.pragma('query_only = OFF');

    // 5. Comprova C03-S25: O marco durável no SQLite permaneceu em 1_700_000_000_000
    expect(service.getDurableWatermark(db)).toBe(1_700_000_000_000);

    // 6. Comprova ausência de escritas a partir da conexão observadora
    const observerDataVersionAfter = observerDb.pragma('data_version', { simple: true }) as number;
    expect(observerDataVersionAfter).toBe(observerDataVersionBefore);
  });

  // CLK-24: ausência de promoção de baseTime sintético para relógio operacional
  it('CLK-24: baseTime sintético não pode ser promovido a watermark sem sample legítimo', () => {
    const { db } = createTestDb();
    const provider = new SettableTimeProvider(1_700_000_000_000);
    const service = new TrustedClockService(provider);

    // Suponha um baseTime arbitrário de fixture
    const fixtureBaseTime = 1_500_000_000_000;

    // Chamador não pode passar o número puro fixtureBaseTime para advanceDurable
    expect(() => {
      transaction(db, () => {
        // @ts-expect-error teste de chamada inválida com número puro
        service.advanceDurable(db, fixtureBaseTime);
      });
    }).toThrow(ClockTamperedSampleError);

    // Mesmo que crie um objeto com o timestamp
    const fakeSample = { utcMs: fixtureBaseTime, sampledAtUtcMs: fixtureBaseTime } as TrustedTimeSample;
    expect(() => {
      transaction(db, () => {
        service.advanceDurable(db, fakeSample);
      });
    }).toThrow(ClockTamperedSampleError);
  });

  // CLK-25: HIGH-01 — GET legítimo não produz falso CLOCK_UNTRUSTED em escrita concomitante
  it('CLK-25: amostra de escrita não falha com CLOCK_UNTRUSTED quando GET posterior avança memória observada', () => {
    const { db } = createTestDb();
    const provider = new SettableTimeProvider(1_700_000_000_000);
    const service = new TrustedClockService(provider);

    // 1. Amostra de comando de escrita tomada em T = 1000
    const writeSample = service.sampleTrustedNow(db);
    expect(writeSample.utcMs).toBe(1_700_000_000_000);

    // 2. Requisição GET legítima ocorre logo após em T = 1050 (tempo físico avança normalmente)
    provider.setTime(1_700_000_000_050);
    const getSample = service.sampleTrustedNow(db);
    expect(getSample.utcMs).toBe(1_700_000_000_050);

    // 3. O comando de escrita abre sua transação e comita writeSample (1000).
    // O relógio físico está em 1050 (válido, >= 1000). Não deve lançar CLOCK_UNTRUSTED!
    transaction(db, () => {
      service.advanceDurable(db, writeSample);
    });

    expect(service.getDurableWatermark(db)).toBe(1_700_000_000_000);
  });

  // CLK-26: HIGH-01 — Regressão física ocorrida entre sampleTrustedNow e advanceDurable falha fechado
  it('CLK-26: recuo do relógio físico entre sampleTrustedNow e advanceDurable falha fechado com CLOCK_UNTRUSTED', () => {
    const { db } = createTestDb();
    const provider = new SettableTimeProvider(1_700_000_000_000);
    const service = new TrustedClockService(provider);

    const sample = service.sampleTrustedNow(db);
    expect(sample.utcMs).toBe(1_700_000_000_000);

    // O hardware da máquina regride para 500ms atrás antes da transação de escrita
    provider.setTime(1_699_999_999_500);

    expect(() => {
      transaction(db, () => {
        service.advanceDurable(db, sample);
      });
    }).toThrow(ClockUntrustedError);

    // Watermark durável deve permanecer nulo
    expect(service.getDurableWatermark(db)).toBeNull();
  });

  // CLK-27: MEDIUM-01 — Amostra vinculada ao banco dbA é rejeitada em dbB
  it('CLK-27: amostra emitida contra uma base de dados é rejeitada em outra base', () => {
    const { db: dbA } = createTestDb();
    const { db: dbB } = createTestDb();

    const provider = new SettableTimeProvider(1_700_000_000_000);
    const service = new TrustedClockService(provider);

    const sampleA = service.sampleTrustedNow(dbA);

    // Tentativa de usar a amostra validada para dbA em dbB
    expect(() => {
      transaction(dbB, () => {
        service.advanceDurable(dbB, sampleA);
      });
    }).toThrow(ClockTamperedSampleError);
  });

  // CLK-28: MEDIUM-01 — Reutilização de amostra consumida
  it('CLK-28: amostra é de uso único por avanço e não pode ser reutilizada em nova transação', () => {
    const { db } = createTestDb();
    const provider = new SettableTimeProvider(1_700_000_000_000);
    const service = new TrustedClockService(provider);

    const sample = service.sampleTrustedNow(db);

    // Primeiro uso na transação 1
    transaction(db, () => {
      service.advanceDurable(db, sample);
    });
    expect(service.getDurableWatermark(db)).toBe(1_700_000_000_000);

    // Tentativa de reutilizar a mesma amostra na transação 2
    expect(() => {
      transaction(db, () => {
        service.advanceDurable(db, sample);
      });
    }).toThrow(ClockTamperedSampleError);
  });

  // Provedor SystemTimeProvider
  it('SystemTimeProvider retorna Date.now() em tempo real', () => {
    const provider = new SystemTimeProvider();
    const before = Date.now();
    const now = provider.now();
    const after = Date.now();

    expect(Number.isSafeInteger(now)).toBe(true);
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});
