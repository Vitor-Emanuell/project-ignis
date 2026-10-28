<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onScopeDispose } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { request, ApiError, buildSnapshotQuery } from './api';
import type {
  Context,
  Catalog,
  RegionItem,
  RegionsResponse,
  SnapshotFilters,
  OperationsSnapshot,
  SnapshotResource,
} from './api';

const props = defineProps<{
  context: Context | null;
  categories: Catalog['categories'];
}>();

const emit = defineEmits<{
  context: [Context];
  accessError: [unknown];
  selectResource: [{ id: string; kind: 'equipment' | 'agent' }];
}>();

const STATES = ['not_installed', 'operational', 'malfunction', 'maintenance', 'disabled', 'stolen'] as const;
const ACTIVITIES = ['available', 'assigned', 'off_duty', 'unknown'] as const;
const CRITICALITIES = [1, 2, 3, 4, 5] as const;

const opened = ref(false);
const busy = ref(false);
const error = ref('');
const message = ref('');
const target = ref<Context | null>(null);
const regions = ref<RegionItem[]>([]);
const snapshot = ref<OperationsSnapshot | null>(null);
const tileFallbackActive = ref(false);
const tileErrorCount = ref(0);
const mapContainer = ref<HTMLElement | null>(null);
const heading = ref<HTMLElement | null>(null);
const feedback = ref<HTMLElement | null>(null);

const filters = reactive<SnapshotFilters>({
  kind: [],
  categoryCode: [],
  operationalState: [],
  activity: [],
  criticality: [],
  regionId: [],
  bbox: null,
});

const bboxDraft = reactive({
  minLon: '-46.655',
  minLat: '-23.565',
  maxLon: '-46.625',
  maxLat: '-23.535',
});

let leafletMap: L.Map | null = null;
let tileLayer: L.TileLayer | null = null;
let regionsLayerGroup: L.LayerGroup | null = null;
let markersLayerGroup: L.LayerGroup | null = null;

const locatedResources = computed(() =>
  (snapshot.value?.resources ?? []).filter(r => r.latitude !== null && r.longitude !== null),
);
const unlocatedResources = computed(() =>
  (snapshot.value?.resources ?? []).filter(r => r.latitude === null || r.longitude === null),
);
const hasActiveFilters = computed(
  () =>
    filters.kind.length > 0 ||
    filters.categoryCode.length > 0 ||
    filters.operationalState.length > 0 ||
    filters.activity.length > 0 ||
    filters.criticality.length > 0 ||
    filters.regionId.length > 0 ||
    filters.bbox !== null,
);

function notify(c: Context) {
  if (
    props.context?.datasetId === c.datasetId &&
    props.context.epoch === c.epoch &&
    c.revision >= props.context.revision
  ) {
    emit('context', c);
  }
}

function describeError(cause: unknown): string {
  return cause instanceof ApiError
    ? `${cause.message} (${cause.code}${cause.requestId ? '; referência ' + cause.requestId : ''})`
    : cause instanceof Error
      ? cause.message
      : 'Consulta operacional indisponível.';
}

function destroyLeafletMap() {
  if (tileLayer) {
    tileLayer.remove();
    tileLayer = null;
  }
  regionsLayerGroup = null;
  markersLayerGroup = null;
  if (leafletMap) {
    leafletMap.remove();
    leafletMap = null;
  }
}

function handleTileError() {
  tileErrorCount.value += 1;
  if (tileLayer) {
    tileLayer.remove();
  }
  if (mapContainer.value && 'classList' in mapContainer.value && mapContainer.value.classList) {
    mapContainer.value.classList.add('offline-cartographic-grid');
  }
  if (!tileFallbackActive.value) {
    tileFallbackActive.value = true;
    message.value =
      'Fallback cartográfico local ativo: tiles externos indisponíveis; polígonos GeoJSON locais, recursos, filtros e indicadores permanecem operacionais.';
  }
  leafletMap?.invalidateSize?.({ pan: false });
}

