<script setup lang="ts">
import { ref, reactive, computed, nextTick, onMounted, onUnmounted } from 'vue';
import LocationFields from './LocationFields.vue';
import DemoData from './DemoData.vue';
import OperationalMap from './OperationalMap.vue';
import PredictiveCity from './PredictiveCity.vue';
import { request, ApiError, configuredDataset } from './api';
import type { Context, Catalog, List, Detail, Resource, Location } from './api';

const datasetId = configuredDataset(import.meta.env.VITE_IGNIS_DATASET_ID);
const context = ref<Context | null>(null), catalog = ref<Catalog | null>(null), listing = ref<List | null>(null);
const selected = ref<Resource | null>(null), currentForReview = ref<Resource | null>(null);
const screen = ref<'list' | 'detail' | 'form'>('list'), secret = ref(''), csrf = ref<string>();
const busy = ref(false), message = ref(''), error = ref(''), uncertain = ref(false), conflict = ref(false);
const feedback = ref<HTMLElement>(), heading = ref<HTMLElement>();
const newLocation = (): Location => ({ referenceType: 'base', postalCode: '', neighborhood: '', city: '', uf: '',
  address: '', reference: '', latitude: null, longitude: null });
const destination = ref<'equipment' | 'agents'>('equipment');
const isAgent = computed(() => destination.value === 'agents');
const categoryCode = ref('');
const proposedCategory = ref<string | null>(null), categoryReview = ref<HTMLElement>();
const category = computed(() => catalog.value?.categories.find(p => p.code === categoryCode.value && p.version === 1));
const attributesLabels:Record<string,string> = {regulatedSpeedLimitKmh:'Limite regulamentado — valor fictício',monitoredLaneCount:'Faixas monitoradas',restrictedMovement:'Movimento fiscalizado',cameraType:'Tipo de câmera',capacityKg:'Capacidade nominal',occupantCapacity:'Total de ocupantes, incluindo condutor',openingWidthM:'Largura de abertura',parkingSpaceCount:'Quantidade de vagas'};
const attributeLabel = (key:string) => attributesLabels[key] ?? key;
const form = reactive({ serialNumber: '', brand: '', model: '', criticality: '' as number | string,
  attributes: {} as Record<string,number|string>, fictitiousName: '', function: '',
  initialState: 'not_installed', initialStateReason: '', declared: false, registrationLocation: newLocation(), hasBase: false, baseLocation: newLocation(),
  hasMaintenance: false, reason: '', priority: '', schedule: 'unknown', dueDate: '', notApplicableReason: '' });
const editing = ref<string | null>(null), expectedVersion = ref<number>(), dirty = ref(false);
type Pending = { path: string; method: string; body: Record<string, unknown>; datasetId: string; epoch: number };
const pending = ref<Pending | null>(null);
let draftContext: { datasetId: string; epoch: number } | null = null;
const domainPath = () => `/api/v1/datasets/${context.value!.datasetId}/epochs/${context.value!.epoch}`;
const focus = async (target = feedback) => { await nextTick(); target.value?.focus(); };

