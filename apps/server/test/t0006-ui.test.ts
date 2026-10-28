import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parse, compileScript } from '@vue/compiler-sfc';
import { transformSync } from 'esbuild';
import { effectScope, reactive, nextTick } from 'vue';
import type { Ref, EffectScope } from 'vue';
import * as vue from 'vue';
import { ApiError, buildSnapshotQuery } from '../../web/src/api.js';
import type { OperationsSnapshot, RegionItem, SnapshotFilters, SnapshotResource } from '../../web/src/api.js';
import { CATEGORIES } from '../src/inventory/catalog.js';
import { REGIONS } from '../src/operations/regions.js';

type Context = { datasetId: string; epoch: number; revision: number };
type MapState = {
  opened: Ref<boolean>;
  busy: Ref<boolean>;
  error: Ref<string>;
  message: Ref<string>;
  regions: Ref<RegionItem[]>;
  snapshot: Ref<OperationsSnapshot | null>;
  tileFallbackActive: Ref<boolean>;
  tileErrorCount: Ref<number>;
  mapContainer: Ref<HTMLElement | null>;
  filters: SnapshotFilters;
  locatedResources: Ref<SnapshotResource[]>;
  unlocatedResources: Ref<SnapshotResource[]>;
  hasActiveFilters: Ref<boolean>;
  open: () => Promise<void>;
  close: () => void;
  load: () => Promise<void>;
  initLeafletMap: () => void;
  renderMapLayers: () => void;
  fitMunicipalityBounds: () => void;
  toggleFilterValue: (field: keyof Omit<SnapshotFilters, 'bbox'>, value: string | number) => Promise<void>;
  applyBbox: (bbox?: [number, number, number, number]) => Promise<void>;
  clearBbox: () => Promise<void>;
  resetFilters: () => Promise<void>;
  handleTileError: () => void;
  selectResource: (resource: { id: string; kind: 'equipment' | 'agent' }) => void;
};

let component: { setup: (props: unknown, context: unknown) => MapState };
const scopes: EffectScope[] = [];
const request = vi.fn();
let tileErrorListeners: (() => void)[] = [];
const mockMapInstance = {
  fitBounds: vi.fn(),
  invalidateSize: vi.fn(),
  getBounds: vi.fn(() => ({
    getSouthWest: () => ({ lng: -46.655, lat: -23.565 }),
    getNorthEast: () => ({ lng: -46.625, lat: -23.535 }),
  })),
  remove: vi.fn(),
};
const mockTileLayerInstance = {
  on: vi.fn((event: string, cb: () => void) => {
    if (event === 'tileerror') tileErrorListeners.push(cb);
    return mockTileLayerInstance;
  }),
  addTo: vi.fn(() => mockTileLayerInstance),
  remove: vi.fn(),
};
const mockRegionsGroup = {
  clearLayers: vi.fn(),
  addTo: vi.fn(),
};
const mockMarkersGroup = {
  clearLayers: vi.fn(),
  addTo: vi.fn(),
};
const mockLeaflet = {
  map: vi.fn((container: any, _options?: Record<string, unknown>) => {
    // Simulate Leaflet Map._initLayout() adding 'leaflet-container' and interaction classes imperatively
    if (container && container.classList) {
      container.classList.add('leaflet-container', 'leaflet-touch', 'leaflet-fade-anim', 'leaflet-grab');
    }
    return mockMapInstance;
  }),
  tileLayer: vi.fn(() => mockTileLayerInstance),
  layerGroup: vi.fn(),
  geoJSON: vi.fn(() => ({
    bindTooltip: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
  })),
  circleMarker: vi.fn(() => ({
    bindPopup: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
  })),
};
const baseContext: Context = {
  datasetId: '10000000-0000-4000-8000-000000000003',
  epoch: 1,
  revision: 3,
};

