<script setup lang="ts">
import {ref,reactive,computed,watch,nextTick,toRaw} from 'vue';
import {request,ApiError} from './api';
import type {Context,Catalog} from './api';
type Manifest={manifestId:string;createdRevision:number;seed:string;baseTime:string;parametersHash:string;contentHash:string;
  provenance:string;counts:{equipment:number;agents:number;resources:number;maintenanceRequests:number;missingCoordinates:number;completePairs:number};configuration:unknown};
type Status=Context & {datasetKind:string;eligibility:{eligible:boolean;reason:string|null};limits:{equipment:number;agents:number};manifest:Manifest|null};
type Intent={context:Context;body:Record<string,unknown>};
const props=defineProps<{context:Context|null;csrf?:string|undefined;categories:Catalog['categories']}>();
const emit=defineEmits<{context:[Context];accessError:[unknown]}>();
const opened=ref(false),busy=ref(false),phase=ref('configuring'),error=ref(''),message=ref('');
const status=ref<Status>(),manifest=ref<Manifest|null>(),target=ref<Context>(),pending=ref<Intent|null>(null),review=ref<Intent|null>(null);
const dirty=ref(false),heading=ref<HTMLElement>(),feedback=ref<HTMLElement>();
const seed=ref('ignis-t5-001'),baseTime=ref('2026-10-24T12:00:00.000Z'),agents=ref(6);
const counts=reactive<Record<string,number>>({}),labels=ref<Catalog['categories']>([]);
const doubles=new Set(['camera','fixed_speed_radar','motorcycle','official_vehicle','school_transport_vehicle','taxi']);
const sameContext=computed(()=>!!target.value&&props.context?.datasetId===target.value.datasetId&&props.context?.epoch===target.value.epoch);
const total=computed(()=>Object.values(counts).reduce((s,n)=>s+(typeof n==='number'?n:0),0));
const editable=computed(()=>!busy.value&&!pending.value&&phase.value==='configuring');
const focus=async()=>{await nextTick();feedback.value?.focus();};
function notify(c:Context){if(props.context?.datasetId===c.datasetId&&props.context.epoch===c.epoch&&c.revision>=props.context.revision)emit('context',c);}
function describe(cause:unknown){return cause instanceof ApiError?`${cause.message} (${cause.code}${cause.requestId?'; referência '+cause.requestId:''})`:cause instanceof Error?cause.message:'Consulta indisponível.';}
function resetDraft(){seed.value='ignis-t5-001';baseTime.value='2026-10-24T12:00:00.000Z';agents.value=6;
  for(const k of Object.keys(counts))delete counts[k];
  labels.value=[...props.categories].sort((a,b)=>a.code<b.code?-1:a.code>b.code?1:0);
  for(const p of labels.value)counts[p.code]=doubles.has(p.code)?2:1;
  pending.value=null;review.value=null;dirty.value=false;phase.value='configuring';}
