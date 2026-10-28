import {afterEach,beforeAll,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {parse,compileScript} from '@vue/compiler-sfc';
import {transformSync} from 'esbuild';
import {effectScope,reactive,nextTick} from 'vue';
import type {Ref,EffectScope} from 'vue';
import * as vue from 'vue';
import {ApiError} from '../../web/src/api.js';
import {CATEGORIES} from '../src/inventory/catalog.js';

// Execute the real SFC setup with Vue reactivity in an isolated Node harness.
// This verifies the state machine, not browser layout/keyboard or a real dialog.
type C={datasetId:string;epoch:number;revision:number};
type Intent={context:C;body:Record<string,unknown>};
type State={review:Ref<Intent|null>;pending:Ref<Intent|null>;target:Ref<C>;phase:Ref<string>;seed:Ref<string>;dirty:Ref<boolean>;
  sameContext:Ref<boolean>;error:Ref<string>;message:Ref<string>;manifest:Ref<unknown>;feedback:Ref<unknown>;
  open:()=>Promise<void>;load:()=>Promise<void>;prepare:()=>void;send:()=>Promise<void>};
let component:{setup:(props:unknown,context:unknown)=>State};
const scopes:EffectScope[]=[];
const request=vi.fn(),confirm=vi.fn(),base:C={datasetId:'10000000-0000-4000-8000-000000000005',epoch:1,revision:0};
beforeAll(()=>{
  const source=readFileSync(new URL('../../web/src/DemoData.vue',import.meta.url),'utf8');
  const {descriptor}=parse(source),script=compileScript(descriptor,{id:'p2-epoch-state'});
  const code=transformSync(script.content,{loader:'ts',format:'cjs',target:'es2023'}).code,module={exports:{}};
  const require=createRequire(import.meta.url);
  new Function('require','module','exports',code)((id:string)=>id==='vue'?vue:id==='./api'?{request,ApiError}:require(id),module,module.exports);
  component=(module.exports as {default:typeof component}).default;
});
afterEach(()=>{for(const scope of scopes.splice(0))scope.stop();vi.unstubAllGlobals();vi.clearAllMocks();});
const settle=async()=>{await nextTick();await new Promise<void>(resolve=>setImmediate(resolve));await nextTick();};
async function setup(){
  confirm.mockReturnValue(false);vi.stubGlobal('window',{confirm});
  request.mockImplementation(async(path:string)=>({data:{...base,epoch:Number(path.split('/epochs/')[1]!.split('/')[0]),datasetKind:'demo',
    eligibility:{eligible:true,reason:null},limits:{equipment:200,agents:30},manifest:null},replayed:false}));
  const props=reactive({context:{...base},csrf:'test-csrf',categories:CATEGORIES}),scope=effectScope();scopes.push(scope);
  const state=scope.run(()=>component.setup(props,{expose:()=>{},emit:()=>{}}))!;
  await state.open();return {props,state};
}
const posts=()=>request.mock.calls.filter(c=>c[1]==='POST');

it('P2-02 — revisão default recusada preserva contexto/corpo e impede POST',async()=>{
  const {props,state}=await setup();state.prepare();expect(state.dirty.value).toBe(false);
  const review=state.review.value,focus=vi.fn();state.feedback.value={focus};
  props.context={...base,epoch:2};await settle();
  expect(confirm).toHaveBeenCalledOnce();expect(state.review.value).toBe(review);expect(state.target.value.epoch).toBe(1);
  expect(state.phase.value).toBe('reviewing');expect(state.sameContext.value).toBe(false);expect(state.error.value).toContain('descarte explícito');
  expect(focus).toHaveBeenCalled();await state.send();expect(posts()).toHaveLength(0);
});
it('P2-02 — aceite explícito descarta revisão default antes da nova consulta, sem POST',async()=>{
  const {props,state}=await setup();state.prepare();props.context={...base,epoch:2};await settle();
  expect(state.review.value?.context.epoch).toBe(1);confirm.mockReturnValue(true);await state.load();
  expect(confirm).toHaveBeenCalledTimes(2);expect(state.review.value).toBeNull();expect(state.target.value.epoch).toBe(2);
  expect(state.phase.value).toBe('configuring');expect(posts()).toHaveLength(0);
});
it('P2-02 — seed alterada continua protegida em recusa e aceite',async()=>{
  const {props,state}=await setup();state.seed.value='p2-seed-alterada';state.dirty.value=true;state.prepare();
  props.context={...base,epoch:2};await settle();expect(state.review.value?.body.seed).toBe('p2-seed-alterada');
  expect(state.target.value.epoch).toBe(1);confirm.mockReturnValue(true);await state.load();
  expect(state.seed.value).toBe('ignis-t5-001');expect(state.review.value).toBeNull();expect(posts()).toHaveLength(0);
});
it('P2-02 — intenção incerta conserva chave/corpo na recusa, sem remapear retry',async()=>{
  const {props,state}=await setup();state.prepare();request.mockRejectedValueOnce(new Error('resposta perdida'));await state.send();
  const intent=state.pending.value;expect(intent?.body.commandId).toBeTypeOf('string');expect(state.phase.value).toBe('uncertain');
  const original=JSON.parse(JSON.stringify(intent)) as Intent;
  expect(original.context).toEqual(base);expect(original.body.expectedRevision).toBe(0);
  props.context={...base,epoch:2};await settle();expect(state.pending.value).toBe(intent);expect(state.phase.value).toBe('context-blocked');
  expect(state.pending.value).toEqual(original);
  await state.send();expect(posts()).toHaveLength(1);confirm.mockReturnValue(true);await state.load();
  expect(state.pending.value).toBeNull();expect(state.target.value.epoch).toBe(2);expect(posts()).toHaveLength(1);
});
it('P2-02 — contexto limpo muda sem confirmação desnecessária ou POST',async()=>{
  const {props,state}=await setup();props.context={...base,epoch:2};await settle();
  expect(confirm).not.toHaveBeenCalled();expect(state.target.value.epoch).toBe(2);expect(posts()).toHaveLength(0);
});
it('P2-02 — GET falho mantém confirmação e manifesto após 201',async()=>{
  const {state}=await setup(),manifest={manifestId:'confirmed',createdRevision:1};state.prepare();
  request.mockResolvedValueOnce({data:{...base,revision:1,manifest},replayed:false});
  request.mockRejectedValueOnce(new ApiError(503,'DATABASE_UNAVAILABLE','Consulta indisponível.'));await state.send();
  expect(state.phase.value).toBe('confirmed');expect(state.pending.value).toBeNull();expect(state.manifest.value).toEqual(manifest);
  expect(state.message.value).toContain('Geração confirmada pelo servidor');expect(state.error.value).toContain('Consulta indisponível');expect(posts()).toHaveLength(1);
});