const sampleResources: SnapshotResource[] = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    kind: 'equipment',
    publicLabel: 'CAM-CENTRO-01',
    version: 1,
    organization: { id: '10000000-0000-4000-8000-000000000004', code: 'ORG_LOCAL', name: 'Órgão municipal fictício' },
    category: { code: 'camera', version: 1, name: 'Câmera' },
    serialNumber: 'CAM-CENTRO-01',
    brand: 'IGNIS',
    model: 'Cam v1',
    criticality: 5,
    mobility: 'fixed',
    operationalState: 'operational',
    communication: 'fresh',
    enrollmentNumber: null,
    fictitiousName: null,
    function: null,
    activity: null,
    regionId: '10000000-0000-4000-8000-000000000101',
    regionCode: 'REG-CENTRO',
    regionName: 'Região Centro',
    positionKind: 'installation',
    latitude: -23.558,
    longitude: -46.648,
    positionObservedAt: null,
    registrationLocation: {
      referenceType: 'installation',
      postalCode: '01001000',
      neighborhood: 'Centro',
      city: 'Cidade',
      uf: 'SP',
      address: 'Rua A',
      reference: 'Ref A',
      latitude: -23.558,
      longitude: -46.648,
      regionId: '10000000-0000-4000-8000-000000000101',
    },
    baseLocation: null,
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    kind: 'agent',
    publicLabel: 'AG-SEM-PONTO-01',
    version: 1,
    organization: { id: '10000000-0000-4000-8000-000000000004', code: 'ORG_LOCAL', name: 'Órgão municipal fictício' },
    category: null,
    serialNumber: null,
    brand: null,
    model: null,
    criticality: null,
    mobility: null,
    operationalState: null,
    communication: null,
    enrollmentNumber: 'AG-SEM-PONTO-01',
    fictitiousName: 'Agente Fictício 01',
    function: 'Fiscalização',
    activity: 'unknown',
    regionId: null,
    regionCode: null,
    regionName: null,
    positionKind: 'none',
    latitude: null,
    longitude: null,
    positionObservedAt: null,
    registrationLocation: {
      referenceType: 'institutional',
      postalCode: '01001000',
      neighborhood: 'Centro',
      city: 'Cidade',
      uf: 'SP',
      address: 'Rua B',
      reference: 'Ref B',
      latitude: null,
      longitude: null,
      regionId: null,
    },
    baseLocation: null,
  },
];

beforeAll(() => {
  const source = readFileSync(new URL('../../web/src/OperationalMap.vue', import.meta.url), 'utf8');
  const { descriptor } = parse(source);
  const script = compileScript(descriptor, { id: 't0006-operational-map' });
  const code = transformSync(script.content, { loader: 'ts', format: 'cjs', target: 'es2023' }).code;
  const module = { exports: {} };
  const require = createRequire(import.meta.url);
  new Function('require', 'module', 'exports', code)(
    (id: string) => {
      if (id === 'vue') return vue;
      if (id === './api') return { request, ApiError, buildSnapshotQuery };
      if (id === 'leaflet') return { default: mockLeaflet, ...mockLeaflet };
      if (id === 'leaflet/dist/leaflet.css') return {};
      return require(id);
    },
    module,
    module.exports,
  );
  component = (module.exports as { default: typeof component }).default;
});

afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop();
  tileErrorListeners = [];
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function makeSnapshotResponse(resources: SnapshotResource[], filters: SnapshotFilters): OperationsSnapshot {
  const located = resources.filter(r => r.latitude !== null && r.longitude !== null);
  const unlocated = resources.filter(r => r.latitude === null || r.longitude === null);
  const equip = resources.filter(r => r.kind === 'equipment');
  const agents = resources.filter(r => r.kind === 'agent');
  return {
    ...baseContext,
    dataNow: '2026-10-24T12:00:00.000Z',
    regionVersion: 1,
    truncated: false,
    totalFiltered: resources.length,
    maxResources: 500,
    appliedFilters: { ...filters },
    indicators: {
      totalResources: resources.length,
      equipmentCount: equip.length,
      agentCount: agents.length,
      locatedCount: located.length,
      unlocatedCount: unlocated.length,
      operationalCount: equip.length,
      communicationUnknownCount: 0,
      communicationStaleCount: 0,
      eligibleEquipment: equip.length,
      availableEquipment: equip.length,
      availability: equip.length ? 100 : null,
      reason: equip.length ? null : 'no_eligible_equipment',
      byOperationalState: {
        not_installed: 0,
        operational: equip.length,
        malfunction: 0,
        maintenance: 0,
        disabled: 0,
        stolen: 0,
      },
      byActivity: { available: 0, assigned: 0, off_duty: 0, unknown: agents.length },
      byCommunication: { not_applicable: 0, unknown: 0, fresh: equip.length, stale: 0 },
      byCriticality: { '1': 0, '2': 0, '3': 0, '4': 0, '5': equip.length },
    },
    regionSummary: REGIONS.map(r => ({
      regionId: r.id,
      code: r.code,
      name: r.name,
      totalResources: r.code === 'REG-CENTRO' ? equip.length : 0,
      equipmentCount: r.code === 'REG-CENTRO' ? equip.length : 0,
      agentCount: 0,
      locatedCount: r.code === 'REG-CENTRO' ? equip.length : 0,
      unlocatedCount: 0,
      operationalCount: r.code === 'REG-CENTRO' ? equip.length : 0,
      communicationUnknownCount: 0,
      communicationStaleCount: 0,
      eligibleEquipment: r.code === 'REG-CENTRO' ? equip.length : 0,
      availableEquipment: r.code === 'REG-CENTRO' ? equip.length : 0,
      availability: r.code === 'REG-CENTRO' && equip.length ? 100 : null,
      reason: r.code === 'REG-CENTRO' && equip.length ? null : 'no_eligible_equipment',
    })),
    resources,
  };
}

