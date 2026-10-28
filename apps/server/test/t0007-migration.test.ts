import { afterEach, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { SCHEMA_VERSION, Store, transaction } from '../src/persistence/store.js';
import { generateDemo, readDemo } from '../src/demo/service.js';
import { authorization, sessionFor } from './support/foundation-fixture.js';
import { generation } from './support/t0005-fixture.js';

type Row = Record<string, string | number | null>;
const T = Date.parse('2026-10-26T12:00:00.000Z');
const fixtures: { directory: string; store: Store }[] = [];
const oldMigrations = ['0001-foundation.sql', '0002-inventory.sql', '0003-heterogeneous-inventory.sql',
  '0004-demo-baseline.sql', '0005-regions-and-spatial.sql'];
const newTables = ['telemetry_source', 'telemetry_credential', 'telemetry_profile', 'telemetry_resource_profile', 'telemetry_binding',
  'telemetry_episode', 'telemetry_event', 'telemetry_sequence_slot', 'telemetry_command_receipt',
  'telemetry_channel_cursor', 'telemetry_cause_resolution', 'telemetry_trusted_clock',
  'telemetry_communication_observation', 'telemetry_position_observation'];

afterEach(() => {
  vi.restoreAllMocks();
  for (const f of fixtures.splice(0)) {
    f.store.close();
    const target = resolve(f.directory);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('ignis-t0007-')) {
      throw new Error('Temporary fixture cleanup outside allocated directory');
    }
    rmSync(target, { recursive: true, force: true });
  }
});

function empty() {
  const directory = mkdtempSync(join(tmpdir(), "ignis-t0007-quote'-"));
  const path = join(directory, 'test.sqlite');
  const store = new Store(path, true);
  fixtures.push({ directory, store });
  return { directory, path, store, db: store.db };
}

function insert(db: Database.Database, table: string, row: Row) {
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...Object.values(row));
}

function rows(db: Database.Database, table: string) {
  return db.prepare(`SELECT * FROM ${table}`).all().map(row => JSON.stringify(row)).sort();
}

function objects(db: Database.Database) {
  return db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY name").all() as Row[];
}

function snapshot(db: Database.Database) {
  return Object.fromEntries((db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[]).map(({ name }) => [name, rows(db, name)]));
}

function integrity(db: Database.Database) {
  expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
  expect(db.pragma('foreign_key_check')).toEqual([]);
}

function schema5(populated = true) {
  const f = empty(), actorId = `operator:${randomUUID()}`, datasetId = randomUUID();
  transaction(f.db, () => {
    f.db.exec('CREATE TABLE schema_migration(version INTEGER PRIMARY KEY NOT NULL, checksum TEXT NOT NULL)');
    for (const [index, file] of oldMigrations.entries()) {
      const sql = readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
      f.db.exec(sql);
      f.db.prepare('INSERT INTO schema_migration VALUES(?,?)').run(index + 1, createHash('sha256').update(sql).digest('hex'));
    }
    f.db.pragma('user_version=5');
    f.db.prepare("INSERT INTO actor VALUES(?,'operator','local-operator')").run(actorId);
    f.db.prepare("INSERT INTO dataset VALUES(?,'local-demo','demo',1)").run(datasetId);
    f.db.prepare("INSERT INTO dataset_epoch VALUES(?,1,'ready',0)").run(datasetId);
    f.db.prepare('INSERT INTO dataset_grant VALUES(?,?,1)').run(datasetId, actorId);
  });
  const auth = authorization(f.store), credentials = sessionFor(f.store, actorId), input = generation();
  // Emulate the schema-5 runtime version guard only while creating the old baseline.
  // Actual domain generation, SQL constraints, hashes, events and receipts stay real.
  if (populated) {
    const readiness = vi.spyOn(f.store, 'ready').mockReturnValue(true);
    try { expect(generateDemo(auth, credentials, datasetId, 1, input).status).toBe(201); }
    finally { readiness.mockRestore(); }
  }
  expect(f.db.pragma('user_version', { simple: true })).toBe(5);
  integrity(f.db);
  return { ...f, actorId, datasetId, auth, credentials, input };
}

function backupPath(sql: string): string | undefined {
  return /^VACUUM INTO '((?:[^']|'')*)'$/.exec(sql)?.[1]?.replaceAll("''", "'");
}

function backups(f: ReturnType<typeof empty>) {
  return readdirSync(f.directory).filter(name => name.includes('.schema5-') && name.endsWith('.backup'));
}

it('PKG01 — empty database reaches schema 6; repeat/reopen does not provision telemetry or clock', () => {
  const f = empty(), installation = f.store.migrate();
  expect(SCHEMA_VERSION).toBe(7);
  expect(f.store.ready()).toBe(true);
  expect(f.db.pragma('user_version', { simple: true })).toBe(7);
  expect(f.db.prepare('SELECT version FROM schema_migration ORDER BY version').all()).toEqual(
    [1, 2, 3, 4, 5, 6, 7].map(version => ({ version })));
  for (const table of newTables) expect(rows(f.db, table), table).toEqual([]);
  const before = snapshot(f.db);
  expect(f.store.migrate()).toEqual(installation);
  expect(snapshot(f.db)).toEqual(before);
  expect(backups(f)).toEqual([]);
  const reopened = new Store(f.path);
  try { expect(reopened.ready()).toBe(true); integrity(reopened.db); }
  finally { reopened.close(); }
});

it('PKG01 — populated schema 5 + committed WAL: validated backup, all legacy data/objects, baseline replay and checksums survive', () => {
  const f = schema5();
  f.db.pragma('wal_checkpoint(TRUNCATE)');
  f.db.pragma('wal_autocheckpoint=0');
  f.db.exec("INSERT INTO actor(id,kind) VALUES('operator:committed-only-in-wal','operator')");
  expect(statSync(f.path + '-wal').size).toBeGreaterThan(32);
  // Negative control proves this committed marker is absent from the main file alone.
  const mainOnly = join(f.directory, 'main-only.sqlite');
  copyFileSync(f.path, mainOnly);
  const main = new Database(mainOnly, { readonly: true });
  try { expect(main.prepare("SELECT id FROM actor WHERE id='operator:committed-only-in-wal'").get()).toBeUndefined(); }
  finally { main.close(); }
  const before = snapshot(f.db), schema = objects(f.db);
  const stateColumns = f.db.pragma('table_xinfo(current_state)');
  const stateFks = f.db.pragma('foreign_key_list(current_state)');
  const exec = f.db.exec.bind(f.db);
  const spy = vi.spyOn(f.db, 'exec').mockImplementation(sql => {
    if (backupPath(sql)) expect(f.db.inTransaction).toBe(false);
    return exec(sql);
  });
  f.store.migrate(); spy.mockRestore();
  for (const [table, data] of Object.entries(before)) {
    if (table !== 'schema_migration') expect(rows(f.db, table), table).toEqual(data);
  }
  for (const object of schema) expect(objects(f.db)).toContainEqual(object);
  expect(f.db.pragma('table_xinfo(current_state)')).toEqual(stateColumns);
  expect(f.db.pragma('foreign_key_list(current_state)')).toEqual(stateFks);
  expect(f.db.prepare('SELECT * FROM schema_migration WHERE version<=5 ORDER BY version').all().map(row => JSON.stringify(row)).sort())
    .toEqual(before.schema_migration);
  expect(backups(f)).toHaveLength(1);
  const backup = new Database(join(f.directory, backups(f)[0]!), { readonly: true });
  try {
    integrity(backup);
    expect(backup.pragma('user_version', { simple: true })).toBe(5);
    expect(snapshot(backup)).toEqual(before);
  } finally { backup.close(); }
  const baseline = readDemo(f.auth, f.credentials, f.datasetId, 1);
  const after = snapshot(f.db);
  const replay = generateDemo(f.auth, f.credentials, f.datasetId, 1, f.input);
  expect(replay).toMatchObject({ status: 201, replayed: true });
  expect(readDemo(f.auth, f.credentials, f.datasetId, 1)).toEqual(baseline);
  expect(snapshot(f.db)).toEqual(after);
  f.store.migrate();
  expect(backups(f)).toHaveLength(1);
  integrity(f.db);
});