function initLeafletMap() {
  if (leafletMap || !mapContainer.value || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  if (!(mapContainer.value instanceof HTMLElement)) {
    return;
  }
  try {
    leafletMap = L.map(mapContainer.value, {
      center: [-23.55, -46.645],
      zoom: 14,
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: true,
    });

    if (tileFallbackActive.value && 'classList' in mapContainer.value && mapContainer.value.classList) {
      mapContainer.value.classList.add('offline-cartographic-grid');
    }

    tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap · Base vetorial IGNIS local',
    });
    tileLayer.on('tileerror', () => {
      handleTileError();
    });
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      handleTileError();
    } else if (!tileFallbackActive.value) {
      tileLayer.addTo(leafletMap);
    }

    regionsLayerGroup = L.layerGroup().addTo(leafletMap);
    markersLayerGroup = L.layerGroup().addTo(leafletMap);
  } catch {
    handleTileError();
  }
}

function renderMapLayers() {
  initLeafletMap();
  if (!leafletMap || !regionsLayerGroup || !markersLayerGroup) return;

  regionsLayerGroup.clearLayers();
  markersLayerGroup.clearLayers();

  for (const region of regions.value) {
    const isSelected = filters.regionId.includes(region.id);
    const summary = snapshot.value?.regionSummary.find(s => s.regionId === region.id);
    const layer = L.geoJSON(
      {
        type: 'Feature',
        properties: { id: region.id, code: region.code, name: region.name },
        geometry: region.geometry,
      } as GeoJSON.Feature,
      {
        style: {
          color: isSelected ? '#0b3d91' : '#2d5a7b',
          weight: isSelected ? 3 : 2,
          fillColor: summary && summary.totalResources > 0 ? '#3b82f6' : '#94a3b8',
          fillOpacity: isSelected ? 0.28 : 0.14,
        },
      },
    );
    const availText =
      summary?.availability !== null && summary?.availability !== undefined
        ? `${summary.availability.toFixed(2)}%`
        : 'N/A (sem equipamentos elegíveis)';
    layer.bindTooltip(`${region.name} (${region.code}) · Recursos: ${summary?.totalResources ?? 0} · Disp.: ${availText}`);
    layer.addTo(regionsLayerGroup);
  }

  for (const item of locatedResources.value) {
    if (item.latitude === null || item.longitude === null) continue;
    const color =
      item.kind === 'agent'
        ? '#7c3aed'
        : item.operationalState === 'operational'
          ? '#15803d'
          : item.operationalState === 'malfunction' || item.operationalState === 'stolen'
            ? '#b91c1c'
            : item.operationalState === 'maintenance'
              ? '#b45309'
              : '#475569';
    const marker = L.circleMarker([item.latitude, item.longitude], {
      radius: item.kind === 'agent' ? 7 : 8,
      color: '#ffffff',
      weight: 2,
      fillColor: color,
      fillOpacity: 0.92,
    });
    marker.bindPopup(
      `<strong>${item.publicLabel}</strong><br/>` +
        `${item.kind === 'agent' ? `Agente · ${item.activity}` : `${item.category?.name ?? ''} · ${item.operationalState}`}<br/>` +
        `Região: ${item.regionName ?? 'Sem região atribuída'}`,
    );
    marker.on('click', () => {
      selectResource(item);
    });
    marker.addTo(markersLayerGroup);
  }
}

function fitMunicipalityBounds() {
  if (!leafletMap || regions.value.length === 0) return;
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const r of regions.value) {
    if (r.bbox[0] < minLon) minLon = r.bbox[0];
    if (r.bbox[1] < minLat) minLat = r.bbox[1];
    if (r.bbox[2] > maxLon) maxLon = r.bbox[2];
    if (r.bbox[3] > maxLat) maxLat = r.bbox[3];
  }
  if (Number.isFinite(minLon) && Number.isFinite(minLat) && Number.isFinite(maxLon) && Number.isFinite(maxLat)) {
    leafletMap.invalidateSize?.({ pan: false });
    leafletMap.fitBounds([
      [minLat, minLon],
      [maxLat, maxLon],
    ]);
  }
}

