import type Database from 'better-sqlite3';
import type { Authorization, Credentials } from '../auth.js';
import { AppError } from '../errors.js';
import { CATEGORIES, profile } from '../inventory/catalog.js';
import type { ObjectJson } from '../inventory/contract.js';
import { queryRegionsInTransaction, REGION_VERSION } from './regions.js';

export const SNAPSHOT_MAX_RESOURCES = 500;
const STATES = ['not_installed', 'operational', 'malfunction', 'maintenance', 'disabled', 'stolen'] as const;
const ACTIVITIES = ['available', 'assigned', 'off_duty', 'unknown'] as const;

export type CommunicationState = 'not_applicable' | 'unknown' | 'fresh' | 'stale';
export type PositionKind = 'observed' | 'installation' | 'base' | 'institutional' | 'none';

export type SnapshotFilters = {
  kind: ('equipment' | 'agent')[];
  categoryCode: string[];
  operationalState: string[];
  activity: string[];
  criticality: number[];
  regionId: string[];
  bbox: [number, number, number, number] | null;
};

export type AvailabilityGroupInput = {
  kind: 'equipment' | 'agent';
  operationalState: string | null;
  communication: CommunicationState | null;
  activity?: string | null;
  criticality?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type AvailabilityMetrics = {
  totalResources: number;
  equipmentCount: number;
  agentCount: number;
  locatedCount: number;
  unlocatedCount: number;
  operationalCount: number;
  communicationUnknownCount: number;
  communicationStaleCount: number;
  eligibleEquipment: number;
  availableEquipment: number;
  availability: number | null;
  reason: 'no_eligible_equipment' | null;
};

export type SnapshotIndicators = AvailabilityMetrics & {
  byOperationalState: Record<string, number>;
  byActivity: Record<string, number>;
  byCommunication: Record<CommunicationState, number>;
  byCriticality: Record<'1' | '2' | '3' | '4' | '5', number>;
};

export type RegionSummaryItem = AvailabilityMetrics & {
  regionId: string | null;
  code: string;
  name: string;
};

const VALID_KINDS = new Set(['equipment', 'agent']);
const VALID_CATEGORIES = new Set(CATEGORIES.map(c => c.code));
const VALID_STATES = new Set<string>(STATES);
const VALID_ACTIVITIES = new Set<string>(ACTIVITIES);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_QUERY_KEYS = new Set([
  'kind',
  'categoryCode',
  'operationalState',
  'activity',
  'criticality',
  'regionId',
  'bbox',
]);

function badRequest(message = 'Parâmetros de consulta inválidos.'): never {
  throw new AppError(400, 'INVALID_REQUEST', message);
}

function invalidValue(message = 'Filtro de consulta fora do domínio permitido.'): never {
  throw new AppError(422, 'INVALID_VALUE', message);
}

function extractTokens(raw: unknown): string[] {
  if (raw === undefined) return [];
  const items = Array.isArray(raw) ? raw : [raw];
  const tokens: string[] = [];
  for (const item of items) {
    if (typeof item !== 'string' || item.trim() === '') badRequest();
    for (const part of item.split(',')) {
      const trimmed = part.trim();
      if (!trimmed) badRequest();
      if (!tokens.includes(trimmed)) tokens.push(trimmed);
    }
  }
  return tokens;
}

export function parseSnapshotQuery(rawUrl: string): SnapshotFilters {
  const qIndex = rawUrl.indexOf('?');
  const search = qIndex >= 0 ? rawUrl.slice(qIndex + 1) : '';
  const params = new URLSearchParams(search);
  for (const key of params.keys()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) badRequest(`Parâmetro de consulta não admitido: ${key}.`);
  }

  const kindTokens = extractTokens(params.getAll('kind'));
  for (const k of kindTokens) {
    if (!VALID_KINDS.has(k)) invalidValue(`Kind inválido: ${k}.`);
  }

  const categoryTokens = extractTokens(params.getAll('categoryCode'));
  for (const code of categoryTokens) {
    if (!VALID_CATEGORIES.has(code)) invalidValue(`Categoria inválida: ${code}.`);
  }

  const stateTokens = extractTokens(params.getAll('operationalState'));
  for (const state of stateTokens) {
    if (!VALID_STATES.has(state)) invalidValue(`Estado operacional inválido: ${state}.`);
  }

  const activityTokens = extractTokens(params.getAll('activity'));
  for (const act of activityTokens) {
    if (!VALID_ACTIVITIES.has(act)) invalidValue(`Atividade inválida: ${act}.`);
  }

  const criticalityTokens = extractTokens(params.getAll('criticality'));
  const criticality: number[] = [];
  for (const token of criticalityTokens) {
    if (!/^-?\d+$/.test(token)) badRequest('Criticidade deve ser inteiro.');
    const num = Number(token);
    if (!Number.isSafeInteger(num) || num < 1 || num > 5) invalidValue('Criticidade deve estar entre 1 e 5.');
    if (!criticality.includes(num)) criticality.push(num);
  }

  const regionTokens = extractTokens(params.getAll('regionId'));
  const regionId: string[] = [];
  for (const token of regionTokens) {
    if (token === 'unassigned') {
      if (!regionId.includes('unassigned')) regionId.push('unassigned');
    } else if (UUID_RE.test(token)) {
      const normalized = token.toLowerCase();
      if (!regionId.includes(normalized)) regionId.push(normalized);
    } else {
      invalidValue(`Identificador de região inválido: ${token}.`);
    }
  }

  const bboxValues = params.getAll('bbox');
  if (bboxValues.length > 1) badRequest('Parâmetro bbox não pode ser repetido.');
  let bbox: [number, number, number, number] | null = null;
  if (bboxValues.length === 1) {
    const rawBbox = bboxValues[0]!;
    if (rawBbox.trim() === '') badRequest('Parâmetro bbox vazio.');
    const parts = rawBbox.split(',').map(s => s.trim());
    if (parts.length !== 4 || parts.some(p => p === '' || !/^-?\d+(?:\.\d+)?$/.test(p))) {
      badRequest('Parâmetro bbox exige 4 coordenadas numéricas: minLon,minLat,maxLon,maxLat.');
    }
    const [minLon, minLat, maxLon, maxLat] = parts.map(Number) as [number, number, number, number];
    if (
      !Number.isFinite(minLon) ||
      !Number.isFinite(minLat) ||
      !Number.isFinite(maxLon) ||
      !Number.isFinite(maxLat) ||
      minLon < -180 ||
      minLon > 180 ||
      maxLon < -180 ||
      maxLon > 180 ||
      minLat < -90 ||
      minLat > 90 ||
      maxLat < -90 ||
      maxLat > 90 ||
      minLon > maxLon ||
      minLat > maxLat
    ) {
      invalidValue('Limites de bbox inválidos.');
    }
    bbox = [minLon, minLat, maxLon, maxLat];
  }

  return {
    kind: kindTokens as ('equipment' | 'agent')[],
    categoryCode: categoryTokens,
    operationalState: stateTokens,
    activity: activityTokens,
    criticality,
    regionId,
    bbox,
  };
}

