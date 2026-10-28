import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Context, Credentials, Authorization } from '../auth.js';
import { AppError } from '../errors.js';
import { executeCommand } from '../idempotency/command.js';
import { canonicalJson, parseJson } from '../idempotency/json.js';
import type { Json } from '../idempotency/json.js';
import { createFields, updateFields, inventoryInput, ORGANIZATION_ID, invalid, validateEquipment } from './contract.js';
import { profile, policy } from './catalog.js';
import type { ObjectJson } from './contract.js';
import { createInitialRequest, maintenanceView } from './maintenance.js';
import { classifyPointInDataset } from '../operations/regions.js';

export function locations(db: Database.Database, c: Context, id: string) {
  const rows = db.prepare(`SELECT role, reference_type AS referenceType, postal_code AS postalCode,
    neighborhood, city, uf, address, reference, latitude, longitude, region_id AS regionId FROM resource_location
    WHERE dataset_id = ? AND epoch = ? AND resource_id = ?`).all(c.datasetId, c.epoch, id) as (ObjectJson & { role: string })[];
  return Object.fromEntries(rows.map(({ role, ...location }) => [role, location]));
}

export function equipmentView(db: Database.Database, c: Context, id: string): ObjectJson {
  const row = db.prepare(`SELECT r.id, r.public_label AS publicLabel, r.version,
    o.id AS organizationId, o.code AS organizationCode, o.name AS organizationName,
    e.category_code AS categoryCode, e.category_version AS categoryVersion, e.mobility,
    e.serial_normalized AS serialNumber, e.brand, e.model, e.criticality, e.attributes_json AS attributesJson,
    s.operational_state AS operationalState
    FROM resource r JOIN equipment e USING(dataset_id, epoch, id)
    JOIN organization o ON o.dataset_id = r.dataset_id AND o.epoch = r.epoch AND o.id = r.organization_id
    JOIN current_state s ON s.dataset_id = r.dataset_id AND s.epoch = r.epoch AND s.resource_id = r.id
    WHERE r.dataset_id = ? AND r.epoch = ? AND r.id = ? AND r.archived = 0`).get(c.datasetId, c.epoch, id) as {
      categoryCode: string; categoryVersion: number; mobility: string;
      id: string; publicLabel: string; version: number; organizationId: string; organizationCode: string; organizationName: string;
      serialNumber: string; brand: string; model: string; criticality: number; attributesJson: string; operationalState: string;
    } | undefined;
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Equipamento não disponível neste contexto.');
  const loc = locations(db, c, id), category = profile(row.categoryCode, row.categoryVersion);
  if (!category) throw new Error('Perfil persistido incompatível.');
  return { id: row.id, kind: 'equipment', publicLabel: row.publicLabel, version: row.version,
    organization: { id: row.organizationId, code: row.organizationCode, name: row.organizationName },
    category: { code: category.code, version: category.version, name: category.name },
    serialNumber: row.serialNumber, brand: row.brand, model: row.model, criticality: row.criticality,
    mobility: row.mobility, attributes: parseJson(row.attributesJson), operationalState: row.operationalState,
    registrationLocation: loc.registration!, baseLocation: loc.base ?? null, maintenance: maintenanceView(db, c, id) };
}

