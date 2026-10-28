import {afterEach,expect,it,vi} from 'vitest';
import {demoFixture,generation} from './support/t0005-fixture.js';
import {canonicalJson} from '../src/idempotency/json.js';
import * as integrity from '../src/demo/integrity.js';

type F=Awaited<ReturnType<typeof demoFixture>>;
const fixtures:F[]=[];
afterEach(async()=>{vi.restoreAllMocks();for(const f of fixtures.splice(0))await f.cleanup();});
async function setup(){const f=await demoFixture();fixtures.push(f);return f;}
type Payload={reason:string;evidenceIds:string[];changes:{fieldPath:string;before:null;after:unknown}[]};

// Alter only the first creation's bound JSON before its real SQLite INSERT.
// All persistent constraints/triggers stay enabled; the altered row is observed
// inside the transaction before the independent verifier must roll it back.
function alterInsertedEvent(f:F,change:(p:Payload)=>void){
  const prepare=f.store.db.prepare.bind(f.store.db);let observed:Payload|undefined;
  vi.spyOn(f.store.db,'prepare').mockImplementation(((sql:string)=>{
    const statement=prepare(sql);
    if(sql.startsWith('INSERT INTO operational_event('))return {run:(...args:unknown[])=>{
      if(args[9]===1){const p=JSON.parse(args[13] as string) as Payload;change(p);args[13]=canonicalJson(p);}
      const result=statement.run(...args);
      if(args[9]===1)observed=JSON.parse((prepare('SELECT changes_json FROM operational_event WHERE dataset_id=? AND epoch=? AND id=?')
        .get(args[0],args[1],args[2]) as {changes_json:string}).changes_json) as Payload;
      return result;
    }};
    return statement;
  }) as typeof f.store.db.prepare);
  return ()=>observed;
}
const corruptions={
  reason:(p:Payload)=>{p.reason='Motivo divergente da fixture.';},
  evidenceIds:(p:Payload)=>{p.evidenceIds=[crypto.randomUUID()];},
  changes:(p:Payload)=>{p.changes.find(c=>c.fieldPath==='brand')!.after='Marca divergente da fixture';},
};

for(const [field,change] of Object.entries(corruptions))it(`P2-01 — ${field} persistido divergente falha e reverte o baseline`,async()=>{
  const f=await setup(),observed=alterInsertedEvent(f,change);
  const result=await f.generate();expect(observed(),field+' realmente inserido').toBeDefined();
  expect(result.statusCode,result.body).toBe(500);expect(result.json().code).toBe('INTERNAL_ERROR');
  expect(Object.values(f.groupCounts()).every(n=>n===0)).toBe(true);expect(f.revision()).toBe(0);
  expect(f.store.db.pragma('foreign_key_check')).toEqual([]);
});

it('P2-01 — prova isolada do fluxo anterior, seguido de rechecagem independente',async()=>{
  const f=await setup(),observed=alterInsertedEvent(f,corruptions.reason);
  // Simulate precisely the previous omission, without changing product files/schema.
  const old=vi.spyOn(integrity,'assertBaselineIntegrity').mockImplementation(()=>{});
  expect((await f.generate()).statusCode).toBe(201);expect(observed()?.reason).toBe('Motivo divergente da fixture.');
  old.mockRestore();
  const manifest=f.store.db.prepare('SELECT * FROM demo_manifest').get() as Record<string,string|number>;
  expect(()=>f.store.db.transaction(()=>integrity.assertBaselineIntegrity(f.store.db,f.datasetId,1,manifest)).deferred()).toThrow(integrity.BaselineIntegrityError);
  const read=await f.read();expect(read.statusCode).toBe(500);expect(read.json().code).toBe('INTERNAL_ERROR');
  expect(f.groupCounts().resource).toBe(26);expect(f.revision()).toBe(1); // Verification is read-only, never repairs.
});

it('P2-01 — baseline íntegro e edição posterior preservam hash/snapshot/replay',async()=>{
  const f=await setup(),input=generation(),first=await f.generate(input);expect(first.statusCode,first.body).toBe(201);
  const before=f.store.db.prepare('SELECT * FROM demo_manifest').get() as Record<string,string|number>;
  expect((await f.read()).statusCode).toBe(200);
  const id=first.json().resources[0].id;
  expect((await f.app.inject({method:'PATCH',url:f.path+'/equipment/'+id,headers:f.headers,
    payload:{commandId:crypto.randomUUID(),expectedVersion:1,brand:'Edição legítima após baseline'}})).statusCode).toBe(200);
  const read=await f.read();expect(read.statusCode,read.body).toBe(200);expect(read.json().revision).toBe(2);
  expect(f.store.db.prepare('SELECT * FROM demo_manifest').get()).toEqual(before);
  const retry=await f.generate(input);expect(retry.json()).toEqual(first.json());expect(retry.headers['idempotency-replayed']).toBe('true');
});

it('P2-01 — ordem bruta de changes é normalizada por fieldPath, sem novo hash',async()=>{
  const a=await setup(),b=await setup();alterInsertedEvent(a,p=>{p.changes.reverse();});
  const one=await a.generate(),two=await b.generate();expect([one.statusCode,two.statusCode]).toEqual([201,201]);
  expect(one.json().manifest.contentHash).toBe(two.json().manifest.contentHash);expect(one.json().resources).toEqual(two.json().resources);
  expect((await a.read()).statusCode).toBe(200);
});

for(const fault of ['missing','resource','ordinal','command'] as const)it(`P2-01 — leitura isolada de grupo ${fault} é rejeitada`,async()=>{
  const f=await setup();expect((await f.generate()).statusCode).toBe(201);
  const prepare=f.store.db.prepare.bind(f.store.db);
  // Persistent FKs/append-only triggers already prevent these mutations. Inject
  // only the read result to prove the service rejects them independently as well.
  vi.spyOn(f.store.db,'prepare').mockImplementation(((sql:string)=>{
    const statement=prepare(sql);
    if(sql.startsWith('SELECT * FROM operational_event WHERE dataset_id='))return {all:(...args:unknown[])=>{
      const rows=statement.all(...args) as Record<string,unknown>[];
      if(fault==='missing')rows.pop();else if(fault==='resource')rows[0]!.resource_id=rows[1]!.resource_id;
      else if(fault==='ordinal')rows[0]!.ordinal=0;else rows[0]!.command_id=crypto.randomUUID();
      return rows;
    }};
    return statement;
  }) as typeof f.store.db.prepare);
  const read=await f.read();expect(read.statusCode,read.body).toBe(500);expect(read.json().code).toBe('INTERNAL_ERROR');
  expect(f.groupCounts().resource).toBe(26);expect(f.revision()).toBe(1);
});
