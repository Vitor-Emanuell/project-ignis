import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { SCHEMA_VERSION, Store, transaction } from '../src/persistence/store.js';
import { generateDemo } from '../src/demo/service.js';
import { authorization, sessionFor } from './support/foundation-fixture.js';
import { generation } from './support/t0005-fixture.js';

type Row = Record<string, string | number | null>;
const fixtures: { directory: string; store: Store }[] = [];
const oldMigrations = [
  '0001-foundation.sql',
  '0002-inventory.sql',
  '0003-heterogeneous-inventory.sql',
  '0004-demo-baseline.sql',
  '0005-regions-and-spatial.sql',
  '0006-telemetry-and-episodes.sql',
];

afterEach(() => {
  vi.restoreAllMocks();
  for (const f of fixtures.splice(0)) {
    f.store.close();
    const target = resolve(f.directory);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('ignis-t0010-')) {
      throw new Error('Temporary fixture cleanup outside allocated directory');
    }
    rmSync(target, { recursive: true, force: true });
  }
});

function empty() {
  const directory = mkdtempSync(join(tmpdir(), "ignis-t0010-quote'-"));
  const path = join(directory, 'test.sqlite');
  const store = new Store(path, true);
  fixtures.push({ directory, store });
  return { directory, path, store, db: store.db };
}

function integrity(db: Database.Database) {
  expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
  expect(db.pragma('foreign_key_check')).toEqual([]);
}

function rows(db: Database.Database, table: string) {
  return db.prepare(`SELECT * FROM ${table}`).all().map(row => JSON.stringify(row)).sort();
}

function objects(db: Database.Database) {
  return db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY name").all() as Row[];
}

function snapshot(db: Database.Database) {
  return Object.fromEntries(
    (db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[]).map(({ name }) => [name, rows(db, name)])
  );
}

function schema6(populated = true) {
  const f = empty(), actorId = `operator:${randomUUID()}`, datasetId = randomUUID();
  transaction(f.db, () => {
    f.db.exec('CREATE TABLE schema_migration(version INTEGER PRIMARY KEY NOT NULL, checksum TEXT NOT NULL)');
    for (const [index, file] of oldMigrations.entries()) {
      const sql = readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
      f.db.exec(sql);
      f.db.prepare('INSERT INTO schema_migration VALUES(?,?)').run(index + 1, createHash('sha256').update(sql).digest('hex'));
    }
    f.db.pragma('user_version=6');
    f.db.prepare("INSERT INTO actor VALUES(?,'operator','local-operator')").run(actorId);
    f.db.prepare("INSERT INTO dataset VALUES(?,'local-demo','demo',1)").run(datasetId);
    f.db.prepare("INSERT INTO dataset_epoch VALUES(?,1,'ready',0)").run(datasetId);
    f.db.prepare('INSERT INTO dataset_grant VALUES(?,?,1)').run(datasetId, actorId);
  });
  const auth = authorization(f.store), credentials = sessionFor(f.store, actorId), input = generation();
  if (populated) {
    const readiness = vi.spyOn(f.store, 'ready').mockReturnValue(true);
    try {
      expect(generateDemo(auth, credentials, datasetId, 1, input).status).toBe(201);
    } finally {
      readiness.mockRestore();
    }
  }
  expect(f.db.pragma('user_version', { simple: true })).toBe(6);
  integrity(f.db);
  return { ...f, actorId, datasetId, auth, credentials, input };
}

function backups(f: ReturnType<typeof empty>) {
  return readdirSync(f.directory).filter(name => name.includes('.schema6-') && name.endsWith('.backup'));
}

it('PKG01 — empty database reaches schema 7; alert and alert_event tables are created empty', () => {
  const f = empty(), installation = f.store.migrate();
  expect(SCHEMA_VERSION).toBe(7);
  expect(f.store.ready()).toBe(true);
  expect(f.db.pragma('user_version', { simple: true })).toBe(7);
  expect(f.db.prepare('SELECT version FROM schema_migration ORDER BY version').all()).toEqual(
    [1, 2, 3, 4, 5, 6, 7].map(version => ({ version }))
  );
  expect(rows(f.db, 'alert')).toEqual([]);
  expect(rows(f.db, 'alert_event')).toEqual([]);
  const before = snapshot(f.db);
  expect(f.store.migrate()).toEqual(installation);
  expect(snapshot(f.db)).toEqual(before);
  expect(backups(f)).toEqual([]);

  const reopened = new Store(f.path);
  try {
    expect(reopened.ready()).toBe(true);
    integrity(reopened.db);
  } finally {
    reopened.close();
  }
});