it('PKG01 — real VACUUM destination failure leaves schema 5 data, ledger and user_version unchanged', () => {
  const f = schema5(), before = snapshot(f.db), schema = objects(f.db), exec = f.db.exec.bind(f.db);
  vi.spyOn(f.db, 'exec').mockImplementation(sql => {
    const destination = backupPath(sql);
    if (destination) mkdirSync(destination); // Existing directory: real SQLite I/O failure.
    return exec(sql);
  });
  expect(() => f.store.migrate()).toThrow();
  expect(snapshot(f.db)).toEqual(before); expect(objects(f.db)).toEqual(schema);
  expect(f.db.pragma('user_version', { simple: true })).toBe(5);
  expect(f.db.inTransaction).toBe(false); integrity(f.db);
});

it.each(['foreign-key', 'check'] as const)('PKG01 — invalid backup (%s) is refused before any original DDL', damage => {
  const f = schema5(), before = snapshot(f.db), schema = objects(f.db), exec = f.db.exec.bind(f.db);
  vi.spyOn(f.db, 'exec').mockImplementation(sql => {
    const result = exec(sql), destination = backupPath(sql);
    if (destination) {
      const backup = new Database(destination);
      try {
        if (damage === 'foreign-key') {
          backup.pragma('foreign_keys=OFF');
          backup.exec("UPDATE dataset_grant SET actor_id='nonexistent'");
          expect(backup.pragma('foreign_key_check')).not.toEqual([]);
        } else {
          backup.pragma('ignore_check_constraints=ON');
          backup.exec('UPDATE equipment SET criticality=99');
          backup.pragma('ignore_check_constraints=OFF');
          expect(backup.pragma('integrity_check', { simple: true })).not.toBe('ok');
        }
      } finally { backup.close(); }
    }
    return result;
  });
  expect(() => f.store.migrate()).toThrow(/Backup SQLite inválido/);
  expect(snapshot(f.db)).toEqual(before); expect(objects(f.db)).toEqual(schema);
  expect(f.db.pragma('user_version', { simple: true })).toBe(5); integrity(f.db);
});

it('PKG01 — caller transaction is refused without VACUUM, commit or rollback of caller work', () => {
  const f = schema5(false);
  f.db.exec('BEGIN IMMEDIATE');
  try {
    f.db.exec("INSERT INTO actor(id,kind) VALUES('operator:uncommitted','operator')");
    expect(() => f.store.migrate()).toThrow(/transação ativa/);
    expect(f.db.inTransaction).toBe(true); expect(backups(f)).toEqual([]);
  } finally { f.db.exec('ROLLBACK'); }
  expect(f.db.prepare("SELECT 1 FROM actor WHERE id='operator:uncommitted'").get()).toBeUndefined();
});

it('PKG01 — another connection writing after backup invalidates attempt; retry backs up the new state', () => {
  const f = schema5(false), schema = objects(f.db), second = new Store(f.path), exec = f.db.exec.bind(f.db);
  try {
    const spy = vi.spyOn(f.db, 'exec').mockImplementation(sql => {
      const result = exec(sql);
      if (backupPath(sql)) second.db.exec("INSERT INTO actor(id,kind) VALUES('operator:concurrent','operator')");
      return result;
    });
    expect(() => f.store.migrate()).toThrow(/Banco alterado durante o backup/);
    spy.mockRestore();
    expect(objects(f.db)).toEqual(schema); expect(f.db.pragma('user_version', { simple: true })).toBe(5);
    expect(f.db.prepare("SELECT id FROM actor WHERE id='operator:concurrent'").get()).toBeDefined();
    f.store.migrate(); expect(f.store.ready()).toBe(true); expect(backups(f)).toHaveLength(2);
  } finally { second.close(); }
});

it('PKG01 — failure after partial real DDL rolls back added tables, indexes and triggers', () => {
  const f = schema5(), before = snapshot(f.db);
  f.db.exec('CREATE TABLE telemetry_event(collision TEXT)');
  const schema = objects(f.db);
  expect(() => f.store.migrate()).toThrow(/already exists/);
  expect(objects(f.db)).toEqual(schema);
  for (const [table, data] of Object.entries(before)) expect(rows(f.db, table)).toEqual(data);
  expect(f.db.pragma('user_version', { simple: true })).toBe(5);
  expect(f.db.inTransaction).toBe(false);
  f.db.exec('DROP TABLE telemetry_event'); // This fixture's collision only.
  f.store.migrate(); expect(f.store.ready()).toBe(true); integrity(f.db);
});

it.each(['ledger', 'user_version'] as const)('PKG01 — rollback after %s preserves the entire schema-5 installation', boundary => {
  const f = schema5(), before = snapshot(f.db), schema = objects(f.db);
  if (boundary === 'ledger') {
    f.db.exec("CREATE TEMP TRIGGER t7_fault AFTER INSERT ON schema_migration WHEN NEW.version=6 BEGIN SELECT RAISE(ABORT,'t7-ledger-fault'); END");
  } else {
    const pragma = f.db.pragma.bind(f.db);
    vi.spyOn(f.db, 'pragma').mockImplementation(((sql: string, options?: { simple?: boolean }) => {
      const result = pragma(sql, options);
      if (sql === 'user_version = 7') {
        expect(pragma('user_version', { simple: true })).toBe(7);
        expect(f.db.prepare('SELECT version FROM schema_migration WHERE version=7').get()).toEqual({ version: 7 });
        throw new Error('t7-user-version-fault');
      }
      return result;
    }) as typeof f.db.pragma);
  }
  expect(() => f.store.migrate()).toThrow(/t7-/);
  vi.restoreAllMocks();
  expect(snapshot(f.db)).toEqual(before); expect(objects(f.db)).toEqual(schema);
  expect(f.db.pragma('user_version', { simple: true })).toBe(5);
  expect(f.db.inTransaction).toBe(false); integrity(f.db);
});

function telemetryFixture() {
  const f = empty(), installation = f.store.migrate();
  const { datasetId, actorId } = installation;
  expect(generateDemo(authorization(f.store), sessionFor(f.store, actorId), datasetId, 1, generation()).status).toBe(201);
  const camera = (f.db.prepare("SELECT id FROM equipment WHERE category_code='camera' LIMIT 1").get() as { id: string }).id;
  const mobile = (f.db.prepare("SELECT id FROM equipment WHERE category_code='inspection_vehicle' LIMIT 1").get() as { id: string }).id;
  const agent = (f.db.prepare('SELECT id FROM agent LIMIT 1').get() as { id: string }).id;
  const sourceId = randomUUID();
  insert(f.db, 'telemetry_source', { id: sourceId, source_kind: 'fixture', provisioned_by: actorId, active: 1, created_at_ms: T });
  for (const [id, kind, category, emitter, interval, ttl] of [
    ['FX-NONE-v1', 'equipment', 'camera', 0, null, null],
    ['FX-FIXED-v1', 'equipment', 'camera', 1, 10000, null],
    ['FX-MOBILE-v1', 'equipment', 'inspection_vehicle', 1, 10000, 30000],
    ['FX-AGENT-v1', 'agent', null, null, null, 30000],
  ] as const) {
    insert(f.db, 'telemetry_profile', { id, version: 1, usage: 'fixture', resource_kind: kind,
      category_code: category, category_version: category === null ? null : 1, emitter_expected: emitter,
      expected_interval_ms: interval, position_ttl_ms: ttl, configuration_json: '{}', provenance: 'C03 isolated DDL fixture' });
  }
  for (const [resource, kind, profile] of [[camera, 'equipment', 'FX-FIXED-v1'],
    [mobile, 'equipment', 'FX-MOBILE-v1'], [agent, 'agent', 'FX-AGENT-v1']] as const) {
    insert(f.db, 'telemetry_resource_profile', { dataset_id: datasetId, epoch: 1, resource_id: resource,
      resource_kind: kind, profile_id: profile, profile_version: 1, active: 1, assigned_at_ms: T });
  }
  const binding: Row = { dataset_id: datasetId, epoch: 1, id: randomUUID(), source_id: sourceId,
    resource_id: camera, resource_kind: 'equipment', channel: 'heartbeat', projection_field: 'communication',
    profile_id: 'FX-FIXED-v1', profile_version: 1, active: 1, resource_born_at_ms: T - 2000, history_allowed_from_ms: T - 1000 };
  insert(f.db, 'telemetry_binding', binding);
  return { ...f, datasetId, actorId, sourceId, camera, mobile, agent, binding };
}
type F = ReturnType<typeof telemetryFixture>;

