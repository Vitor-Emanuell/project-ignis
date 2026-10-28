import {afterEach,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import Database from 'better-sqlite3';
import {inventoryFixture,valid,location,maintenance} from './support/inventory-fixture.js';
import {agentInput,equipmentInput,attributeValue,schema2Fixture,golden,oldData} from './support/t0004-fixture.js';
import {CATEGORIES,CATEGORY,CATEGORY_POLICIES} from '../src/inventory/catalog.js';
import {OPERATIONAL_ID} from '../src/inventory/contract.js';
import {createEquipment,updateEquipment} from '../src/inventory/service.js';
import {authorization,sessionFor} from './support/foundation-fixture.js';
import {transaction} from '../src/persistence/store.js';
const fixtures:Awaited<ReturnType<typeof inventoryFixture>>[]=[];
afterEach(async()=>{for(const f of fixtures.splice(0))await f.cleanup();});
async function setup(){const f=await inventoryFixture();fixtures.push(f);return f;}
const object=(r:{json:()=>any},kind='equipment')=>r.json()[kind];

it('V01-T4-01/03 — manifesto, ordenação e imutabilidade inclusive REPLACE',async()=>{
  const f=await setup(),r=await f.call('GET','/catalog'),data=r.json();
  expect(r.headers['cache-control']).toBe('no-store');
  expect(data.categories).toEqual([...CATEGORIES].sort((a,b)=>a.code<b.code?-1:1));
  expect(data.categoryPolicies).toEqual([...CATEGORY_POLICIES].sort((a,b)=>a.code<b.code?-1:1));expect(data.categories).toHaveLength(14);
  expect(JSON.parse((f.store.db.prepare("SELECT profile_json FROM category_version WHERE category_code='fixed_speed_radar'").get() as any).profile_json)).toEqual(CATEGORY);
  for(const table of ['category_version','category_policy']){
    expect(()=>f.store.db.exec('DELETE FROM '+table)).toThrow(/Immutable/);
    expect(()=>f.store.db.exec('UPDATE '+table+" SET category_code='different'")).toThrow(/Immutable/);
    expect(()=>f.store.db.exec('INSERT OR REPLACE INTO '+table+' SELECT * FROM '+table)).toThrow(/Immutable/);
  }
  for(const change of [{categoryCode:'unknown'},{categoryVersion:2}])expect((await f.call('POST','/equipment',valid(change))).statusCode).toBe(422);
});

for(const p of CATEGORIES)it('V01-T4-02/04/17 — atributos/mobilidade '+p.code,async()=>{
  const f=await setup(),[key,a]=Object.entries(p.attributes)[0]!,values=a.enum??[a.minimum??1,a.maximum!,...(a.type==='number'?[0.25]:[])];
  for(const value of values){
    const r=await f.call('POST','/equipment',equipmentInput(p.code,{attributes:{[key]:value}}));expect(r.statusCode,r.body).toBe(201);
    const record=object(r);expect(record).toMatchObject({category:{code:p.code,version:1},mobility:p.mobility,operationalState:'not_installed'});
    expect(record).not.toHaveProperty('positionObservedAt');
    const edited=await f.call('PATCH','/equipment/'+record.id,{commandId:randomUUID(),expectedVersion:1,attributes:{[key]:value}});
    expect(edited.statusCode,edited.body).toBe(200);expect(object(edited).version).toBe(1);
  }
  for(const [attributes,status] of [[{},400],[{[key]:null},422],[{[key]:true},400],
    [{[key]:attributeValue(p.code)[key],extra:1},400],[{[key]:a.enum?'invalid':a.maximum!+1},422],
    [{[key]:a.enum?123:a.minimum!==undefined?a.minimum-1:0},a.enum?400:422]] as const){
    const before=f.counts(),r=await f.call('POST','/equipment',equipmentInput(p.code,{attributes}));
    expect(r.statusCode,r.body).toBe(status);expect(f.counts()).toEqual(before);
  }
  if(a.type==='integer')expect((await f.call('POST','/equipment',equipmentInput(p.code,{attributes:{[key]:1.5}}))).statusCode).toBe(422);
  const made=object(await f.call('POST','/equipment',equipmentInput(p.code)));
  const beforeInvalidEdit=f.counts(),revisionBeforeInvalidEdit=f.revision();
  const invalidEdit=await f.call('PATCH','/equipment/'+made.id,{commandId:randomUUID(),expectedVersion:1,attributes:{[key]:a.enum?'invalid':a.maximum!+1}});
  expect(invalidEdit.statusCode,invalidEdit.body).toBe(422);
  expect(f.counts()).toEqual(beforeInvalidEdit);expect(f.revision()).toBe(revisionBeforeInvalidEdit);
  for(const forbidden of [{categoryCode:'camera'},{categoryVersion:2},{mobility:'mobile'},{kind:'agent'},{initialState:'operational'},{initialMaintenance:null}])
    expect((await f.call('PATCH','/equipment/'+made.id,{commandId:randomUUID(),expectedVersion:1,...forbidden})).statusCode).toBe(400);
});

it('V01-T4-05/13 — upgrade populado, bytes/recibos e três replays originais T0003',()=>{
  const f=schema2Fixture();try{
    const credentials=sessionFor(f.store,golden.actorId),sessions=f.store.db.prepare('SELECT * FROM local_session').all();
    const before=oldData(f.store);f.store.migrate();expect(oldData(f.store)).toEqual(before);expect(f.store.ready()).toBe(true);
    expect(f.store.db.prepare('SELECT * FROM local_session').all()).toEqual(sessions);
    expect(f.store.db.pragma('foreign_key_check')).toEqual([]);expect(f.store.db.pragma('defer_foreign_keys',{simple:true})).toBe(0);
    const auth=authorization(f.store);
    for(const command of golden.commands){
      const r=command.method==='POST'?createEquipment(auth,credentials,OPERATIONAL_ID,1,command.input):
        updateEquipment(auth,credentials,OPERATIONAL_ID,1,command.route.split('/').at(-1)!,command.input);
      expect(r.replayed).toBe(true);expect(r.body).toEqual(command.response);
    }
    expect(f.store.db.prepare('SELECT * FROM command_receipt').all()).toEqual(golden.tables.command_receipt);
    expect(readdirSync(f.directory).filter(n=>n.endsWith('.backup'))).toHaveLength(1);
    const backup=new Database(join(f.directory,readdirSync(f.directory).find(n=>n.endsWith('.backup'))!),{readonly:true});
    try{
      expect(backup.pragma('user_version',{simple:true})).toBe(2);expect(backup.pragma('integrity_check',{simple:true})).toBe('ok');
      expect(backup.prepare('SELECT * FROM command_receipt').all()).toEqual(golden.tables.command_receipt);
      expect(backup.prepare('SELECT * FROM local_session').all()).toEqual(sessions);
    }finally{backup.close();}
    expect(f.store.migrate().actorId).toBe(golden.actorId);expect(oldData(f.store)).toEqual(before);
  }finally{f.cleanup();}
});

it('V01-T4-05 — falha de ledger reverte DDL/dados da migração',()=>{
  const f=schema2Fixture();try{
    const before=oldData(f.store);
    f.store.db.exec("CREATE TEMP TRIGGER fault BEFORE INSERT ON schema_migration WHEN NEW.version=3 BEGIN SELECT RAISE(ABORT,'migration-test-fault'); END");
    expect(()=>f.store.migrate()).toThrow(/migration-test-fault/);expect(f.store.db.pragma('user_version',{simple:true})).toBe(2);
    expect(oldData(f.store)).toEqual(before);expect(f.store.db.prepare("SELECT name FROM sqlite_master WHERE name='agent'").get()).toBeUndefined();
    expect(f.store.db.pragma('foreign_key_check')).toEqual([]);f.store.db.exec('DROP TRIGGER temp.fault');f.store.migrate();expect(f.store.ready()).toBe(true);
  }finally{f.cleanup();}
});

it('V01-T4-06/07/08 — Agent próprio, matrícula/série, edição e no-op',async()=>{
  const f=await setup(),input=agentInput({enrollmentNumber:' ag-01 '}),r=await f.call('POST','/agents',input);
  expect(r.statusCode,r.body).toBe(201);const a=object(r,'agent');
  expect(a).toMatchObject({kind:'agent',enrollmentNumber:'AG-01',publicLabel:'AG-01',activity:'unknown',version:1,baseLocation:null});
  expect(a).not.toHaveProperty('maintenance');expect(a).not.toHaveProperty('serialNumber');
  expect((await f.call('POST','/agents',agentInput({enrollmentNumber:'AG-01'}))).json().code).toBe('ENROLLMENT_CONFLICT');
  expect((await f.call('POST','/equipment',valid({serialNumber:'AG-01'}))).statusCode).toBe(201);
  expect((await f.call('POST','/equipment',equipmentInput('camera',{serialNumber:'AG-01'}))).json().code).toBe('SERIAL_CONFLICT');
  const change={commandId:randomUUID(),expectedVersion:1,function:'Outra função fictícia',baseLocation:location()};
  const edited=await f.call('PATCH','/agents/'+a.id,change);expect(edited.statusCode,edited.body).toBe(200);
  expect(object(edited,'agent')).toMatchObject({version:2,function:change.function,activity:'unknown'});
  const count=f.counts(),revision=f.revision();
  expect((await f.call('PATCH','/agents/'+a.id,{commandId:randomUUID(),expectedVersion:2,function:change.function})).statusCode).toBe(200);
  expect(f.revision()).toBe(revision);expect(f.counts()).toEqual({...count,command_receipt:count.command_receipt!+1});
  expect((await f.call('GET','/agents/'+a.id)).json().agent.version).toBe(2);
  const other=object(await f.call('POST','/agents',agentInput()),'agent');
  expect((await f.call('PATCH','/agents/'+other.id,{commandId:randomUUID(),expectedVersion:1,enrollmentNumber:' ag-01 '})).json().code).toBe('ENROLLMENT_CONFLICT');
});

it('V01-T4-09/10/11 — instituição/base, CEP/UF/coordenadas/proveniência',async()=>{
  const f=await setup();
  for(const make of [()=>equipmentInput('taxi'),()=>agentInput()]){
    const agent=make().registrationLocation.referenceType==='institutional',route=agent?'/agents':'/equipment';
    for(const [change,status] of [[{postalCode:'01001000'},201],[{latitude:0,longitude:0},201],[{latitude:90,longitude:-180},201],
      [{latitude:1},422],[{latitude:91,longitude:0},422],[{latitude:'1',longitude:1},400],[{uf:'xx'},422],
      [{postalCode:'123'},422],[{regionId:randomUUID()},400],[{observedAt:'2026-10-24T00:00:00Z'},400],
      [{referenceType:agent?'installation':'institutional'},422]] as const){
      const input=make(),r=await f.call('POST',route,{...input,registrationLocation:{...input.registrationLocation,...change}});
      expect(r.statusCode,r.body).toBe(status);
      if(status===201){const row=object(r,agent?'agent':'equipment');expect(row.registrationLocation.regionId).toBeNull();expect(row).not.toHaveProperty('position');}
    }
  }
});

it('V01-T4-18 — paginação Agent, ordem e consultas sem efeitos',async()=>{
  const f=await setup();for(const enrollmentNumber of ['ZZ','AA','MM'])expect((await f.call('POST','/agents',agentInput({enrollmentNumber}))).statusCode).toBe(201);
  expect((await f.call('GET','/agents?page=2&pageSize=1')).json()).toMatchObject({total:3,page:2,pageSize:1,revision:3,items:[{enrollmentNumber:'MM'}]});
  expect((await f.call('GET','/agents?page=99')).json()).toMatchObject({total:3,items:[]});
  for(const [q,status] of [['page=0',422],['pageSize=201',422],['q=x',400],['page=1&page=2',400],['page=1.1',400]] as const)
    expect((await f.call('GET','/agents?'+q)).statusCode).toBe(status);
  expect((await f.call('GET','/agents/'+randomUUID())).statusCode).toBe(404);
  expect((await f.call('GET','/agents')).headers['cache-control']).toBe('no-store');
});

it('V01-T4-20 — declaração inicial, motivo e precondições de instalação',async()=>{
  const f=await setup();
  for(const p of CATEGORIES){
    const operational=equipmentInput(p.code,{initialState:'operational',initialStateReason:'Declaração fictícia explícita',
      registrationLocation:{...location(),referenceType:p.mobility==='fixed'?'installation':'base',latitude:-23,longitude:-46}});
    const r=await f.call('POST','/equipment',operational);expect(r.statusCode,r.body).toBe(p.code===CATEGORY.code?400:201);
    if(p.code===CATEGORY.code){
      const {initialStateReason:_,...old}=operational as Record<string,unknown>;
      expect((await f.call('POST','/equipment',old)).statusCode).toBe(422);
    }else{
      expect(object(r).operationalState).toBe('operational');
      const event=f.store.db.prepare('SELECT changes_json FROM operational_event WHERE resource_id=?').get(object(r).id) as any;
      expect(JSON.parse(event.changes_json).reason).toBe('Declaração fictícia explícita');
    }
  }
  for(const change of [{initialState:'operational'},{initialState:'malfunction'},{initialStateReason:'x'},
    {initialState:'operational',initialStateReason:'x',registrationLocation:location()}])
    expect([400,422]).toContain((await f.call('POST','/equipment',equipmentInput('camera',change))).statusCode);
  expect((await f.call('POST','/equipment',equipmentInput('camera',{registrationLocation:{...location(),referenceType:'installation',latitude:0,longitude:0}}))).json().equipment.operationalState).toBe('not_installed');
});

for(const p of CATEGORIES)it('V01-T4-21 — causas/agendas '+p.code,async()=>{
  const f=await setup(),policy=CATEGORY_POLICIES.find(v=>v.code===p.code)!;
  for(const status of ['dated','unknown','not_applicable']){
    const input=equipmentInput(p.code,{initialMaintenance:maintenance(status)}),r=await f.call('POST','/equipment',input);
    expect(r.statusCode,r.body).toBe(201);expect(object(r).maintenance.requests[0]).toMatchObject({causeCode:policy.initialMaintenance.causeCode,status:'open',version:1});
    expect(object(r).maintenance.nextMaintenance.status).toBe(status);expect(object(r).operationalState).toBe('not_installed');
    expect((await f.call('POST','/equipment',input)).headers['idempotency-replayed']).toBe('true');
  }
  expect(object(await f.call('POST','/equipment',equipmentInput(p.code))).maintenance.requests).toEqual([]);
  expect((await f.call('POST','/equipment',equipmentInput(p.code,{initialMaintenance:{...maintenance(),causeCode:'initial_preventive_check'}}))).statusCode).toBe(400);
});

it('V01-T4-23 — completude/exclusividade no commit e FKs contextuais',async()=>{
  const f=await setup(),db=f.store.db;
  expect(()=>transaction(db,()=>db.prepare("INSERT INTO resource(dataset_id,epoch,id,kind,organization_id,public_label,version) VALUES (?,1,?,'agent',?,'incomplete',1)")
    .run(OPERATIONAL_ID,randomUUID(),'10000000-0000-4000-8000-000000000004'))).toThrow(/FOREIGN KEY/);
  const a=object(await f.call('POST','/agents',agentInput()),'agent'),e=object(await f.call('POST','/equipment',valid()));
  expect(()=>db.prepare("INSERT INTO agent(dataset_id,epoch,id,enrollment_normalized,fictitious_name,function) VALUES (?,1,?,'SECOND','Nome','Função')").run(OPERATIONAL_ID,e.id)).toThrow(/FOREIGN KEY/);
  for(const table of ['agent','current_state','resource_location'])
    expect(()=>transaction(db,()=>db.prepare('DELETE FROM '+table+' WHERE dataset_id=? AND '+(table==='agent'?'id':'resource_id')+'=?').run(OPERATIONAL_ID,a.id))).toThrow(/FOREIGN KEY/);
  expect(()=>db.exec('UPDATE equipment SET attributes_json=\'{"regulatedSpeedLimitKmh":60,"extra":1}\'')).toThrow(/attributes/);
  expect(db.pragma('foreign_key_check')).toEqual([]);
});
