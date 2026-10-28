import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Context } from '../auth.js';
import type { ObjectJson } from './contract.js';

// The initial request belongs to Maintenance and joins the caller's inventory transaction.
export function createInitialRequest(db: Database.Database, context: Context, equipmentId: string, input: ObjectJson | null, causeCode: string, id?: string) {
  if (!input) return;
  const schedule = input.schedule as ObjectJson;
  db.prepare(`INSERT INTO maintenance_request(dataset_id, epoch, id, equipment_id, cause_code, status,
    version, reason, priority, schedule_status, due_date, not_applicable_reason)
    VALUES (?, ?, ?, ?, ?, 'open', 1, ?, ?, ?, ?, ?)`)
    .run(context.datasetId, context.epoch, id ?? randomUUID(), equipmentId, causeCode, input.reason, input.priority,
      schedule.status, schedule.dueDate, schedule.notApplicableReason);
}

export function maintenanceView(db: Database.Database, context: Context, equipmentId: string) {
  const rows = db.prepare(`SELECT id, cause_code, status, version, reason, priority, schedule_status,
    due_date, not_applicable_reason FROM maintenance_request WHERE dataset_id = ? AND epoch = ? AND equipment_id = ? ORDER BY id`)
    .all(context.datasetId, context.epoch, equipmentId) as {
      id: string; cause_code: string; status: string; version: number; reason: string; priority: string;
      schedule_status: string; due_date: string | null; not_applicable_reason: string | null;
    }[];
  return {
    requests: rows.map(r => ({ id: r.id, causeCode: r.cause_code, status: r.status, version: r.version,
      reason: r.reason, priority: r.priority,
      schedule: { status: r.schedule_status, dueDate: r.due_date, notApplicableReason: r.not_applicable_reason } })),
    nextMaintenance: { status: rows[0]?.schedule_status ?? 'unknown', date: rows[0]?.due_date ?? null,
      reason: rows[0]?.not_applicable_reason ?? null },
  };
}
