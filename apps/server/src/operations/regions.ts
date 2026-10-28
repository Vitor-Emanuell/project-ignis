import type Database from 'better-sqlite3';
import type { Authorization, Credentials } from '../auth.js';
import { parseJson } from '../idempotency/json.js';

export type Position = readonly [number, number];
export type LinearRing = readonly Position[];
export type PolygonGeometry = {
  readonly type: 'Polygon';
  readonly coordinates: readonly LinearRing[];
};
export type MultiPolygonGeometry = {
  readonly type: 'MultiPolygon';
  readonly coordinates: readonly (readonly LinearRing[])[];
};
export type RegionGeometry = PolygonGeometry | MultiPolygonGeometry;

export type RegionItem = {
  id: string;
  code: string;
  name: string;
  version: number;
  bbox: [number, number, number, number];
  geometry: RegionGeometry;
};

export const REGION_VERSION = 1;

export const REGIONS: readonly RegionItem[] = [
  {
    id: '10000000-0000-4000-8000-000000000101',
    code: 'REG-CENTRO',
    name: 'Região Centro',
    version: 1,
    bbox: [-46.655, -23.565, -46.64, -23.55],
    geometry: {
      type: 'Polygon',
      coordinates: [[[-46.655, -23.565], [-46.64, -23.565], [-46.64, -23.55], [-46.655, -23.55], [-46.655, -23.565]]],
    },
  },
  {
    id: '10000000-0000-4000-8000-000000000102',
    code: 'REG-LESTE',
    name: 'Região Leste',
    version: 1,
    bbox: [-46.64, -23.565, -46.625, -23.55],
    geometry: {
      type: 'Polygon',
      coordinates: [[[-46.64, -23.565], [-46.625, -23.565], [-46.625, -23.55], [-46.64, -23.55], [-46.64, -23.565]]],
    },
  },
  {
    id: '10000000-0000-4000-8000-000000000103',
    code: 'REG-NORTE',
    name: 'Região Norte',
    version: 1,
    bbox: [-46.64, -23.55, -46.625, -23.535],
    geometry: {
      type: 'Polygon',
      coordinates: [[[-46.64, -23.55], [-46.625, -23.55], [-46.625, -23.535], [-46.64, -23.535], [-46.64, -23.55]]],
    },
  },
  {
    id: '10000000-0000-4000-8000-000000000104',
    code: 'REG-OESTE',
    name: 'Região Oeste',
    version: 1,
    bbox: [-46.655, -23.55, -46.64, -23.535],
    geometry: {
      type: 'Polygon',
      coordinates: [[[-46.655, -23.55], [-46.64, -23.55], [-46.64, -23.535], [-46.655, -23.535], [-46.655, -23.55]]],
    },
  },
  {
    id: '10000000-0000-4000-8000-000000000105',
    code: 'REG-ZONA-EXPANSAO',
    name: 'Zona de Expansão',
    version: 1,
    bbox: [-46.67, -23.565, -46.656, -23.535],
    geometry: {
      type: 'Polygon',
      coordinates: [[[-46.67, -23.565], [-46.656, -23.565], [-46.656, -23.535], [-46.67, -23.535], [-46.67, -23.565]]],
    },
  },
];

const EPS = 1e-12;

export function pointOnSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): boolean {
  if (
    px < Math.min(x1, x2) - EPS ||
    px > Math.max(x1, x2) + EPS ||
    py < Math.min(y1, y2) - EPS ||
    py > Math.max(y1, y2) + EPS
  ) {
    return false;
  }
  const cross = (px - x1) * (y2 - y1) - (py - y1) * (x2 - x1);
  return Math.abs(cross) <= EPS;
}

