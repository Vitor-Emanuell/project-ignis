import {afterEach,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Store,transaction} from '../src/persistence/store.js';
import {buildApp} from '../src/app.js';
import {createAgent} from '../src/inventory/agents.js';
import {OPERATIONAL_ID} from '../src/inventory/contract.js';
import {inventoryFixture,maintenance,base,valid} from './support/inventory-fixture.js';
import {agentInput,equipmentInput,schema2Fixture,oldData} from './support/t0004-fixture.js';
import {ORIGIN,SECRET,authorization} from './support/foundation-fixture.js';
import {runT4Jobs} from './support/t0004-process.js';
const fixtures:Awaited<ReturnType<typeof inventoryFixture>>[]=[];

it('V01-T4-18 — lista mantém um snapshot enquanto outra conexão confirma cadastro',async()=>{
  const f=await setup(),first=await f.call('POST','/agents',agentInput({enrollmentNumber:'AA'})),db=f.store.db,other=new Store(f.path);
  const prepare=db.prepare.bind(db);let inserted=false;
  try{
    db.prepare=((sql:string)=>{
      if(!inserted&&sql.includes('SELECT id FROM agent WHERE')){
        inserted=true;
        createAgent(authorization(other),{token:f.cookie.slice('ignis_session='.length),csrf:f.csrf,origin:ORIGIN},OPERATIONAL_ID,1,agentInput({enrollmentNumber:'BB'}));
      }
      return prepare(sql);
    }) as typeof db.prepare;
    const page=await f.call('GET','/agents');
    expect(inserted).toBe(true);expect(page.json()).toMatchObject({revision:1,total:1,items:[{id:first.json().agent.id,enrollmentNumber:'AA'}]});
    expect((await f.call('GET','/agents')).json()).toMatchObject({revision:2,total:2});
  }finally{db.prepare=prepare;other.close();}
});
afterEach(async()=>{for(const f of fixtures.splice(0))await f.cleanup();});
async function setup(){const f=await inventoryFixture();fixtures.push(f);return f;}
function job(f:Awaited<ReturnType<typeof inventoryFixture>>,kind:'equipment'|'agent',body:unknown,id?:string){
  return {path:f.path,token:f.cookie.slice('ignis_session='.length),csrf:f.csrf,kind,body,...(id?{id}:{})};
}
it('V01-T4-12/17 — Agent auth/origin/CSRF/grants/epoch, parser estrito, campos proibidos e limites',async()=>{
  const f=await setup(),input=agentInput(),made=await f.call('POST','/agents',input),id=made.json().agent.id;
  for(const route of ['/agents','/agents/'+id])expect((await f.app.inject({url:base+route})).statusCode).toBe(401);
  for(const headers of [{cookie:f.cookie,origin:ORIGIN},{...f.headers,'x-csrf-token':'invalid'},{...f.headers,origin:'https://evil.example'}])
    for(const [method,route,payload] of [['POST','/agents',agentInput()],['PATCH','/agents/'+id,{commandId:randomUUID(),expectedVersion:1,function:'x'}]] as const)
      expect((await f.app.inject({method,url:base+route,headers,payload})).statusCode).toBe(403);
  for(const fields of [{activity:'available'},{initialActivity:'available'},{organizationId:randomUUID()},{serialNumber:'x'},{maintenance:null},{}])
    expect((await f.call('PATCH','/agents/'+id,{commandId:randomUUID(),expectedVersion:1,...fields})).statusCode).toBe(400);
  expect((await f.call('POST','/agents',agentInput({initialActivity:'available'}))).statusCode).toBe(422);
  expect((await f.call('POST','/agents',agentInput({fictitiousName:'   '}))).statusCode).toBe(422);
  expect((await f.call('POST','/agents',agentInput({organizationId:randomUUID()}))).statusCode).toBe(422);
  expect((await f.app.inject({method:'POST',url:base+'/agents',headers:{...f.headers,'content-type':'application/json'},payload:'{"commandId":"a","commandId":"b"}'})).statusCode).toBe(400);
  expect((await f.app.inject({method:'POST',url:base+'/agents',headers:f.headers,payload:agentInput({fictitiousName:'x'.repeat(70000)})})).statusCode).toBe(413);
  expect((await f.app.inject({url:base.replace('/epochs/1','/epochs/2')+'/agents',headers:f.headers})).statusCode).toBe(409);
  expect((await f.app.inject({url:'/api/v1/datasets/'+f.installation.datasetId+'/epochs/1/agents/'+id,headers:f.headers})).statusCode).toBe(404);
  f.store.db.prepare('UPDATE dataset_grant SET can_write=0 WHERE dataset_id=?').run(OPERATIONAL_ID);
  expect((await f.call('POST','/agents',input)).statusCode).toBe(403);
  f.store.db.prepare('UPDATE dataset_grant SET can_write=1 WHERE dataset_id=?').run(OPERATIONAL_ID);
  f.store.db.prepare('UPDATE local_session SET expires_at=0').run();
  expect((await f.call('GET','/agents')).statusCode).toBe(401);
});

