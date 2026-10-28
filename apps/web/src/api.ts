export type Context = { datasetId: string; epoch: number; revision: number };
export type Location = {
  referenceType: string; postalCode: string; neighborhood: string; city: string; uf: string;
  address: string; reference: string; latitude: number | null; longitude: number | null; regionId?: string | null;
};
export type Equipment = {
  id: string; kind: 'equipment'; publicLabel: string; version: number; serialNumber: string; brand: string;
  model: string; criticality: number; mobility: string; attributes: Record<string, number | string>;
  category: { code: string; version: number; name: string }; organization: { id: string; code: string; name: string };
  registrationLocation: Location; baseLocation: Location | null; operationalState: string;
  maintenance: { requests: { id: string; reason: string; priority: string }[];
    nextMaintenance: { status: string; date: string | null; reason: string | null } };
};
export type Agent = {
  id:string;kind:'agent';publicLabel:string;version:number;enrollmentNumber:string;fictitiousName:string;function:string;activity:string;
  organization:{id:string;code:string;name:string};registrationLocation:Location;baseLocation:Location|null;
};
export type Resource = Equipment | Agent;
export type Attribute = {type:'integer'|'number'|'string';unit:string|null;minimum?:number;exclusiveMinimum?:number;maximum?:number;enum?:string[];required:boolean;nullable:boolean;demonstrationOnly:boolean};
export type CategoryProfile = {code:string;version:number;name:string;mobility:'fixed'|'mobile';attributes:Record<string,Attribute>};
export type Catalog = Context & {categories:CategoryProfile[];organizations:{id:string;code:string;name:string}[];
  categoryPolicies:{code:string;version:number;allowedInitialStates:string[];initialMaintenance:{supported:boolean;causeCode:string}}[]};
export type List = Context & {page:number;pageSize:number;total:number;items:Resource[]};
export type Detail = Context & ({equipment:Equipment}|{agent:Agent});
export type RegionGeometry =
  | { type: 'Polygon'; coordinates: [number, number][][] }
  | { type: 'MultiPolygon'; coordinates: [number, number][][][] };
export type RegionItem = {
  id: string;
  code: string;
  name: string;
  version: number;
  bbox: [number, number, number, number];
  geometry: RegionGeometry;
};
export type RegionsResponse = Context & {
  regionVersion: number;
  items: RegionItem[];
};
export type SnapshotFilters = {
  kind: ('equipment' | 'agent')[];
  categoryCode: string[];
  operationalState: string[];
  activity: string[];
  criticality: number[];
  regionId: string[];
  bbox: [number, number, number, number] | null;
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
  byCommunication: Record<'not_applicable' | 'unknown' | 'fresh' | 'stale', number>;
  byCriticality: Record<'1' | '2' | '3' | '4' | '5', number>;
};
export type RegionSummaryItem = AvailabilityMetrics & {
  regionId: string | null;
  code: string;
  name: string;
};
export type SnapshotResource = {
  id: string;
  kind: 'equipment' | 'agent';
  publicLabel: string;
  version: number;
  organization: { id: string; code: string; name: string };
  category: { code: string; version: number; name: string } | null;
  serialNumber: string | null;
  brand: string | null;
  model: string | null;
  criticality: number | null;
  mobility: 'fixed' | 'mobile' | null;
  operationalState: string | null;
  communication: 'not_applicable' | 'unknown' | 'fresh' | 'stale' | null;
  enrollmentNumber: string | null;
  fictitiousName: string | null;
  function: string | null;
  activity: string | null;
  regionId: string | null;
  regionCode: string | null;
  regionName: string | null;
  positionKind: 'observed' | 'installation' | 'base' | 'institutional' | 'none';
  latitude: number | null;
  longitude: number | null;
  positionObservedAt: string | null;
  registrationLocation: Location;
  baseLocation: Location | null;
};
export type OperationsSnapshot = Context & {
  dataNow: string | null;
  regionVersion: number;
  truncated: boolean;
  totalFiltered: number;
  maxResources: number;
  appliedFilters: SnapshotFilters;
  indicators: SnapshotIndicators;
  regionSummary: RegionSummaryItem[];
  resources: SnapshotResource[];
};
export function buildSnapshotQuery(filters: Partial<SnapshotFilters>): string {
  const params = new URLSearchParams();
  if (filters.kind?.length) params.set('kind', filters.kind.join(','));
  if (filters.categoryCode?.length) params.set('categoryCode', filters.categoryCode.join(','));
  if (filters.operationalState?.length) params.set('operationalState', filters.operationalState.join(','));
  if (filters.activity?.length) params.set('activity', filters.activity.join(','));
  if (filters.criticality?.length) params.set('criticality', filters.criticality.join(','));
  if (filters.regionId?.length) params.set('regionId', filters.regionId.join(','));
  if (filters.bbox) params.set('bbox', filters.bbox.join(','));
  const query = params.toString();
  return query ? `?${query}` : '';
}
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly requestId?: string) { super(message); }
}
export async function request<T>(path: string, method = 'GET', body?: unknown, csrf?: string): Promise<{ data: T; replayed: boolean }> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(path, { method, credentials: 'same-origin', signal: controller.signal,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { code?: string; message?: string; requestId?: string };
      throw new ApiError(response.status, error.code ?? 'HTTP_ERROR', error.message ?? 'Não foi possível concluir a solicitação.', error.requestId);
    }
    return { data: response.status === 204 ? undefined as T : await response.json() as T,
      replayed: response.headers.get('Idempotency-Replayed') === 'true' };
  } finally { clearTimeout(timer); }
}
export function configuredDataset(value: unknown): string | null {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : null;
}