async function load() {
  if (!props.context || busy.value) return;
  const c = { ...props.context };
  const contextChanged =
    !target.value || target.value.datasetId !== c.datasetId || target.value.epoch !== c.epoch;

  busy.value = true;
  error.value = '';
  try {
    const basePath = `/api/v1/datasets/${c.datasetId}/epochs/${c.epoch}`;
    if (contextChanged || regions.value.length === 0) {
      const { data: regData } = await request<RegionsResponse>(`${basePath}/regions`);
      if (regData.datasetId !== c.datasetId || regData.epoch !== c.epoch) {
        throw new ApiError(409, 'EPOCH_CONFLICT', 'Resposta de regiões de outro contexto.');
      }
      regions.value = regData.items;
    }

    const query = buildSnapshotQuery(filters);
    const { data: snapData } = await request<OperationsSnapshot>(`${basePath}/operations/snapshot${query}`);
    if (snapData.datasetId !== c.datasetId || snapData.epoch !== c.epoch) {
      throw new ApiError(409, 'EPOCH_CONFLICT', 'Snapshot de outro contexto.');
    }
    if (!contextChanged && target.value && snapData.revision < target.value.revision) {
      throw new ApiError(409, 'STALE_RESPONSE', 'Snapshot anterior à revisão já consultada.');
    }

    target.value = { datasetId: snapData.datasetId, epoch: snapData.epoch, revision: snapData.revision };
    snapshot.value = snapData;
    notify(target.value);
    await nextTick();
    renderMapLayers();
    if (contextChanged) {
      fitMunicipalityBounds();
    }
  } catch (cause) {
    error.value = describeError(cause);
    if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
      emit('accessError', cause);
    }
  } finally {
    busy.value = false;
  }
}

async function open() {
  opened.value = true;
  await nextTick();
  initLeafletMap();
  await load();
  await nextTick();
  heading.value?.focus?.();
}

function close() {
  destroyLeafletMap();
  opened.value = false;
  error.value = '';
  message.value = '';
}

async function toggleFilterValue<
  K extends 'kind' | 'categoryCode' | 'operationalState' | 'activity' | 'criticality' | 'regionId',
>(field: K, value: SnapshotFilters[K][number]) {
  const list = filters[field] as SnapshotFilters[K][number][];
  const idx = list.indexOf(value);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(value);
  await load();
}

async function applyBbox(bbox?: [number, number, number, number]) {
  if (bbox) {
    filters.bbox = bbox;
    bboxDraft.minLon = String(bbox[0]);
    bboxDraft.minLat = String(bbox[1]);
    bboxDraft.maxLon = String(bbox[2]);
    bboxDraft.maxLat = String(bbox[3]);
  } else {
    const parsed: [number, number, number, number] = [
      Number(bboxDraft.minLon),
      Number(bboxDraft.minLat),
      Number(bboxDraft.maxLon),
      Number(bboxDraft.maxLat),
    ];
    if (parsed.some(n => !Number.isFinite(n)) || parsed[0] > parsed[2] || parsed[1] > parsed[3]) {
      error.value = 'Janela espacial (bbox) inválida: verifique minLon <= maxLon e minLat <= maxLat.';
      return;
    }
    filters.bbox = parsed;
  }
  await load();
}

async function applyViewportBbox() {
  if (leafletMap) {
    const bounds = leafletMap.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    await applyBbox([
      Number(sw.lng.toFixed(6)),
      Number(sw.lat.toFixed(6)),
      Number(ne.lng.toFixed(6)),
      Number(ne.lat.toFixed(6)),
    ]);
  } else {
    await applyBbox();
  }
}

async function clearBbox() {
  filters.bbox = null;
  await load();
}

async function resetFilters() {
  filters.kind.splice(0);
  filters.categoryCode.splice(0);
  filters.operationalState.splice(0);
  filters.activity.splice(0);
  filters.criticality.splice(0);
  filters.regionId.splice(0);
  filters.bbox = null;
  await load();
}

function selectResource(resource: Pick<SnapshotResource, 'id' | 'kind'>) {
  emit('selectResource', { id: resource.id, kind: resource.kind });
}

watch(
  [() => props.context?.datasetId, () => props.context?.epoch, () => props.context?.revision],
  () => {
    if (opened.value && !busy.value && props.context) {
      if (
        !target.value ||
        target.value.datasetId !== props.context.datasetId ||
        target.value.epoch !== props.context.epoch ||
        target.value.revision < props.context.revision
      ) {
        void load();
      }
    }
  },
);

onScopeDispose(() => {
  destroyLeafletMap();
});
</script>