it('PKG01 — populated schema 6 + committed WAL: validated backup, legacy data and baseline survive migration', () => {
  const f = schema6(true);
  f.db.pragma('wal_checkpoint(TRUNCATE)');
  f.db.pragma('wal_autocheckpoint=0');
  f.db.exec("INSERT INTO actor(id,kind) VALUES('operator:committed-in-wal','operator')");
  expect(statSync(f.path + '-wal').size).toBeGreaterThan(32);

  const before = snapshot(f.db);
  const beforeSchema = objects(f.db);

  const installation = f.store.migrate();
  expect(f.db.pragma('user_version', { simple: true })).toBe(7);
  integrity(f.db);
  expect(f.store.ready()).toBe(true);

  // Backup file exists
  const backupFiles = backups(f);
  expect(backupFiles.length).toBe(1);

  // All legacy tables retain exact same rows
  for (const [table, data] of Object.entries(before)) {
    if (table !== 'schema_migration') {
      expect(rows(f.db, table), table).toEqual(data);
    }
  }
  expect(rows(f.db, 'alert')).toEqual([]);
  expect(rows(f.db, 'alert_event')).toEqual([]);
});

it('PKG01 — fault injection during migration 7 rolls back cleanly to schema 6', () => {
  const f = schema6(true);
  const before = snapshot(f.db);
  const beforeSchema = objects(f.db);

  f.db.exec("CREATE TEMP TRIGGER t10_fault AFTER INSERT ON schema_migration WHEN NEW.version=7 BEGIN SELECT RAISE(ABORT,'t10-fault'); END");

  expect(() => f.store.migrate()).toThrow(/t10-fault/);
  expect(f.db.pragma('user_version', { simple: true })).toBe(6);
  expect(f.db.inTransaction).toBe(false);
  integrity(f.db);

  expect(snapshot(f.db)).toEqual(before);
  expect(objects(f.db)).toEqual(beforeSchema);
});

