import {afterEach,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {demoFixture,generation} from './support/t0005-fixture.js';
import {prepareOperational} from '../src/inventory/prepare.js';
import {prepareDemoReferences} from '../src/inventory/demo-references.js';
import {transaction,Store} from '../src/persistence/store.js';
import {buildApp} from '../src/app.js';
import {ORIGIN,SECRET} from './support/foundation-fixture.js';
import {OPERATIONAL_ID} from '../src/inventory/contract.js';
import {valid} from './support/inventory-fixture.js';
const fixtures:Awaited<ReturnType<typeof demoFixture>>[]=[];
afterEach(async()=>{for(const f of fixtures.splice(0))await f.cleanup();});
async function setup(){const f=await demoFixture();fixtures.push(f);return f;}
it('V02-T5-17 — sessão/origem/CSRF/grant e operational não recebem geração',async()=>{
  const f=await setup();
  for(const headers of [{},{...f.headers,origin:'http://alheio.invalid'},{...f.headers,'x-csrf-token':'invalid'},{...f.headers,cookie:'ignis_session=invalid'}]){
    const r=await f.app.inject({method:'POST',url:f.path+'/demo-data',headers,payload:generation()});expect([401,403]).toContain(r.statusCode);
  }
  expect((await f.app.inject({method:'GET',url:`/api/v1/datasets/${randomUUID()}/epochs/1/demo-data`,headers:f.headers})).statusCode).toBe(403);
  prepareOperational(f.store);
  const op=`/api/v1/datasets/${OPERATIONAL_ID}/epochs/1/demo-data`;
  expect((await f.app.inject({method:'GET',url:op,headers:f.headers})).json().eligibility).toEqual({eligible:false,reason:'DEMO_ONLY'});
  expect((await f.app.inject({method:'POST',url:op,headers:f.headers,payload:generation()})).json().code).toBe('DEMO_ONLY');
  f.store.db.prepare('UPDATE dataset_grant SET can_write=0 WHERE dataset_id=?').run(f.datasetId);
  expect((await f.read()).json().eligibility.reason).toBe('CONTEXT_FORBIDDEN');expect((await f.generate()).statusCode).toBe(403);
  expect(Object.values(f.groupCounts()).every(n=>n===0)).toBe(true);
});
it('V02-T5-17/18 — read-only, sessão expirada e epoch aposentado prevalecem sobre recibo',async()=>{
  const f=await setup(),input=generation();expect((await f.generate(input)).statusCode).toBe(201);
  const app=await buildApp({foundation:{store:new Store(f.databasePath),host:'127.0.0.1',dev:true,operatorSecret:SECRET,readOnly:true}});
  try{expect((await app.inject({method:'GET',url:f.path+'/demo-data',headers:f.headers})).json().eligibility.reason).toBe('READ_ONLY');
    expect((await app.inject({method:'POST',url:f.path+'/demo-data',headers:f.headers,payload:input})).json().code).toBe('READ_ONLY');}finally{await app.close();}
  transaction(f.store.db,()=>{
    f.store.db.prepare("UPDATE dataset_epoch SET status='retired' WHERE dataset_id=? AND epoch=1").run(f.datasetId);
    f.store.db.prepare("INSERT INTO dataset_epoch VALUES(?,2,'ready',0)").run(f.datasetId);
    f.store.db.prepare('UPDATE dataset SET active_epoch=2 WHERE id=?').run(f.datasetId);
  });
  expect((await f.generate(input)).json().code).toBe('EPOCH_CONFLICT');
  f.store.db.exec('UPDATE local_session SET expires_at=0');expect((await f.generate(input)).statusCode).toBe(401);
  expect(f.groupCounts().resource).toBe(26);
});
it('V02-T5-19 — cadastros preexistentes e revisão divergente não são reparados',async()=>{
  const f=await setup();f.store.db.prepare('UPDATE dataset_epoch SET revision=1 WHERE dataset_id=?').run(f.datasetId);
  expect((await f.generate()).json().code).toBe('VERSION_CONFLICT');
  transaction(f.store.db,()=>prepareDemoReferences(f.store.db,{datasetId:f.datasetId,epoch:1,actorId:f.installation.actorId,revision:1}));
  expect((await f.app.inject({method:'POST',url:f.path+'/equipment',headers:f.headers,payload:valid()})).statusCode).toBe(201);
  const before=f.groupCounts();expect((await f.generate()).json().code).toBe('DEMO_NOT_EMPTY');expect(f.groupCounts()).toEqual(before);
});
it('V02-T5-18 — preparing não é elegível nem publica baseline',async()=>{
  const f=await setup();f.store.db.prepare("INSERT INTO dataset_epoch VALUES(?,2,'preparing',0)").run(f.datasetId);
  const url=f.path.replace('/epochs/1','/epochs/2')+'/demo-data';
  for(const method of ['GET','POST'] as const){const r=await f.app.inject({method,url,headers:f.headers,...(method==='POST'?{payload:generation()}: {})});
    expect(r.statusCode,r.body).toBe(409);expect(r.json().code).toBe('EPOCH_CONFLICT');}
  expect(Object.values(f.groupCounts()).every(n=>n===0)).toBe(true);expect(f.revision()).toBe(0);
});
it('V02-T5-20 — negativos HTTP preservam códigos e não produzem efeitos',async()=>{
  const f=await setup();
  for(const [change,status] of [
    [{agentCount:-1},422],[{agentCount:31},422],[{agentCount:1.5},422],[{agentCount:'6'},400],
    [{equipmentByCategory:[],agentCount:0},422],[{equipmentByCategory:[{code:'camera',version:1,count:201}]},422],
    [{equipmentByCategory:[{code:'unknown',version:1,count:1}]},422],
    [{equipmentByCategory:[{code:'camera',version:2,count:1}]},422],
    [{equipmentByCategory:[{code:'camera',version:1,count:1},{code:'camera',version:1,count:1}]},422],
    [{seed:''},422],[{tickDuration:1},400],[{baseTime:'invalid'},422],
  ] as const){const r=await f.generate({...generation(),...change});expect(r.statusCode,r.body).toBe(status);}
  expect(Object.values(f.groupCounts()).every(n=>n===0)).toBe(true);expect(f.revision()).toBe(0);
});
it('V02-T5-20 — parser/limites/campos extras e 429 também limitam replay',async()=>{
  const f=await setup();
  const bad=await f.app.inject({method:'POST',url:f.path+'/demo-data',headers:{...f.headers,'content-type':'application/json'},payload:'{"commandId":"a","commandId":"b"}'});
  expect(bad.statusCode).toBe(400);
  expect((await f.app.inject({method:'POST',url:f.path+'/demo-data',headers:{...f.headers,'content-type':'application/json'},payload:JSON.stringify({seed:'x'.repeat(66000)})})).statusCode).toBe(413);
  expect((await f.app.inject({method:'GET',url:f.path+'/demo-data?unknown=1',headers:f.headers})).statusCode).toBe(400);
  const other=await setup(),input=generation();for(let i=0;i<60;i++)expect((await other.generate(input)).statusCode).toBe(201);
  const limited=await other.generate(input);expect(limited.statusCode).toBe(429);expect(limited.headers['retry-after']).toBe('60');expect(other.groupCounts().resource).toBe(26);
});
it('V02-T5-11/22 — nova sessão conserva replay; schema sem funcionalidades temporais',async()=>{
  const f=await setup(),input=generation(),first=await f.generate(input);
  expect(f.store.db.prepare("SELECT count(*) as count FROM alert").get()).toEqual({count:0});
  expect(f.store.db.prepare("SELECT count(*) as count FROM alert_event").get()).toEqual({count:0});
  const login=await f.app.inject({method:'POST',url:'/api/v1/session',headers:{origin:ORIGIN},payload:{secret:SECRET}});
  const headers={origin:ORIGIN,cookie:String(login.headers['set-cookie']).split(';')[0]!, 'x-csrf-token':login.json().csrfToken};
  const retry=await f.app.inject({method:'POST',url:f.path+'/demo-data',headers,payload:input});expect(retry.json()).toEqual(first.json());expect(retry.headers['idempotency-replayed']).toBe('true');
  expect(f.store.db.prepare("SELECT count(*) as count FROM alert").get()).toEqual({count:0});
  expect(f.store.db.prepare("SELECT count(*) as count FROM alert_event").get()).toEqual({count:0});
  const names=f.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[];
  expect(names.some(x=>/scenario_run|mission|tick|coverage/.test(x.name))).toBe(false);
  const telemetryTables=names.map(x=>x.name).filter(n=>n.startsWith("telemetry_"));
  expect(telemetryTables.length).toBeGreaterThan(0);
  for(const table of ['alert','alert_event',...telemetryTables]){
    const count=f.store.db.prepare("SELECT count(*) as count FROM " + table).get() as {count:number};
    expect(count.count).toBe(0);
  }
});
