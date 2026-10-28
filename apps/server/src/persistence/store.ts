import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AppError, storageError } from '../errors.js';

const migrations = ['0001-foundation.sql', '0002-inventory.sql', '0003-heterogeneous-inventory.sql', '0004-demo-baseline.sql', '0005-regions-and-spatial.sql', '0006-telemetry-and-episodes.sql', '0007-alerts.sql'].map((file, i) => {
  const sql = readFileSync(new URL(`../../migrations/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  return { version: i + 1, sql, checksum: createHash('sha256').update(sql).digest('hex') };
});
export const SCHEMA_VERSION = 7;

export function transaction<T>(db: Database.Database, action: () => T): T {
  if (db.inTransaction) throw new Error('Transação aninhada não permitida.');
  try {
    db.exec('BEGIN IMMEDIATE');
    const result = action();
    if (result instanceof Promise) throw new Error('A transação SQLite deve ser síncrona.');
    db.exec('COMMIT');
    return result;
  } catch (error) {
    if (db.inTransaction) db.exec('ROLLBACK');
    return storageError(error);
  }
}

export function walResetFixed(version: string): boolean {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);
  return major > 3 || (major === 3 && (minor > 51 || (minor === 51 && patch >= 3)
    || (minor === 50 && patch >= 7) || (minor === 44 && patch >= 6)));
}

export class Store {
  readonly db: Database.Database;
  readonly path: string;

  constructor(path: string, create = false) {
    if (path === ':memory:' || path.startsWith('file:') || path.startsWith('\\\\') || path.startsWith('//')) {
      throw new Error('DATABASE_PATH deve apontar para arquivo persistente no disco local.');
    }
    this.path = resolve(path);
    if (create) mkdirSync(dirname(this.path), { recursive: true });
    if (!create && !existsSync(this.path)) throw new Error('Banco ausente. Execute npm run db:migrate.');
    this.db = new Database(this.path, { fileMustExist: !create, timeout: 1000 });
    try {
      this.db.pragma('foreign_keys = ON');
      // REPLACE must also run immutable/append-only DELETE guards.
      this.db.pragma('recursive_triggers = ON');
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = FULL');
      this.db.pragma('busy_timeout = 1000');
      const diagnostics = this.diagnostics();
      if (!walResetFixed(diagnostics.sqliteVersion) || diagnostics.foreignKeys !== 1
        || diagnostics.journalMode !== 'wal' || diagnostics.synchronous !== 2 || diagnostics.busyTimeout !== 1000) {
        throw new Error('SQLite incompatível com os requisitos de versão/WAL/FKs de T0002.');
      }
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  diagnostics() {
    return {
      sqliteVersion: (this.db.prepare('SELECT sqlite_version() AS version').get() as { version: string }).version,
      foreignKeys: this.db.pragma('foreign_keys', { simple: true }) as number,
      journalMode: this.db.pragma('journal_mode', { simple: true }) as string,
      synchronous: this.db.pragma('synchronous', { simple: true }) as number,
      busyTimeout: this.db.pragma('busy_timeout', { simple: true }) as number,
    };
  }

  ready(): boolean {
    try {
      const versions = this.db.prepare('SELECT version, checksum FROM schema_migration ORDER BY version').all() as { version: number; checksum: string }[];
      if (versions.length !== migrations.length || versions.some((m, i) => m.version !== migrations[i]?.version || m.checksum !== migrations[i]?.checksum)
        || this.db.pragma('user_version', { simple: true }) !== SCHEMA_VERSION) return false;
      const settings = this.diagnostics();
      if (settings.foreignKeys !== 1 || settings.journalMode !== 'wal' || settings.synchronous !== 2
        || settings.busyTimeout !== 1000 || !walResetFixed(settings.sqliteVersion)) return false;
      if ((this.db.pragma('foreign_key_check') as unknown[]).length !== 0) return false;
      if (!this.db.prepare("SELECT 1 FROM actor WHERE local_key = 'local-operator'").get()
        || !this.db.prepare("SELECT 1 FROM dataset WHERE code = 'local-demo'").get()) return false;
      this.db.prepare('SELECT dataset_id, epoch, actor_id, operation, command_id, request_hash FROM command_receipt LIMIT 1').get();
      const broken = this.db.prepare(`SELECT 1 FROM dataset d LEFT JOIN dataset_epoch e
        ON e.dataset_id = d.id AND e.epoch = d.active_epoch WHERE e.status IS NULL OR e.status != 'ready' LIMIT 1`).get();
      return !broken;
    } catch { return false; }
  }

  assertReady(): void {
    if (!this.ready()) throw new AppError(503, 'DATABASE_UNAVAILABLE', 'Banco indisponível ou esquema incompatível.');
  }

  migrate(): { actorId: string; datasetId: string; epoch: number } {
    // VACUUM INTO must precede BEGIN IMMEDIATE, never run in a caller's transaction.
    if (this.db.inTransaction) throw new Error('Migração não permitida dentro de transação ativa.');
    const dataVersion = this.db.pragma('data_version', { simple: true });
    this.validateBeforeMigration();
    // SQLite produces a consistent backup including committed WAL content. No file-only copy.
    const priorVersion = this.db.pragma('user_version', { simple: true }) as number;
    if (priorVersion >= 2 && priorVersion < SCHEMA_VERSION) {
      const backupPath = `${this.path}.schema${priorVersion}-${randomUUID()}.backup`;
      this.db.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
      // Readonly integrity_check missed injected CHECK violations on SQLite
      // 3.53.4 (covered by the corrupted-backup test). Open the existing
      // backup normally, then prohibit writes at the connection level instead.
      const backup = new Database(backupPath, { fileMustExist: true });
      try {
        backup.pragma('query_only = ON');
        if (backup.pragma('user_version', { simple: true }) !== priorVersion
          || JSON.stringify(backup.prepare('SELECT version, checksum FROM schema_migration ORDER BY version').all())
            !== JSON.stringify(this.db.prepare('SELECT version, checksum FROM schema_migration ORDER BY version').all())
          || backup.pragma('integrity_check', { simple: true }) !== 'ok'
          || (backup.pragma('foreign_key_check') as unknown[]).length) throw new Error('Backup SQLite inválido; migração recusada.');
      } finally { backup.close(); }
    }
    transaction(this.db, () => {
      // A writer between validation/backup and the write lock invalidates this attempt.
      // Refuse rather than migrate a state not covered by the validated backup.
      if (this.db.pragma('data_version', { simple: true }) !== dataVersion
        || this.db.pragma('user_version', { simple: true }) !== priorVersion) {
        throw new Error('Banco alterado durante o backup; repita a migração com escritores parados.');
      }
      this.validateBeforeMigration();
      if ((this.db.pragma('user_version', { simple: true }) as number) > SCHEMA_VERSION) {
        throw new Error('Versão de esquema futura; migração recusada.');
      }
      this.db.exec(`CREATE TABLE IF NOT EXISTS schema_migration (
        version INTEGER PRIMARY KEY NOT NULL, checksum TEXT NOT NULL)`);
      const existing = this.db.prepare('SELECT version, checksum FROM schema_migration ORDER BY version').all() as { version: number; checksum: string }[];
      if (existing.some((m, i) => m.version !== migrations[i]?.version || m.checksum !== migrations[i]?.checksum)) {
        throw new Error('Migrações desconhecidas ou checksum divergente; nenhuma atualização aplicada.');
      }
      for (const migration of migrations.slice(existing.length)) {
        this.db.exec(migration.sql);
        this.db.prepare('INSERT INTO schema_migration(version, checksum) VALUES (?, ?)').run(migration.version, migration.checksum);
      }
      this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
      if ((this.db.pragma('foreign_key_check') as unknown[]).length
        || this.db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Integridade inválida; migração revertida.');
    });
    const installation = transaction(this.db, () => {
      let actor = this.db.prepare("SELECT id FROM actor WHERE local_key = 'local-operator'").get() as { id: string } | undefined;
      if (!actor) {
        actor = { id: `operator:${randomUUID()}` };
        this.db.prepare("INSERT INTO actor(id, kind, local_key) VALUES (?, 'operator', 'local-operator')").run(actor.id);
      }
      let dataset = this.db.prepare("SELECT id, active_epoch FROM dataset WHERE code = 'local-demo'").get() as { id: string; active_epoch: number } | undefined;
      if (!dataset) {
        dataset = { id: randomUUID(), active_epoch: 1 };
        this.db.prepare("INSERT INTO dataset(id, code, kind, active_epoch) VALUES (?, 'local-demo', 'demo', 1)").run(dataset.id);
        this.db.prepare("INSERT INTO dataset_epoch(dataset_id, epoch, status, revision) VALUES (?, 1, 'ready', 0)").run(dataset.id);
        this.db.prepare('INSERT INTO dataset_grant(dataset_id, actor_id, can_write) VALUES (?, ?, 1)').run(dataset.id, actor.id);
      }
      return { actorId: actor.id, datasetId: dataset.id, epoch: dataset.active_epoch };
    });
    this.assertReady();
    return installation;
  }

  private validateBeforeMigration(): void {
    const version = this.db.pragma('user_version', { simple: true }) as number;
    if (version > SCHEMA_VERSION) throw new Error('Versão de esquema futura; migração recusada.');
    const hasLedger = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migration'").get();
    const existing = hasLedger ? this.db.prepare('SELECT version,checksum FROM schema_migration ORDER BY version').all() as {version:number;checksum:string}[] : [];
    if (existing.length !== version || existing.some((m,i) => m.version !== migrations[i]?.version || m.checksum !== migrations[i]?.checksum)) {
      throw new Error('Migrações desconhecidas ou checksum divergente; nenhuma atualização aplicada.');
    }
    if ((this.db.pragma('foreign_key_check') as unknown[]).length || this.db.pragma('integrity_check', { simple: true }) !== 'ok') {
      throw new Error('Banco inconsistente; migração recusada sem reparo.');
    }
  }

  close(): void { if (this.db.open) this.db.close(); }
}