describe('PKG01 — Alert table schema, lifecycle and invariants', () => {
  function setupAlertContext() {
    const f = empty();
    f.store.migrate();
    const datasetId = randomUUID();
    const actorId = `operator:${randomUUID()}`;
    const resourceId = randomUUID();

    transaction(f.db, () => {
      f.db.prepare("INSERT INTO actor(id, kind, local_key) VALUES (?, 'operator', ?)").run(actorId, `op-${actorId}`);
      f.db.prepare("INSERT INTO dataset(id, code, kind, active_epoch) VALUES (?, ?, 'demo', 1)").run(datasetId, `code-${datasetId}`);
      f.db.prepare("INSERT INTO dataset_epoch(dataset_id, epoch, status, revision) VALUES (?, 1, 'ready', 0)").run(datasetId);
      f.db.prepare("INSERT INTO organization(dataset_id, epoch, id, code, name) VALUES (?, 1, ?, 'ORG_TEST', 'Org Test')").run(datasetId, randomUUID());
      f.db.prepare(
        "INSERT INTO resource(dataset_id, epoch, id, kind, organization_id, public_label, version) VALUES (?, 1, ?, 'equipment', (SELECT id FROM organization WHERE dataset_id=? AND epoch=1 LIMIT 1), 'LABEL_1', 1)"
      ).run(datasetId, resourceId, datasetId);
      f.db.prepare(
        "INSERT INTO equipment(dataset_id, epoch, id, category_code, category_version, serial_normalized, brand, model, criticality, mobility, attributes_json) VALUES (?, 1, ?, 'fixed_speed_radar', 1, 'SER_1', 'Brand', 'Model', 5, 'fixed', '{\"regulatedSpeedLimitKmh\":60}')"
      ).run(datasetId, resourceId);
      f.db.prepare(
        `INSERT INTO resource_location(dataset_id, epoch, resource_id, role, reference_type, postal_code, neighborhood, city, uf, address, reference, latitude, longitude, region_id)
         VALUES (?, 1, ?, 'registration', 'installation', '01001000', 'Centro', 'Cidade', 'SP', 'Av 1', 'Ref 1', -23.558, -46.648, NULL)`
      ).run(datasetId, resourceId);
      f.db.prepare(
        "INSERT INTO current_state(dataset_id, epoch, resource_id, operational_state, version) VALUES (?, 1, ?, 'not_installed', 1)"
      ).run(datasetId, resourceId);
    });

    return { ...f, datasetId, actorId, resourceId };
  }

  it('allows valid open alert insertion and enforces status/timestamp consistency', () => {
    const ctx = setupAlertContext();
    const alertId = randomUUID();

    // Valid open alert
    ctx.db.prepare(`
      INSERT INTO alert (
        dataset_id, epoch, id, resource_id, rule_code, rule_version,
        cycle, severity, status, cause_code, evidence_json, opened_at_ms
      ) VALUES (?, 1, ?, ?, 'equipment_fault', 1, 1, 'critical', 'open', 'sensor_fault', '{"detail":"broken"}', 1000)
    `).run(ctx.datasetId, alertId, ctx.resourceId);

    const row = ctx.db.prepare('SELECT * FROM alert WHERE id = ?').get(alertId) as Record<string, unknown>;
    expect(row.status).toBe('open');
    expect(row.severity).toBe('critical');
    expect(row.acknowledged_at_ms).toBeNull();
    expect(row.resolved_at_ms).toBeNull();

    // Invalid open alert with non-null acknowledged_at_ms fails CHECK
    expect(() => {
      ctx.db.prepare(`
        INSERT INTO alert (
          dataset_id, epoch, id, resource_id, rule_code, rule_version,
          cycle, severity, status, cause_code, evidence_json, opened_at_ms, acknowledged_at_ms
        ) VALUES (?, 1, ?, ?, 'communication_missing', 1, 1, 'warning', 'open', NULL, '{}', 1000, 1050)
      `).run(ctx.datasetId, randomUUID(), ctx.resourceId);
    }).toThrow(/CHECK constraint failed/);

    // Invalid open alert with non-null resolved_at_ms fails CHECK
    expect(() => {
      ctx.db.prepare(`
        INSERT INTO alert (
          dataset_id, epoch, id, resource_id, rule_code, rule_version,
          cycle, severity, status, cause_code, evidence_json, opened_at_ms, resolved_at_ms
        ) VALUES (?, 1, ?, ?, 'communication_missing', 1, 1, 'warning', 'open', NULL, '{}', 1000, 1050)
      `).run(ctx.datasetId, randomUUID(), ctx.resourceId);
    }).toThrow(/CHECK constraint failed/);
  });

  it('enforces partial unique active alert per resource and rule code', () => {
    const ctx = setupAlertContext();
    const alert1 = randomUUID();
    const alert2 = randomUUID();

    ctx.db.prepare(`
      INSERT INTO alert (
        dataset_id, epoch, id, resource_id, rule_code, rule_version,
        cycle, severity, status, cause_code, evidence_json, opened_at_ms
      ) VALUES (?, 1, ?, ?, 'equipment_fault', 1, 1, 'critical', 'open', 'fault_a', '{}', 1000)
    `).run(ctx.datasetId, alert1, ctx.resourceId);

    // Second active alert with same resource and rule_code fails UNIQUE index
    expect(() => {
      ctx.db.prepare(`
        INSERT INTO alert (
          dataset_id, epoch, id, resource_id, rule_code, rule_version,
          cycle, severity, status, cause_code, evidence_json, opened_at_ms
        ) VALUES (?, 1, ?, ?, 'equipment_fault', 1, 2, 'critical', 'open', 'fault_b', '{}', 2000)
      `).run(ctx.datasetId, alert2, ctx.resourceId);
    }).toThrow(/UNIQUE constraint failed.*alert/);

    // But different rule_code on the same resource succeeds
    const alertDifferentRule = randomUUID();
    expect(() => {
      ctx.db.prepare(`
        INSERT INTO alert (
          dataset_id, epoch, id, resource_id, rule_code, rule_version,
          cycle, severity, status, cause_code, evidence_json, opened_at_ms
        ) VALUES (?, 1, ?, ?, 'communication_missing', 1, 1, 'warning', 'open', NULL, '{}', 2000)
      `).run(ctx.datasetId, alertDifferentRule, ctx.resourceId);
    }).not.toThrow();
  });

  it('supports full lifecycle transitions (open -> acknowledged -> resolved) and blocks illegal transitions', () => {
    const ctx = setupAlertContext();
    const alertId = randomUUID();

    ctx.db.prepare(`
      INSERT INTO alert (
        dataset_id, epoch, id, resource_id, rule_code, rule_version,
        cycle, severity, status, cause_code, evidence_json, opened_at_ms
      ) VALUES (?, 1, ?, ?, 'maintenance_due', 1, 1, 'high', 'open', 'initial_preventive_check', '{}', 1000)
    `).run(ctx.datasetId, alertId, ctx.resourceId);

    // 1. Transition open -> acknowledged
    ctx.db.prepare(`
      UPDATE alert
      SET status = 'acknowledged', acknowledged_at_ms = 1500, acknowledged_by = ?
      WHERE id = ?
    `).run(ctx.actorId, alertId);

    const acknowledgedRow = ctx.db.prepare('SELECT status, acknowledged_at_ms, acknowledged_by FROM alert WHERE id = ?').get(alertId) as Record<string, unknown>;
    expect(acknowledgedRow.status).toBe('acknowledged');
    expect(acknowledgedRow.acknowledged_at_ms).toBe(1500);
    expect(acknowledgedRow.acknowledged_by).toBe(ctx.actorId);

    // Illegal: acknowledged cannot regress to open
    expect(() => {
      ctx.db.prepare(`
        UPDATE alert
        SET status = 'open'
        WHERE id = ?
      `).run(alertId);
    }).toThrow(/Invalid alert status transition/);

    expect(() => {
      ctx.db.prepare(`
        UPDATE alert
        SET status = 'open', acknowledged_at_ms = NULL, acknowledged_by = NULL
        WHERE id = ?
      `).run(alertId);
    }).toThrow(/Historical alert acknowledgment is immutable/);

    // 2. Transition acknowledged -> resolved
    ctx.db.prepare(`
      UPDATE alert
      SET status = 'resolved', resolved_at_ms = 2000, resolved_by = ?
      WHERE id = ?
    `).run(ctx.actorId, alertId);

    const resolvedRow = ctx.db.prepare('SELECT status, resolved_at_ms FROM alert WHERE id = ?').get(alertId) as Record<string, unknown>;
    expect(resolvedRow.status).toBe('resolved');
    expect(resolvedRow.resolved_at_ms).toBe(2000);

    // Illegal: resolved is terminal and immutable
    expect(() => {
      ctx.db.prepare(`
        UPDATE alert
        SET status = 'open'
        WHERE id = ?
      `).run(alertId);
    }).toThrow(/Resolved alert is immutable|Invalid alert status transition/);

    expect(() => {
      ctx.db.prepare(`
        UPDATE alert
        SET severity = 'critical'
        WHERE id = ?
      `).run(alertId);
    }).toThrow(/Resolved alert is immutable/);
  });

  it('allows direct transition open -> resolved', () => {
    const ctx = setupAlertContext();
    const alertId = randomUUID();

    ctx.db.prepare(`
      INSERT INTO alert (
        dataset_id, epoch, id, resource_id, rule_code, rule_version,
        cycle, severity, status, cause_code, evidence_json, opened_at_ms
      ) VALUES (?, 1, ?, ?, 'equipment_fault', 1, 1, 'high', 'open', 'motor_fault', '{}', 1000)
    `).run(ctx.datasetId, alertId, ctx.resourceId);

    // Direct resolve without acknowledge
    ctx.db.prepare(`
      UPDATE alert
      SET status = 'resolved', resolved_at_ms = 1800
      WHERE id = ?
    `).run(alertId);

    const row = ctx.db.prepare('SELECT status, acknowledged_at_ms, resolved_at_ms FROM alert WHERE id = ?').get(alertId) as Record<string, unknown>;
    expect(row.status).toBe('resolved');
    expect(row.acknowledged_at_ms).toBeNull();
    expect(row.resolved_at_ms).toBe(1800);
  });

  it('allows recurrence with a new cycle after previous alert is resolved', () => {
    const ctx = setupAlertContext();
    const cycle1Id = randomUUID();
    const cycle2Id = randomUUID();

    // Cycle 1 opened and resolved
    ctx.db.prepare(`
      INSERT INTO alert (
        dataset_id, epoch, id, resource_id, rule_code, rule_version,
        cycle, severity, status, cause_code, evidence_json, opened_at_ms
      ) VALUES (?, 1, ?, ?, 'equipment_fault', 1, 1, 'high', 'open', 'fault_1', '{}', 1000)
    `).run(ctx.datasetId, cycle1Id, ctx.resourceId);

    ctx.db.prepare(`
      UPDATE alert
      SET status = 'resolved', resolved_at_ms = 2000
      WHERE id = ?
    `).run(cycle1Id);

    // Cycle 2 can now be opened for the exact same resource and rule_code!
    expect(() => {
      ctx.db.prepare(`
        INSERT INTO alert (
          dataset_id, epoch, id, resource_id, rule_code, rule_version,
          cycle, severity, status, cause_code, evidence_json, opened_at_ms
        ) VALUES (?, 1, ?, ?, 'equipment_fault', 1, 2, 'critical', 'open', 'fault_1', '{}', 3000)
      `).run(ctx.datasetId, cycle2Id, ctx.resourceId);
    }).not.toThrow();

    // Both cycles remain in the table preserving complete historical audit
    const allAlerts = ctx.db.prepare('SELECT id, cycle, status, opened_at_ms, resolved_at_ms FROM alert ORDER BY cycle').all() as Record<string, unknown>[];
    expect(allAlerts).toHaveLength(2);
    expect(allAlerts[0]!.cycle).toBe(1);
    expect(allAlerts[0]!.status).toBe('resolved');
    expect(allAlerts[1]!.cycle).toBe(2);
    expect(allAlerts[1]!.status).toBe('open');
  });

  it('protects alert records against DELETE and identity mutations', () => {
    const ctx = setupAlertContext();
    const alertId = randomUUID();

    ctx.db.prepare(`
      INSERT INTO alert (
        dataset_id, epoch, id, resource_id, rule_code, rule_version,
        cycle, severity, status, cause_code, evidence_json, opened_at_ms
      ) VALUES (?, 1, ?, ?, 'communication_missing', 1, 1, 'warning', 'open', NULL, '{}', 1000)
    `).run(ctx.datasetId, alertId, ctx.resourceId);

    // No delete
    expect(() => {
      ctx.db.prepare('DELETE FROM alert WHERE id = ?').run(alertId);
    }).toThrow(/Retain alert history/);

    // No mutation of identity / cycle
    expect(() => {
      ctx.db.prepare('UPDATE alert SET cycle = 2 WHERE id = ?').run(alertId);
    }).toThrow(/Immutable alert identity and cycle/);

    expect(() => {
      ctx.db.prepare('UPDATE alert SET opened_at_ms = 999 WHERE id = ?').run(alertId);
    }).toThrow(/Immutable alert identity and cycle/);

    expect(() => {
      ctx.db.prepare('UPDATE alert SET resource_id = ? WHERE id = ?').run(randomUUID(), alertId);
    }).toThrow(/Immutable alert identity and cycle/);
  });

  it('P2-A — protects historical acknowledgment facts and cause_code from mutation or clearing', () => {
    const ctx = setupAlertContext();
    const alertId = randomUUID();

    // 1. Insert open alert with cause_code
    ctx.db.prepare(`
      INSERT INTO alert (
        dataset_id, epoch, id, resource_id, rule_code, rule_version,
        cycle, severity, status, cause_code, evidence_json, opened_at_ms
      ) VALUES (?, 1, ?, ?, 'equipment_fault', 1, 1, 'high', 'open', 'sensor_fault', '{"initial":true}', 1000)
    `).run(ctx.datasetId, alertId, ctx.resourceId);

    // 2. Transition open -> acknowledged
    ctx.db.prepare(`
      UPDATE alert
      SET status = 'acknowledged', acknowledged_at_ms = 1500, acknowledged_by = ?
      WHERE id = ?
    `).run(ctx.actorId, alertId);

    // 3. Legitimate update of severity and evidence while acknowledged succeeds
    ctx.db.prepare(`
      UPDATE alert
      SET severity = 'critical', evidence_json = '{"updated":true}'
      WHERE id = ?
    `).run(alertId);

    const rowAck = ctx.db.prepare('SELECT severity, evidence_json, acknowledged_at_ms, acknowledged_by, cause_code FROM alert WHERE id = ?').get(alertId) as Record<string, unknown>;
    expect(rowAck.severity).toBe('critical');
    expect(rowAck.evidence_json).toBe('{"updated":true}');
    expect(rowAck.acknowledged_at_ms).toBe(1500);
    expect(rowAck.acknowledged_by).toBe(ctx.actorId);
    expect(rowAck.cause_code).toBe('sensor_fault');

    // 4. Attempt to mutate acknowledged_at_ms fails
    expect(() => {
      ctx.db.prepare('UPDATE alert SET acknowledged_at_ms = 1600 WHERE id = ?').run(alertId);
    }).toThrow(/Historical alert acknowledgment is immutable/);

    // 5. Attempt to mutate acknowledged_by fails
    expect(() => {
      ctx.db.prepare("UPDATE alert SET acknowledged_by = 'someone_else' WHERE id = ?").run(alertId);
    }).toThrow(/Historical alert acknowledgment is immutable/);

    // 6. Attempt to clear acknowledged_at_ms to NULL fails
    expect(() => {
      ctx.db.prepare('UPDATE alert SET acknowledged_at_ms = NULL WHERE id = ?').run(alertId);
    }).toThrow(/Historical alert acknowledgment is immutable/);

    // 7. Attempt to mutate cause_code fails
    expect(() => {
      ctx.db.prepare("UPDATE alert SET cause_code = 'motor_fault' WHERE id = ?").run(alertId);
    }).toThrow(/Alert cause_code is immutable/);

    // 8. Attempt to clear cause_code to NULL fails
    expect(() => {
      ctx.db.prepare('UPDATE alert SET cause_code = NULL WHERE id = ?').run(alertId);
    }).toThrow(/Alert cause_code is immutable/);

    // 9. Legitimate transition acknowledged -> resolved preserving ack info succeeds
    expect(() => {
      ctx.db.prepare(`
        UPDATE alert
        SET status = 'resolved', resolved_at_ms = 2000, resolved_by = ?
        WHERE id = ?
      `).run(ctx.actorId, alertId);
    }).not.toThrow();

    const rowRes = ctx.db.prepare('SELECT status, resolved_at_ms, acknowledged_at_ms, cause_code FROM alert WHERE id = ?').get(alertId) as Record<string, unknown>;
    expect(rowRes.status).toBe('resolved');
    expect(rowRes.resolved_at_ms).toBe(2000);
    expect(rowRes.acknowledged_at_ms).toBe(1500);
    expect(rowRes.cause_code).toBe('sensor_fault');
  });
});