function eventRow(f: F, changes: Row = {}): Row {
  return { dataset_id: f.datasetId, epoch: 1, source_id: f.sourceId, event_id: randomUUID(), resource_id: f.camera,
    channel: 'heartbeat', binding_id: f.binding.id!, sequence: 0, observation_type: 'heartbeat', canonical_version: 1,
    event_hash: 'a'.repeat(64), canonical_json: '{}', occurred_at_ms: T, received_at_ms: T, recorded_at_ms: T,
    observation_effective_at_ms: T, is_simulated: 1, episode_id: null, cause_code: null, episode_started_at_ms: null,
    disposition: 'applied', effects_json: '{"communication":true}', reason_code: 'fixture', resulting_revision: 2,
    response_status: 200, response_body: '{"fixture":"confirmed"}', ...changes };
}

function eventAndSlot(f: F, event: Row) {
  insert(f.db, 'telemetry_event', event);
  insert(f.db, 'telemetry_sequence_slot', Object.fromEntries(
    ['dataset_id', 'epoch', 'source_id', 'resource_id', 'channel', 'sequence', 'event_id'].map(key => [key, event[key]!])));
}

function receipt(f: F, event: Row, changes: Row = {}): Row {
  return { dataset_id: event.dataset_id!, epoch: event.epoch!, actor_id: `source:${event.source_id}`,
    operation: 'telemetry.ingest.v1', command_id: randomUUID(), source_id: event.source_id!, event_id: event.event_id!,
    canonical_version: 1, request_hash: 'b'.repeat(64), response_status: 200, response_body: event.response_body!,
    resulting_revision: event.resulting_revision!, ...changes };
}

it('PKG01 — Kc, Ke and Ks reject collisions; another Kc may reference the same immutable result without duplicating events', () => {
  const f = telemetryFixture(), event = eventRow(f), kc = receipt(f, event);
  transaction(f.db, () => { eventAndSlot(f, event); insert(f.db, 'telemetry_command_receipt', kc); });
  const before = snapshot(f.db);
  expect(() => insert(f.db, 'telemetry_command_receipt', { ...kc, request_hash: 'c'.repeat(64) })).toThrow(/UNIQUE/);
  expect(() => transaction(f.db, () => eventAndSlot(f, { ...event, event_hash: 'c'.repeat(64) }))).toThrow(/UNIQUE/);
  expect(() => transaction(f.db, () => {
    const conflicting = { ...event, event_id: randomUUID() };
    insert(f.db, 'telemetry_event', conflicting);
    insert(f.db, 'telemetry_command_receipt', receipt(f, conflicting));
    insert(f.db, 'telemetry_sequence_slot', { dataset_id: f.datasetId, epoch: 1, source_id: f.sourceId,
      resource_id: f.camera, channel: 'heartbeat', sequence: 0, event_id: conflicting.event_id });
  })).toThrow(/UNIQUE/);
  expect(snapshot(f.db)).toEqual(before);
  insert(f.db, 'telemetry_command_receipt', receipt(f, event));
  expect(rows(f.db, 'telemetry_command_receipt')).toHaveLength(2);
  expect(rows(f.db, 'telemetry_event')).toHaveLength(1); expect(rows(f.db, 'telemetry_sequence_slot')).toHaveLength(1);
  expect(rows(f.db, 'dataset_epoch')).toEqual(before.dataset_epoch);
  expect(rows(f.db, 'command_receipt')).toEqual(before.command_receipt);
  expect(() => insert(f.db, 'telemetry_command_receipt', receipt(f, event, { response_body: '{}' }))).toThrow(/confirmed event result/);
  integrity(f.db);
});

it('PKG01 — deferred Ke/Ks references reject missing or mismatched slots at COMMIT', () => {
  const f = telemetryFixture(), before = snapshot(f.db);
  expect(() => transaction(f.db, () => insert(f.db, 'telemetry_event', eventRow(f)))).toThrow(/FOREIGN KEY/);
  expect(() => transaction(f.db, () => insert(f.db, 'telemetry_sequence_slot', {
    dataset_id: f.datasetId, epoch: 1, source_id: f.sourceId, resource_id: f.camera, channel: 'heartbeat', sequence: 0, event_id: randomUUID(),
  }))).toThrow(/FOREIGN KEY/);
  expect(snapshot(f.db)).toEqual(before); expect(f.db.inTransaction).toBe(false);
});

it('PKG01 — principal isolation, credential rotation and revocation retain machine identity and receipts', () => {
  const f = telemetryFixture(), event = eventRow(f);
  transaction(f.db, () => eventAndSlot(f, event));
  insert(f.db, 'telemetry_command_receipt', receipt(f, event));
  const before = rows(f.db, 'telemetry_command_receipt');
  for (const hash of ['d', 'e']) insert(f.db, 'telemetry_credential', { token_hash: hash.repeat(64), source_id: f.sourceId,
    issued_at_ms: T, expires_at_ms: T + 60000, revoked_at_ms: null });
  f.db.prepare('UPDATE telemetry_credential SET revoked_at_ms=? WHERE token_hash=?').run(T + 1, 'd'.repeat(64));
  f.db.exec('UPDATE telemetry_source SET active=0'); f.db.exec('UPDATE telemetry_source SET active=1');
  expect(rows(f.db, 'telemetry_command_receipt')).toEqual(before);
  expect(() => insert(f.db, 'telemetry_command_receipt', receipt(f, event, { actor_id: f.actorId }))).toThrow(/FOREIGN KEY/);
  expect(() => f.db.prepare("INSERT INTO actor(id,kind) VALUES(?,'operator')").run(`source:${f.sourceId}`)).toThrow(/namespace/);
  expect(() => f.db.prepare('INSERT INTO local_session VALUES(?,?,?,?)').run('f'.repeat(64), `source:${f.sourceId}`, 'a'.repeat(64), T)).toThrow(/FOREIGN KEY/);
  expect(() => f.db.prepare('UPDATE telemetry_source SET id=?').run(randomUUID())).toThrow(/Immutable/);
  expect(() => f.db.exec("UPDATE telemetry_credential SET revoked_at_ms=NULL WHERE revoked_at_ms IS NOT NULL")).toThrow(/Immutable/);
  integrity(f.db);
});

it('PKG01 — bindings enforce context, profile/category, one active source/channel and one field owner', () => {
  const f = telemetryFixture();
  expect(() => insert(f.db, 'telemetry_binding', { ...f.binding, id: randomUUID() })).toThrow(/UNIQUE/);
  expect(() => insert(f.db, 'telemetry_binding', { ...f.binding, id: randomUUID(), channel: 'another' })).toThrow(/UNIQUE/);
  expect(() => insert(f.db, 'telemetry_binding', { ...f.binding, id: randomUUID(), epoch: 2 })).toThrow();
  expect(() => insert(f.db, 'telemetry_binding', { ...f.binding, id: randomUUID(), profile_id: 'FX-MOBILE-v1', active: 0 })).toThrow(/Incompatible/);
  expect(() => insert(f.db, 'telemetry_binding', { ...f.binding, id: randomUUID(), profile_id: 'FX-NONE-v1', active: 0 })).toThrow(/Incompatible/);
  expect(() => insert(f.db, 'telemetry_binding', { ...f.binding, id: randomUUID(), source_id: randomUUID(), active: 0 })).toThrow(/FOREIGN KEY/);
  f.db.exec('UPDATE telemetry_binding SET active=0');
  insert(f.db, 'telemetry_binding', { ...f.binding, id: randomUUID() });
  expect(() => f.db.prepare('UPDATE telemetry_binding SET source_id=? WHERE id=?').run(randomUUID(), f.binding.id)).toThrow(/Immutable/);
  expect(() => f.db.exec('DELETE FROM telemetry_binding')).toThrow(/Retain/);
  expect(() => f.db.exec("UPDATE telemetry_profile SET usage='operational'")).toThrow(/Immutable/);
  integrity(f.db);
});