export function writeLocation(db: Database.Database, c: Context, id: string, role: string, loc: ObjectJson | null) {
  db.prepare('DELETE FROM resource_location WHERE dataset_id = ? AND epoch = ? AND resource_id = ? AND role = ?').run(c.datasetId, c.epoch, id, role);
  if (!loc) return;
  const regionId = classifyPointInDataset(db, c.datasetId, c.epoch, loc.latitude as number | null, loc.longitude as number | null);
  db.prepare(`INSERT INTO resource_location(dataset_id, epoch, resource_id, role, reference_type, postal_code,
    neighborhood, city, uf, address, reference, latitude, longitude, region_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(c.datasetId, c.epoch, id, role, loc.referenceType, loc.postalCode, loc.neighborhood, loc.city,
      loc.uf, loc.address, loc.reference, loc.latitude, loc.longitude, regionId);
}

function ensureSerial(db: Database.Database, c: Context, serial: Json, except: string | null = null) {
  const duplicate = db.prepare(`SELECT id FROM equipment WHERE dataset_id = ? AND epoch = ? AND serial_normalized = ? AND (? IS NULL OR id != ?)`)
    .get(c.datasetId, c.epoch, serial, except, except);
  if (duplicate) throw new AppError(409, 'SERIAL_CONFLICT', 'Série já cadastrada neste contexto.');
}
export type BaselineEvent = {id:string;revision:number;ordinal:number;baseTime:string;receivedAt:string};
export function event(db: Database.Database, c: Context, id: string, version: number, commandId: string,
  action: string, before: ObjectJson | null, after: ObjectJson, initialReason?: string, baseline?: BaselineEvent) {
  const revision = baseline?.revision ?? c.revision + 1;
  if (!baseline) db.prepare('UPDATE dataset_epoch SET revision = revision + 1 WHERE dataset_id = ? AND epoch = ?').run(c.datasetId, c.epoch);
  const now = new Date().toISOString();
  const changes = Object.keys(after).filter(key => !before || canonicalJson(before[key]!) !== canonicalJson(after[key]!))
    .map(key => ({ fieldPath: key, before: before?.[key] ?? null, after: after[key]! }));
  db.prepare(`INSERT INTO operational_event(dataset_id, epoch, id, resource_id, action, actor_id,
    command_id, resource_version, revision, ordinal, effective_at, recorded_at, received_at, changes_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(c.datasetId, c.epoch, baseline?.id ?? randomUUID(), id, action, c.actorId, commandId, version, revision, baseline?.ordinal ?? 1,
      baseline?.baseTime ?? now, baseline?.baseTime ?? now, baseline?.receivedAt ?? now, canonicalJson({ reason: initialReason ?? (action.endsWith('.create.v1')
        ? 'Cadastro inicial autorizado pelo operador.' : 'Edição cadastral autorizada pelo operador.'),
      evidenceIds: [], changes }));
  return revision;
}
const envelope = (c: Context, equipment: ObjectJson, revision = c.revision) => ({ datasetId: c.datasetId, epoch: c.epoch, revision, equipment });

// Trusted domain application; its caller owns authorization, receipt and transaction.
export function createEquipmentInUnit(db:Database.Database,c:Context,input:ObjectJson,commandId:string,ids?:{resourceId:string;maintenanceId?:string}) {
  if(!db.inTransaction)throw new Error('Cadastro exige unidade de trabalho.');
  const value=inventoryInput({commandId,...input}).body;
      if (value.organizationId !== ORGANIZATION_ID || !db.prepare('SELECT 1 FROM organization WHERE dataset_id = ? AND epoch = ? AND id = ?')
        .get(c.datasetId, c.epoch, value.organizationId)) invalid('Organização não admitida neste contexto.');
      ensureSerial(db, c, value.serialNumber!);
      const id = ids?.resourceId ?? randomUUID(), category = profile(value.categoryCode, value.categoryVersion)!;
      db.prepare(`INSERT INTO resource(dataset_id, epoch, id, kind, organization_id, public_label, version)
        VALUES (?, ?, ?, 'equipment', ?, ?, 1)`).run(c.datasetId, c.epoch, id, value.organizationId, value.serialNumber);
      db.prepare(`INSERT INTO equipment VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(c.datasetId, c.epoch, id, value.categoryCode, value.categoryVersion, value.serialNumber,
          value.brand, value.model, value.criticality, category.mobility, canonicalJson(value.attributes!));
      writeLocation(db, c, id, 'registration', value.registrationLocation as ObjectJson);
      writeLocation(db, c, id, 'base', value.baseLocation as ObjectJson | null);
      db.prepare('INSERT INTO current_state(dataset_id,epoch,resource_id,operational_state,version) VALUES (?,?,?,?,1)').run(c.datasetId,c.epoch,id,value.initialState);
      createInitialRequest(db, c, id, value.initialMaintenance as ObjectJson | null, policy(category.code).initialMaintenance.causeCode, ids?.maintenanceId);
      const view = equipmentView(db, c, id);
  return view;
}

export function createEquipment(auth: Authorization, credentials: Credentials, datasetId: string, epoch: number, input: unknown) {
  const { commandId, body } = inventoryInput(input);
  return executeCommand(auth, credentials, {
    operation: 'inventory.equipment.create.v1', fields: createFields,
    apply(db, c, value) {
      const view = createEquipmentInUnit(db,c,value,commandId);
      const revision = event(db, c, view.id as string, 1, commandId, 'inventory.equipment.create.v1', null, view, value.initialStateReason as string | undefined);
      return { status: 201, body: envelope(c, view, revision), resultingRevision: revision };
    },
  }, { datasetId, epoch, commandId, body });
}

export function updateEquipment(auth: Authorization, credentials: Credentials, datasetId: string, epoch: number, id: string, input: unknown) {
  const { commandId, body } = inventoryInput(input, true);
  return executeCommand(auth, credentials, {
    operation: 'inventory.equipment.update.v1', fields: updateFields,
    apply(db, c, value) {
      const before = equipmentView(db, c, id);
      if (before.version !== value.expectedVersion) throw new AppError(409, 'VERSION_CONFLICT', 'Versão alterada. Consulte o cadastro e revise sua edição.');
      const category = before.category as ObjectJson;
      validateEquipment(value, profile(category.code, category.version)!, before.operationalState as string);
      const changed = Object.keys(value).filter(key => key !== 'expectedVersion').filter(key => {
        const previous = before[key];
        const compare = key.endsWith('Location') && previous ? Object.fromEntries(Object.entries(previous as ObjectJson).filter(([name]) => name !== 'regionId')) : previous;
        return canonicalJson(compare!) !== canonicalJson(value[key]!);
      });
      if (!changed.length) return { status: 200, body: envelope(c, before), resultingRevision: c.revision };
      const merged = { ...before, ...value };
      ensureSerial(db, c, merged.serialNumber!, id);
      const version = (before.version as number) + 1;
      db.prepare('UPDATE resource SET version = ?, public_label = ? WHERE dataset_id = ? AND epoch = ? AND id = ? AND version = ?')
        .run(version, merged.serialNumber, c.datasetId, c.epoch, id, value.expectedVersion);
      db.prepare(`UPDATE equipment SET serial_normalized = ?, brand = ?, model = ?, criticality = ?, attributes_json = ?
        WHERE dataset_id = ? AND epoch = ? AND id = ?`).run(merged.serialNumber, merged.brand, merged.model,
          merged.criticality, canonicalJson(merged.attributes!), c.datasetId, c.epoch, id);
      for (const [key, role] of [['registrationLocation', 'registration'], ['baseLocation', 'base']] as const) {
        if (Object.hasOwn(value, key)) writeLocation(db, c, id, role, value[key] as ObjectJson | null);
      }
      const view = equipmentView(db, c, id);
      const revision = event(db, c, id, version, commandId, 'inventory.equipment.update.v1', before, view);
      return { status: 200, body: envelope(c, view, revision), resultingRevision: revision };
    },
  }, { datasetId, epoch, commandId, target: { type: 'equipment', id }, body });
}