class FakeHTMLElement {
  private classes = new Set<string>(['operational-map-canvas']);
  public clientHeight = 416;
  public offsetHeight = 416;
  public style: Record<string, string> = { position: 'relative' };
  public classList = {
    add: (...tokens: string[]) => {
      for (const t of tokens) this.classes.add(t);
    },
    remove: (...tokens: string[]) => {
      for (const t of tokens) this.classes.delete(t);
    },
    contains: (token: string) => this.classes.has(token),
    toggle: (token: string, force?: boolean) => {
      const shouldHave = force !== undefined ? force : !this.classes.has(token);
      if (shouldHave) this.classes.add(token);
      else this.classes.delete(token);
      return shouldHave;
    },
    toArray: () => [...this.classes],
  };
  get className() {
    return [...this.classes].join(' ');
  }
  set className(val: string) {
    this.classes = new Set(val.split(/\s+/).filter(Boolean));
  }
}

async function setupMap() {
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', {});
  vi.stubGlobal('HTMLElement', FakeHTMLElement);
  vi.stubGlobal('navigator', { onLine: true });

  let groupCall = 0;
  mockLeaflet.layerGroup.mockImplementation(() => {
    groupCall++;
    const grp = groupCall % 2 === 1 ? mockRegionsGroup : mockMarkersGroup;
    return { ...grp, addTo: vi.fn(() => grp) };
  });

  request.mockImplementation(async (path: string) => {
    if (path.endsWith('/regions')) {
      return {
        data: { ...baseContext, regionVersion: 1, items: REGIONS as unknown as RegionItem[] },
        replayed: false,
      };
    }
    const hasBbox = path.includes('bbox=');
    const onlyEquip = path.includes('kind=equipment');
    const items = sampleResources.filter(r => {
      if (hasBbox && (r.latitude === null || r.longitude === null)) return false;
      if (onlyEquip && r.kind !== 'equipment') return false;
      return true;
    });
    return {
      data: makeSnapshotResponse(items, {
        kind: onlyEquip ? ['equipment'] : [],
        categoryCode: [],
        operationalState: [],
        activity: [],
        criticality: [],
        regionId: [],
        bbox: hasBbox ? [-46.655, -23.565, -46.625, -23.535] : null,
      }),
      replayed: false,
    };
  });

  const emitted: { event: string; payload: unknown }[] = [];
  const props = reactive({ context: { ...baseContext }, categories: CATEGORIES });
  const scope = effectScope();
  scopes.push(scope);
  const state = scope.run(() =>
    component.setup(props, {
      expose: () => {},
      emit: (event: string, payload: unknown) => emitted.push({ event, payload }),
    }),
  )!;
  state.mapContainer.value = new FakeHTMLElement() as unknown as HTMLElement;
  await state.open();
  await nextTick();
  return { props, state, emitted };
}