it('PKG01 — FX-NONE can be explicitly assigned without a source/channel, separately from missing profile', () => {
  const f = telemetryFixture();
  const assignment: Row = { dataset_id: f.datasetId, epoch: 1, resource_id: f.camera, resource_kind: 'equipment',
    profile_id: 'FX-NONE-v1', profile_version: 1, active: 1, assigned_at_ms: T };
  expect(() => insert(f.db, 'telemetry_resource_profile', assignment)).toThrow(/UNIQUE|active binding/);
  transaction(f.db, () => {
    f.db.prepare('UPDATE telemetry_binding SET active=0 WHERE resource_id=?').run(f.camera);
    f.db.prepare('UPDATE telemetry_resource_profile SET active=0 WHERE resource_id=?').run(f.camera);
    insert(f.db, 'telemetry_resource_profile', assignment);
  });
  expect(f.db.prepare(`SELECT p.emitter_expected FROM telemetry_resource_profile r JOIN telemetry_profile p
    ON p.id=r.profile_id AND p.version=r.profile_version WHERE r.resource_id=? AND r.active=1`).get(f.camera)).toEqual({ emitter_expected: 0 });
  expect(f.db.prepare('SELECT 1 FROM telemetry_binding WHERE resource_id=? AND active=1').get(f.camera)).toBeUndefined();
  expect(() => insert(f.db, 'telemetry_binding', { ...f.binding, id: randomUUID(), profile_id: 'FX-NONE-v1' })).toThrow(/Incompatible/);
  expect(() => insert(f.db, 'telemetry_resource_profile', { ...assignment, resource_id: f.mobile })).toThrow(/Incompatible/);
  expect(() => f.db.exec('UPDATE telemetry_resource_profile SET assigned_at_ms=0')).toThrow(/Immutable/);
  integrity(f.db);
});

function episode(f: F, changes: Row = {}): Row {
  return { dataset_id: f.datasetId, epoch: 1, resource_id: f.camera, episode_id: randomUUID(), cause_code: 'fixture_fault_a',
    source_id: f.sourceId, episode_started_at_ms: T - 500, recorded_at_ms: T, ...changes };
}

it('PKG01 — EpisodeKey excludes cause; aliases, changed origin/start/cause, deletion and REPLACE are refused', () => {
  const f = telemetryFixture(), ep = episode(f);
  insert(f.db, 'telemetry_episode', ep);
  expect(() => insert(f.db, 'telemetry_episode', { ...ep, cause_code: 'fixture_fault_b' })).toThrow(/UNIQUE/);
  expect(() => insert(f.db, 'telemetry_episode', { ...ep, episode_id: randomUUID() })).toThrow(/UNIQUE/);
  for (const [column, value] of [['cause_code', 'fixture_fault_b'], ['episode_started_at_ms', T], ['source_id', randomUUID()]] as const) {
    expect(() => f.db.prepare(`UPDATE telemetry_episode SET ${column}=?`).run(value)).toThrow(/Immutable/);
  }
  expect(() => f.db.exec('INSERT OR REPLACE INTO telemetry_episode SELECT * FROM telemetry_episode')).toThrow(/Immutable/);
  expect(() => f.db.exec('DELETE FROM telemetry_episode')).toThrow(/Immutable/);
  expect(() => insert(f.db, 'telemetry_episode', episode(f, { resource_id: f.agent }))).toThrow(/FOREIGN KEY/);
  expect(() => insert(f.db, 'telemetry_episode', episode(f, { cause_code: 'initial_camera_inspection' }))).toThrow(/CHECK/);
  insert(f.db, 'telemetry_episode', episode(f, { cause_code: 'fixture_fault_b' }));
  integrity(f.db);
});

it('PKG01 — fault evidence references exact episode origin/cause/start; unknown clearing, time contradiction and history-bound violation fail', () => {
  const f = telemetryFixture(), ep = episode(f);
  insert(f.db, 'telemetry_episode', ep);
  const fault = eventRow(f, { observation_type: 'fault_detected', episode_id: ep.episode_id!,
    cause_code: ep.cause_code!, episode_started_at_ms: ep.episode_started_at_ms! });
  for (const changes of [{ episode_id: randomUUID(), observation_type: 'fault_cleared' },
    { cause_code: 'fixture_fault_b' }, { episode_started_at_ms: T - 499 },
    { occurred_at_ms: T - 501, observation_effective_at_ms: T - 501 },
    { occurred_at_ms: T - 1001, observation_effective_at_ms: T - 1001 },
    { sequence: -1 }, { sequence: 0.5 }, { sequence: 9007199254740992 }] satisfies Row[]) {
    expect(() => transaction(f.db, () => eventAndSlot(f, { ...fault, ...changes }))).toThrow();
  }
  transaction(f.db, () => eventAndSlot(f, fault));
  transaction(f.db, () => eventAndSlot(f, { ...fault, event_id: randomUUID(), sequence: 1, observation_type: 'fault_cleared' }));
  expect(rows(f.db, 'telemetry_episode')).toHaveLength(1);
  expect(rows(f.db, 'telemetry_event')).toHaveLength(2); integrity(f.db);
});

it('PKG01 — resolution evidence is equipment/context/cause-specific, inclusive, append-only and never lowers its cutoff', () => {
  const f = telemetryFixture();
  const resolution: Row = { dataset_id: f.datasetId, epoch: 1, id: randomUUID(), resource_id: f.camera,
    cause_code: 'fixture_fault_a', completed_at_ms: T, recorded_at_ms: T, actor_id: f.actorId, evidence_json: '{"fixture":true}' };
  insert(f.db, 'telemetry_cause_resolution', resolution);
  expect(() => insert(f.db, 'telemetry_cause_resolution', { ...resolution, id: randomUUID(), completed_at_ms: T - 1 })).toThrow(/cutoff/);
  expect(() => insert(f.db, 'telemetry_cause_resolution', { ...resolution, id: randomUUID(), resource_id: f.agent })).toThrow(/FOREIGN KEY/);
  expect(() => insert(f.db, 'telemetry_cause_resolution', { ...resolution, id: randomUUID(), epoch: 2 })).toThrow(/FOREIGN KEY/);
  insert(f.db, 'telemetry_cause_resolution', { ...resolution, id: randomUUID(), cause_code: 'fixture_fault_b', completed_at_ms: T - 1 });
  for (const delta of [-1, 0, 1]) insert(f.db, 'telemetry_episode', episode(f, { episode_started_at_ms: T + delta }));
  // Query only demonstrates storage of the inclusive cut; no Maintenance workflow is implemented.
  const coverage = f.db.prepare(`SELECT e.episode_started_at_ms<=r.cut AS covered FROM telemetry_episode e
    JOIN (SELECT dataset_id,epoch,resource_id,cause_code,max(completed_at_ms) AS cut FROM telemetry_cause_resolution
      GROUP BY dataset_id,epoch,resource_id,cause_code) r USING(dataset_id,epoch,resource_id,cause_code)
    ORDER BY e.episode_started_at_ms`).all();
  expect(coverage).toEqual([{ covered: 1 }, { covered: 1 }, { covered: 0 }]);
  expect(() => f.db.exec('UPDATE telemetry_cause_resolution SET completed_at_ms=completed_at_ms')).toThrow(/Immutable/);
  expect(() => f.db.exec('DELETE FROM telemetry_cause_resolution')).toThrow(/Immutable/);
  integrity(f.db);
});