function fail(cause: unknown) {
  error.value = cause instanceof ApiError ? `${cause.message} (${cause.code}${cause.requestId ? `; referência ${cause.requestId}` : ''})` : cause instanceof Error ? cause.message : 'Falha de comunicação. Não foi possível atualizar os dados.';
  if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
    context.value = null; csrf.value = undefined; listing.value = null; selected.value = null; catalog.value = null;
    error.value += ' Refaça o acesso para confirmar o contexto. O rascunho fica bloqueado em memória.';
  }
  if (cause instanceof ApiError && cause.code === 'EPOCH_CONFLICT') {
    context.value = null; listing.value = null; selected.value = null; catalog.value = null; pending.value = null;
    error.value += ' Confirme o contexto novamente. A tentativa antiga não será reenviada na nova geração.';
  }
  void focus();
}
async function run(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true; error.value = ''; message.value = '';
  try { await action(); } catch (cause) { fail(cause); } finally { busy.value = false; }
}
function accept(result: Context) {
  if (!context.value || result.datasetId !== context.value.datasetId || result.epoch !== context.value.epoch) throw new ApiError(409, 'EPOCH_CONFLICT', 'Resposta de outro contexto.');
  if (result.revision < context.value.revision) throw new ApiError(409, 'STALE_RESPONSE', 'Resposta anterior à revisão já consultada. Atualize a consulta.');
  context.value = { datasetId: result.datasetId, epoch: result.epoch, revision: result.revision };
}
async function loadList(page = listing.value?.page ?? 1) {
  const { data } = await request<List>(`${domainPath()}/${destination.value}?page=${page}&pageSize=50`);
  accept(data); listing.value = data; screen.value = 'list'; selected.value = null; await focus(heading);
}
async function loadDetail(id: string) {
  const { data } = await request<Detail>(`${domainPath()}/${destination.value}/${id}`);
  accept(data); selected.value = 'equipment' in data ? data.equipment : data.agent; screen.value = 'detail'; await focus(heading);
}
async function openResourceFromMap(item: { id: string; kind: 'equipment' | 'agent' }) {
  if ((dirty.value || pending.value) && !window.confirm('Descartar o rascunho em andamento para inspecionar o recurso selecionado no mapa?')) return;
  resetForm(); pending.value = null; dirty.value = false; conflict.value = false; draftContext = null;
  destination.value = item.kind === 'agent' ? 'agents' : 'equipment';
  await run(() => loadDetail(item.id));
}
async function connect() {
  if (!datasetId) return;
  const { data } = await request<Context>(`/api/v1/datasets/${datasetId}/context`);
  const changed = draftContext && (draftContext.datasetId !== data.datasetId || draftContext.epoch !== data.epoch);
  if (changed && (dirty.value || pending.value) && !window.confirm('O contexto mudou. Descartar o rascunho antigo? Uma tentativa incerta pode ter sido confirmada na geração anterior; ela não será reenviada no novo contexto.')) {
    context.value = null; listing.value = null; selected.value = null; catalog.value = null;
    error.value = 'Rascunho antigo bloqueado. Confirme explicitamente seu descarte antes de abrir outro contexto.'; await focus(); return;
  }
  context.value = data;
  const { data: refs } = await request<Catalog>(`${domainPath()}/catalog`);
  accept(refs); catalog.value = refs;
  if (changed) {
    resetForm(); pending.value = null; conflict.value = false; dirty.value = false; draftContext = null;
    message.value = 'Geração alterada. O rascunho antigo foi descartado; revise o contexto antes de iniciar outra intenção.';
  }
  if ((dirty.value || pending.value) && draftContext) { screen.value = 'form'; await focus(heading); }
  else await loadList();
}
async function login() {
  await run(async () => {
    const { data } = await request<{ csrfToken: string }>('/api/v1/session', 'POST', { secret: secret.value });
    secret.value = ''; csrf.value = data.csrfToken; await connect();
  });
}
async function logout() {
  if (dirty.value && !window.confirm('Descartar o rascunho local e encerrar o acesso?')) return;
  await run(async () => {
    await request('/api/v1/session', 'DELETE', undefined, csrf.value);
    context.value = null; csrf.value = undefined; listing.value = null; selected.value = null; catalog.value = null;
    pending.value = null; dirty.value = false; resetForm(); draftContext = null;
    message.value = 'Acesso encerrado pelo servidor.'; await focus();
  });
}
function cleanLocation(loc: Location): Location {
  const { regionId: _region, ...rest } = loc;
  return { ...rest, latitude: typeof rest.latitude === 'number' ? rest.latitude : null,
    longitude: typeof rest.longitude === 'number' ? rest.longitude : null };
}
function resetForm() {
  categoryCode.value = '';
  proposedCategory.value = null;
  Object.assign(form, { serialNumber: '', brand: '', model: '', criticality: '', attributes: {}, fictitiousName: '', function: '', initialState:'not_installed', initialStateReason:'', declared:false,
    registrationLocation: newLocation(), hasBase: false, baseLocation: newLocation(), hasMaintenance: false,
    reason: '', priority: '', schedule: 'unknown', dueDate: '', notApplicableReason: '' });
}
function beginForm(value: Resource | null = null) {
  if (!context.value || !csrf.value) return;
  resetForm(); editing.value = value?.id ?? null; expectedVersion.value = value?.version;
  if (value) {
    Object.assign(form,{registrationLocation:cleanLocation(value.registrationLocation),hasBase:!!value.baseLocation,
      baseLocation:value.baseLocation?cleanLocation(value.baseLocation):newLocation()});
    if(value.kind==='agent') Object.assign(form,{serialNumber:value.enrollmentNumber,fictitiousName:value.fictitiousName,function:value.function});
    else {categoryCode.value=value.category.code;Object.assign(form,{serialNumber:value.serialNumber,brand:value.brand,model:value.model,criticality:value.criticality,attributes:{...value.attributes}});}
  } else if(isAgent.value) form.registrationLocation.referenceType='institutional';
  pending.value=null;uncertain.value=false;conflict.value=false;currentForReview.value=null;
  draftContext={datasetId:context.value.datasetId,epoch:context.value.epoch};dirty.value=false;message.value='';error.value='';screen.value='form';void focus(heading);
}
async function switchDestination(value:'equipment'|'agents') {
  if(value===destination.value)return;
  if((dirty.value||pending.value)&&!window.confirm(pending.value?'O resultado não foi confirmado. Descartar a intenção local e consultar antes de outro cadastro?':'Descartar este rascunho e mudar de destino?'))return;
  resetForm();pending.value=null;dirty.value=false;conflict.value=false;draftContext=null;destination.value=value;listing.value=null;selected.value=null;
  await run(()=>loadList(1));
}
function changeCategory(event:Event) {
  const select=event.target as HTMLSelectElement,next=select.value;
  if(next===categoryCode.value)return;
  if(categoryCode.value && dirty.value){proposedCategory.value=next;select.value=categoryCode.value;void focus(categoryReview);return;}
  applyCategory(next);
}
function applyCategory(next:string) {
  proposedCategory.value=null;
  categoryCode.value=next;form.attributes=Object.fromEntries(Object.keys(category.value?.attributes??{}).map(k=>[k,'']));
  form.hasMaintenance=false;form.reason='';form.priority='';form.schedule='unknown';form.dueDate='';form.notApplicableReason='';
  form.initialState='not_installed';form.initialStateReason='';form.declared=false;
  if(category.value?.mobility==='mobile'&&form.registrationLocation.referenceType!=='base')form.registrationLocation.referenceType='';
  dirty.value=true;void focus(heading);
}
function cancelCategoryChange() { proposedCategory.value=null;void focus(heading); }
async function cancelForm() {
  if ((dirty.value || pending.value) && !window.confirm(pending.value
    ? 'O resultado do envio não foi confirmado. Descartar a intenção local e consultar o inventário antes de cadastrar novamente?'
    : 'Descartar as alterações deste rascunho?')) return;
  pending.value = null; dirty.value = false; conflict.value = false; draftContext = null; resetForm();
  await run(() => loadList());
}
function payload() {
  const common={commandId:crypto.randomUUID(),registrationLocation:cleanLocation(form.registrationLocation),
    baseLocation:form.hasBase?cleanLocation(form.baseLocation):null};
  const body:Record<string,unknown>=isAgent.value?{...common,enrollmentNumber:form.serialNumber,fictitiousName:form.fictitiousName,function:form.function}:
    {...common,serialNumber:form.serialNumber,brand:form.brand,model:form.model,criticality:form.criticality,attributes:{...form.attributes}};
  if(editing.value)body.expectedVersion=expectedVersion.value;
  else {
    const organization=catalog.value?.organizations.find(o=>o.code==='ORG_LOCAL');
    if(!organization)throw new Error('Referência organizacional ausente.');
    body.organizationId=organization.id;
    if(isAgent.value)body.initialActivity='unknown';
    else {
      if(!category.value)throw new Error('Selecione a categoria e sua versão.');
      if(form.initialState==='operational'&&!form.declared)throw new Error('Confirme a declaração de situação inicial.');
      Object.assign(body,{categoryCode:category.value.code,categoryVersion:category.value.version,initialState:form.initialState,
        initialMaintenance:form.hasMaintenance?{reason:form.reason,priority:form.priority,schedule:{status:form.schedule,
          dueDate:form.schedule==='dated'?form.dueDate:null,notApplicableReason:form.schedule==='not_applicable'?form.notApplicableReason:null}}:null});
      if(form.initialState==='operational')body.initialStateReason=form.initialStateReason;
    }
  }
  return body;
}
async function save() {
  if (!context.value || !csrf.value || conflict.value) return;
  await run(async () => {
    if (!pending.value) pending.value = { path: `${domainPath()}/${destination.value}${editing.value ? `/${editing.value}` : ''}`,
      method: editing.value ? 'PATCH' : 'POST', body: structuredClone(payload()),
      datasetId: context.value!.datasetId, epoch: context.value!.epoch };
    const intent = pending.value;
    if (intent.datasetId !== context.value!.datasetId || intent.epoch !== context.value!.epoch) throw new ApiError(409, 'EPOCH_CONFLICT', 'Tentativa vinculada à geração anterior.');
    let result: Awaited<ReturnType<typeof request<Detail>>>;
    try { result = await request<Detail>(intent.path, intent.method, intent.body, csrf.value); }
    catch (cause) {
      if (cause instanceof ApiError && cause.status < 500) {
        if (cause.code === 'VERSION_CONFLICT' || cause.code === 'IDEMPOTENCY_CONFLICT') conflict.value = true;
        // Authentication or throttling on a retry cannot determine whether the earlier attempt committed.
        if (!(uncertain.value && [401, 403, 429].includes(cause.status))) pending.value = null;
        uncertain.value = pending.value !== null; throw cause;
      }
      uncertain.value = true;
      error.value = 'Não foi possível confirmar o resultado. Os campos estão bloqueados; reenvie a mesma tentativa para consultar sua confirmação.';
      await focus(); return;
    }
    // A receipt confirms the original result; only the subsequent GET supplies the current view.
    pending.value = null; uncertain.value = false; dirty.value = false; draftContext = null;
    const confirmed = 'equipment' in result.data ? result.data.equipment : result.data.agent;
    message.value = result.replayed ? 'Tentativa original confirmada por replay. Consultando a versão atual.' : editing.value
      ? confirmed.version === expectedVersion.value ? 'Cadastro confirmado sem alterações.' : 'Cadastro atualizado.'
      : isAgent.value ? 'Agente cadastrado.' : 'Equipamento cadastrado.';
    resetForm(); await loadDetail(confirmed.id);
  });
}
async function reviewConflict() {
  if (!editing.value) { await run(() => loadList()); return; }
  await run(async () => {
    const { data } = await request<Detail>(`${domainPath()}/${destination.value}/${editing.value}`);
    accept(data); currentForReview.value = 'equipment' in data ? data.equipment : data.agent;
    message.value = 'Compare a versão consultada com o rascunho. O envio só será liberado após sua revisão explícita.'; await focus();
  });
}
function approveRevision() {
  if (!currentForReview.value) return;
  expectedVersion.value = currentForReview.value.version; currentForReview.value = null; conflict.value = false;
  pending.value = null; message.value = 'Versão consultada adotada explicitamente. Revise os campos e salve quando estiver pronto.';
}
function locationLabel(value: Location | null) {
  return value ? `${value.referenceType === 'base' ? 'Base' : value.referenceType === 'institutional' ? 'Instituição' : 'Instalação'}: ${value.address}; ${value.neighborhood}; ${value.city}/${value.uf}; CEP ${value.postalCode}; ${value.reference}; coordenadas ${value.latitude ?? 'não informada'}, ${value.longitude ?? 'não informada'}` : 'Não informada';
}
const comparison = computed(() => {
  const current=currentForReview.value;if(!current)return [];
  const fields=current.kind==='agent'?[['Matrícula',current.enrollmentNumber,form.serialNumber],['Nome fictício',current.fictitiousName,form.fictitiousName],['Função',current.function,form.function]]:
    [['Série',current.serialNumber,form.serialNumber],['Fabricante',current.brand,form.brand],['Modelo',current.model,form.model],
      ['Criticidade',current.criticality,form.criticality],['Atributos',JSON.stringify(current.attributes),JSON.stringify(form.attributes)]];
  return [...fields,['Localização cadastral',locationLabel(current.registrationLocation),locationLabel(form.registrationLocation)],
    ['Base adicional',locationLabel(current.baseLocation),locationLabel(form.hasBase?form.baseLocation:null)]];
});
const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.value || pending.value) { event.preventDefault(); event.returnValue = ''; } };
onMounted(() => { window.addEventListener('beforeunload', beforeUnload); if (datasetId) void run(connect); });
onUnmounted(() => window.removeEventListener('beforeunload', beforeUnload));
</script>