<template>
  <section aria-label="Mapa operacional e indicadores">
    <button type="button" :disabled="!context || busy" @click="open">
      {{ opened ? 'Atualizar mapa operacional e indicadores' : 'Abrir mapa operacional, regiões e indicadores (J01)' }}
    </button>
    <button v-if="opened" type="button" :disabled="busy" @click="close">Fechar mapa operacional</button>

    <template v-if="opened && context">
      <h2 ref="heading" tabindex="-1">Mapa operacional, regiões e disponibilidade (R05 / R06)</h2>
      <div ref="feedback" tabindex="-1" aria-label="Status do mapa operacional">
        <p v-if="error" role="alert">{{ error }}</p>
        <p v-if="message" role="status">{{ message }}</p>
        <p v-if="tileFallbackActive" role="status" class="tile-fallback-banner">
          Modo cartográfico vetorial local ativo (tiles externos indisponíveis ou offline). Polígonos GeoJSON locais ({{ regions.length }} regiões), marcadores ({{ locatedResources.length }}), filtros e indicadores continuam operacionais.
        </p>
      </div>

      <p v-if="snapshot">
        Snapshot consistente · Dataset <code>{{ snapshot.datasetId }}</code> · Geração {{ snapshot.epoch }} · Revisão
        <strong>{{ snapshot.revision }}</strong> · Regiões v{{ snapshot.regionVersion }} ·
        {{ snapshot.dataNow ? `DataNow ${snapshot.dataNow}` : 'Sem eventos temporais' }}
      </p>

      <!-- Indicadores Operacionais R06 -->
      <section v-if="snapshot" aria-label="Indicadores de disponibilidade e contagem" class="indicators-grid">
        <div class="indicator-card">
          <h3>Disponibilidade operacional (R06)</h3>
          <p class="indicator-primary">
            <template v-if="snapshot.indicators.availability !== null">
              <strong>{{ snapshot.indicators.availability.toFixed(2) }}%</strong>
              ({{ snapshot.indicators.availableEquipment }} disponíveis / {{ snapshot.indicators.eligibleEquipment }} elegíveis)
            </template>
            <template v-else>
              <strong>Não aplicável (N/A)</strong> · Motivo: <code>{{ snapshot.indicators.reason }}</code> (0 equipamentos elegíveis)
            </template>
          </p>
          <p class="indicator-note">
            Elegíveis: operational, malfunction e maintenance. Disponíveis confirmados: operational com comunicação fresh ou not_applicable. Excluídos do denominador: not_installed, disabled, stolen e Agents.
          </p>
          <p class="indicator-note">
            Fisicamente operacionais: <strong>{{ snapshot.indicators.operationalCount }}</strong> · Comunicação unknown:
            <strong>{{ snapshot.indicators.communicationUnknownCount }}</strong> · Comunicação stale:
            <strong>{{ snapshot.indicators.communicationStaleCount }}</strong>
          </p>
        </div>

        <div class="indicator-card">
          <h3>Totais no recorte filtrado</h3>
          <p>
            Total filtrado: <strong>{{ snapshot.totalFiltered }}</strong> ({{ snapshot.indicators.equipmentCount }} equipamentos ·
            {{ snapshot.indicators.agentCount }} agentes)
          </p>
          <p>
            Com coordenadas no mapa: <strong>{{ snapshot.indicators.locatedCount }}</strong> · Sem coordenadas (somente lista):
            <strong>{{ snapshot.indicators.unlocatedCount }}</strong>
          </p>
          <p v-if="snapshot.truncated" role="alert">
            Atenção: exibindo {{ snapshot.resources.length }} de {{ snapshot.totalFiltered }} recursos (limite por snapshot: {{ snapshot.maxResources }}). Os indicadores refletem o total filtrado completo.
          </p>
        </div>

        <div class="indicator-card">
          <h3>Distribuição por estado e atividade</h3>
          <p>
            Equipamentos — operational: {{ snapshot.indicators.byOperationalState.operational ?? 0 }} ·
            malfunction: {{ snapshot.indicators.byOperationalState.malfunction ?? 0 }} ·
            maintenance: {{ snapshot.indicators.byOperationalState.maintenance ?? 0 }} ·
            not_installed: {{ snapshot.indicators.byOperationalState.not_installed ?? 0 }} ·
            disabled: {{ snapshot.indicators.byOperationalState.disabled ?? 0 }} ·
            stolen: {{ snapshot.indicators.byOperationalState.stolen ?? 0 }}
          </p>
          <p>
            Agentes — available: {{ snapshot.indicators.byActivity.available ?? 0 }} ·
            assigned: {{ snapshot.indicators.byActivity.assigned ?? 0 }} ·
            off_duty: {{ snapshot.indicators.byActivity.off_duty ?? 0 }} ·
            unknown: {{ snapshot.indicators.byActivity.unknown ?? 0 }}
          </p>
        </div>
      </section>

      <!-- Filtros Combinados R05 -->
      <fieldset :disabled="busy" aria-label="Filtros combinados R05">
        <legend>Filtros combinados (AND entre campos, OR entre valores do mesmo campo)</legend>

        <div class="filter-group">
          <strong>Natureza (kind):</strong>
          <label class="inline-check">
            <input type="checkbox" :checked="filters.kind.includes('equipment')" @change="toggleFilterValue('kind', 'equipment')" />
            Equipamento
          </label>
          <label class="inline-check">
            <input type="checkbox" :checked="filters.kind.includes('agent')" @change="toggleFilterValue('kind', 'agent')" />
            Agente
          </label>
        </div>

        <div class="filter-group">
          <strong>Região administrativa:</strong>
          <label v-for="reg in regions" :key="reg.id" class="inline-check">
            <input type="checkbox" :checked="filters.regionId.includes(reg.id)" @change="toggleFilterValue('regionId', reg.id)" />
            {{ reg.name }} ({{ reg.code }})
          </label>
          <label class="inline-check">
            <input type="checkbox" :checked="filters.regionId.includes('unassigned')" @change="toggleFilterValue('regionId', 'unassigned')" />
            Sem região atribuída (unassigned)
          </label>
        </div>

        <div class="filter-group">
          <strong>Situação do equipamento:</strong>
          <label v-for="st in STATES" :key="st" class="inline-check">
            <input type="checkbox" :checked="filters.operationalState.includes(st)" @change="toggleFilterValue('operationalState', st)" />
            {{ st }}
          </label>
        </div>

        <div class="filter-group">
          <strong>Atividade do agente:</strong>
          <label v-for="act in ACTIVITIES" :key="act" class="inline-check">
            <input type="checkbox" :checked="filters.activity.includes(act)" @change="toggleFilterValue('activity', act)" />
            {{ act }}
          </label>
        </div>

        <div class="filter-group">
          <strong>Criticidade (1–5):</strong>
          <label v-for="crit in CRITICALITIES" :key="crit" class="inline-check">
            <input type="checkbox" :checked="filters.criticality.includes(crit)" @change="toggleFilterValue('criticality', crit)" />
            Nível {{ crit }}
          </label>
        </div>

        <div class="filter-group">
          <strong>Categoria de equipamento:</strong>
          <label v-for="cat in categories" :key="cat.code" class="inline-check">
            <input type="checkbox" :checked="filters.categoryCode.includes(cat.code)" @change="toggleFilterValue('categoryCode', cat.code)" />
            {{ cat.name }} ({{ cat.code }})
          </label>
        </div>

        <div class="filter-group">
          <strong>Janela espacial (bbox: minLon, minLat, maxLon, maxLat):</strong>
          <div class="bbox-inputs">
            <input v-model="bboxDraft.minLon" aria-label="Longitude mínima" placeholder="minLon" />
            <input v-model="bboxDraft.minLat" aria-label="Latitude mínima" placeholder="minLat" />
            <input v-model="bboxDraft.maxLon" aria-label="Longitude máxima" placeholder="maxLon" />
            <input v-model="bboxDraft.maxLat" aria-label="Latitude máxima" placeholder="maxLat" />
            <button type="button" @click="applyBbox()">Aplicar bbox informada</button>
            <button type="button" @click="applyViewportBbox()">Filtrar pelo enquadramento do mapa</button>
            <button v-if="filters.bbox" type="button" @click="clearBbox()">Limpar bbox (restaurar recursos sem coordenadas)</button>
          </div>
          <p v-if="filters.bbox">
            Bbox ativa: <code>{{ filters.bbox.join(', ') }}</code> (recursos sem coordenadas ficam ocultos enquanto bbox estiver ativa).
          </p>
        </div>

        <div>
          <button v-if="hasActiveFilters" type="button" @click="resetFilters">Limpar todos os filtros</button>
          <button type="button" @click="fitMunicipalityBounds">Enquadrar município</button>
          <button type="button" @click="handleTileError">Simular indisponibilidade de tiles (fallback local)</button>
        </div>
      </fieldset>

      <!-- Mapa Interativo Leaflet com Base Vetorial Local de Fallback -->
      <div class="map-wrapper" :class="{ 'offline-cartographic-grid': tileFallbackActive }">
        <div
          ref="mapContainer"
          class="operational-map-canvas"
          role="region"
          aria-label="Mapa interativo municipal com polígonos GeoJSON locais"
        ></div>
      </div>

      <!-- Resumo por Região -->
      <section v-if="snapshot" aria-label="Resumo por região administrativa">
        <h3>Resumo por região administrativa (mesma revisão {{ snapshot.revision }})</h3>
        <table>
          <thead>
            <tr>
              <th>Região</th>
              <th>Código</th>
              <th>Total</th>
              <th>Equipamentos</th>
              <th>Agentes</th>
              <th>Elegíveis</th>
              <th>Disponíveis</th>
              <th>Disponibilidade</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="reg in snapshot.regionSummary" :key="reg.regionId ?? 'unassigned'">
              <td>{{ reg.name }}</td>
              <td><code>{{ reg.code }}</code></td>
              <td>{{ reg.totalResources }}</td>
              <td>{{ reg.equipmentCount }}</td>
              <td>{{ reg.agentCount }}</td>
              <td>{{ reg.eligibleEquipment }}</td>
              <td>{{ reg.availableEquipment }}</td>
              <td>
                <template v-if="reg.availability !== null">{{ reg.availability.toFixed(2) }}%</template>
                <template v-else>N/A ({{ reg.reason }})</template>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Lista de Recursos do Snapshot (incluindo sem coordenadas quando bbox inativa) -->
      <section v-if="snapshot" aria-label="Recursos no snapshot operacional">
        <h3>
          Recursos no snapshot ({{ snapshot.resources.length }} de {{ snapshot.totalFiltered }} ·
          {{ locatedResources.length }} com coordenadas no mapa · {{ unlocatedResources.length }} sem coordenadas)
        </h3>
        <p v-if="snapshot.resources.length === 0">Nenhum recurso encontrado para os filtros selecionados.</p>
        <ul v-else>
          <li v-for="item in snapshot.resources" :key="item.id">
            <button type="button" :disabled="busy" @click="selectResource(item)">
              Inspecionar {{ item.publicLabel }}
            </button>
            <span>
              <strong>{{ item.kind === 'agent' ? 'Agente' : 'Equipamento' }}</strong> ·
              <template v-if="item.kind === 'equipment'">
                {{ item.category?.name }} · Situação: <code>{{ item.operationalState }}</code> · Comunicação:
                <code>{{ item.communication }}</code> · Criticidade {{ item.criticality }}
              </template>
              <template v-else>
                {{ item.fictitiousName }} · {{ item.function }} · Atividade: <code>{{ item.activity }}</code>
              </template>
              · Região: <strong>{{ item.regionName ?? 'Sem região atribuída (unassigned)' }}</strong> ·
              <template v-if="item.latitude !== null && item.longitude !== null">
                Posição ({{ item.positionKind }}): {{ item.latitude }}, {{ item.longitude }}
              </template>
              <template v-else>
                <em>Sem coordenadas cadastrais (visível na lista; sem marcador no mapa)</em>
              </template>
            </span>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style scoped>
