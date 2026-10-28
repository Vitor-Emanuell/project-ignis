<script setup lang="ts">
import type { Location } from './api';
defineProps<{ model: Location; prefix: string; base?: boolean; allowed?: string[]; pointRequired?: boolean }>();
const fields = [['postalCode', 'CEP'], ['neighborhood', 'Bairro'], ['city', 'Cidade'], ['address', 'Endereço'], ['reference', 'Referência']] as const;
const states = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
</script>
<template>
  <label :for="`${prefix}-referenceType`">Natureza da referência</label>
  <select :id="`${prefix}-referenceType`" v-model="model.referenceType" required>
    <option value="" disabled>Selecione a natureza da referência</option>
    <option v-for="kind in (base ? ['base'] : allowed ?? ['base','installation'])" :key="kind" :value="kind">{{ kind==='base'?'Base conhecida':kind==='institutional'?'Referência institucional':'Local cadastral de instalação' }}</option>
  </select>
  <template v-for="[key, label] in fields" :key="key">
    <label :for="`${prefix}-${key}`">{{ label }}</label>
    <input :id="`${prefix}-${key}`" v-model="model[key]" required maxlength="256" :pattern="key === 'postalCode' ? '[0-9]{5}-?[0-9]{3}' : undefined" />
  </template>
  <label :for="`${prefix}-uf`">UF</label><select :id="`${prefix}-uf`" v-model="model.uf" required><option value="" disabled>Selecione</option><option v-for="uf in states" :key="uf">{{ uf }}</option></select>
  <p :id="`${prefix}-coordinates-help`">{{ pointRequired?'Coordenadas obrigatórias neste ramo.':'Coordenadas opcionais: informe o par completo ou deixe ambos vazios.' }} CEP não gera posição.</p>
  <label :for="`${prefix}-latitude`">Latitude</label><input :id="`${prefix}-latitude`" v-model.number="model.latitude" type="number" min="-90" max="90" step="any" :required="pointRequired" :aria-describedby="`${prefix}-coordinates-help`" />
  <label :for="`${prefix}-longitude`">Longitude</label><input :id="`${prefix}-longitude`" v-model.number="model.longitude" type="number" min="-180" max="180" step="any" :required="pointRequired" :aria-describedby="`${prefix}-coordinates-help`" />
</template>