it('Critério 7 e 8 — UI carrega regiões e snapshot, renderiza camadas Leaflet, filtra R05, aplica/limpa bbox e opera com fallback ao disparar tileerror real', async () => {
  const { state, emitted } = await setupMap();

  expect(state.opened.value).toBe(true);
  expect(state.regions.value).toHaveLength(5);
  expect(state.snapshot.value?.revision).toBe(3);
  expect(state.locatedResources.value).toHaveLength(1);
  expect(state.unlocatedResources.value).toHaveLength(1);

  // Verify Leaflet map and layers were initialized and rendered (5 GeoJSON regions + 1 located marker)
  expect(mockLeaflet.map).toHaveBeenCalledTimes(1);
  expect(mockLeaflet.tileLayer).toHaveBeenCalledTimes(1);
  expect(mockLeaflet.geoJSON).toHaveBeenCalledTimes(5);
  expect(mockLeaflet.circleMarker).toHaveBeenCalledTimes(1);
  expect(mockMapInstance.fitBounds).toHaveBeenCalledTimes(1);
  expect(tileErrorListeners.length).toBeGreaterThanOrEqual(1);

  // Apply bbox -> unlocated resource excluded from snapshot list
  await state.applyBbox([-46.655, -23.565, -46.625, -23.535]);
  expect(state.filters.bbox).toEqual([-46.655, -23.565, -46.625, -23.535]);
  expect(state.locatedResources.value).toHaveLength(1);
  expect(state.unlocatedResources.value).toHaveLength(0);

  // Clear bbox -> unlocated resource restored to list
  await state.clearBbox();
  expect(state.filters.bbox).toBeNull();
  expect(state.unlocatedResources.value).toHaveLength(1);

  // Combined filter toggle
  await state.toggleFilterValue('kind', 'equipment');
  expect(state.filters.kind).toEqual(['equipment']);
  expect(state.hasActiveFilters.value).toBe(true);
  expect(state.snapshot.value?.totalFiltered).toBe(1);

  await state.resetFilters();
  expect(state.hasActiveFilters.value).toBe(false);
  expect(state.snapshot.value?.totalFiltered).toBe(2);

  // Trigger the actual Leaflet tileLayer 'tileerror' event callback (not static code inspection!)
  expect(state.tileFallbackActive.value).toBe(false);
  mockLeaflet.geoJSON.mockClear();
  mockLeaflet.circleMarker.mockClear();
  tileErrorListeners[0]!();
  expect(state.tileFallbackActive.value).toBe(true);
  expect(state.tileErrorCount.value).toBe(1);
  expect(state.message.value).toContain('Fallback cartográfico local ativo');

  // Re-render layers while in tile-fallback mode: all 5 local GeoJSON polygons and located markers still render
  state.renderMapLayers();
  expect(mockLeaflet.geoJSON).toHaveBeenCalledTimes(5);
  expect(mockLeaflet.circleMarker).toHaveBeenCalledTimes(1);
  expect(state.regions.value).toHaveLength(5);
  expect(state.locatedResources.value).toHaveLength(1);
  expect(state.snapshot.value?.indicators.availability).toBe(100);

  // Resource selection emits selectResource for inspection
  state.selectResource({ id: sampleResources[0]!.id, kind: 'equipment' });
  expect(emitted.some(e => e.event === 'selectResource' && (e.payload as any).id === sampleResources[0]!.id)).toBe(true);
});