.indicators-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  gap: 0.75rem;
}
.indicator-card {
  border: 1px solid #888;
  padding: 0.75rem;
  background: #fff;
}
.indicator-primary {
  font-size: 1.15rem;
}
.indicator-note {
  font-size: 0.9rem;
  color: #444;
}
.filter-group {
  margin-block: 0.5rem;
}
.inline-check {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-right: 0.75rem;
  margin-top: 0.25rem;
}
.bbox-inputs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.35rem;
}
.bbox-inputs input {
  width: 8rem;
}
.map-wrapper {
  position: relative;
  margin-block: 1rem;
  width: 100%;
  height: 26rem;
  min-height: 26rem;
  max-height: 26rem;
  overflow: hidden;
  contain: layout paint size;
  box-sizing: border-box;
}
.operational-map-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 26rem;
  max-height: 26rem;
  overflow: hidden;
  box-sizing: border-box;
  border: 2px solid #2d5a7b;
  background-color: #eef4f8;
}
.offline-cartographic-grid,
.offline-cartographic-grid .operational-map-canvas {
  background-color: #e8f0f6;
  background-image:
    linear-gradient(to right, rgba(45, 90, 123, 0.14) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(45, 90, 123, 0.14) 1px, transparent 1px);
  background-size: 24px 24px;
}
.tile-fallback-banner {
  background: #fff8e6;
  border-color: #b45309;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 0.5rem;
}
th,
td {
  border: 1px solid #999;
  padding: 0.4rem 0.5rem;
  text-align: left;
}
</style>
