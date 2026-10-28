import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { AppError } from '../src/errors.js';
import { Store, transaction } from '../src/persistence/store.js';
import { authorization, sessionFor } from './support/foundation-fixture.js';
import { generation } from './support/t0005-fixture.js';
import { generateDemo } from '../src/demo/service.js';
import {
  type ActiveTelemetryBinding,
  type AuthenticatedSourceContext,
  ClockUntrustedError,
  SettableTimeProvider,
  TelemetryAuthService,
  TelemetryBindingService,
  TrustedClockService,
  assertValidSourceContext,
  telemetryTokenHash,
} from '../src/domain/telemetry/index.js';

type Row = Record<string, string | number | null>;

const fixtures: { directory: string; store: Store }[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  const items = fixtures.splice(0);
  for (const f of items) {
    f.store.close();
  }
  const dirs = new Set(items.map(f => resolve(f.directory)));
  for (const target of dirs) {
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('ignis-t0007-auth-')) {
      throw new Error('Temporary fixture cleanup outside allocated directory');
    }
    rmSync(target, { recursive: true, force: true });
  }
});

function insert(db: Database.Database, table: string, row: Row) {
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...Object.values(row));
}

function createTestEnvironment(baseTimeUtcMs = 1_700_000_000_000) {
  const directory = mkdtempSync(join(tmpdir(), 'ignis-t0007-auth-'));
  const path = join(directory, 'test.sqlite');
  const store = new Store(path, true);
  const installation = store.migrate();
  fixtures.push({ directory, store });

  const { datasetId, actorId } = installation;
  generateDemo(authorization(store), sessionFor(store, actorId), datasetId, 1, generation());

  const db = store.db;
  const timeProvider = new SettableTimeProvider(baseTimeUtcMs);
  const clockService = new TrustedClockService(timeProvider);
  const authService = new TelemetryAuthService({ clockService, timeProvider });
  const bindingService = new TelemetryBindingService();

  // Provisiona profiles padrão de fixture para bindings
  insert(db, 'telemetry_profile', {
    id: 'FX-FIXED-v1',
    version: 1,
    usage: 'fixture',
    resource_kind: 'equipment',
    category_code: 'camera',
    category_version: 1,
    emitter_expected: 1,
    expected_interval_ms: 10000,
    position_ttl_ms: null,
    configuration_json: '{}',
    provenance: 'T0007 fixture',
  });

  const resourceId = (db.prepare("SELECT id FROM equipment WHERE category_code='camera' LIMIT 1").get() as { id: string }).id;

  insert(db, 'telemetry_resource_profile', {
    dataset_id: datasetId,
    epoch: 1,
    resource_id: resourceId,
    resource_kind: 'equipment',
    profile_id: 'FX-FIXED-v1',
    profile_version: 1,
    active: 1,
    assigned_at_ms: baseTimeUtcMs - 40_000,
  });

  // Helper para provisionar uma fonte e credencial válida
  function provisionSource(options: {
    sourceId?: string;
    active?: number;
    rawToken?: string;
    expiresInMs?: number;
    revokedAtMs?: number | null;
  } = {}) {
    const sId = options.sourceId ?? randomUUID();
    const rawToken = options.rawToken ?? `tok_${randomBytes(24).toString('base64url')}`;
    const tokenHash = telemetryTokenHash(rawToken);

    insert(db, 'telemetry_source', {
      id: sId,
      source_kind: 'sensor',
      provisioned_by: actorId,
      active: options.active ?? 1,
      created_at_ms: baseTimeUtcMs - 100_000,
    });

    insert(db, 'telemetry_credential', {
      token_hash: tokenHash,
      source_id: sId,
      issued_at_ms: baseTimeUtcMs - 10_000,
      expires_at_ms: baseTimeUtcMs + (options.expiresInMs ?? 3_600_000),
      revoked_at_ms: options.revokedAtMs ?? null,
    });

    return { sourceId: sId, rawToken, tokenHash };
  }

  // Helper para provisionar um binding válido
  function provisionBinding(options: {
    sourceId: string;
    resId?: string;
    channel?: string;
    active?: number;
  }) {
    const bindingId = randomUUID();
    const resId = options.resId ?? resourceId;
    const channel = options.channel ?? 'heartbeat';

    insert(db, 'telemetry_binding', {
      dataset_id: datasetId,
      epoch: 1,
      id: bindingId,
      source_id: options.sourceId,
      resource_id: resId,
      resource_kind: 'equipment',
      channel,
      projection_field: 'communication',
      profile_id: 'FX-FIXED-v1',
      profile_version: 1,
      active: options.active ?? 1,
      resource_born_at_ms: baseTimeUtcMs - 50_000,
      history_allowed_from_ms: baseTimeUtcMs - 50_000,
    });

    return { bindingId, resourceId: resId, channel };
  }

  return {
    directory,
    path,
    store,
    db,
    actorId,
    datasetId,
    resourceId,
    baseTimeUtcMs,
    timeProvider,
    clockService,
    authService,
    bindingService,
    provisionSource,
    provisionBinding,
  };
}