export function computeAvailabilityMetrics(items: readonly AvailabilityGroupInput[]): AvailabilityMetrics {
  let totalResources = 0;
  let equipmentCount = 0;
  let agentCount = 0;
  let locatedCount = 0;
  let unlocatedCount = 0;
  let operationalCount = 0;
  let communicationUnknownCount = 0;
  let communicationStaleCount = 0;
  let eligibleEquipment = 0;
  let availableEquipment = 0;

  for (const item of items) {
    totalResources++;
    const hasCoords = item.latitude !== null && item.latitude !== undefined && item.longitude !== null && item.longitude !== undefined;
    if (hasCoords) locatedCount++;
    else unlocatedCount++;

    if (item.kind === 'agent') {
      agentCount++;
      continue;
    }

    equipmentCount++;
    const state = item.operationalState;
    const comm = item.communication ?? 'unknown';
    if (comm === 'unknown') communicationUnknownCount++;
    else if (comm === 'stale') communicationStaleCount++;

    if (state === 'operational') {
      operationalCount++;
    }
    if (state === 'operational' || state === 'malfunction' || state === 'maintenance') {
      eligibleEquipment++;
      if (state === 'operational' && (comm === 'fresh' || comm === 'not_applicable')) {
        availableEquipment++;
      }
    }
  }

  if (eligibleEquipment === 0) {
    return {
      totalResources,
      equipmentCount,
      agentCount,
      locatedCount,
      unlocatedCount,
      operationalCount,
      communicationUnknownCount,
      communicationStaleCount,
      eligibleEquipment: 0,
      availableEquipment: 0,
      availability: null,
      reason: 'no_eligible_equipment',
    };
  }

  const availability = Math.round((10000 * availableEquipment) / eligibleEquipment) / 100;
  return {
    totalResources,
    equipmentCount,
    agentCount,
    locatedCount,
    unlocatedCount,
    operationalCount,
    communicationUnknownCount,
    communicationStaleCount,
    eligibleEquipment,
    availableEquipment,
    availability,
    reason: null,
  };
}