describe('PKG01 — AlertEvent table schema and append-only invariants', () => {
  function setupAlertWithEvent() {
    const f = empty();
    f.store.migrate();
    const datasetId = randomUUID();
    const actorId = `operator:${randomUUID()}`;
    const resourceId = randomUUID();
    const alertId = randomUUID();

    transaction(f.db, () => {
      f.db.prepare("INSERT INTO actor(id, kind, local_key) VALUES (?, 'operator', ?)").run(actorId, `op-${actorId}`);
      f.db.prepare("INSERT INTO dataset(id, code, kind, active_epoch) VALUES (?, ?, 'demo', 1)").run(datasetId, `code-${datasetId}`);
      f.db.prepare("INSERT INTO dataset_epoch(dataset_id, epoch, status, revision) VALUES (?, 1, 'ready', 0)").run(datasetId);
      f.db.prepare("INSERT INTO organization(dataset_id, epoch, id, code, name) VALUES (?, 1, ?, 'ORG_TEST', 'Org Test')").run(datasetId, randomUUID());
      f.db.prepare(
        "INSERT INTO resource(dataset_id, epoch, id, kind, organization_id, public_label, version) VALUES (?, 1, ?, 'equipment', (SELECT id FROM organization WHERE dataset_id=? AND epoch=1 LIMIT 1), 'RAD_1', 1)"
      ).run(datasetId, resourceId, datasetId);
      f.db.prepare(
        "INSERT INTO equipment(dataset_id, epoch, id, category_code, category_version, serial_normalized, brand, model, criticality, mobility, attributes_json) VALUES (?, 1, ?, 'fixed_speed_radar', 1, 'RAD_SER', 'Brand', 'Model', 4, 'fixed', '{\"regulatedSpeedLimitKmh\":60}')"
      ).run(datasetId, resourceId);
      f.db.prepare(
        `INSERT INTO resource_location(dataset_id, epoch, resource_id, role, reference_type, postal_code, neighborhood, city, uf, address, reference, latitude, longitude, region_id)
         VALUES (?, 1, ?, 'registration', 'installation', '01001000', 'Centro', 'Cidade', 'SP', 'Av 1', 'Ref 1', -23.558, -46.648, NULL)`
      ).run(datasetId, resourceId);
      f.db.prepare(
        "INSERT INTO current_state(dataset_id, epoch, resource_id, operational_state, version) VALUES (?, 1, ?, 'not_installed', 1)"
      ).run(datasetId, resourceId);
      f.db.prepare(`
        INSERT INTO alert (
          dataset_id, epoch, id, resource_id, rule_code, rule_version,
          cycle, severity, status, cause_code, evidence_json, opened_at_ms
        ) VALUES (?, 1, ?, ?, 'equipment_fault', 1, 1, 'high', 'open', 'motor_fault', '{"obs":"test"}', 1000)
      `).run(datasetId, alertId, resourceId);
    });

    return { ...f, datasetId, actorId, resourceId, alertId };
  }

  it('records valid AlertChanged events and enforces append-only triggers', () => {
    const ctx = setupAlertWithEvent();
    const event1Id = randomUUID();
    const event2Id = randomUUID();

    // Event 1: Opened
    ctx.db.prepare(`
      INSERT INTO alert_event (
        dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
        cycle, severity, previous_status, status, evidence_json, occurred_at_ms, recorded_at_ms, actor_id
      ) VALUES (?, 1, ?, ?, ?, 'equipment_fault', 1, 1, 'high', NULL, 'open', '{"obs":"test"}', 1000, 1000, ?)
    `).run(ctx.datasetId, event1Id, ctx.alertId, ctx.resourceId, ctx.actorId);

    // Event 2: Acknowledged
    ctx.db.prepare(`
      INSERT INTO alert_event (
        dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
        cycle, severity, previous_status, status, evidence_json, occurred_at_ms, recorded_at_ms, actor_id
      ) VALUES (?, 1, ?, ?, ?, 'equipment_fault', 1, 1, 'high', 'open', 'acknowledged', '{"ack":true}', 1500, 1500, ?)
    `).run(ctx.datasetId, event2Id, ctx.alertId, ctx.resourceId, ctx.actorId);

    const eventRows = ctx.db.prepare('SELECT id, status, previous_status FROM alert_event ORDER BY occurred_at_ms').all() as Record<string, unknown>[];
    expect(eventRows).toHaveLength(2);
    expect(eventRows[0]!.status).toBe('open');
    expect(eventRows[0]!.previous_status).toBeNull();
    expect(eventRows[1]!.status).toBe('acknowledged');
    expect(eventRows[1]!.previous_status).toBe('open');

    // Duplicate event for same (alert_id, status) in same epoch is rejected
    expect(() => {
      ctx.db.prepare(`
        INSERT INTO alert_event (
          dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
          cycle, severity, previous_status, status, evidence_json, occurred_at_ms, recorded_at_ms, actor_id
        ) VALUES (?, 1, ?, ?, ?, 'equipment_fault', 1, 1, 'high', NULL, 'open', '{"dup":true}', 1000, 1000, ?)
      `).run(ctx.datasetId, randomUUID(), ctx.alertId, ctx.resourceId, ctx.actorId);
    }).toThrow(/UNIQUE constraint failed/);

    // Immutability: no UPDATE or DELETE on alert_event
    expect(() => {
      ctx.db.prepare("UPDATE alert_event SET severity = 'critical' WHERE id = ?").run(event1Id);
    }).toThrow(/Immutable alert event/);

    expect(() => {
      ctx.db.prepare('DELETE FROM alert_event WHERE id = ?').run(event1Id);
    }).toThrow(/Retain alert event history/);
  });

  it('P1-A — enforces composite foreign key matching alert identity, rule, cycle and context', () => {
    const ctx = setupAlertWithEvent();
    const eventId = randomUUID();

    // 1. Valid event matching all columns
    expect(() => {
      ctx.db.prepare(`
        INSERT INTO alert_event (
          dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
          cycle, severity, previous_status, status, evidence_json, occurred_at_ms, recorded_at_ms, actor_id
        ) VALUES (?, 1, ?, ?, ?, 'equipment_fault', 1, 1, 'high', NULL, 'open', '{"valid":true}', 1000, 1000, ?)
      `).run(ctx.datasetId, eventId, ctx.alertId, ctx.resourceId, ctx.actorId);
    }).not.toThrow();

    // 2. Valid severity history: severity can differ from alert initial severity (escalation)
    const eventAckId = randomUUID();
    expect(() => {
      ctx.db.prepare(`
        INSERT INTO alert_event (
          dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
          cycle, severity, previous_status, status, evidence_json, occurred_at_ms, recorded_at_ms, actor_id
        ) VALUES (?, 1, ?, ?, ?, 'equipment_fault', 1, 1, 'critical', 'open', 'acknowledged', '{"escalated":true}', 1200, 1200, ?)
      `).run(ctx.datasetId, eventAckId, ctx.alertId, ctx.resourceId, ctx.actorId);
    }).not.toThrow();

    // 3. Divergent resource_id fails FK
    const anotherResourceId = randomUUID();
    transaction(ctx.db, () => {
      ctx.db.prepare(
        "INSERT INTO resource(dataset_id, epoch, id, kind, organization_id, public_label, version) VALUES (?, 1, ?, 'equipment', (SELECT id FROM organization WHERE dataset_id=? AND epoch=1 LIMIT 1), 'RAD_2', 1)"
      ).run(ctx.datasetId, anotherResourceId, ctx.datasetId);
      ctx.db.prepare(
        "INSERT INTO equipment(dataset_id, epoch, id, category_code, category_version, serial_normalized, brand, model, criticality, mobility, attributes_json) VALUES (?, 1, ?, 'fixed_speed_radar', 1, 'RAD_SER_2', 'Brand', 'Model', 4, 'fixed', '{\"regulatedSpeedLimitKmh\":60}')"
      ).run(ctx.datasetId, anotherResourceId);
      ctx.db.prepare(
        `INSERT INTO resource_location(dataset_id, epoch, resource_id, role, reference_type, postal_code, neighborhood, city, uf, address, reference, latitude, longitude, region_id)
         VALUES (?, 1, ?, 'registration', 'installation', '01001000', 'Centro', 'Cidade', 'SP', 'Av 1', 'Ref 1', -23.558, -46.648, NULL)`
      ).run(ctx.datasetId, anotherResourceId);
      ctx.db.prepare(
        "INSERT INTO current_state(dataset_id, epoch, resource_id, operational_state, version) VALUES (?, 1, ?, 'not_installed', 1)"
      ).run(ctx.datasetId, anotherResourceId);
    });

    expect(() => {
      ctx.db.prepare(`
        INSERT INTO alert_event (
          dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
          cycle, severity, previous_status, status, evidence_json, occurred_at_ms, recorded_at_ms, actor_id
        ) VALUES (?, 1, ?, ?, ?, 'equipment_fault', 1, 1, 'high', 'open', 'resolved', '{}', 1500, 1500, ?)
      `).run(ctx.datasetId, randomUUID(), ctx.alertId, anotherResourceId, ctx.actorId);
    }).toThrow(/FOREIGN KEY constraint failed/);

    // 4. Divergent rule_code fails FK
    expect(() => {
      ctx.db.prepare(`
        INSERT INTO alert_event (
          dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
          cycle, severity, previous_status, status, evidence_json, occurred_at_ms, recorded_at_ms, actor_id
        ) VALUES (?, 1, ?, ?, ?, 'communication_missing', 1, 1, 'warning', 'open', 'resolved', '{}', 1500, 1500, ?)
      `).run(ctx.datasetId, randomUUID(), ctx.alertId, ctx.resourceId, ctx.actorId);
    }).toThrow(/FOREIGN KEY constraint failed/);

    // 5. Divergent cycle fails FK
    expect(() => {
      ctx.db.prepare(`
        INSERT INTO alert_event (
          dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
          cycle, severity, previous_status, status, evidence_json, occurred_at_ms, recorded_at_ms, actor_id
        ) VALUES (?, 1, ?, ?, ?, 'equipment_fault', 1, 2, 'high', 'open', 'resolved', '{}', 1500, 1500, ?)
      `).run(ctx.datasetId, randomUUID(), ctx.alertId, ctx.resourceId, ctx.actorId);
    }).toThrow(/FOREIGN KEY constraint failed/);

    // 6. Divergent context (dataset_id / epoch) fails FK
    expect(() => {
      ctx.db.prepare(`
        INSERT INTO alert_event (
          dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
          cycle, severity, previous_status, status, evidence_json, occurred_at_ms, recorded_at_ms, actor_id
        ) VALUES ('OTHER_DATASET', 1, ?, ?, ?, 'equipment_fault', 1, 1, 'high', 'open', 'resolved', '{}', 1500, 1500, ?)
      `).run(randomUUID(), ctx.alertId, ctx.resourceId, ctx.actorId);
    }).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('P1-B — eliminates NULL ternary loophole and strictly validates state transitions', () => {
    const ctx = setupAlertWithEvent();

    // 1. Valid origin combinations
    expect(() => {
      ctx.db.prepare(`
        INSERT INTO alert_event (
          dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
          cycle, severity, previous_status, status, evidence_json, occurred_at_ms, recorded_at_ms, actor_id
        ) VALUES (?, 1, ?, ?, ?, 'equipment_fault', 1, 1, 'high', NULL, 'open', '{}', 1000, 1000, ?)
      `).run(ctx.datasetId, randomUUID(), ctx.alertId, ctx.resourceId, ctx.actorId);
    }).not.toThrow();

    expect(() => {
      ctx.db.prepare(`
        INSERT INTO alert_event (
          dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
          cycle, severity, previous_status, status, evidence_json, occurred_at_ms, recorded_at_ms, actor_id
        ) VALUES (?, 1, ?, ?, ?, 'equipment_fault', 1, 1, 'high', 'open', 'acknowledged', '{}', 1100, 1100, ?)
      `).run(ctx.datasetId, randomUUID(), ctx.alertId, ctx.resourceId, ctx.actorId);
    }).not.toThrow();

    expect(() => {
      ctx.db.prepare(`
        INSERT INTO alert_event (
          dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
          cycle, severity, previous_status, status, evidence_json, occurred_at_ms, recorded_at_ms, actor_id
        ) VALUES (?, 1, ?, ?, ?, 'equipment_fault', 1, 1, 'high', 'acknowledged', 'resolved', '{}', 1200, 1200, ?)
      `).run(ctx.datasetId, randomUUID(), ctx.alertId, ctx.resourceId, ctx.actorId);
    }).not.toThrow();

    // Direct resolved with previous_status = 'open' (on a fresh alert)
    const directResolveAlertId = randomUUID();
    ctx.db.prepare(`
      INSERT INTO alert (
        dataset_id, epoch, id, resource_id, rule_code, rule_version,
        cycle, severity, status, cause_code, evidence_json, opened_at_ms, resolved_at_ms
      ) VALUES (?, 1, ?, ?, 'equipment_fault', 1, 2, 'high', 'resolved', 'motor_fault', '{}', 2000, 2100)
    `).run(ctx.datasetId, directResolveAlertId, ctx.resourceId);

    expect(() => {
      ctx.db.prepare(`
        INSERT INTO alert_event (
          dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
          cycle, severity, previous_status, status, evidence_json, occurred_at_ms, recorded_at_ms, actor_id
        ) VALUES (?, 1, ?, ?, ?, 'equipment_fault', 1, 2, 'high', 'open', 'resolved', '{}', 2100, 2100, ?)
      `).run(ctx.datasetId, randomUUID(), directResolveAlertId, ctx.resourceId, ctx.actorId);
    }).not.toThrow();

    // 2. Adversarial tests — NULL loophole must FAIL
    expect(() => {
      ctx.db.prepare(`
        INSERT INTO alert_event (
          dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
          cycle, severity, previous_status, status, evidence_json, occurred_at_ms, recorded_at_ms, actor_id
        ) VALUES (?, 1, ?, ?, ?, 'equipment_fault', 1, 1, 'high', NULL, 'resolved', '{}', 1300, 1300, ?)
      `).run(ctx.datasetId, randomUUID(), ctx.alertId, ctx.resourceId, ctx.actorId);
    }).toThrow(/CHECK constraint failed/);

    expect(() => {
      ctx.db.prepare(`
        INSERT INTO alert_event (
          dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
          cycle, severity, previous_status, status, evidence_json, occurred_at_ms, recorded_at_ms, actor_id
        ) VALUES (?, 1, ?, ?, ?, 'equipment_fault', 1, 1, 'high', NULL, 'acknowledged', '{}', 1300, 1300, ?)
      `).run(ctx.datasetId, randomUUID(), ctx.alertId, ctx.resourceId, ctx.actorId);
    }).toThrow(/CHECK constraint failed/);

    expect(() => {
      ctx.db.prepare(`
        INSERT INTO alert_event (
          dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
          cycle, severity, previous_status, status, evidence_json, occurred_at_ms, recorded_at_ms, actor_id
        ) VALUES (?, 1, ?, ?, ?, 'equipment_fault', 1, 1, 'high', 'open', 'open', '{}', 1300, 1300, ?)
      `).run(ctx.datasetId, randomUUID(), ctx.alertId, ctx.resourceId, ctx.actorId);
    }).toThrow(/CHECK constraint failed/);

    expect(() => {
      ctx.db.prepare(`
        INSERT INTO alert_event (
          dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
          cycle, severity, previous_status, status, evidence_json, occurred_at_ms, recorded_at_ms, actor_id
        ) VALUES (?, 1, ?, ?, ?, 'equipment_fault', 1, 1, 'high', 'acknowledged', 'open', '{}', 1300, 1300, ?)
      `).run(ctx.datasetId, randomUUID(), ctx.alertId, ctx.resourceId, ctx.actorId);
    }).toThrow(/CHECK constraint failed/);

    expect(() => {
      ctx.db.prepare(`
        INSERT INTO alert_event (
          dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
          cycle, severity, previous_status, status, evidence_json, occurred_at_ms, recorded_at_ms, actor_id
        ) VALUES (?, 1, ?, ?, ?, 'equipment_fault', 1, 1, 'high', 'acknowledged', 'acknowledged', '{}', 1300, 1300, ?)
      `).run(ctx.datasetId, randomUUID(), ctx.alertId, ctx.resourceId, ctx.actorId);
    }).toThrow(/CHECK constraint failed/);

    expect(() => {
      ctx.db.prepare(`
        INSERT INTO alert_event (
          dataset_id, epoch, id, alert_id, resource_id, rule_code, rule_version,
          cycle, severity, previous_status, status, evidence_json, occurred_at_ms, recorded_at_ms, actor_id
        ) VALUES (?, 1, ?, ?, ?, 'equipment_fault', 1, 1, 'high', 'resolved', 'resolved', '{}', 1300, 1300, ?)
      `).run(ctx.datasetId, randomUUID(), ctx.alertId, ctx.resourceId, ctx.actorId);
    }).toThrow(/CHECK constraint failed/);
  });
});