<template>
  <main :aria-busy="busy">
    <header><h1>IGNIS — Inventário de equipamentos e agentes</h1><p>Dados demonstrativos fictícios. Catálogo versionado e referências institucionais.</p></header>
    <section ref="feedback" tabindex="-1" aria-label="Resultado da operação">
      <p v-if="error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p><p v-if="busy" role="status">Aguarde: operação em andamento.</p>
    </section>
    <section aria-labelledby="access-title"><h2 id="access-title">Acesso local</h2>
      <p v-if="!datasetId" role="alert">Contexto não configurado. A instalação deve fornecer uma referência pública válida para o dataset operacional.</p>
      <template v-else>
        <p>Referência da instalação: <code>{{ datasetId }}</code></p>
        <form @submit.prevent="login"><label for="operator-secret">Segredo do operador local{{ csrf ? ' (novo acesso)' : '' }}</label>
          <input id="operator-secret" v-model="secret" type="password" autocomplete="off" required maxlength="256" :disabled="busy" /><button :disabled="busy">Acessar</button></form>
        <button type="button" :disabled="busy" @click="run(connect)">Confirmar contexto</button><button v-if="csrf" type="button" :disabled="busy" @click="logout">Encerrar acesso</button>
      </template>
    </section>
    <section v-if="context" aria-label="Inventário contextual">
      <p>Dataset: <code>{{ context.datasetId }}</code> · Geração {{ context.epoch }} · Revisão {{ context.revision }}</p>
      <p v-if="!csrf">Consulta autorizada pela sessão existente. Faça novo acesso antes de enviar alterações.</p>
      <nav aria-label="Inventário">
        <button :disabled="busy" @click="switchDestination('equipment')">Equipamentos</button>
        <button :disabled="busy" @click="switchDestination('agents')">Agentes</button>
        <button :disabled="busy || screen==='form'" @click="run(()=>loadList())">Atualizar consulta</button>
        <button :disabled="busy || !csrf || screen==='form' || !catalog?.organizations.length" @click="beginForm()">{{ isAgent?'Cadastrar agente':'Cadastrar equipamento' }}</button>
      </nav>
      <p v-if="!catalog?.organizations.length" role="alert">Referências operacionais não preparadas. Consulte o preparo explícito indicado no README.</p>
      <h2 ref="heading" tabindex="-1">{{ screen==='form'?(editing?'Editar cadastro':isAgent?'Cadastrar agente fictício':'Cadastrar equipamento'):screen==='detail'?'Detalhe do recurso':isAgent?'Agentes':'Equipamentos' }}</h2>
      <template v-if="screen==='list' && listing">
        <p v-if="error">Última consulta conhecida; os dados podem estar desatualizados.</p>
        <p v-if="listing.total===0">{{ isAgent?'Nenhum agente':'Nenhum equipamento' }} cadastrado neste contexto.</p>
        <p v-else>Exibindo {{ listing.items.length }} de {{ listing.total }} registros. Página {{ listing.page }}.</p>
        <ul><li v-for="item in listing.items" :key="item.id">
          <button :disabled="busy" @click="run(()=>loadDetail(item.id))">Abrir {{ item.publicLabel }}</button>
          <p v-if="item.kind==='agent'">{{ item.fictitiousName }} · {{ item.function }} · Atividade: {{ item.activity }}</p>
          <p v-else>{{ item.category.name }} v{{ item.category.version }} · {{ item.mobility==='fixed'?'Fixo':'Móvel' }} · Situação: {{ item.operationalState }} · {{ item.brand }}/{{ item.model }}</p>
          <p>{{ item.organization.name }} · {{ item.registrationLocation.city }}/{{ item.registrationLocation.uf }} · Referência {{ item.registrationLocation.referenceType }}</p>
        </li></ul>
        <button :disabled="busy || listing.page<=1" @click="run(()=>loadList(listing!.page-1))">Página anterior</button>
        <button :disabled="busy || listing.page*listing.pageSize>=listing.total" @click="run(()=>loadList(listing!.page+1))">Próxima página</button>
      </template>
      <template v-if="screen==='detail' && selected">
        <dl><dt>Identificação pública</dt><dd>{{ selected.publicLabel }}</dd><dt>Identificador</dt><dd>{{ selected.id }}</dd>
          <dt>Versão do cadastro</dt><dd>{{ selected.version }}</dd><dt>Organização fictícia</dt><dd>{{ selected.organization.name }}</dd>
          <template v-if="selected.kind==='agent'"><dt>Matrícula fictícia</dt><dd>{{ selected.enrollmentNumber }}</dd><dt>Nome fictício</dt><dd>{{ selected.fictitiousName }}</dd><dt>Função</dt><dd>{{ selected.function }}</dd><dt>Atividade</dt><dd>{{ selected.activity }}</dd></template>
          <template v-else><dt>Categoria / mobilidade</dt><dd>{{ selected.category.name }} v{{ selected.category.version }} · {{ selected.mobility==='fixed'?'Fixo':'Móvel' }}</dd>
            <dt>Fabricante / modelo</dt><dd>{{ selected.brand }}/{{ selected.model }}</dd><dt>Criticidade</dt><dd>{{ selected.criticality }}</dd>
            <template v-for="(value,key) in selected.attributes" :key="key"><dt>{{ attributeLabel(key) }}</dt><dd>{{ value }} {{ catalog?.categories.find(c=>selected?.kind==='equipment' && c.code===selected.category.code && c.version===selected.category.version)?.attributes[key]?.unit }}</dd></template>
            <dt>Situação operacional</dt><dd>{{ selected.operationalState }}</dd>
          </template>
        </dl>
        <section v-for="[label,loc] in [['Localização cadastral',selected.registrationLocation],['Base adicional',selected.baseLocation]] as const" :key="label">
          <h3>{{ label }}</h3><template v-if="loc"><p>Referência {{ loc.referenceType }} · {{ loc.address }} · {{ loc.neighborhood }} · {{ loc.city }}/{{ loc.uf }} · CEP {{ loc.postalCode }}</p>
            <p>{{ loc.reference }}</p><p>{{ loc.latitude===null?'Coordenadas não informadas':('Latitude '+loc.latitude+'; longitude '+loc.longitude) }} · {{ loc.regionId?('Região '+loc.regionId):'Região não atribuída' }}</p></template>
          <p v-else>Base adicional não informada.</p>
        </section>
        <template v-if="selected.kind==='equipment'">
          <h3>Manutenção inicial</h3><p v-if="!selected.maintenance.requests.length">Sem solicitação registrada.</p>
          <p v-for="item in selected.maintenance.requests" :key="item.id">Solicitação aberta: {{ item.reason }} · Prioridade {{ item.priority }}</p>
          <p>{{ selected.maintenance.nextMaintenance.status==='dated'?'Agenda: '+selected.maintenance.nextMaintenance.date+' (data civil, Brasília)':selected.maintenance.nextMaintenance.status==='not_applicable'?'Agenda não aplicável: '+selected.maintenance.nextMaintenance.reason:'Agenda não informada' }}</p>
        </template>
        <p>Posição observada e comunicação: informação indisponível nesta etapa. Cadastro e base não indicam posição atual.</p>
        <button :disabled="busy || !csrf" @click="beginForm(selected)">Editar cadastro</button>
      </template>
      <form v-if="screen==='form'" @submit.prevent="save" @input="dirty=true" @change="dirty=true">
        <p>Dados exclusivamente fictícios. Organização: {{ catalog?.organizations.find(o=>o.code==='ORG_LOCAL')?.name }}.</p>
        <p v-if="editing">Categoria/versão, organização, mobilidade, situação/atividade e manutenção não são alteradas pela edição cadastral.</p>
        <section v-if="proposedCategory!==null" ref="categoryReview" tabindex="-1" aria-label="Revisão da troca de categoria">
          <p>Trocar para {{ catalog?.categories.find(p=>p.code===proposedCategory)?.name ?? 'nenhuma categoria' }}? Os campos comuns serão preservados; atributos específicos, solicitação inicial e motivo de situação serão descartados.</p>
          <button type="button" @click="cancelCategoryChange">Manter categoria e rascunho</button>
          <button type="button" @click="applyCategory(proposedCategory!)">Confirmar troca e descartar dados específicos</button>
        </section>
        <fieldset :disabled="busy || !!pending || conflict || proposedCategory!==null"><legend>Dados cadastrais</legend>
          <template v-if="!isAgent">
            <template v-if="!editing"><label for="category">Categoria / versão</label>
              <select id="category" :value="categoryCode" required @change="changeCategory"><option value="">Selecione uma categoria</option>
                <option v-for="p in catalog?.categories" :key="p.code+':'+p.version" :value="p.code">{{ p.name }} v{{ p.version }}</option></select></template>
            <p v-if="category">{{ category.name }} v{{ category.version }} · {{ category.mobility==='fixed'?'Fixo':'Móvel' }} · Categoria primária única; não duplique um recurso para representar função sobreposta.</p>
          </template>
          <label for="serial">{{ isAgent?'Matrícula fictícia':'Série' }}</label><input id="serial" v-model="form.serialNumber" required maxlength="256" />
          <template v-if="isAgent"><label for="fictitious-name">Nome fictício</label><input id="fictitious-name" v-model="form.fictitiousName" required maxlength="256" />
            <label for="agent-function">Função fictícia</label><input id="agent-function" v-model="form.function" required maxlength="256" /><p>Atividade inicial: unknown. Referências institucionais; não informe dados pessoais reais.</p></template>
          <template v-else>
            <label for="brand">Fabricante fictício</label><input id="brand" v-model="form.brand" required maxlength="256" />
            <label for="model">Modelo fictício</label><input id="model" v-model="form.model" required maxlength="256" />
            <label for="criticality">Criticidade (1–5)</label><input id="criticality" v-model.number="form.criticality" type="number" min="1" max="5" step="1" required />
            <fieldset v-if="category"><legend>Atributos específicos — valores fictícios de demonstração</legend>
              <template v-for="(descriptor,key) in category.attributes" :key="category.code+key"><label :for="'attribute-'+key">{{ attributeLabel(key) }}{{ descriptor.unit?' ('+descriptor.unit+')':'' }} — obrigatório</label>
                <select v-if="descriptor.enum" :id="'attribute-'+key" v-model="form.attributes[key]" required><option value="">Selecione</option><option v-for="value in descriptor.enum" :key="value">{{ value }}</option></select>
                <input v-else :id="'attribute-'+key" v-model.number="form.attributes[key]" type="number" :min="descriptor.minimum??descriptor.exclusiveMinimum" :max="descriptor.maximum" :step="descriptor.type==='integer'?1:'any'" required :aria-describedby="'help-'+key" />
                <p :id="'help-'+key">Parâmetro fictício, sem validade regulamentar. {{ descriptor.exclusiveMinimum!==undefined?'Deve ser maior que '+descriptor.exclusiveMinimum+'.':'' }} {{ descriptor.minimum!==undefined?'Mínimo '+descriptor.minimum+'.':'' }} {{ descriptor.maximum!==undefined?'Máximo '+descriptor.maximum+'.':'' }}</p>
              </template>
            </fieldset>
            <template v-if="!editing"><label for="initial-state">Situação inicial declarada</label>
              <select id="initial-state" v-model="form.initialState"><option value="not_installed">Ainda não instalado</option><option v-if="category && category.code!=='fixed_speed_radar'" value="operational">Operacional — declaração explícita</option></select>
              <p>Endereço, coordenadas e base não ativam o equipamento.</p>
              <template v-if="form.initialState==='operational'"><label for="state-reason">Motivo da declaração inicial</label><input id="state-reason" v-model="form.initialStateReason" required maxlength="256" />
                <label><input v-model="form.declared" type="checkbox" required /> Declaro a situação inicial informada e o cumprimento das precondições.</label>
                <p v-if="category?.mobility==='fixed'">Fixo operacional exige referência de instalação e par completo de coordenadas.</p></template>
            </template>
          </template>
          <fieldset><legend>{{ isAgent?'Localização institucional obrigatória':'Localização cadastral obrigatória' }}</legend>
            <LocationFields :model="form.registrationLocation" prefix="registration" :allowed="isAgent?['institutional']:category?.mobility==='mobile'?['base']:['base','installation']" :point-required="!isAgent && !editing && category?.mobility==='fixed' && form.initialState==='operational'" /></fieldset>
          <label><input v-model="form.hasBase" type="checkbox" /> Informar base adicional separada</label>
          <fieldset v-if="form.hasBase"><legend>Base adicional</legend><LocationFields :model="form.baseLocation" prefix="base" base /></fieldset>
          <fieldset v-if="!isAgent && !editing && category"><legend>Solicitação inicial de manutenção (opcional)</legend>
            <label><input v-model="form.hasMaintenance" type="checkbox" /> Registrar explicitamente uma solicitação preventiva inicial</label><p>Nenhuma solicitação é criada apenas pelo cadastro. A causa pertence ao perfil selecionado; a agenda pertence à solicitação.</p>
            <template v-if="form.hasMaintenance"><label for="reason">Motivo</label><input id="reason" v-model="form.reason" required maxlength="256" />
              <label for="priority">Prioridade explícita</label><select id="priority" v-model="form.priority" required><option value="">Selecione</option><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="critical">Crítica</option></select>
              <label for="schedule">Agenda</label><select id="schedule" v-model="form.schedule"><option value="unknown">Desconhecida</option><option value="dated">Data informada</option><option value="not_applicable">Não aplicável</option></select>
              <template v-if="form.schedule==='dated'"><label for="due-date">Data civil (Brasília)</label><input id="due-date" v-model="form.dueDate" type="date" required /></template>
              <template v-if="form.schedule==='not_applicable'"><label for="not-applicable">Justificativa de não aplicabilidade</label><input id="not-applicable" v-model="form.notApplicableReason" required maxlength="256" /></template>
            </template>
          </fieldset>
        </fieldset>
        <section v-if="conflict" aria-label="Revisão do conflito"><p>O envio está bloqueado. Consulte e revise o registro atual antes de uma nova intenção.</p>
          <button type="button" :disabled="busy" @click="reviewConflict">Consultar versão atual para comparação</button>
          <template v-if="currentForReview"><p>Versão atual consultada: {{ currentForReview.version }}</p><dl><template v-for="[label,current,draft] in comparison" :key="String(label)"><dt>{{ label }}</dt><dd>Servidor: {{ current }}</dd><dd>Meu rascunho: {{ draft }}</dd></template></dl>
            <button type="button" :disabled="busy" @click="approveRevision">Revisei a versão atual; liberar meu rascunho</button></template>
        </section>
        <button type="submit" :disabled="busy || !csrf || conflict || proposedCategory!==null || (!isAgent && !category)">{{ uncertain?'Reenviar mesma tentativa':'Salvar cadastro' }}</button>
        <button type="button" :disabled="busy" @click="cancelForm">Cancelar e consultar inventário</button>
      </form>
    </section>
    <PredictiveCity :context="context" @context="accept" @access-error="fail" />
    <DemoData :context="context" :csrf="csrf" :categories="catalog?.categories ?? []" @context="accept" @access-error="fail" />
    <OperationalMap :context="context" :categories="catalog?.categories ?? []" @context="accept" @access-error="fail" @select-resource="openResourceFromMap" />
    <footer><a href="/health/live">Diagnóstico do processo</a></footer>
  </main>
</template>
<style>
body { margin: 0; font-family: system-ui, sans-serif; color: #202020; background: #fafafa; }
main { max-width: 68rem; margin: auto; padding: 1rem; } section, fieldset { margin-block: 1rem; }
fieldset { border: 1px solid #777; padding: 1rem; min-width: 0; } label { display: block; margin-top: .75rem; }
input:not([type=checkbox]), select { box-sizing: border-box; width: min(100%, 32rem); padding: .5rem; font: inherit; }
button { margin: .5rem .5rem .5rem 0; padding: .5rem .75rem; font: inherit; cursor: pointer; } button:disabled { cursor: default; }
:focus-visible { outline: 3px solid #154c9c; outline-offset: 3px; } [role=alert] { border-left: 4px solid #9d2020; padding: .75rem; font-weight: 600; }
[role=status] { padding: .5rem; border: 1px solid #555; } dt { font-weight: bold; margin-top: .75rem; } dd { margin-left: 0; }
code, pre { overflow-wrap: anywhere; white-space: pre-wrap; } pre { border: 1px solid #777; padding: .75rem; } li { padding-block: .5rem; } p { line-height: 1.5; }
</style>
