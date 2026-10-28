<script setup lang="ts">
import { ref, watch } from 'vue';
import { request, ApiError } from './api';
import type { Context } from './api';

type History = Context & {
  asOfMs: number; fromMs: number; horizonDays: number; status: 'insufficient_data';
  score: null; provenance: string; ordering: string; limitations: string[];
  items: { id: string; label: string; criticality: number; occurrences: number; simulatedOccurrences: number; failures: number;
    maintenanceCount: number; nextDueDate: string | null; score: null }[];
};
const props = defineProps<{ context: Context | null }>();
const emit = defineEmits<{ (e: 'context', c: Context): void; (e: 'access-error', error: unknown): void }>();
const opened = ref(false), busy = ref(false), error = ref(''), history = ref<History | null>(null);
let requestVersion = 0;
async function load() {
  if (!props.context) return;
  const c = { ...props.context }, version = ++requestVersion;
  busy.value = true; error.value = ''; history.value = null;
  try {
    const result = await request<History>(`/api/v1/datasets/${c.datasetId}/epochs/${c.epoch}/prediction/history`);
    if (version !== requestVersion || props.context?.datasetId !== c.datasetId || props.context?.epoch !== c.epoch) return;
    if (result.data.datasetId !== c.datasetId || result.data.epoch !== c.epoch || result.data.revision < props.context.revision)
      throw new Error('Resposta de contexto ou revisão anterior. Atualize a consulta.');
    history.value = result.data; emit('context', result.data);
  } catch (e) {
    if (version !== requestVersion) return;
    error.value = e instanceof Error ? e.message : 'Consulta indisponível.';
    if (e instanceof ApiError && ([401, 403].includes(e.status) || e.code === 'EPOCH_CONFLICT')) emit('access-error', e);
  } finally { if (version === requestVersion) busy.value = false; }
}
watch([() => props.context?.datasetId, () => props.context?.epoch], (newVal, oldVal) => {
  if (oldVal && newVal[0] === oldVal[0] && newVal[1] === oldVal[1]) return;
  requestVersion++; history.value = null; error.value = ''; busy.value = false;
  if (opened.value && props.context) void load();
});
function open() { opened.value = true; void load(); }
</script>
<template>
  <section aria-label="Cidade Preditiva">
    <button type="button" :disabled="!context || busy" @click="open">Consultar Cidade Preditiva</button>
    <template v-if="opened">
      <h2>Cidade Preditiva — histórico observado</h2>
      <p v-if="busy" role="status">Consultando histórico…</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <template v-if="history">
        <p role="status">Dados insuficientes para P01: score indisponível. Horizonte de atenção: {{ history.horizonDays }} dias.</p>
        <p>Período: {{ new Date(history.fromMs).toISOString() }} até {{ new Date(history.asOfMs).toISOString() }}.
          Dataset {{ history.datasetId }} · geração {{ history.epoch }} · revisão {{ history.revision }}.</p>
        <p>{{ history.provenance }}. Ordem descritiva: {{ history.ordering }}.</p>
        <p v-for="note in history.limitations" :key="note">{{ note }}</p>
        <p v-if="history.items.length === 0">Nenhum equipamento no contexto.</p>
        <table v-else>
          <thead><tr><th>Recurso</th><th>Falhas registradas</th><th>Ocorrências (simuladas)</th><th>Criticidade</th><th>Pedidos abertos</th><th>Próxima agenda</th></tr></thead>
          <tbody><tr v-for="item in history.items" :key="item.id">
            <td>{{ item.label }}</td><td>{{ item.failures }}</td><td>{{ item.occurrences }} ({{ item.simulatedOccurrences }})</td>
            <td>{{ item.criticality }}</td><td>{{ item.maintenanceCount }}</td><td>{{ item.nextDueDate ?? 'Não informada' }}</td>
          </tr></tbody>
        </table>
        <p>Ausência de registros não significa risco zero. Não é aprendizado de máquina nem previsão validada.</p>
      </template>
    </template>
  </section>
</template>