it('PKG01 — cursor survives rebind/reopen, separates sequence from projection time and refuses regression', () => {
  const f = telemetryFixture(), first = eventRow(f, { sequence: 4 });
  transaction(f.db, () => eventAndSlot(f, first));
  insert(f.db, 'telemetry_channel_cursor', { dataset_id: f.datasetId, epoch: 1, source_id: f.sourceId,
    resource_id: f.camera, channel: 'heartbeat', max_sequence_seen: 4, max_occurred_at_ms: T, projected_effective_at_ms: T });
  transaction(f.db, () => {
    eventAndSlot(f, eventRow(f, { sequence: 9, occurred_at_ms: T - 1, observation_effective_at_ms: T - 1, disposition: 'historical', effects_json: '{}' }));
    f.db.exec('UPDATE telemetry_channel_cursor SET max_sequence_seen=9');
  });
  expect(f.db.prepare('SELECT max_sequence_seen,max_occurred_at_ms FROM telemetry_channel_cursor').get()).toEqual({ max_sequence_seen: 9, max_occurred_at_ms: T });
  expect(() => f.db.exec('UPDATE telemetry_channel_cursor SET max_sequence_seen=4')).toThrow(/regress/);
  expect(() => f.db.prepare('UPDATE telemetry_channel_cursor SET max_occurred_at_ms=?').run(T - 1)).toThrow(/regress/);
  expect(() => f.db.exec('DELETE FROM telemetry_channel_cursor')).toThrow(/Retain/);
  f.db.exec('UPDATE telemetry_binding SET active=0');
  const rebound = { ...f.binding, id: randomUUID() }; insert(f.db, 'telemetry_binding', rebound);
  expect(() => transaction(f.db, () => eventAndSlot(f, eventRow(f, { sequence: 4, binding_id: rebound.id })))).toThrow(/UNIQUE/);
  const reopened = new Store(f.path);
  try { expect(rows(reopened.db, 'telemetry_channel_cursor')).toEqual(rows(f.db, 'telemetry_channel_cursor')); integrity(reopened.db); }
  finally { reopened.close(); }
});

it('PKG01 — trusted UTC is empty until explicit write, durable and nonregressing without domain revision changes', () => {
  const f = telemetryFixture(), revision = rows(f.db, 'dataset_epoch');
  expect(rows(f.db, 'telemetry_trusted_clock')).toEqual([]);
  insert(f.db, 'telemetry_trusted_clock', { singleton: 1, trusted_utc_ms: T });
  f.db.prepare('UPDATE telemetry_trusted_clock SET trusted_utc_ms=?').run(T + 1);
  expect(() => f.db.prepare('UPDATE telemetry_trusted_clock SET trusted_utc_ms=?').run(T)).toThrow(/regress/);
  expect(() => f.db.exec('DELETE FROM telemetry_trusted_clock')).toThrow(/Retain/);
  expect(() => f.db.prepare('INSERT OR REPLACE INTO telemetry_trusted_clock VALUES(1,?)').run(T)).toThrow(/Retain/);
  const reopened = new Store(f.path);
  try { expect(reopened.db.prepare('SELECT * FROM telemetry_trusted_clock').get()).toEqual({ singleton: 1, trusted_utc_ms: T + 1 }); }
  finally { reopened.close(); }
  expect(rows(f.db, 'dataset_epoch')).toEqual(revision);
});

it('PKG01 — communication/position retain provenance, contextual FKs and complete coordinates without persisting fallback', () => {
  const f = telemetryFixture(), before = rows(f.db, 'current_state'), heartbeat = eventRow(f);
  transaction(f.db, () => eventAndSlot(f, heartbeat));
  insert(f.db, 'telemetry_communication_observation', { dataset_id: f.datasetId, epoch: 1, resource_id: f.camera,
    source_id: f.sourceId, event_id: heartbeat.event_id!, channel: 'heartbeat', observed_at_ms: T });
  const binding = { ...f.binding, id: randomUUID(), resource_id: f.mobile, channel: 'position', projection_field: 'position', profile_id: 'FX-MOBILE-v1' };
  insert(f.db, 'telemetry_binding', binding);
  const position = eventRow(f, { resource_id: f.mobile, binding_id: binding.id, channel: 'position', observation_type: 'position' });
  transaction(f.db, () => eventAndSlot(f, position));
  const observation: Row = { dataset_id: f.datasetId, epoch: 1, resource_id: f.mobile, source_id: f.sourceId,
    event_id: position.event_id!, channel: 'position', observed_at_ms: T, latitude: 0, longitude: 0, accuracy_m: 0, region_id: null };
  for (const changes of [{ latitude: null }, { latitude: 91 }, { longitude: -181 }, { accuracy_m: -1 }, { region_id: randomUUID() },
    { resource_id: f.camera }, { resource_id: f.agent }, { epoch: 2 }, { event_id: randomUUID() }] satisfies Row[]) {
    expect(() => insert(f.db, 'telemetry_position_observation', { ...observation, ...changes })).toThrow();
  }
  insert(f.db, 'telemetry_position_observation', observation);
  expect(rows(f.db, 'current_state')).toEqual(before);
  expect((f.db.pragma('table_info(telemetry_position_observation)') as { name: string }[]).map(c => c.name)).not.toContain('position_kind');
  integrity(f.db);
});

it.each(['epoch', 'dataset'] as const)('PKG01 — identities can repeat in another %s, but evidence cannot cross contexts', dimension => {
  const f = telemetryFixture(), ep = episode(f), event = eventRow(f);
  const context = { dataset_id: dimension === 'dataset' ? randomUUID() : f.datasetId, epoch: dimension === 'epoch' ? 2 : 1 };
  insert(f.db, 'telemetry_episode', ep);
  transaction(f.db, () => eventAndSlot(f, event));
  // Reproduce only referenced inventory in an isolated context, without reset/run behavior.
  transaction(f.db, () => {
    if (dimension === 'dataset') f.db.prepare("INSERT INTO dataset VALUES(?,'other-fixture','demo',1)").run(context.dataset_id);
    f.db.prepare('INSERT INTO dataset_epoch VALUES(?,?,?,0)').run(context.dataset_id, context.epoch, dimension === 'epoch' ? 'retired' : 'ready');
    for (const table of ['organization', 'resource', 'equipment', 'agent', 'resource_location', 'current_state', 'telemetry_resource_profile']) {
      const columns = (f.db.pragma(`table_xinfo(${table})`) as { name: string; hidden: number }[]).filter(c => c.hidden === 0).map(c => c.name);
      for (const row of f.db.prepare(`SELECT ${columns.join(',')} FROM ${table} WHERE dataset_id=? AND epoch=1`).all(f.datasetId) as Row[]) {
        insert(f.db, table, { ...row, ...context });
      }
    }
    insert(f.db, 'telemetry_binding', { ...f.binding, ...context });
    insert(f.db, 'telemetry_episode', { ...ep, ...context });
    eventAndSlot(f, { ...event, ...context });
    insert(f.db, 'telemetry_command_receipt', receipt(f, event, { command_id: 'same-key' }));
    insert(f.db, 'telemetry_command_receipt', receipt(f, { ...event, ...context }, { command_id: 'same-key' }));
  });
  expect(rows(f.db, 'telemetry_episode')).toHaveLength(2);
  expect(rows(f.db, 'telemetry_event')).toHaveLength(2);
  expect(rows(f.db, 'telemetry_command_receipt')).toHaveLength(2);
  expect(() => insert(f.db, 'telemetry_episode', { ...ep, epoch: 3 })).toThrow(/FOREIGN KEY/);
  integrity(f.db);
});