export function computeSnapshotIndicators(items: readonly AvailabilityGroupInput[]): SnapshotIndicators {
  const base = computeAvailabilityMetrics(items);
  const byOperationalState: Record<string, number> = {
    not_installed: 0,
    operational: 0,
    malfunction: 0,
    maintenance: 0,
    disabled: 0,
    stolen: 0,
  };
  const byActivity: Record<string, number> = {
    available: 0,
    assigned: 0,
    off_duty: 0,
    unknown: 0,
  };
  const byCommunication: Record<CommunicationState, number> = {
    not_applicable: 0,
    unknown: 0,
    fresh: 0,
    stale: 0,
  };
  const byCriticality: Record<'1' | '2' | '3' | '4' | '5', number> = {
    '1': 0,
    '2': 0,
    '3': 0,
    '4': 0,
    '5': 0,
  };

  for (const item of items) {
    if (item.kind === 'equipment') {
      if (item.operationalState && Object.hasOwn(byOperationalState, item.operationalState)) {
        byOperationalState[item.operationalState]!++;
      }
      const comm: CommunicationState = item.communication ?? 'unknown';
      byCommunication[comm]++;
      if (item.criticality && item.criticality >= 1 && item.criticality <= 5) {
        const key = String(item.criticality) as '1' | '2' | '3' | '4' | '5';
        byCriticality[key]++;
      }
    } else {
      if (item.activity && Object.hasOwn(byActivity, item.activity)) {
        byActivity[item.activity]!++;
      }
    }
  }

  return {
    ...base,
    byOperationalState,
    byActivity,
    byCommunication,
    byCriticality,
  };
}

type RawResourceRow = {
  id: string;
  kind: 'equipment' | 'agent';
  publicLabel: string;
  version: number;
  organizationId: string;
  organizationCode: string;
  organizationName: string;
  categoryCode: string | null;
  categoryVersion: number | null;
  serialNumber: string | null;
  brand: string | null;
  model: string | null;
  criticality: number | null;
  mobility: 'fixed' | 'mobile' | null;
  operationalState: string | null;
  communicationState: CommunicationState | null;
  enrollmentNumber: string | null;
  fictitiousName: string | null;
  agentFunction: string | null;
  activity: string | null;
};

type RawLocationRow = {
  resourceId: string;
  role: 'registration' | 'base';
  referenceType: 'base' | 'installation' | 'institutional';
  postalCode: string;
  neighborhood: string;
  city: string;
  uf: string;
  address: string;
  reference: string;
  latitude: number | null;
  longitude: number | null;
  regionId: string | null;
};