describe('PKG-03: Autenticação e Autorização de Fontes de Telemetria', () => {
  // AUTH-01: Token válido de fonte ativa em geração ativa/pronta
  it('AUTH-01: token válido autentica fonte e emite AuthenticatedSourceContext legítimo', () => {
    const env = createTestEnvironment();
    const { sourceId, rawToken } = env.provisionSource();

    const auth = env.authService.authenticateSource(env.db, rawToken, env.datasetId, 1);

    expect(auth.sourceId).toBe(sourceId);
    expect(auth.principalId).toBe(`source:${sourceId}`);
    expect(auth.sourceKind).toBe('sensor');
    expect(auth.datasetId).toBe(env.datasetId);
    expect(auth.epoch).toBe(1);
    expect(Object.isFrozen(auth)).toBe(true);
  });

  // AUTH-02: Token ausente (undefined, vazio, espaços)
  it.each([undefined, '', '   '])('AUTH-02: token ausente (%s) falha com 401 UNAUTHORIZED', rawToken => {
    const env = createTestEnvironment();
    expect(() => {
      env.authService.authenticateSource(env.db, rawToken, env.datasetId, 1);
    }).toThrow(new AppError(401, 'UNAUTHORIZED', 'Credencial de telemetria inválida ou ausente.'));
  });

  // AUTH-03: Token sintaticamente válido mas inexistente no banco
  it('AUTH-03: token não existente falha com 401 UNAUTHORIZED sem vazar existência', () => {
    const env = createTestEnvironment();
    expect(() => {
      env.authService.authenticateSource(env.db, 'tok_non_existent_secret_token_12345', env.datasetId, 1);
    }).toThrow(new AppError(401, 'UNAUTHORIZED', 'Credencial de telemetria inválida ou ausente.'));
  });

  // AUTH-04: Credencial com revoked_at_ms preenchido
  it('AUTH-04: credencial revogada falha com 401 UNAUTHORIZED', () => {
    const env = createTestEnvironment();
    const { rawToken } = env.provisionSource({ revokedAtMs: env.baseTimeUtcMs - 500 });

    expect(() => {
      env.authService.authenticateSource(env.db, rawToken, env.datasetId, 1);
    }).toThrow(new AppError(401, 'UNAUTHORIZED', 'Credencial de telemetria inválida ou ausente.'));
  });

  // AUTH-05: Credencial expirada (expires_at_ms <= now)
  it('AUTH-05: credencial com tempo expirado falha com 401 UNAUTHORIZED', () => {
    const env = createTestEnvironment();
    const { rawToken } = env.provisionSource({ expiresInMs: -1000 }); // Expirou 1s atrás

    expect(() => {
      env.authService.authenticateSource(env.db, rawToken, env.datasetId, 1);
    }).toThrow(new AppError(401, 'UNAUTHORIZED', 'Credencial de telemetria inválida ou ausente.'));
  });

  // AUTH-06: Credencial com issued_at_ms no futuro
  it('AUTH-06: credencial com data de emissão no futuro falha com 401 UNAUTHORIZED', () => {
    const env = createTestEnvironment();
    const sId = randomUUID();
    const rawToken = 'tok_future_credential_sample';
    insert(env.db, 'telemetry_source', {
      id: sId,
      source_kind: 'sensor',
      provisioned_by: env.actorId,
      active: 1,
      created_at_ms: env.baseTimeUtcMs,
    });
    insert(env.db, 'telemetry_credential', {
      token_hash: telemetryTokenHash(rawToken),
      source_id: sId,
      issued_at_ms: env.baseTimeUtcMs + 50_000, // No futuro
      expires_at_ms: env.baseTimeUtcMs + 100_000,
      revoked_at_ms: null,
    });

    expect(() => {
      env.authService.authenticateSource(env.db, rawToken, env.datasetId, 1);
    }).toThrow(new AppError(401, 'UNAUTHORIZED', 'Credencial de telemetria inválida ou ausente.'));
  });

  // AUTH-07: Fonte com active = 0
  it('AUTH-07: fonte desativada falha com 403 FORBIDDEN', () => {
    const env = createTestEnvironment();
    const { rawToken } = env.provisionSource({ active: 0 });

    expect(() => {
      env.authService.authenticateSource(env.db, rawToken, env.datasetId, 1);
    }).toThrow(new AppError(403, 'FORBIDDEN', 'Fonte telemétrica desativada.'));
  });

  // AUTH-08: Epoch solicitado diferente do active_epoch
  it('AUTH-08: epoch divergente do active_epoch falha com 409 EPOCH_CONFLICT', () => {
    const env = createTestEnvironment();
    const { rawToken } = env.provisionSource();

    expect(() => {
      env.authService.authenticateSource(env.db, rawToken, env.datasetId, 2); // Dataset está no epoch 1
    }).toThrow(new AppError(409, 'EPOCH_CONFLICT', 'Geração obsoleta ou indisponível.'));
  });

  // AUTH-09: Epoch com status diferente de 'ready'
  it('AUTH-09: epoch em estado diferente de ready falha com 409 EPOCH_CONFLICT', () => {
    const env = createTestEnvironment();
    const { rawToken } = env.provisionSource();

    // Altera status do epoch 1 para preparing
    env.db.prepare('UPDATE dataset_epoch SET status = ? WHERE dataset_id = ? AND epoch = 1').run('preparing', env.datasetId);

    expect(() => {
      env.authService.authenticateSource(env.db, rawToken, env.datasetId, 1);
    }).toThrow(new AppError(409, 'EPOCH_CONFLICT', 'Geração obsoleta ou indisponível.'));
  });

  // AUTH-10: Binding ativo existente
  it('AUTH-10: binding ativo e válido retorna ActiveTelemetryBinding congelado', () => {
    const env = createTestEnvironment();
    const { sourceId, rawToken } = env.provisionSource();
    const { bindingId, channel } = env.provisionBinding({ sourceId });

    const auth = env.authService.authenticateSource(env.db, rawToken, env.datasetId, 1);
    const binding = env.bindingService.resolveActiveBinding(env.db, auth, env.resourceId, channel);

    expect(binding.bindingId).toBe(bindingId);
    expect(binding.sourceId).toBe(sourceId);
    expect(binding.resourceId).toBe(env.resourceId);
    expect(binding.channel).toBe(channel);
    expect(binding.profileId).toBe('FX-FIXED-v1');
    expect(binding.profileVersion).toBe(1);
    expect(Object.isFrozen(binding)).toBe(true);
  });

  // AUTH-11: Binding inexistente para a tupla solicitada
  it('AUTH-11: consulta de binding inexistente para o canal falha com 403 FORBIDDEN', () => {
    const env = createTestEnvironment();
    const { sourceId, rawToken } = env.provisionSource();
    env.provisionBinding({ sourceId, channel: 'heartbeat' });

    const auth = env.authService.authenticateSource(env.db, rawToken, env.datasetId, 1);

    expect(() => {
      env.bindingService.resolveActiveBinding(env.db, auth, env.resourceId, 'unknown_channel');
    }).toThrow(new AppError(403, 'FORBIDDEN', 'Binding inexistente, inativo ou não autorizado para a fonte.'));
  });

  // AUTH-12: Binding com active = 0
  it('AUTH-12: binding inativo (active = 0) falha com 403 FORBIDDEN', () => {
    const env = createTestEnvironment();
    const { sourceId, rawToken } = env.provisionSource();
    const { channel } = env.provisionBinding({ sourceId, active: 0 });

    const auth = env.authService.authenticateSource(env.db, rawToken, env.datasetId, 1);

    expect(() => {
      env.bindingService.resolveActiveBinding(env.db, auth, env.resourceId, channel);
    }).toThrow(new AppError(403, 'FORBIDDEN', 'Binding inexistente, inativo ou não autorizado para a fonte.'));
  });

  // AUTH-13: Conflito de posse: Fonte A tentando emitir para canal vinculado exclusivamente à Fonte B
  it('AUTH-13: Fonte A não pode acessar canal vinculado exclusivamente à Fonte B', () => {
    const env = createTestEnvironment();
    const srcA = env.provisionSource();
    const srcB = env.provisionSource();
    const { channel } = env.provisionBinding({ sourceId: srcB.sourceId }); // Vinculado a B

    const authA = env.authService.authenticateSource(env.db, srcA.rawToken, env.datasetId, 1);

    expect(() => {
      env.bindingService.resolveActiveBinding(env.db, authA, env.resourceId, channel);
    }).toThrow(new AppError(403, 'FORBIDDEN', 'Binding inexistente, inativo ou não autorizado para a fonte.'));
  });

  // AUTH-14: Ausência de vazamento de segredo em erros ou retornos
  it('AUTH-14: tokens e hashes nunca vazam nas mensagens de erro ou propriedades de contexto', () => {
    const env = createTestEnvironment();
    const rawSecret = 'SUPER_SECRET_TOKEN_DO_NOT_LEAK_xyz';
    env.provisionSource({ rawToken: rawSecret, active: 0 });

    try {
      env.authService.authenticateSource(env.db, rawSecret, env.datasetId, 1);
      expect.unreachable('Deveria ter lançado erro');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.message).not.toContain(rawSecret);
      expect(appErr.message).not.toContain(telemetryTokenHash(rawSecret));
    }
  });

  // AUTH-15: Falha transitória de persistência falha fechado com 503 DATABASE_UNAVAILABLE
  it('AUTH-15: erro SQLite transitório falha fechado com 503 DATABASE_UNAVAILABLE', () => {
    const env = createTestEnvironment();
    const { rawToken } = env.provisionSource();

    const spy = vi.spyOn(env.db, 'prepare').mockImplementation(() => {
      const sqliteErr = new Error('database is locked');
      (sqliteErr as { code?: string }).code = 'SQLITE_BUSY';
      throw sqliteErr;
    });

    expect(() => {
      env.authService.authenticateSource(env.db, rawToken, env.datasetId, 1);
    }).toThrow(new AppError(503, 'DATABASE_UNAVAILABLE', 'Banco indisponível. Reenvie a mesma chave.'));

    spy.mockRestore();
  });

  // AUTH-16: Imutabilidade do contexto e binding
  it('AUTH-16: AuthenticatedSourceContext e ActiveTelemetryBinding são congelados com Object.freeze', () => {
    const env = createTestEnvironment();
    const { sourceId, rawToken } = env.provisionSource();
    const { channel } = env.provisionBinding({ sourceId });

    const auth = env.authService.authenticateSource(env.db, rawToken, env.datasetId, 1);
    const binding = env.bindingService.resolveActiveBinding(env.db, auth, env.resourceId, channel);

    expect(Object.isFrozen(auth)).toBe(true);
    expect(Object.isFrozen(binding)).toBe(true);
    expect(() => {
      // @ts-expect-error teste de tentativa de mutação
      auth.sourceId = 'hacked';
    }).toThrow();
  });

  // AUTH-ENUM-01: Uniformidade de erro para credenciais
  it('AUTH-ENUM-01: credencial ausente, inexistente, revogada e expirada retornam exatamente 401 UNAUTHORIZED idêntico', () => {
    const env = createTestEnvironment();
    const sRevoked = env.provisionSource({ revokedAtMs: env.baseTimeUtcMs - 100 });
    const sExpired = env.provisionSource({ expiresInMs: -5000 });

    const cases = [
      undefined,
      'tok_non_existent',
      sRevoked.rawToken,
      sExpired.rawToken,
    ];

    for (const token of cases) {
      try {
        env.authService.authenticateSource(env.db, token, env.datasetId, 1);
        expect.unreachable('Deveria ter falhado com 401');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(401);
        expect(appErr.code).toBe('UNAUTHORIZED');
        expect(appErr.message).toBe('Credencial de telemetria inválida ou ausente.');
      }
    }
  });

  // AUTH-TIME-01: Expiração em tempo físico (C03 §5 e C03-S18)
  it('AUTH-TIME-01: credencial expira no tempo físico exato quando relógio avança', () => {
    const env = createTestEnvironment();
    // Válido por 10 segundos
    const { rawToken } = env.provisionSource({ expiresInMs: 10_000 });

    // T = 0s: Válido
    const auth1 = env.authService.authenticateSource(env.db, rawToken, env.datasetId, 1);
    expect(auth1).toBeDefined();

    // T = 5s: Ainda válido
    env.timeProvider.advanceBy(5_000);
    const auth2 = env.authService.authenticateSource(env.db, rawToken, env.datasetId, 1);
    expect(auth2).toBeDefined();

    // T = 10.001s: Expirou
    env.timeProvider.advanceBy(5_001);
    expect(() => {
      env.authService.authenticateSource(env.db, rawToken, env.datasetId, 1);
    }).toThrow(new AppError(401, 'UNAUTHORIZED', 'Credencial de telemetria inválida ou ausente.'));
  });

  // AUTH-TIME-02: Regressão temporal contra marco durável D08 (C03 §5)
  it('AUTH-TIME-02: regressão física contra marco durável falha fechado com 503 CLOCK_UNTRUSTED', () => {
    const env = createTestEnvironment();
    const { rawToken } = env.provisionSource();

    // Estabelece watermark durável D08 em T = 1_700_000_050_000
    const sample = env.clockService.sampleTrustedNow(env.db);
    transaction(env.db, () => {
      env.clockService.advanceDurable(env.db, sample);
    });
    expect(env.clockService.getDurableWatermark(env.db)).toBe(env.baseTimeUtcMs);

    // O hardware regride para 500ms antes do watermark
    env.timeProvider.setTime(env.baseTimeUtcMs - 500);

    try {
      env.authService.authenticateSource(env.db, rawToken, env.datasetId, 1);
      expect.unreachable('Deveria falhar com CLOCK_UNTRUSTED');
    } catch (err) {
      expect(err).toBeInstanceOf(ClockUntrustedError);
      const appErr = err as AppError;
      expect(appErr.statusCode).toBe(503);
      expect(appErr.code).toBe('CLOCK_UNTRUSTED');
    }
  });

  // AUTH-TX-01: Invocação de assert*InTx fora de transação falha com 500 TRANSACTION_REQUIRED
  it('AUTH-TX-01: assertSourceAuthorizedInTx e assertBindingActiveInTx exigem transação ativa', () => {
    const env = createTestEnvironment();
    const { sourceId, rawToken } = env.provisionSource();
    const { channel } = env.provisionBinding({ sourceId });

    const auth = env.authService.authenticateSource(env.db, rawToken, env.datasetId, 1);

    expect(env.db.inTransaction).toBe(false);

    expect(() => {
      env.authService.assertSourceAuthorizedInTx(env.db, auth, rawToken);
    }).toThrow(new AppError(500, 'TRANSACTION_REQUIRED', 'Revalidação de segurança exige transação ativa.'));

    expect(() => {
      env.bindingService.assertBindingActiveInTx(env.db, auth, env.resourceId, channel);
    }).toThrow(new AppError(500, 'TRANSACTION_REQUIRED', 'Revalidação de binding exige transação ativa.'));
  });

  // AUTH-ID-01: Contexto forjado manualmente é rejeitado por violação de proveniência
  it('AUTH-ID-01: contexto forjado sem emissão legítima é rejeitado por proveniência', () => {
    const env = createTestEnvironment();
    const { sourceId, rawToken } = env.provisionSource();
    const { channel } = env.provisionBinding({ sourceId });

    const fakeAuth: AuthenticatedSourceContext = Object.freeze({
      sourceId,
      principalId: `source:${sourceId}`,
      sourceKind: 'sensor',
      datasetId: env.datasetId,
      epoch: 1,
    });

    // Rejeitado em assertSourceAuthorizedInTx
    transaction(env.db, () => {
      expect(() => {
        env.authService.assertSourceAuthorizedInTx(env.db, fakeAuth, rawToken);
      }).toThrow(new AppError(401, 'UNAUTHORIZED', 'Identidade não autenticada ou forjada.'));
    });

    // Rejeitado em resolveActiveBinding
    expect(() => {
      env.bindingService.resolveActiveBinding(env.db, fakeAuth, env.resourceId, channel);
    }).toThrow(new AppError(401, 'UNAUTHORIZED', 'Identidade não autenticada ou forjada.'));
  });

  // AUTH-ID-02: Token trocado (token de sourceA apresentado com contexto de sourceB)
  it('AUTH-ID-02: token de uma fonte apresentado com contexto de outra fonte é rejeitado na transação', () => {
    const env = createTestEnvironment();
    const srcA = env.provisionSource();
    const srcB = env.provisionSource();

    const authB = env.authService.authenticateSource(env.db, srcB.rawToken, env.datasetId, 1);

    // Tentativa de revalidar authB usando o token de srcA
    transaction(env.db, () => {
      expect(() => {
        env.authService.assertSourceAuthorizedInTx(env.db, authB, srcA.rawToken);
      }).toThrow(new AppError(401, 'UNAUTHORIZED', 'Credencial não corresponde à fonte autenticada.'));
    });
  });

  // AUTH-TOCTOU-01: Credencial revogada concorrentemente entre pré-autenticação e transação
  it('AUTH-TOCTOU-01: revogação concorrente de credencial após pré-autenticação aborta transação e reverte escritas', () => {
    const env = createTestEnvironment();
    const { sourceId, rawToken, tokenHash } = env.provisionSource();

    const auth = env.authService.authenticateSource(env.db, rawToken, env.datasetId, 1);

    // Conexão concorrente revoga a credencial e comita
    const otherStore = new Store(env.path);
    try {
      otherStore.db.prepare('UPDATE telemetry_credential SET revoked_at_ms = ? WHERE token_hash = ?').run(env.baseTimeUtcMs, tokenHash);
    } finally {
      otherStore.close();
    }

    // Transação principal tenta persistir evento
    let writeAttempted = false;
    expect(() => {
      transaction(env.db, () => {
        // Escrita hipotética preliminar
        env.db.prepare("INSERT INTO actor(id,kind) VALUES('operator:temp_test','operator')").run();
        writeAttempted = true;
        // Revalidação obrigatória antes do commit
        env.authService.assertSourceAuthorizedInTx(env.db, auth, rawToken);
      });
    }).toThrow(new AppError(401, 'UNAUTHORIZED', 'Credencial de telemetria inválida ou ausente.'));

    expect(writeAttempted).toBe(true);
    // Garante que o rollback desfez a escrita preliminar
    expect(env.db.prepare("SELECT 1 FROM actor WHERE id='operator:temp_test'").get()).toBeUndefined();
  });

  // AUTH-TOCTOU-02: Fonte desativada concorrentemente
  it('AUTH-TOCTOU-02: desativação concorrente de fonte após pré-autenticação falha com 403 FORBIDDEN', () => {
    const env = createTestEnvironment();
    const { sourceId, rawToken } = env.provisionSource();

    const auth = env.authService.authenticateSource(env.db, rawToken, env.datasetId, 1);

    // Conexão concorrente desativa a fonte
    const otherStore = new Store(env.path);
    try {
      otherStore.db.prepare('UPDATE telemetry_source SET active = 0 WHERE id = ?').run(sourceId);
    } finally {
      otherStore.close();
    }

    transaction(env.db, () => {
      expect(() => {
        env.authService.assertSourceAuthorizedInTx(env.db, auth, rawToken);
      }).toThrow(new AppError(403, 'FORBIDDEN', 'Fonte telemétrica desativada.'));
    });
  });

  // AUTH-TOCTOU-03: Binding desativado concorrentemente
  it('AUTH-TOCTOU-03: desativação concorrente de binding após resolução falha com 403 FORBIDDEN na transação', () => {
    const env = createTestEnvironment();
    const { sourceId, rawToken } = env.provisionSource();
    const { bindingId, channel } = env.provisionBinding({ sourceId });

    const auth = env.authService.authenticateSource(env.db, rawToken, env.datasetId, 1);
    const binding = env.bindingService.resolveActiveBinding(env.db, auth, env.resourceId, channel);
    expect(binding).toBeDefined();

    // Conexão concorrente desativa o binding
    const otherStore = new Store(env.path);
    try {
      otherStore.db.prepare('UPDATE telemetry_binding SET active = 0 WHERE id = ?').run(bindingId);
    } finally {
      otherStore.close();
    }

    transaction(env.db, () => {
      expect(() => {
        env.bindingService.assertBindingActiveInTx(env.db, auth, env.resourceId, channel);
      }).toThrow(new AppError(403, 'FORBIDDEN', 'Binding inexistente, inativo ou não autorizado para a fonte.'));
    });
  });

  // AUTH-TOCTOU-04: Dataset avança epoch concorrentemente
  it('AUTH-TOCTOU-04: avanço de epoch por conexão concorrente falha com 409 EPOCH_CONFLICT na transação', () => {
    const env = createTestEnvironment();
    const { rawToken } = env.provisionSource();

    const auth = env.authService.authenticateSource(env.db, rawToken, env.datasetId, 1);

    // Conexão concorrente aposenta o epoch 1 e avança para epoch 2
    const otherStore = new Store(env.path);
    try {
      transaction(otherStore.db, () => {
        otherStore.db.prepare("UPDATE dataset_epoch SET status = 'retired' WHERE dataset_id = ? AND epoch = 1").run(env.datasetId);
        insert(otherStore.db, 'dataset_epoch', { dataset_id: env.datasetId, epoch: 2, status: 'ready', revision: 0 });
        otherStore.db.prepare('UPDATE dataset SET active_epoch = 2 WHERE id = ?').run(env.datasetId);
      });
    } finally {
      otherStore.close();
    }

    transaction(env.db, () => {
      expect(() => {
        env.authService.assertSourceAuthorizedInTx(env.db, auth, rawToken);
      }).toThrow(new AppError(409, 'EPOCH_CONFLICT', 'Geração obsoleta ou indisponível.'));
    });
  });

  // AUTH-PROV-01: Compartilhamento de proveniência entre TelemetryAuthService e TelemetryBindingService
  it('AUTH-PROV-01: contexto legítimo é aceito por ambos serviços; clonagem manual é rejeitada por ambos', () => {
    const env = createTestEnvironment();
    const { sourceId, rawToken } = env.provisionSource();
    const { channel } = env.provisionBinding({ sourceId });

    const auth = env.authService.authenticateSource(env.db, rawToken, env.datasetId, 1);

    // Contexto original aceito por ambos
    expect(() => assertValidSourceContext(auth)).not.toThrow();
    expect(env.bindingService.resolveActiveBinding(env.db, auth, env.resourceId, channel)).toBeDefined();

    // Clonagem manual via Object.assign ou spread
    const clonedAuth: AuthenticatedSourceContext = Object.freeze({ ...auth });

    expect(() => assertValidSourceContext(clonedAuth)).toThrow(new AppError(401, 'UNAUTHORIZED', 'Identidade não autenticada ou forjada.'));
    expect(() => env.bindingService.resolveActiveBinding(env.db, clonedAuth, env.resourceId, channel)).toThrow(
      new AppError(401, 'UNAUTHORIZED', 'Identidade não autenticada ou forjada.'),
    );
  });
});