it('PKG01 — immutable events, slots and receipts also resist SQL REPLACE', () => {
  const f = telemetryFixture(), event = eventRow(f);
  transaction(f.db, () => { eventAndSlot(f, event); insert(f.db, 'telemetry_command_receipt', receipt(f, event)); });
  for (const table of ['telemetry_event', 'telemetry_sequence_slot', 'telemetry_command_receipt']) {
    expect(() => f.db.exec(`UPDATE ${table} SET epoch=epoch`)).toThrow(/Immutable/);
    expect(() => f.db.exec(`DELETE FROM ${table}`)).toThrow(/Immutable/);
    expect(() => f.db.exec(`INSERT OR REPLACE INTO ${table} SELECT * FROM ${table}`)).toThrow(/Immutable/);
  }
  integrity(f.db);
});

it('HARDENING RED 01 — DELETE and REPLACE on telemetry_credential must be rejected', () => {
  const f = telemetryFixture();
  const hash = '1'.repeat(64);
  insert(f.db, 'telemetry_credential', { token_hash: hash, source_id: f.sourceId, issued_at_ms: T, expires_at_ms: T + 60000, revoked_at_ms: T + 1000 });
  expect(() => f.db.exec(`DELETE FROM telemetry_credential WHERE token_hash='${hash}'`)).toThrow(/Retain|Immutable/);
  expect(() => f.db.exec(`INSERT OR REPLACE INTO telemetry_credential VALUES('${hash}', '${f.sourceId}', ${T}, ${T + 90000}, NULL)`)).toThrow(/Retain|Immutable/);
  expect(() => f.db.exec(`INSERT OR REPLACE INTO telemetry_credential VALUES('${hash}', '${randomUUID()}', ${T}, ${T + 90000}, NULL)`)).toThrow(/Retain|Immutable/);
});

it('HARDENING RED 02 — active telemetry_binding requires active telemetry_resource_profile', () => {
  const f = telemetryFixture();
  // 1. Deactivating resource profile while binding is active must fail
  expect(() => f.db.prepare('UPDATE telemetry_resource_profile SET active=0 WHERE resource_id=? AND profile_id=?').run(f.camera, 'FX-FIXED-v1')).toThrow(/active binding/i);

  // 2. Ordered deactivation (binding -> profile) succeeds
  transaction(f.db, () => {
    f.db.prepare('UPDATE telemetry_binding SET active=0 WHERE resource_id=?').run(f.camera);
    f.db.prepare('UPDATE telemetry_resource_profile SET active=0 WHERE resource_id=? AND profile_id=?').run(f.camera, 'FX-FIXED-v1');
  });

  // 3. Creating active binding when resource profile is inactive must fail
  expect(() => insert(f.db, 'telemetry_binding', { ...f.binding, id: randomUUID(), active: 1 })).toThrow(/active profile/i);
  // Re-activating binding when resource profile is inactive must fail
  expect(() => f.db.prepare('UPDATE telemetry_binding SET active=1 WHERE id=?').run(f.binding.id)).toThrow(/active profile/i);

  // 4. Ordered activation (profile -> binding) succeeds
  transaction(f.db, () => {
    f.db.prepare('UPDATE telemetry_resource_profile SET active=1 WHERE resource_id=? AND profile_id=?').run(f.camera, 'FX-FIXED-v1');
    f.db.prepare('UPDATE telemetry_binding SET active=1 WHERE id=?').run(f.binding.id);
  });
  expect(f.db.prepare('SELECT active FROM telemetry_binding WHERE id=?').get(f.binding.id)).toEqual({ active: 1 });

  // 5. Coexistence of FX-NONE-v1 active with active emitter binding must fail
  transaction(f.db, () => {
    f.db.prepare('UPDATE telemetry_binding SET active=0 WHERE resource_id=?').run(f.camera);
    f.db.prepare('UPDATE telemetry_resource_profile SET active=0 WHERE resource_id=? AND profile_id=?').run(f.camera, 'FX-FIXED-v1');
    insert(f.db, 'telemetry_resource_profile', {
      dataset_id: f.datasetId, epoch: 1, resource_id: f.camera, resource_kind: 'equipment',
      profile_id: 'FX-NONE-v1', profile_version: 1, active: 1, assigned_at_ms: T + 10,
    });
  });
  expect(() => f.db.prepare('UPDATE telemetry_binding SET active=1 WHERE id=?').run(f.binding.id)).toThrow(/inactive profile|FX-NONE/i);
  expect(() => insert(f.db, 'telemetry_binding', { ...f.binding, id: randomUUID(), active: 1 })).toThrow(/active profile|Incompatible/i);
  integrity(f.db);
});

it('HARDENING RED 03 — observation projection integrity: DELETE, regression, and historical/mismatched event rejection', () => {
  const f = telemetryFixture();
  const heartbeat = eventRow(f);
  transaction(f.db, () => eventAndSlot(f, heartbeat));
  insert(f.db, 'telemetry_communication_observation', {
    dataset_id: f.datasetId, epoch: 1, resource_id: f.camera,
    source_id: f.sourceId, event_id: heartbeat.event_id!, channel: 'heartbeat', observed_at_ms: T,
  });

  // DELETE must be rejected
  expect(() => f.db.exec('DELETE FROM telemetry_communication_observation')).toThrow(/Retain|Immutable/);
  // observed_at_ms regression must be rejected
  expect(() => f.db.prepare('UPDATE telemetry_communication_observation SET observed_at_ms=? WHERE resource_id=?').run(T - 1, f.camera)).toThrow(/regress/i);
  // INSERT OR REPLACE with regressed observed_at_ms must be rejected
  expect(() => f.db.exec(`INSERT OR REPLACE INTO telemetry_communication_observation VALUES('${f.datasetId}', 1, '${f.camera}', '${f.sourceId}', '${heartbeat.event_id}', 'heartbeat', ${T - 1})`)).toThrow();

  // Reference to historical or ignored event must be rejected
  const histEvent = eventRow(f, { event_id: randomUUID(), sequence: 5, disposition: 'historical', effects_json: '{}' });
  transaction(f.db, () => eventAndSlot(f, histEvent));
  expect(() => insert(f.db, 'telemetry_communication_observation', {
    dataset_id: f.datasetId, epoch: 1, resource_id: f.camera,
    source_id: f.sourceId, event_id: histEvent.event_id!, channel: 'heartbeat', observed_at_ms: T,
  })).toThrow(/applied/i);

  // Divergence between observed_at_ms and event observation_effective_at_ms must be rejected
  const appEvent = eventRow(f, { event_id: randomUUID(), sequence: 6, observation_effective_at_ms: T + 2000, occurred_at_ms: T + 2000 });
  transaction(f.db, () => eventAndSlot(f, appEvent));
  expect(() => insert(f.db, 'telemetry_communication_observation', {
    dataset_id: f.datasetId, epoch: 1, resource_id: f.camera,
    source_id: f.sourceId, event_id: appEvent.event_id!, channel: 'heartbeat', observed_at_ms: T + 1000,
  })).toThrow(/mismatch|effective/i);
});