export function readOperationsSnapshot(
  auth: Authorization,
  credentials: Credentials,
  datasetId: string,
  epoch: number,
  rawUrl: string,
) {
  const filters = parseSnapshotQuery(rawUrl);

  return auth.store.db
    .transaction(() => {
      const c = auth.context(credentials, datasetId, epoch);
      const db = auth.store.db;

      const regions = queryRegionsInTransaction(db, c.datasetId, c.epoch);
      const regionMap = new Map(regions.map(r => [r.id, r]));

      const dataNowRow = db
        .prepare('SELECT max(effective_at) AS dataNow FROM operational_event WHERE dataset_id = ? AND epoch = ?')
        .get(c.datasetId, c.epoch) as { dataNow: string | null } | undefined;
      const dataNow = dataNowRow?.dataNow ?? null;

      const rows = db
        .prepare(
          `SELECT
             r.id,
             r.kind,
             r.public_label AS publicLabel,
             r.version,
             o.id AS organizationId,
             o.code AS organizationCode,
             o.name AS organizationName,
             e.category_code AS categoryCode,
             e.category_version AS categoryVersion,
             e.serial_normalized AS serialNumber,
             e.brand,
             e.model,
             e.criticality,
             e.mobility,
             s.operational_state AS operationalState,
             s.communication_state AS communicationState,
             a.enrollment_normalized AS enrollmentNumber,
             a.fictitious_name AS fictitiousName,
             a.function AS agentFunction,
             s.activity
           FROM resource r
           JOIN organization o ON o.dataset_id = r.dataset_id AND o.epoch = r.epoch AND o.id = r.organization_id
           JOIN current_state s ON s.dataset_id = r.dataset_id AND s.epoch = r.epoch AND s.resource_id = r.id
           LEFT JOIN equipment e ON e.dataset_id = r.dataset_id AND e.epoch = r.epoch AND e.id = r.id
           LEFT JOIN agent a ON a.dataset_id = r.dataset_id AND a.epoch = r.epoch AND a.id = r.id
           WHERE r.dataset_id = ? AND r.epoch = ? AND r.archived = 0
           ORDER BY r.public_label COLLATE BINARY ASC, r.id COLLATE BINARY ASC`,
        )
        .all(c.datasetId, c.epoch) as RawResourceRow[];

      const locationRows = db
        .prepare(
          `SELECT
             resource_id AS resourceId,
             role,
             reference_type AS referenceType,
             postal_code AS postalCode,
             neighborhood,
             city,
             uf,
             address,
             reference,
             latitude,
             longitude,
             region_id AS regionId
           FROM resource_location
           WHERE dataset_id = ? AND epoch = ?`,
        )
        .all(c.datasetId, c.epoch) as RawLocationRow[];

      const locByResource = new Map<string, { registration?: ObjectJson; base?: ObjectJson }>();
      for (const loc of locationRows) {
        const entry = locByResource.get(loc.resourceId) ?? {};
        const view: ObjectJson = {
          referenceType: loc.referenceType,
          postalCode: loc.postalCode,
          neighborhood: loc.neighborhood,
          city: loc.city,
          uf: loc.uf,
          address: loc.address,
          reference: loc.reference,
          latitude: loc.latitude,
          longitude: loc.longitude,
          regionId: loc.regionId,
        };
        if (loc.role === 'registration') entry.registration = view;
        else entry.base = view;
        locByResource.set(loc.resourceId, entry);
      }

      const kindSet = filters.kind.length ? new Set(filters.kind) : null;
      const categorySet = filters.categoryCode.length ? new Set(filters.categoryCode) : null;
      const stateSet = filters.operationalState.length ? new Set(filters.operationalState) : null;
      const activitySet = filters.activity.length ? new Set(filters.activity) : null;
      const criticalitySet = filters.criticality.length ? new Set(filters.criticality) : null;
      const regionSet = filters.regionId.length ? new Set(filters.regionId) : null;
      const bbox = filters.bbox;

      const filtered = [];
      for (const row of rows) {
        const locs = locByResource.get(row.id);
        const regLoc = locs?.registration!;
        const baseLoc = locs?.base ?? null;

        let latitude: number | null = null;
        let longitude: number | null = null;
        let positionKind: PositionKind = 'none';
        let effectiveRegionId: string | null = null;

        if (regLoc && regLoc.latitude !== null && regLoc.longitude !== null) {
          latitude = regLoc.latitude as number;
          longitude = regLoc.longitude as number;
          positionKind = regLoc.referenceType as PositionKind;
          effectiveRegionId = (regLoc.regionId as string | null) ?? null;
        } else if (baseLoc && baseLoc.latitude !== null && baseLoc.longitude !== null) {
          latitude = baseLoc.latitude as number;
          longitude = baseLoc.longitude as number;
          positionKind = 'base';
          effectiveRegionId = (baseLoc.regionId as string | null) ?? null;
        }

        // Combined filters R05: AND between fields, OR between values of the same field.
        if (kindSet && !kindSet.has(row.kind)) continue;
        if (categorySet && (row.kind !== 'equipment' || !row.categoryCode || !categorySet.has(row.categoryCode))) continue;
        if (stateSet && (row.kind !== 'equipment' || !row.operationalState || !stateSet.has(row.operationalState))) continue;
        if (activitySet && (row.kind !== 'agent' || !row.activity || !activitySet.has(row.activity))) continue;
        if (criticalitySet && (row.kind !== 'equipment' || row.criticality === null || !criticalitySet.has(row.criticality))) continue;
        if (regionSet) {
          const regionKey = effectiveRegionId ?? 'unassigned';
          if (!regionSet.has(regionKey)) continue;
        }
        if (bbox) {
          if (latitude === null || longitude === null) continue;
          const [minLon, minLat, maxLon, maxLat] = bbox;
          if (longitude < minLon || longitude > maxLon || latitude < minLat || latitude > maxLat) continue;
        }

        const categoryProfile = row.kind === 'equipment' && row.categoryCode && row.categoryVersion
          ? profile(row.categoryCode, row.categoryVersion)
          : null;
        const communication: CommunicationState | null = row.kind === 'equipment'
          ? (row.communicationState ?? 'unknown')
          : null;
        const regionInfo = effectiveRegionId ? regionMap.get(effectiveRegionId) ?? null : null;

        filtered.push({
          id: row.id,
          kind: row.kind,
          publicLabel: row.publicLabel,
          version: row.version,
          organization: {
            id: row.organizationId,
            code: row.organizationCode,
            name: row.organizationName,
          },
          category: categoryProfile
            ? { code: categoryProfile.code, version: categoryProfile.version, name: categoryProfile.name }
            : null,
          serialNumber: row.serialNumber,
          brand: row.brand,
          model: row.model,
          criticality: row.criticality,
          mobility: row.mobility,
          operationalState: row.operationalState,
          communication,
          enrollmentNumber: row.enrollmentNumber,
          fictitiousName: row.fictitiousName,
          function: row.agentFunction,
          activity: row.activity,
          regionId: effectiveRegionId,
          regionCode: regionInfo?.code ?? null,
          regionName: regionInfo?.name ?? null,
          positionKind,
          latitude,
          longitude,
          positionObservedAt: null,
          registrationLocation: regLoc,
          baseLocation: baseLoc,
        });
      }

      const indicators = computeSnapshotIndicators(filtered);

      const itemsByRegion = new Map<string | null, typeof filtered>();
      for (const r of regions) itemsByRegion.set(r.id, []);
      itemsByRegion.set(null, []);
      for (const item of filtered) {
        const bucket = itemsByRegion.get(item.regionId) ?? itemsByRegion.get(null)!;
        bucket.push(item);
      }

      const regionSummary: RegionSummaryItem[] = [
        ...regions.map(r => ({
          regionId: r.id,
          code: r.code,
          name: r.name,
          ...computeAvailabilityMetrics(itemsByRegion.get(r.id) ?? []),
        })),
        {
          regionId: null,
          code: 'UNASSIGNED',
          name: 'Sem região atribuída',
          ...computeAvailabilityMetrics(itemsByRegion.get(null) ?? []),
        },
      ];

      const totalFiltered = filtered.length;
      const truncated = totalFiltered > SNAPSHOT_MAX_RESOURCES;
      const resources = truncated ? filtered.slice(0, SNAPSHOT_MAX_RESOURCES) : filtered;

      return {
        datasetId: c.datasetId,
        epoch: c.epoch,
        revision: c.revision,
        dataNow,
        regionVersion: REGION_VERSION,
        truncated,
        totalFiltered,
        maxResources: SNAPSHOT_MAX_RESOURCES,
        appliedFilters: filters,
        indicators,
        regionSummary,
        resources,
      };
    })
    .deferred();
}