async function load(){
  if(!props.context||busy.value)return;
  const c={...props.context};
  if(target.value&&(target.value.datasetId!==c.datasetId||target.value.epoch!==c.epoch)){
    if((dirty.value||pending.value||review.value)&&!window.confirm('O contexto mudou. Descartar o rascunho/revisão/intenção anteriores? Isso não desfaz um possível commit; a tentativa não será enviada à nova geração.')){
      if(!review.value||phase.value!=='reviewing')phase.value='context-blocked';
      error.value='Contexto alterado. Rascunho, revisão ou intenção anteriores bloqueados até descarte explícito.';await focus();return;
    }
    resetDraft();manifest.value=null;status.value=undefined;target.value=undefined;message.value='Contexto alterado; consulte a geração atual antes de outra intenção.';
  }
  busy.value=true;error.value='';
  try{
    const {data}=await request<Status>(`/api/v1/datasets/${c.datasetId}/epochs/${c.epoch}/demo-data`);
    if(data.datasetId!==c.datasetId||data.epoch!==c.epoch)throw new Error('Resposta de outro contexto; consulta bloqueada.');
    if(target.value&&data.revision<target.value.revision)throw new Error('Consulta anterior à revisão confirmada; consulte novamente.');
    if(!target.value)resetDraft();target.value={datasetId:data.datasetId,epoch:data.epoch,revision:data.revision};
    status.value=data;if(data.manifest)manifest.value=data.manifest;notify(data);
    if(phase.value==='context-blocked')phase.value='configuring';
  }catch(cause){error.value=describe(cause);if(cause instanceof ApiError&&[401,403].includes(cause.status))emit('accessError',cause);}
  finally{busy.value=false;await focus();}
}
async function open(){opened.value=true;await load();await nextTick();heading.value?.focus();}
function prepare(){
  if(!sameContext.value||!status.value?.eligibility.eligible||!props.csrf)return;
  error.value='';
  const distribution=labels.value.filter(p=>counts[p.code]!>0).map(p=>({code:p.code,version:p.version,count:counts[p.code]!}));
  if(!seed.value.length||seed.value.length>256||!baseTime.value||!Number.isSafeInteger(agents.value)||agents.value<0||agents.value>30
    ||Object.values(counts).some(n=>!Number.isSafeInteger(n)||n<0)||total.value>200||total.value+agents.value===0){
    error.value='Revise seed, baseTime e quantidades inteiras: máximo 200 equipamentos e 30 agentes, pelo menos um recurso.';void focus();return;
  }
  review.value={context:{...target.value!},body:{expectedRevision:target.value!.revision,scenarioCode:'ignis-baseline',scenarioVersion:1,
    generatorVersion:'t5-baseline-v1',prngVersion:'sha256-counter32-v1',seed:seed.value,baseTime:baseTime.value,equipmentByCategory:distribution,agentCount:agents.value}};
  phase.value='reviewing';message.value='Revise o contexto e os efeitos antes de confirmar. Nenhum dado foi gravado.';void focus();
}
async function send(){
  if(busy.value||!props.csrf||!sameContext.value)return;
  if(!pending.value){if(!review.value)return;pending.value={context:{...review.value.context},body:{commandId:crypto.randomUUID(),...structuredClone(toRaw(review.value.body))}};}
  const intent=pending.value;if(props.context?.epoch!==intent.context.epoch||props.context.datasetId!==intent.context.datasetId){
    phase.value='context-blocked';error.value='Tentativa antiga não será enviada em outro contexto.';return;}
  busy.value=true;error.value='';message.value='Enviando geração; aguarde confirmação do servidor.';
  let confirmed=false;
  try{
    const {data,replayed}=await request<Context&{manifest:Manifest}>(`/api/v1/datasets/${intent.context.datasetId}/epochs/${intent.context.epoch}/demo-data`,'POST',intent.body,props.csrf);
    if(data.datasetId!==intent.context.datasetId||data.epoch!==intent.context.epoch)throw new ApiError(409,'EPOCH_CONFLICT','Confirmação de outro contexto.');
    confirmed=true;manifest.value=data.manifest;target.value={datasetId:data.datasetId,epoch:data.epoch,revision:Math.max(target.value!.revision,data.revision)};
    pending.value=null;review.value=null;dirty.value=false;phase.value='confirmed';
    message.value=replayed?'Geração original confirmada por replay. Consultando o manifesto.':'Geração confirmada pelo servidor. Consultando o manifesto.';
  }catch(cause){
    error.value=describe(cause);
    if(cause instanceof ApiError&&cause.status<500){
      if([401,403].includes(cause.status)){phase.value='access-needed';message.value='Refaça o acesso e confirme o mesmo contexto para reenviar a mesma intenção.';emit('accessError',cause);}
      else if(cause.code==='EPOCH_CONFLICT'){phase.value='context-blocked';message.value='Confirme o contexto. A intenção antiga não será remapeada.';}
      else if(cause.status===429){phase.value='uncertain';message.value='Aguarde o prazo informado e reenvie a mesma tentativa.';}
      else {pending.value=null;phase.value='configuring';review.value=null;message.value='Geração recusada. Consulte o manifesto/cadastros antes de rever a intenção.';}
    }else{phase.value='uncertain';message.value='Resultado não confirmado. Campos bloqueados; reenvie explicitamente a mesma tentativa.';}
  }finally{busy.value=false;}
  if(confirmed)await load();await focus();
}
function cancelReview(){review.value=null;phase.value='configuring';message.value='Confirmação cancelada; nenhum POST foi enviado.';void focus();}
async function close(){
  if((dirty.value||pending.value)&&!window.confirm(pending.value?'Descartar a intenção local? Isso não desfaz possível commit. Consulte o manifesto antes de gerar novamente.':'Descartar os parâmetros alterados?'))return;
  opened.value=false;resetDraft();error.value='';message.value='';
}
watch([()=>props.context?.datasetId,()=>props.context?.epoch,()=>props.csrf],()=>{if(opened.value&&!busy.value&&props.context)void load();});
</script>
<template>
  <section aria-label="Geração de dados demonstrativos">
    <button type="button" :disabled="!context || busy" @click="open">Gerar ou consultar baseline demonstrativo</button>
    <template v-if="opened">
      <h2 ref="heading" tabindex="-1">Baseline cadastral demonstrativo</h2>
      <div ref="feedback" tabindex="-1" aria-label="Resultado da geração">
        <p v-if="error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
        <p v-if="busy" role="status">Aguarde: operação em andamento, sem confirmação de resultado ainda.</p>
      </div>
      <p v-if="!context">Acesso necessário. Parâmetros e intenção permanecem bloqueados em memória.</p>
      <template v-else-if="sameContext">
        <p>Dataset: <code>{{ target?.datasetId }}</code> · Geração {{ target?.epoch }} · Revisão consultada {{ target?.revision }} · Tipo {{ status?.datasetKind }}</p>
        <p v-if="!status?.eligibility.eligible">Geração indisponível: {{ status?.eligibility.reason }}. Nenhum dado será substituído ou limpo.</p>
        <p v-if="!csrf">Faça novo acesso antes de enviar alterações; a sessão existente permite consulta.</p>
        <button type="button" :disabled="busy || phase==='reviewing'" @click="load">Consultar manifesto e elegibilidade</button>
        <form v-if="status?.eligibility.eligible || pending" @submit.prevent="prepare" @input="dirty=true">
          <fieldset :disabled="!editable">
            <legend>Parâmetros fictícios da geração</legend>
            <p>Cenário ignis-baseline / 1 · Gerador t5-baseline-v1 · PRNG sha256-counter32-v1</p>
            <label for="demo-seed">Seed demonstrativa</label><input id="demo-seed" v-model="seed" required maxlength="256">
            <label for="demo-base">BaseTime explícito em ISO 8601</label><input id="demo-base" v-model="baseTime" required>
            <label for="demo-agents">Quantidade de Agents fictícios (0–30)</label><input id="demo-agents" v-model.number="agents" type="number" min="0" max="30" step="1" required>
            <fieldset><legend>Equipamentos por categoria — zero desmarca; máximo total 200</legend>
              <template v-for="p in labels" :key="p.code">
                <label :for="'demo-'+p.code">{{ p.name }} ({{ p.code }} v{{ p.version }})</label>
                <input :id="'demo-'+p.code" v-model.number="counts[p.code]" type="number" min="0" max="200" step="1" required>
              </template>
            </fieldset>
            <p>Total selecionado: {{ total }} equipamentos e {{ agents }} Agents. Preset inicial: 20/6, 14 categorias.</p>
          </fieldset>
          <button v-if="!pending && phase==='configuring'" type="submit" :disabled="busy || !csrf">Revisar geração</button>
        </form>
        <button v-if="pending" type="button" :disabled="busy || !csrf || !sameContext" @click="send">Reenviar mesma tentativa de geração</button>
        <section v-if="manifest" aria-label="Manifesto confirmado">
          <h3>Manifesto inicial confirmado — synthetic_baseline</h3>
          <p>Revisão de criação {{ manifest.createdRevision }}; a revisão consultada pode conter edições posteriores. O hash inicial permanece imutável.</p>
          <p>{{ manifest.counts.equipment }} equipamentos · {{ manifest.counts.agents }} Agents · {{ manifest.counts.maintenanceRequests }} pedidos · {{ manifest.counts.missingCoordinates }} sem coordenadas</p>
          <p>Seed {{ manifest.seed }} · BaseTime {{ manifest.baseTime }}</p>
          <p>Identificador: <code>{{ manifest.manifestId }}</code></p>
          <p>parametersHash: <code>{{ manifest.parametersHash }}</code></p><p>contentHash: <code>{{ manifest.contentHash }}</code></p>
        </section>
      </template>
      <p v-else>Contexto alterado ou ainda não confirmado. Nenhuma intenção antiga será enviada.</p>
      <section v-if="context && phase==='reviewing' && review" aria-label="Revisão da geração">
        <h3>Confirmação explícita</h3>
        <p>Contexto da revisão: <code>{{ review.context.datasetId }}</code> · Geração {{ review.context.epoch }} · Revisão {{ review.context.revision }}</p>
        <p v-if="!sameContext">Revisão anterior preservada e bloqueada. Confirme explicitamente o descarte para consultar o novo contexto.</p>
        <p>Será criado um único baseline neste dataset/epoch, sem substituir dados. Todos os equipamentos começam not_installed; Agents unknown.</p>
        <p>Manutenção segue a regra versionada; preset 20/6 contém 15 pedidos e seis recursos sem coordenadas. Coordenadas são cadastrais demonstrativas, nunca observações; região não atribuída. Sem mapa, reset, ticks ou histórico.</p>
        <pre>{{ JSON.stringify(review.body,null,2) }}</pre>
        <button type="button" :disabled="busy || !csrf || !sameContext" @click="send">Confirmar geração</button>
        <button type="button" :disabled="busy || !sameContext" @click="cancelReview">Cancelar confirmação</button>
      </section>
      <button type="button" :disabled="busy" @click="close">Fechar geração</button>
    </template>
  </section>
</template>