it('HARDENING 04 — Lacuna A: activation of FX-NONE-v1 via UPDATE is blocked while binding is active and succeeds after orderly deactivation', () => {
  const f = telemetryFixture();
  // 1. Resource f.camera has active FX-FIXED-v1 and active binding (from telemetryFixture).
  expect(f.db.prepare('SELECT active FROM telemetry_binding WHERE resource_id=? AND active=1').get(f.camera)).toBeDefined();

  // 2. Prepare an inactive assignment of FX-NONE-v1 on f.camera
  const noneAssignment: Row = {
    dataset_id: f.datasetId, epoch: 1, resource_id: f.camera, resource_kind: 'equipment',
    profile_id: 'FX-NONE-v1', profile_version: 1, active: 0, assigned_at_ms: T,
  };
  insert(f.db, 'telemetry_resource_profile', noneAssignment);

  // 3. Attempt to execute UPDATE telemetry_resource_profile SET active=1 for FX-NONE-v1 while binding is active
  // 4. Confirm rejection by trigger telemetry_resource_profile_none_update
  expect(() => f.db.prepare(
    'UPDATE telemetry_resource_profile SET active=1 WHERE resource_id=? AND profile_id=?'
  ).run(f.camera, 'FX-NONE-v1')).toThrow(/Cannot activate FX-NONE with active binding|active binding/i);

  // 5. Confirm previous state remained intact (FX-NONE-v1 still active=0, binding still active=1, FX-FIXED-v1 still active=1)
  expect(f.db.prepare('SELECT active FROM telemetry_resource_profile WHERE resource_id=? AND profile_id=?').get(f.camera, 'FX-NONE-v1'))
    .toEqual({ active: 0 });
  expect(f.db.prepare('SELECT active FROM telemetry_resource_profile WHERE resource_id=? AND profile_id=?').get(f.camera, 'FX-FIXED-v1'))
    .toEqual({ active: 1 });
  expect(f.db.prepare('SELECT active FROM telemetry_binding WHERE resource_id=? AND id=?').get(f.camera, f.binding.id))
    .toEqual({ active: 1 });

  // 6. Deactivate binding and emitter profile in the correct order (binding -> profile)
  transaction(f.db, () => {
    f.db.prepare('UPDATE telemetry_binding SET active=0 WHERE resource_id=?').run(f.camera);
    f.db.prepare('UPDATE telemetry_resource_profile SET active=0 WHERE resource_id=? AND profile_id=?').run(f.camera, 'FX-FIXED-v1');
  });

  // 7. Confirm legitimate activation of FX-NONE-v1 succeeds when there is no active binding
  f.db.prepare('UPDATE telemetry_resource_profile SET active=1 WHERE resource_id=? AND profile_id=?').run(f.camera, 'FX-NONE-v1');
  expect(f.db.prepare('SELECT active FROM telemetry_resource_profile WHERE resource_id=? AND profile_id=?').get(f.camera, 'FX-NONE-v1'))
    .toEqual({ active: 1 });
  integrity(f.db);
});

it('HARDENING 05 — Lacuna B: telemetry_position_observation integrity (DELETE, REPLACE, regression, disposition, and effective time)', () => {
  const f = telemetryFixture();

  // 1. Setup active binding for mobile equipment (f.mobile with FX-MOBILE-v1)
  const mobileBinding = {
    dataset_id: f.datasetId, epoch: 1, id: randomUUID(), source_id: f.sourceId,
    resource_id: f.mobile, resource_kind: 'equipment', channel: 'position',
    projection_field: 'position', profile_id: 'FX-MOBILE-v1', profile_version: 1,
    active: 1, resource_born_at_ms: T - 2000, history_allowed_from_ms: T - 1000,
  };
  insert(f.db, 'telemetry_binding', mobileBinding);

  // 2. Create valid applied position event
  const posEvent = eventRow(f, {
    resource_id: f.mobile,
    binding_id: mobileBinding.id,
    channel: 'position',
    observation_type: 'position',
    sequence: 0,
    occurred_at_ms: T,
    received_at_ms: T,
    recorded_at_ms: T,
    observation_effective_at_ms: T,
    disposition: 'applied',
    effects_json: '{"position":true}',
  });
  transaction(f.db, () => eventAndSlot(f, posEvent));

  const validPosObs: Row = {
    dataset_id: f.datasetId, epoch: 1, resource_id: f.mobile,
    source_id: f.sourceId, event_id: posEvent.event_id as string, channel: 'position',
    observed_at_ms: T, latitude: -23.5505, longitude: -46.6333, accuracy_m: 5.0, region_id: null,
  };

  // 3. INSERT valid observation for mobile resource with applied event succeeds
  insert(f.db, 'telemetry_position_observation', validPosObs);
  expect(f.db.prepare('SELECT observed_at_ms, latitude FROM telemetry_position_observation WHERE resource_id=?').get(f.mobile))
    .toEqual({ observed_at_ms: T, latitude: -23.5505 });

  // 4. DELETE prohibited
  expect(() => f.db.exec('DELETE FROM telemetry_position_observation')).toThrow(/Retain|Immutable/);

  // 5. INSERT OR REPLACE prohibited over existing observation
  expect(() => f.db.exec(
    `INSERT OR REPLACE INTO telemetry_position_observation VALUES('${f.datasetId}', 1, '${f.mobile}', '${f.sourceId}', '${posEvent.event_id}', 'position', ${T}, -23.5, -46.6, 5.0, NULL)`
  )).toThrow(/Retain|Immutable/);

  // 6. Regression of observed_at_ms prohibited
  expect(() => f.db.prepare(
    'UPDATE telemetry_position_observation SET observed_at_ms=? WHERE resource_id=?'
  ).run(T - 1, f.mobile)).toThrow(/regress|Invalid/i);

  // 7. Reference to historical event prohibited
  const histEvent = eventRow(f, {
    event_id: randomUUID(), resource_id: f.mobile, binding_id: mobileBinding.id,
    channel: 'position', observation_type: 'position', sequence: 1,
    disposition: 'historical', occurred_at_ms: T + 500, observation_effective_at_ms: T + 500,
    effects_json: '{}',
  });
  transaction(f.db, () => eventAndSlot(f, histEvent));
  expect(() => f.db.prepare(
    'UPDATE telemetry_position_observation SET event_id=?, observed_at_ms=? WHERE resource_id=?'
  ).run(histEvent.event_id, T + 500, f.mobile)).toThrow(/unapplied|applied|Invalid/i);

  // 8. Reference to ignored event prohibited
  const ignoredEvent = eventRow(f, {
    event_id: randomUUID(), resource_id: f.mobile, binding_id: mobileBinding.id,
    channel: 'position', observation_type: 'position', sequence: 2,
    disposition: 'ignored', occurred_at_ms: T + 600, observation_effective_at_ms: T + 600,
    effects_json: '{}',
  });
  transaction(f.db, () => eventAndSlot(f, ignoredEvent));
  expect(() => f.db.prepare(
    'UPDATE telemetry_position_observation SET event_id=?, observed_at_ms=? WHERE resource_id=?'
  ).run(ignoredEvent.event_id, T + 600, f.mobile)).toThrow(/unapplied|applied|Invalid/i);

  // 9. Divergence between observed_at_ms and observation_effective_at_ms prohibited
  const appEvent2 = eventRow(f, {
    event_id: randomUUID(), resource_id: f.mobile, binding_id: mobileBinding.id,
    channel: 'position', observation_type: 'position', sequence: 3,
    disposition: 'applied', occurred_at_ms: T + 2000, observation_effective_at_ms: T + 2000,
    effects_json: '{"position":true}',
  });
  transaction(f.db, () => eventAndSlot(f, appEvent2));
  // Mismatch: event effective time is T + 2000, but observed_at_ms passed is T + 1000
  expect(() => f.db.prepare(
    'UPDATE telemetry_position_observation SET event_id=?, observed_at_ms=? WHERE resource_id=?'
  ).run(appEvent2.event_id, T + 1000, f.mobile)).toThrow(/unapplied|applied|Invalid/i);

  // 10. Mobility rules: inserting position observation for fixed equipment (f.camera) fails
  const fixedPosEvent = eventRow(f, {
    resource_id: f.camera, binding_id: f.binding.id as string, channel: 'heartbeat',
    sequence: 10, occurred_at_ms: T, observation_effective_at_ms: T, disposition: 'applied',
  });
  transaction(f.db, () => eventAndSlot(f, fixedPosEvent));
  expect(() => insert(f.db, 'telemetry_position_observation', {
    ...validPosObs, resource_id: f.camera, event_id: fixedPosEvent.event_id as string, channel: 'heartbeat',
  })).toThrow(/fixed|Invalid/i);

  // 11. Identity preservation: changing dataset_id, epoch or resource_id via UPDATE is prohibited
  expect(() => f.db.prepare(
    'UPDATE telemetry_position_observation SET dataset_id=? WHERE resource_id=?'
  ).run(randomUUID(), f.mobile)).toThrow(/Invalid/i);
  expect(() => f.db.prepare(
    'UPDATE telemetry_position_observation SET resource_id=? WHERE resource_id=?'
  ).run(f.camera, f.mobile)).toThrow(/Invalid/i);

  integrity(f.db);
});