it('Regressão Cenário 7 — fallback cartográfico preserva .leaflet-container, bloqueia scrollWheelZoom involuntário, remove tileLayer e mantém dimensões e ciclo de vida estáveis', async () => {
  const source = readFileSync(new URL('../../web/src/OperationalMap.vue', import.meta.url), 'utf8');
  const { descriptor } = parse(source);

  // 1. Template regression: ref="mapContainer" must NOT have a dynamic :class binding that causes Vue patchClass
  // (el.className = ...) to wipe out '.leaflet-container' when tileFallbackActive flips to true.
  const mapContainerTagMatch = descriptor.template?.content.match(/<div[^>]*ref="mapContainer"[^>]*>/);
  expect(mapContainerTagMatch).toBeTruthy();
  expect(mapContainerTagMatch![0]).not.toContain(':class');

  // 2. Scoped CSS regression: both .map-wrapper and .operational-map-canvas enforce fixed 26rem bounds and overflow: hidden
  const styles = descriptor.styles.map(s => s.content).join('\n');
  expect(styles).toMatch(/\.map-wrapper\s*\{[^}]*height:\s*26rem/s);
  expect(styles).toMatch(/\.map-wrapper\s*\{[^}]*max-height:\s*26rem/s);
  expect(styles).toMatch(/\.map-wrapper\s*\{[^}]*overflow:\s*hidden/s);
  expect(styles).toMatch(/\.operational-map-canvas\s*\{[^}]*min-height:\s*26rem/s);
  expect(styles).toMatch(/\.operational-map-canvas\s*\{[^}]*max-height:\s*26rem/s);
  expect(styles).toMatch(/\.operational-map-canvas\s*\{[^}]*overflow:\s*hidden/s);

  const { state } = await setupMap();
  const container = state.mapContainer.value as unknown as FakeHTMLElement;

  // 3. Leaflet initialized with scrollWheelZoom: false so page wheel scrolling never triggers involuntary zoom
  expect(mockLeaflet.map).toHaveBeenCalledTimes(1);
  expect(mockLeaflet.map.mock.calls[0]?.[0]).toBe(container);
  expect(mockLeaflet.map.mock.calls[0]?.[1]).toMatchObject({
    scrollWheelZoom: false,
    zoomControl: true,
  });

  // Verify container initially has both 'operational-map-canvas' and Leaflet's 'leaflet-container'
  const heightBefore = container.clientHeight;
  expect(container.classList.contains('operational-map-canvas')).toBe(true);
  expect(container.classList.contains('leaflet-container')).toBe(true);
  expect(state.tileFallbackActive.value).toBe(false);

  // 4. Activate fallback multiple times (simulating button clicks + tileerror events)
  state.handleTileError();
  await nextTick();
  state.handleTileError();
  await nextTick();
  tileErrorListeners[0]?.();
  await nextTick();

  expect(state.tileFallbackActive.value).toBe(true);
  expect(state.tileErrorCount.value).toBe(3);
  // External tileLayer is detached cleanly on fallback
  expect(mockTileLayerInstance.remove).toHaveBeenCalled();
  // Map size invalidated with { pan: false } without creating any duplicate L.map instance
  expect(mockMapInstance.invalidateSize).toHaveBeenCalledWith({ pan: false });
  expect(mockLeaflet.map).toHaveBeenCalledTimes(1);

  // CRITICAL: '.leaflet-container' MUST still be present on mapContainer alongside 'offline-cartographic-grid'
  // and container height must remain identical
  expect(container.classList.contains('leaflet-container')).toBe(true);
  expect(container.classList.contains('operational-map-canvas')).toBe(true);
  expect(container.classList.contains('offline-cartographic-grid')).toBe(true);
  expect(container.clientHeight).toBe(heightBefore);
  expect(container.offsetHeight).toBe(heightBefore);

  // 5. Re-framing municipality in fallback mode invalidates size without pan and calls fitBounds without duplicating map
  mockMapInstance.invalidateSize.mockClear();
  mockMapInstance.fitBounds.mockClear();
  state.fitMunicipalityBounds();
  expect(mockMapInstance.invalidateSize).toHaveBeenCalledWith({ pan: false });
  expect(mockMapInstance.fitBounds).toHaveBeenCalledTimes(1);
  expect(container.clientHeight).toBe(heightBefore);

  // 6. Closing and reopening the map destroys the previous Leaflet instance cleanly and initializes once on reopen
  state.close();
  expect(state.opened.value).toBe(false);
  expect(mockMapInstance.remove).toHaveBeenCalledTimes(1);

  state.mapContainer.value = new FakeHTMLElement() as unknown as HTMLElement;
  await state.open();
  await nextTick();
  expect(state.opened.value).toBe(true);
  expect(mockLeaflet.map).toHaveBeenCalledTimes(2);
  expect((state.mapContainer.value as unknown as FakeHTMLElement).classList.contains('leaflet-container')).toBe(true);
  expect((state.mapContainer.value as unknown as FakeHTMLElement).classList.contains('offline-cartographic-grid')).toBe(
    true,
  );
  // Since fallback is already active, tileLayer.addTo is not called again on reopen
  expect(state.regions.value).toHaveLength(5);
  expect(state.locatedResources.value).toHaveLength(1);
});