it('V01-T4-05 — falhas em cópia, índice e trigger revertem o grafo inteiro',()=>{
  for(const boundary of ['INSERT INTO operational_event SELECT * FROM t4_old_operational_event;',
    'CREATE INDEX equipment_category ON equipment(dataset_id,epoch,category_code,category_version);',
    "BEGIN SELECT RAISE(ABORT,'Immutable category policy'); END;"]){
    const f=schema2Fixture();try{
      const before=oldData(f.store),sql=readFileSync(new URL('../migrations/0003-heterogeneous-inventory.sql',import.meta.url),'utf8');
      expect(sql).toContain(boundary);
      expect(()=>transaction(f.store.db,()=>f.store.db.exec(sql.replace(boundary,boundary+'\nSELECT * FROM deliberately_missing_t4_table;')))).toThrow(/deliberately_missing_t4_table/);
      expect(f.store.db.pragma('user_version',{simple:true})).toBe(2);expect(oldData(f.store)).toEqual(before);
      expect(f.store.db.pragma('foreign_key_check')).toEqual([]);f.store.migrate();expect(f.store.ready()).toBe(true);
    }finally{f.cleanup();}
  }
});
it('V01-T4-05 — perfil legado incompatível é recusado sem reparo',()=>{
  const f=schema2Fixture();try{
    f.store.db.exec("DROP TRIGGER category_immutable_update; UPDATE category_version SET profile_json='{}'");
    const before=oldData(f.store);expect(()=>f.store.migrate()).toThrow(/CHECK/);
    expect(f.store.db.pragma('user_version',{simple:true})).toBe(2);expect(oldData(f.store)).toEqual(before);
  }finally{f.cleanup();}
});
it('V01-T4-07/08/12/13 — mesma identidade em outro contexto autorizado e replay com nova sessão',async()=>{
  const f=await setup(),input=agentInput({enrollmentNumber:'CONTEXTUAL'});
  const original=await f.call('POST','/agents',input);
  f.store.db.prepare('INSERT INTO organization VALUES (?,1,?,?,?)').run(f.installation.datasetId,'10000000-0000-4000-8000-000000000004','ORG_LOCAL','Órgão municipal fictício');
  const other='/api/v1/datasets/'+f.installation.datasetId+'/epochs/1/agents';
  expect((await f.app.inject({method:'POST',url:other,headers:f.headers,payload:input})).statusCode).toBe(201);
  expect((await f.app.inject({url:other+'/'+original.json().agent.id,headers:f.headers})).statusCode).toBe(404);
  const login=await f.app.inject({method:'POST',url:'/api/v1/session',headers:{origin:ORIGIN},payload:{secret:SECRET}});
  const headers={origin:ORIGIN,cookie:String(login.headers['set-cookie']).split(';')[0]!,'x-csrf-token':login.json().csrfToken};
  const replay=await f.app.inject({method:'POST',url:base+'/agents',headers,payload:input});
  expect(replay.headers['idempotency-replayed']).toBe('true');expect(replay.json()).toEqual(original.json());
});
it('V01-T4-12 — read-only não concede escrita e 429 inclui replay Agent',async()=>{
  const f=await setup(),app=await buildApp({foundation:{store:f.store,host:'127.0.0.1',operatorSecret:SECRET,readOnly:true}});
  try{expect((await app.inject({method:'POST',url:base+'/agents',headers:f.headers,payload:agentInput()})).statusCode).toBe(403);}finally{await app.close();}
  // App close owns its store: restore the fixture connection before the independent limiter check.
  await f.reopen();const input=agentInput();
  for(let n=0;n<60;n++)expect((await f.call('POST','/agents',input)).statusCode).toBe(201);
  const r=await f.call('POST','/agents',input);expect(r.statusCode).toBe(429);expect(r.headers['retry-after']).toBe('60');
  expect(f.counts().resource).toBe(1);
});
for(const kind of ['equipment','agent'] as const)it('V01-T4-07/08/13/14 — corrida real, retry e CAS de '+kind,async()=>{
  const f=await setup(),input=kind==='agent'?agentInput({enrollmentNumber:'RACE'}):equipmentInput('camera',{serialNumber:'RACE'});
  const route=kind==='agent'?'/agents':'/equipment',property=kind;
  const duplicate=await runT4Jobs([job(f,kind,input),job(f,kind,{...input,commandId:randomUUID()})]);
  expect(duplicate.map(r=>r.status).sort()).toEqual([201,409]);
  const made=(await f.call('GET',route)).json().items[0],id=made.id;
  const changes=[{commandId:randomUUID(),expectedVersion:1,...(kind==='agent'?{function:'A'}:{brand:'A'})},
    {commandId:randomUUID(),expectedVersion:1,...(kind==='agent'?{function:'B'}:{brand:'B'})}];
  const race=await runT4Jobs(changes.map(input=>job(f,kind,input,id)));expect(race.map(r=>r.status).sort()).toEqual([200,409]);
  const winner=changes[race.findIndex(r=>r.status===200)]!,first=race.find(r=>r.status===200)!;
  const other={commandId:randomUUID(),expectedVersion:2,...(kind==='agent'?{function:'Later'}:{brand:'Later'})};
  expect((await f.call('PATCH',route+'/'+id,other)).statusCode).toBe(200);
  const replay=await f.call('PATCH',route+'/'+id,winner);expect(replay.json()).toEqual(first.body);expect(replay.headers['idempotency-replayed']).toBe('true');
  expect((await f.call('PATCH',route+'/'+id,{...winner,expectedVersion:3})).json().code).toBe('IDEMPOTENCY_CONFLICT');
  const noop={commandId:randomUUID(),expectedVersion:3,...(kind==='agent'?{function:'Later'}:{brand:'Later'})},before=f.revision();
  expect((await f.call('PATCH',route+'/'+id,noop)).json()[property].version).toBe(3);expect(f.revision()).toBe(before);
  const create=kind==='agent'?agentInput():equipmentInput('taxi');
  const equivalent=await runT4Jobs([job(f,kind,create),job(f,kind,create)]);
  expect(equivalent.map(r=>r.status)).toEqual([201,201]);expect(equivalent.filter(r=>r.replayed)).toHaveLength(1);
});
for(const kind of ['equipment','agent'] as const)it('V01-T4-15 — rollback em todas as fronteiras de '+kind,async()=>{
  for(const table of ['resource',kind==='agent'?'agent':'equipment','resource_location','current_state',...(kind==='equipment'?['maintenance_request']:[]),'operational_event','command_receipt','commit']){
    const f=await setup(),input=kind==='agent'?agentInput():equipmentInput('camera',{initialMaintenance:maintenance()});
    f.store.db.exec(table==='commit'?"CREATE TEMP TRIGGER fault AFTER INSERT ON command_receipt BEGIN INSERT INTO dataset VALUES ('"+randomUUID()+"','broken','demo',999); END":
      "CREATE TEMP TRIGGER fault AFTER INSERT ON "+table+" BEGIN SELECT RAISE(ABORT,'test-only fault'); END");
    const r=await f.call('POST',kind==='agent'?'/agents':'/equipment',input);expect(r.statusCode,r.body).toBe(500);
    expect(Object.values(f.counts()).every(n=>n===0),table).toBe(true);expect(f.revision()).toBe(0);expect(f.store.db.inTransaction).toBe(false);
    f.store.db.exec('DROP TRIGGER temp.fault');expect((await f.call('POST',kind==='agent'?'/agents':'/equipment',input)).statusCode).toBe(201);
  }
});
it('V01-T4-05/16 — queda durante migração e antes/depois do commit de domínio',async()=>{
  const old=schema2Fixture();try{
    const before=oldData(old.store),result=await runT4Jobs([{path:old.path,token:'',csrf:'',kind:'agent',body:{},point:'migration'}]);
    expect(result[0]?.fence).toBe('migration');expect(old.store.db.pragma('user_version',{simple:true})).toBe(2);expect(oldData(old.store)).toEqual(before);
    old.store.migrate();expect(old.store.ready()).toBe(true);
  }finally{old.cleanup();}
  for(const kind of ['equipment','agent'] as const)for(const point of ['before_commit','after_commit'] as const){
    const f=await setup(),input=kind==='agent'?agentInput():equipmentInput('taxi',{initialMaintenance:maintenance('dated')});
    expect((await runT4Jobs([{...job(f,kind,input),point}]))[0]?.fence).toBe(point);
    await f.reopen();expect(f.counts().resource).toBe(point==='before_commit'?0:1);expect(f.counts().command_receipt).toBe(point==='before_commit'?0:1);
    const r=await f.call('POST',kind==='agent'?'/agents':'/equipment',input);expect(r.statusCode,r.body).toBe(201);
    expect(r.headers['idempotency-replayed']).toBe(point==='after_commit'?'true':undefined);
    expect(f.counts().resource).toBe(1);expect(f.store.db.pragma('foreign_key_check')).toEqual([]);
  }
},30000);
it('V01-T4-13/14 — indisponibilidade limitada e retry da mesma intenção',async()=>{
  const f=await setup(),other=new Store(f.path),input=agentInput();
  try{
    other.db.exec('BEGIN IMMEDIATE');const r=await f.call('POST','/agents',input);expect(r.statusCode).toBe(503);
    expect(f.counts().command_receipt).toBe(0);other.db.exec('ROLLBACK');
    expect((await f.call('POST','/agents',input)).statusCode).toBe(201);
    await f.reopen();expect((await f.call('POST','/agents',input)).headers['idempotency-replayed']).toBe('true');
  }finally{if(other.db.inTransaction)other.db.exec('ROLLBACK');other.close();}
});