it('HARDENING 06 — Lacuna C: legitimate projection progression for communication and position observations, with historical bypass rejection', () => {
  const f = telemetryFixture();

  // Part 1: telemetry_communication_observation
  // 1. Register first applied event
  const commEvent1 = eventRow(f, {
    sequence: 0, occurred_at_ms: T, received_at_ms: T, recorded_at_ms: T,
    observation_effective_at_ms: T, disposition: 'applied',
  });
  transaction(f.db, () => eventAndSlot(f, commEvent1));

  // 2. Insert initial communication observation
  insert(f.db, 'telemetry_communication_observation', {
    dataset_id: f.datasetId, epoch: 1, resource_id: f.camera,
    source_id: f.sourceId, event_id: commEvent1.event_id as string, channel: 'heartbeat', observed_at_ms: T,
  });
  expect(f.db.prepare('SELECT observed_at_ms, event_id FROM telemetry_communication_observation WHERE resource_id=?').get(f.camera))
    .toEqual({ observed_at_ms: T, event_id: commEvent1.event_id });

  // 3. Register second applied event with posterior timestamp (T + 1000)
  const commEvent2 = eventRow(f, {
    event_id: randomUUID(), sequence: 1, occurred_at_ms: T + 1000, received_at_ms: T + 1000,
    recorded_at_ms: T + 1000, observation_effective_at_ms: T + 1000, disposition: 'applied',
  });
  transaction(f.db, () => eventAndSlot(f, commEvent2));

  // 4. Update communication observation to reference second event
  f.db.prepare(`
    UPDATE telemetry_communication_observation
    SET source_id=?, event_id=?, channel=?, observed_at_ms=?
    WHERE dataset_id=? AND epoch=1 AND resource_id=?
  `).run(f.sourceId, commEvent2.event_id, 'heartbeat', T + 1000, f.datasetId, f.camera);

  // 5 & 6. Confirm advance of observed_at_ms and matching event_id
  expect(f.db.prepare('SELECT observed_at_ms, event_id, source_id, channel FROM telemetry_communication_observation WHERE resource_id=?').get(f.camera))
    .toEqual({ observed_at_ms: T + 1000, event_id: commEvent2.event_id, source_id: f.sourceId, channel: 'heartbeat' });

  // 8. Negative test: attempting UPDATE pointing to historical event with higher timestamp must fail
  const commHistLater = eventRow(f, {
    event_id: randomUUID(), sequence: 2, occurred_at_ms: T + 5000, received_at_ms: T + 5000,
    recorded_at_ms: T + 5000, observation_effective_at_ms: T + 5000, disposition: 'historical',
    effects_json: '{}',
  });
  transaction(f.db, () => eventAndSlot(f, commHistLater));
  expect(() => f.db.prepare(`
    UPDATE telemetry_communication_observation
    SET source_id=?, event_id=?, channel=?, observed_at_ms=?
    WHERE dataset_id=? AND epoch=1 AND resource_id=?
  `).run(f.sourceId, commHistLater.event_id, 'heartbeat', T + 5000, f.datasetId, f.camera)).toThrow(/invalid event|applied/i);

  // Confirm state unchanged after failed update
  expect(f.db.prepare('SELECT observed_at_ms, event_id FROM telemetry_communication_observation WHERE resource_id=?').get(f.camera))
    .toEqual({ observed_at_ms: T + 1000, event_id: commEvent2.event_id });

  // Part 2: telemetry_position_observation
  const mobileBinding = {
    dataset_id: f.datasetId, epoch: 1, id: randomUUID(), source_id: f.sourceId,
    resource_id: f.mobile, resource_kind: 'equipment', channel: 'position',
    projection_field: 'position', profile_id: 'FX-MOBILE-v1', profile_version: 1,
    active: 1, resource_born_at_ms: T - 2000, history_allowed_from_ms: T - 1000,
  };
  insert(f.db, 'telemetry_binding', mobileBinding);

  // 1. Register first applied position event
  const posEvent1 = eventRow(f, {
    resource_id: f.mobile, binding_id: mobileBinding.id, channel: 'position', observation_type: 'position',
    sequence: 0, occurred_at_ms: T, received_at_ms: T, recorded_at_ms: T,
    observation_effective_at_ms: T, disposition: 'applied', effects_json: '{"position":true}',
  });
  transaction(f.db, () => eventAndSlot(f, posEvent1));

  // 2. Insert initial position observation
  insert(f.db, 'telemetry_position_observation', {
    dataset_id: f.datasetId, epoch: 1, resource_id: f.mobile,
    source_id: f.sourceId, event_id: posEvent1.event_id as string, channel: 'position',
    observed_at_ms: T, latitude: -23.5505, longitude: -46.6333, accuracy_m: 5.0, region_id: null,
  });

  // 3. Register second applied position event with posterior timestamp and new coordinates
  const posEvent2 = eventRow(f, {
    event_id: randomUUID(), resource_id: f.mobile, binding_id: mobileBinding.id, channel: 'position',
    observation_type: 'position', sequence: 1, occurred_at_ms: T + 2500, received_at_ms: T + 2500,
    recorded_at_ms: T + 2500, observation_effective_at_ms: T + 2500, disposition: 'applied', effects_json: '{"position":true}',
  });
  transaction(f.db, () => eventAndSlot(f, posEvent2));

  // 4. Update position observation to reference second event with new coordinates
  f.db.prepare(`
    UPDATE telemetry_position_observation
    SET source_id=?, event_id=?, channel=?, observed_at_ms=?, latitude=?, longitude=?, accuracy_m=?
    WHERE dataset_id=? AND epoch=1 AND resource_id=?
  `).run(f.sourceId, posEvent2.event_id, 'position', T + 2500, -23.5600, -46.6500, 3.5, f.datasetId, f.mobile);

  // 5 & 6. Confirm advance of observed_at_ms, event_id and coordinates
  expect(f.db.prepare(`
    SELECT observed_at_ms, event_id, source_id, channel, latitude, longitude, accuracy_m
    FROM telemetry_position_observation WHERE resource_id=?
  `).get(f.mobile)).toEqual({
    observed_at_ms: T + 2500, event_id: posEvent2.event_id, source_id: f.sourceId, channel: 'position',
    latitude: -23.5600, longitude: -46.6500, accuracy_m: 3.5,
  });

  // 8. Negative test: attempting UPDATE pointing to historical event with higher timestamp must fail
  const posHistLater = eventRow(f, {
    event_id: randomUUID(), resource_id: f.mobile, binding_id: mobileBinding.id, channel: 'position',
    observation_type: 'position', sequence: 2, occurred_at_ms: T + 6000, received_at_ms: T + 6000,
    recorded_at_ms: T + 6000, observation_effective_at_ms: T + 6000, disposition: 'historical',
    effects_json: '{}',
  });
  transaction(f.db, () => eventAndSlot(f, posHistLater));
  expect(() => f.db.prepare(`
    UPDATE telemetry_position_observation
    SET source_id=?, event_id=?, channel=?, observed_at_ms=?, latitude=?, longitude=?, accuracy_m=?
    WHERE dataset_id=? AND epoch=1 AND resource_id=?
  `).run(f.sourceId, posHistLater.event_id, 'position', T + 6000, -23.5700, -46.6600, 2.0, f.datasetId, f.mobile))
    .toThrow(/Invalid dynamic position update|applied/i);

  // Confirm state unchanged after failed update
  expect(f.db.prepare('SELECT observed_at_ms, event_id FROM telemetry_position_observation WHERE resource_id=?').get(f.mobile))
    .toEqual({ observed_at_ms: T + 2500, event_id: posEvent2.event_id });

  // 7. Referential integrity and consistency check
  integrity(f.db);
});
