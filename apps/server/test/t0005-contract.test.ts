import {afterEach,expect,it} from 'vitest';
import {demoFixture,generation} from './support/t0005-fixture.js';
import {canonicalJson,hashJson} from '../src/idempotency/json.js';
import {makePlan,generationInput} from '../src/demo/engine.js';
const fixtures:Awaited<ReturnType<typeof demoFixture>>[]=[];
afterEach(async()=>{for(const f of fixtures.splice(0))await f.cleanup();});
async function setup(){const f=await demoFixture();fixtures.push(f);return f;}
it('V02-T5-05/07/08/09/10 — 14 schemas, manifesto, revisão única e proveniência',async()=>{
  const f=await setup();expect((await f.read()).json().eligibility).toEqual({eligible:true,reason:null});
  const input=generation(),result=await f.generate(input);expect(result.statusCode,result.body).toBe(201);
  const b=result.json();expect(b.manifest.counts).toMatchObject({resources:26,equipment:20,agents:6,maintenanceRequests:15,missingCoordinates:6});
  expect(f.groupCounts()).toEqual({resource:26,equipment:20,agent:6,maintenance_request:15,operational_event:26,demo_manifest:1,demo_member:26,demo_seal:1,command_receipt:1});
  expect(f.revision()).toBe(1);const events=f.store.db.prepare('SELECT revision,ordinal,effective_at,recorded_at,received_at FROM operational_event ORDER BY ordinal').all() as any[];
  expect(events.map(x=>x.ordinal)).toEqual(Array.from({length:26},(_,i)=>i+1));expect(events.every(e=>e.revision===1&&e.effective_at===input.baseTime&&e.recorded_at===input.baseTime&&e.received_at!==input.baseTime)).toBe(true);
  expect(f.store.db.prepare('SELECT DISTINCT operational_state FROM current_state WHERE operational_state IS NOT NULL').all()).toEqual([{operational_state:'not_installed'}]);
  const stored=f.store.db.prepare('SELECT projection_json,content_hash FROM demo_manifest').get() as any;
  expect(hashJson(JSON.parse(stored.projection_json)).hash).toBe(stored.content_hash);
  expect(stored.projection_json).toBe(canonicalJson(makePlan(generationInput(input).body).projection));
  expect(f.store.db.pragma('foreign_key_check')).toEqual([]);
});
it('V02-T5-01/04/10 — mesmos IDs em contextos isolados, hash preservado após edição',async()=>{
  const a=await setup(),b=await setup(),input=generation();
  const one=await a.generate(input),two=await b.generate(input);expect([one.statusCode,two.statusCode]).toEqual([201,201]);
  expect(one.json().resources).toEqual(two.json().resources);expect(one.json().manifest.contentHash).toBe(two.json().manifest.contentHash);
  const id=one.json().resources[0].id;
  expect((await a.app.inject({method:'PATCH',url:a.path+'/equipment/'+id,headers:a.headers,
    payload:{commandId:crypto.randomUUID(),expectedVersion:1,brand:'Editado depois do baseline'}})).statusCode).toBe(200);
  const read=(await a.read()).json();expect(read.revision).toBe(2);expect(read.manifest.createdRevision).toBe(1);
  expect(read.manifest.contentHash).toBe(one.json().manifest.contentHash);
  const retry=await a.generate(input);expect(retry.headers['idempotency-replayed']).toBe('true');
  expect(retry.json()).toEqual(one.json());expect(a.revision()).toBe(2);
});
it('V02-T5-11/12/19 — replay precede revisão/vazio, segunda Kc conflita',async()=>{
  const f=await setup(),input=generation();const first=await f.generate(input);expect(first.statusCode,first.body).toBe(201);
  const retry=await f.generate({...input,equipmentByCategory:[...input.equipmentByCategory].reverse()});
  expect(retry.headers['idempotency-replayed']).toBe('true');expect(retry.json()).toEqual(first.json());expect(f.revision()).toBe(1);
  const mismatch=await f.generate({...input,expectedRevision:1});expect(mismatch.json().code).toBe('IDEMPOTENCY_CONFLICT');
  const other=await f.generate(generation());expect(other.json().code).toBe('DEMO_BASELINE_EXISTS');
  expect(f.groupCounts().resource).toBe(26);
});