export function pointInRing(lon: number, lat: number, ring: LinearRing): 'inside' | 'boundary' | 'outside' {
  if (ring.length < 3) return 'outside';
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (pointOnSegment(lon, lat, xi, yi, xj, yj)) {
      return 'boundary';
    }
    const intersects = (yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside ? 'inside' : 'outside';
}

export function pointInPolygon(lon: number, lat: number, geometry: RegionGeometry): boolean {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
  if (geometry.type === 'Polygon') {
    const outer = geometry.coordinates[0];
    if (!outer) return false;
    const outerStatus = pointInRing(lon, lat, outer);
    if (outerStatus === 'outside') return false;
    if (outerStatus === 'boundary') return true;
    for (let k = 1; k < geometry.coordinates.length; k++) {
      const holeStatus = pointInRing(lon, lat, geometry.coordinates[k]!);
      if (holeStatus === 'boundary') return true;
      if (holeStatus === 'inside') return false;
    }
    return true;
  }
  return geometry.coordinates.some(coords => pointInPolygon(lon, lat, { type: 'Polygon', coordinates: coords }));
}

export function classifyPoint(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  regions: readonly Pick<RegionItem, 'id' | 'code' | 'bbox' | 'geometry'>[] = REGIONS,
): string | null {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
    return null;
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  const ordered = [...regions].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const region of ordered) {
    const [minLon, minLat, maxLon, maxLat] = region.bbox;
    if (longitude < minLon || longitude > maxLon || latitude < minLat || latitude > maxLat) {
      continue;
    }
    if (pointInPolygon(longitude, latitude, region.geometry)) {
      return region.id;
    }
  }
  return null;
}

export function classifyPointInDataset(
  db: Database.Database,
  datasetId: string,
  epoch: number,
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): string | null {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
    return null;
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  const candidates = db
    .prepare(
      `SELECT id, code, min_lon AS minLon, min_lat AS minLat, max_lon AS maxLon, max_lat AS maxLat, geometry_json AS geometryJson
       FROM region
       WHERE dataset_id = ? AND epoch = ?
         AND ? >= min_lon AND ? <= max_lon
         AND ? >= min_lat AND ? <= max_lat
       ORDER BY code COLLATE BINARY ASC, id COLLATE BINARY ASC`,
    )
    .all(datasetId, epoch, longitude, longitude, latitude, latitude) as {
    id: string;
    code: string;
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
    geometryJson: string;
  }[];

  for (const row of candidates) {
    const geometry = parseJson(row.geometryJson) as unknown as RegionGeometry;
    if (pointInPolygon(longitude, latitude, geometry)) {
      return row.id;
    }
  }
  return null;
}

export function queryRegionsInTransaction(db: Database.Database, datasetId: string, epoch: number): RegionItem[] {
  const rows = db
    .prepare(
      `SELECT id, code, name, version, min_lon AS minLon, min_lat AS minLat, max_lon AS maxLon, max_lat AS maxLat, geometry_json AS geometryJson
       FROM region
       WHERE dataset_id = ? AND epoch = ?
       ORDER BY code COLLATE BINARY ASC, id COLLATE BINARY ASC`,
    )
    .all(datasetId, epoch) as {
    id: string;
    code: string;
    name: string;
    version: number;
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
    geometryJson: string;
  }[];

  return rows.map(row => ({
    id: row.id,
    code: row.code,
    name: row.name,
    version: row.version,
    bbox: [row.minLon, row.minLat, row.maxLon, row.maxLat],
    geometry: parseJson(row.geometryJson) as unknown as RegionGeometry,
  }));
}

export function listRegions(auth: Authorization, credentials: Credentials, datasetId: string, epoch: number) {
  return auth.store.db
    .transaction(() => {
      const c = auth.context(credentials, datasetId, epoch);
      const items = queryRegionsInTransaction(auth.store.db, c.datasetId, c.epoch);
      return {
        datasetId: c.datasetId,
        epoch: c.epoch,
        revision: c.revision,
        regionVersion: REGION_VERSION,
        items,
      };
    })
    .deferred();
}
