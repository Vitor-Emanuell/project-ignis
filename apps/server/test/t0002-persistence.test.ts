import { afterEach, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { executeCommand } from '../src/idempotency/command.js';
import type { CommandSpec } from '../src/idempotency/command.js';
import { Store, transaction, SCHEMA_VERSION } from '../src/persistence/store.js';
import { buildApp } from '../src/app.js';
import { AppError } from '../src/errors.js';
import { authorization, fixture, input, probe, DATASET, SECOND_DATASET, ORIGIN, sessionFor } from './support/foundation-fixture.js';
import { startCommand } from './support/child-process.js';

const fixtures: ReturnType<typeof fixture>[] = [];
const children: ReturnType<typeof startCommand>[] = [];
afterEach(async () => {
  await Promise.all(children.splice(0).map(child => child.stop()));
  fixtures.splice(0).forEach(f => f.cleanup());
});
const setup = () => { const f = fixture(); fixtures.push(f); return f; };
const code = (action: () => unknown, expected: string) => expect(action).toThrow(expect.objectContaining({ code: expected }));
const run = (f: ReturnType<typeof fixture>, value = input(), spec: CommandSpec = probe) => executeCommand(f.auth, f.credentials, spec, value);
const start = (job: Parameters<typeof startCommand>[0]) => { const child = startCommand(job); children.push(child); return child; };

describe('V00-I: persistência e integridade reais', () => {
  it('V00-I01 — primeira confirmação atômica', () => {
    const f = setup();
    expect(run(f)).toMatchObject({ status: 200, body: { revision: 1, value: 1 }, replayed: false });
    expect(f.revision()).toBe(1); expect(f.count()).toBe(1);
  });

  it('V00-I02 — replay normalizado e vetor H0', () => {
    const f = setup();
    const first = run(f);
    const second = run(f, input({ datasetId: DATASET.toUpperCase(), commandId: input().commandId.toUpperCase(),
      body: JSON.parse('{"value":1e0,"expectedVersion":0.0}') }));
    expect(second).toEqual({ ...first, headers: { 'Idempotency-Replayed': 'true' }, replayed: true });
    expect(second.hash).toBe('8529d6d5286b0d06c21188e77743a6194b0df0ffa154eaf588c9b3138fee285c');
    expect(f.revision()).toBe(1); expect(f.count()).toBe(1);
    // The golden UUIDs contain only digits: use hexadecimal letters as well.
    const mixed = setup(), id = 'ABCDEFAB-ABCD-4ABC-8ABC-ABCDEFABCDEF';
    const original = run(mixed, input({ commandId: id, target: { type: 'technical', id } }));
    expect(run(mixed, input({ commandId: id.toLowerCase(), target: { type: 'technical', id: id.toLowerCase() } })))
      .toEqual({ ...original, headers: { 'Idempotency-Replayed': 'true' }, replayed: true });
    expect(mixed.revision()).toBe(1); expect(mixed.count()).toBe(1);
  });

  it('V00-I03 — divergência preserva original', () => {
    const f = setup(); const first = run(f);
    code(() => run(f, input({ body: { expectedVersion: 0, value: 2 } })), 'IDEMPOTENCY_CONFLICT');
    expect(run(f)).toEqual({ ...first, headers: { 'Idempotency-Replayed': 'true' }, replayed: true });
    expect(f.revision()).toBe(1); expect(f.count()).toBe(1);
  });

  it('V00-I04 — alvo e precondição fazem parte do conteúdo', () => {
    const f = setup(); const id = randomUUID();
    run(f, input({ target: { type: 'technical', id } }));
    code(() => run(f, input({ target: { type: 'technical', id: randomUUID() } })), 'IDEMPOTENCY_CONFLICT');
    code(() => run(f, input({ target: { type: 'technical', id }, body: { expectedVersion: 1, value: 1 } })), 'IDEMPOTENCY_CONFLICT');
    expect(f.revision()).toBe(1); expect(f.count()).toBe(1);
  });

  it('V00-I05 — metadados internos não mudam hash/recibo', () => {
    const f = setup();
    const first = run(f, { ...input(), ...{ receivedAt: 'old', recordedAt: 'old', dataNow: 1, wallNow: 1,
      effectiveAt: 'old', correlationId: 'first', requestId: 'one', generatedId: randomUUID() } });
    const renewed = sessionFor(f.store, 'operator:test');
    const second = executeCommand(f.auth, renewed, probe, { ...input(), ...{ receivedAt: 'new', recordedAt: 'new',
      dataNow: 2, wallNow: 2, effectiveAt: 'new', correlationId: 'other', requestId: 'two', generatedId: randomUUID() } });
    expect(second).toEqual({ ...first, headers: { 'Idempotency-Replayed': 'true' }, replayed: true });
    expect(second.hash).toBe('8529d6d5286b0d06c21188e77743a6194b0df0ffa154eaf588c9b3138fee285c');
    expect(f.count()).toBe(1);
  });

  it('V00-I06 — campos extras e JSON duplicado não deixam efeitos', async () => {
    const f = setup();
    for (const field of ['receivedAt', 'dataNow', 'unknown']) {
      code(() => run(f, input({ body: { expectedVersion: 0, value: 1, [field]: 1 } })), 'INVALID_REQUEST');
    }
    const app = await buildApp();
    try {
      const response = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { 'content-type': 'application/json' },
        payload: '{"secret":"a","secret":"b"}' });
      expect(response.statusCode).toBe(400);
    } finally { await app.close(); }
    expect(f.revision()).toBe(0); expect(f.count()).toBe(0);
  });

  it('V00-I13 — commit com resposta perdida sobrevive à queda e reabertura', async () => {
    const f = setup();
    const child = start({ path: f.path, credentials: f.credentials, input: input(), mode: 'crash-after' });
    await child.phase('committed');
    await child.stop();
    f.store.close();
    const reopened = new Store(f.path);
    try {
      const result = executeCommand(authorization(reopened), f.credentials, probe, input());
      expect(result).toMatchObject({ status: 200, replayed: true, body: { revision: 1, value: 1 } });
      expect(reopened.db.prepare('SELECT count(*) AS n FROM command_receipt').get()).toEqual({ n: 1 });
      expect(reopened.ready()).toBe(true);
    } finally { reopened.close(); }
  });

  it('V00-I14 — rollback de efeito, recibo, serialização e commit; queda antes do commit', async () => {
    const f = setup();
    const faults: CommandSpec[] = [
      { ...probe, apply(db, context, body) { probe.apply(db, context, body); throw new AppError(500, 'TEST_FAULT', 'Falha de teste.'); } },
      { ...probe, apply(db, context, body) { const result = probe.apply(db, context, body);
        db.exec("CREATE TEMP TRIGGER fail_receipt BEFORE INSERT ON command_receipt BEGIN SELECT RAISE(ABORT, 'test fault'); END"); return result; } },
      { ...probe, apply(db, context, body) { probe.apply(db, context, body); return { status: 200, body: { invalid: undefined } as never }; } },
      { ...probe, apply(db, context, body) { const result = probe.apply(db, context, body);
        db.prepare("INSERT INTO dataset(id, code, kind, active_epoch) VALUES (?, 'deferred-failure', 'demo', 999)").run(randomUUID()); return result; } },
    ];
    for (const spec of faults) {
      expect(() => run(f, input(), spec)).toThrow();
      expect(f.revision()).toBe(0); expect(f.count()).toBe(0);
      expect(f.store.db.inTransaction).toBe(false);
      f.store.db.exec('DROP TRIGGER IF EXISTS temp.fail_receipt');
    }
    const child = start({ path: f.path, credentials: f.credentials, input: input(), mode: 'crash-before' });
    await child.phase('locked'); await child.stop();
    f.store.close();
    const reopened = new Store(f.path);
    try {
      expect(reopened.db.prepare('SELECT revision FROM dataset_epoch WHERE dataset_id = ? AND epoch = 1').get(DATASET)).toEqual({ revision: 0 });
      expect(reopened.db.prepare('SELECT count(*) AS n FROM command_receipt').get()).toEqual({ n: 0 });
      expect(executeCommand(authorization(reopened), f.credentials, probe, input()).replayed).toBe(false);
    } finally { reopened.close(); }
  });

  it('V00-I15 — conexões/processos concorrentes equivalentes e vencedor revertido', async () => {
    for (const mode of ['hold', 'rollback'] as const) {
      const f = setup(); const release = join(f.directory, 'release');
      const winner = start({ path: f.path, credentials: f.credentials, input: input(), mode, release });
      await winner.phase('locked');
      const follower = start({ path: f.path, credentials: f.credentials, input: input(), mode: 'normal' });
      await follower.phase('starting');
      await new Promise(resolve => setTimeout(resolve, 150));
      writeFileSync(release, 'release');
      const first = await winner.phase('result'), second = await follower.phase('result');
      expect(second.result).toMatchObject({ replayed: mode === 'hold', body: { revision: 1, value: 1 } });
      expect(second.elapsed).toBeGreaterThanOrEqual(100);
      if (mode === 'hold') expect(first.result?.replayed).toBe(false);
      else expect(first.error).toBe('TEST_ROLLBACK');
      expect(f.count()).toBe(1); expect(f.revision()).toBe(1);
      await Promise.all([winner.exit, follower.exit]);
    }
  });

  it('V00-I16 — concorrência divergente e timeout 503 limitado', async () => {
    const f = setup(), release = join(f.directory, 'release');
    const winner = start({ path: f.path, credentials: f.credentials, input: input(), mode: 'hold', release });
    await winner.phase('locked');
    const loser = start({ path: f.path, credentials: f.credentials,
      input: input({ body: { expectedVersion: 0, value: 2 } }), mode: 'normal' });
    await loser.phase('starting');
    await new Promise(resolve => setTimeout(resolve, 150)); writeFileSync(release, 'release');
    expect((await loser.phase('result')).error).toBe('IDEMPOTENCY_CONFLICT');
    await winner.phase('result'); await Promise.all([winner.exit, loser.exit]);
    const busyFixture = setup(), busyRelease = join(busyFixture.directory, 'release');
    const holder = start({ path: busyFixture.path, credentials: busyFixture.credentials, input: input(), mode: 'hold', release: busyRelease });
    await holder.phase('locked');
    const blocked = start({ path: busyFixture.path, credentials: busyFixture.credentials, input: input(), mode: 'normal' });
    const response = await blocked.phase('result');
    expect(response).toMatchObject({ error: 'DATABASE_UNAVAILABLE', status: 503 });
    expect(response.elapsed).toBeGreaterThanOrEqual(900); expect(response.elapsed).toBeLessThan(3000);
    expect(busyFixture.revision()).toBe(0); expect(busyFixture.count()).toBe(0);
    writeFileSync(busyRelease, 'release'); await holder.phase('result'); await holder.exit;
    expect(run(busyFixture).replayed).toBe(true); expect(busyFixture.count()).toBe(1);
  });

  it('V00-I17 — isolamento de dataset, principal e operação; acesso negado', () => {
    const f = setup(); run(f);
    run(f, input({ datasetId: SECOND_DATASET, epoch: 2 }));
    f.store.db.prepare("INSERT INTO actor(id, kind) VALUES ('operator:other', 'operator')").run();
    f.store.db.prepare("INSERT INTO dataset_grant(dataset_id, actor_id, can_write) VALUES (?, 'operator:other', 1)").run(DATASET);
    const other = sessionFor(f.store, 'operator:other');
    expect(executeCommand(f.auth, other, probe, input({ body: { expectedVersion: 1, value: 1 } })).replayed).toBe(false);
    run(f, input({ body: { expectedVersion: 2, value: 1 } }), { ...probe, operation: 'verification.other.v1' });
    expect(f.count()).toBe(4); expect(f.revision()).toBe(3); expect(f.revision(SECOND_DATASET, 2)).toBe(1);
    code(() => executeCommand(f.auth, other, probe, input({ datasetId: SECOND_DATASET, epoch: 2 })), 'CONTEXT_FORBIDDEN');
    code(() => executeCommand(f.auth, { token: 'forged', csrf: 'forged', origin: ORIGIN }, probe, input()), 'UNAUTHORIZED');
  });

  it('V00-I18 — sessão renovada e revisão alterada não invalidam replay', () => {
    const f = setup(); const first = run(f);
    run(f, input({ commandId: randomUUID(), body: { expectedVersion: 1, value: 5 } }));
    const renewed = sessionFor(f.store, 'operator:test');
    expect(executeCommand(f.auth, renewed, probe, input())).toEqual({ ...first, headers: { 'Idempotency-Replayed': 'true' }, replayed: true });
    expect(f.revision()).toBe(2); expect(f.count()).toBe(2);
    f.store.db.prepare("UPDATE dataset_grant SET can_write = 0 WHERE actor_id = 'operator:test'").run();
    code(() => executeCommand(f.auth, renewed, probe, input()), 'CONTEXT_FORBIDDEN');
  });

  it('V00-I19 — epoch aposentado prevalece; nova geração é outra identidade', () => {
    const f = setup(); run(f);
    transaction(f.store.db, () => {
      f.store.db.prepare("UPDATE dataset_epoch SET status = 'retired' WHERE dataset_id = ?").run(DATASET);
      f.store.db.prepare("INSERT INTO dataset_epoch(dataset_id, epoch, status) VALUES (?, 2, 'ready')").run(DATASET);
      f.store.db.prepare('UPDATE dataset SET active_epoch = 2 WHERE id = ?').run(DATASET);
    });
    code(() => run(f), 'EPOCH_CONFLICT');
    expect(run(f, input({ epoch: 2 })).replayed).toBe(false);
    expect(f.count()).toBe(2); expect(f.revision(DATASET, 2)).toBe(1);
  });

  it('V00-I20 — UNIQUE, FK composta, NOT NULL e rollback SQL', () => {
    const f = setup(); run(f);
    expect(() => f.store.db.exec('INSERT INTO command_receipt SELECT * FROM command_receipt LIMIT 1')).toThrow(/UNIQUE/);
    expect(() => transaction(f.store.db, () => {
      f.store.db.prepare('UPDATE dataset_epoch SET revision = revision + 1 WHERE dataset_id = ? AND epoch = 1').run(DATASET);
      f.store.db.exec('INSERT INTO command_receipt SELECT dataset_id, 2, actor_id, operation, command_id, canonical_version, request_hash, response_status, response_body, resulting_revision FROM command_receipt LIMIT 1');
    })).toThrow(/FOREIGN KEY/);
    expect(() => f.store.db.exec('INSERT INTO command_receipt SELECT dataset_id, epoch, NULL, operation, command_id, canonical_version, request_hash, response_status, response_body, resulting_revision FROM command_receipt LIMIT 1')).toThrow(/NOT NULL/);
    expect(f.revision()).toBe(1); expect(f.count()).toBe(1);
    expect(f.store.db.inTransaction).toBe(false);
  });

  it('V00-I21 — driver, PRAGMAs por conexão, migração/reabertura e readiness', async () => {
    const f = setup(), second = new Store(f.path);
    try {
      for (const store of [f.store, second]) expect(store.diagnostics()).toMatchObject({
        foreignKeys: 1, journalMode: 'wal', synchronous: 2, busyTimeout: 1000,
      });
      const before = f.store.migrate(); expect(f.store.migrate()).toEqual(before);
      expect(f.store.db.prepare('SELECT count(*) AS n FROM schema_migration').get()).toEqual({ n: SCHEMA_VERSION });
      expect(second.ready()).toBe(true);
      console.info('V00-I21 SQLite efetivo:', f.store.diagnostics());
      f.store.db.pragma('user_version = 999');
      const app = await buildApp({ foundation: { store: second, host: '127.0.0.1' } });
      try {
        expect((await app.inject('/health/ready')).statusCode).toBe(503);
        expect((await app.inject('/health/live')).json()).toEqual({ status: 'ok' });
        expect(() => f.store.migrate()).toThrow(/futura/);
      } finally { await app.close(); }
      f.store.db.pragma(`user_version = ${SCHEMA_VERSION}`);
      f.store.db.prepare("UPDATE schema_migration SET checksum = 'changed'").run();
      expect(f.store.ready()).toBe(false);
      expect(() => f.store.migrate()).toThrow(/checksum/);
    } finally { second.close(); }
  });
});
