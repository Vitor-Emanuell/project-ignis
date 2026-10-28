import {afterEach,beforeAll,expect,it,vi} from 'vitest';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import Database from 'better-sqlite3';
import {transaction} from '../src/persistence/store.js';
import {demoFixture,generation} from './support/t0005-fixture.js';
import {schema2Fixture,oldData} from './support/t0004-fixture.js';
import {addDataset,sessionFor,authorization} from './support/foundation-fixture.js';
import {generateDemo} from '../src/demo/service.js';
import {generationInput} from '../src/demo/engine.js';
import {hashJson} from '../src/idempotency/json.js';
type F=Awaited<ReturnType<typeof demoFixture>>;
const fixtures:F[]=[];afterEach(async()=>{for(const f of fixtures.splice(0))await f.cleanup();});
async function setup(){const f=await demoFixture();fixtures.push(f);return f;}
const tables=['organization','demo_manifest','resource','equipment','agent','resource_location','current_state','maintenance_request','demo_member','operational_event','demo_seal','command_receipt'];
let snapshot:Record<string,Record<string,any>[]>;let original:ReturnType<typeof generation>;
beforeAll(async()=>{const f=await demoFixture();try{original=generation();expect((await f.generate(original)).statusCode).toBe(201);
  snapshot=Object.fromEntries(tables.map(t=>{const columns=(f.store.db.pragma('table_xinfo('+t+')') as any[]).filter(x=>x.hidden===0).map(x=>x.name);
    return [t,f.store.db.prepare('SELECT '+columns.join(',')+' FROM '+t+' WHERE dataset_id=? AND epoch=1').all(f.datasetId) as Record<string,any>[]];}));
}finally{await f.cleanup();}});
function copy(f:F,mutate:(rows:typeof snapshot)=>void=()=>{}){
  const rows=structuredClone(snapshot),actor=f.installation.actorId;
  for(const [table,records] of Object.entries(rows))for(const r of records){r.dataset_id=f.datasetId;if('actor_id'in r)r.actor_id=actor;
    if(table==='command_receipt'){
      const response=JSON.parse(r.response_body);response.datasetId=f.datasetId;response.manifest.datasetId=f.datasetId;response.manifest.origin.actorId=actor;
      r.response_body=JSON.stringify(response);r.request_hash=hashJson({canonicalVersion:1,datasetId:f.datasetId,epoch:1,actorId:actor,
        operation:'demo.generate.v1',target:null,body:generationInput(original).body}).hash;
    }}
  mutate(rows);
  transaction(f.store.db,()=>{
    f.store.db.prepare('UPDATE dataset_epoch SET revision=1 WHERE dataset_id=?').run(f.datasetId);
    for(const t of tables)for(const row of rows[t]!){const keys=Object.keys(row);f.store.db.prepare(`INSERT INTO ${t}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...Object.values(row));}
  });
}
it('V02-T5-15 — grupo íntegro confirma por SQL real; certificado não é só guarda JS',async()=>{
  const f=await setup();copy(f);expect(f.groupCounts().demo_seal).toBe(1);expect(f.store.db.pragma('foreign_key_check')).toEqual([]);
});
const attacks:Record<string,(rows:typeof snapshot)=>void>={
  'prefixo':r=>{r.demo_member!.pop();r.operational_event!.pop();},
  'buraco':r=>{r.demo_member!.splice(4,1);r.operational_event!.splice(4,1);},
  'ordinal duplicado':r=>{r.demo_member![1]!.ordinal=1;},
  'ordinal zero':r=>{r.demo_member![0]!.ordinal=0;},
  'N incorreto':r=>{r.demo_manifest![0]!.expected_agents=5;},
  'recurso alheio':r=>{r.demo_member![0]!.resource_id=r.demo_member![1]!.resource_id;},
  'evento alheio':r=>{r.demo_member![0]!.event_id=randomUUID();},
  'contexto alheio':r=>{r.demo_member![0]!.dataset_id=randomUUID();},
  'revisão alheia':r=>{r.demo_member![0]!.revision=2;},
  'pai alheio':r=>{r.demo_member![0]!.command_id=randomUUID();},
  'sem fechamento':r=>{r.demo_seal=[];},
  'sem recibo':r=>{r.command_receipt=[];},
  'recibo divergente':r=>{r.command_receipt![0]!.resulting_revision=2;},
  'distribuição adulterada':r=>{const p=JSON.parse(r.demo_manifest![0]!.parameters_json);p.equipmentByCategory[0].count++;p.equipmentByCategory[1].count--;r.demo_manifest![0]!.parameters_json=JSON.stringify(p);},
  'somente recibo':r=>{for(const t of tables)if(t!=='command_receipt')r[t]=[];},
};
for(const [name,attack] of Object.entries(attacks))it('V02-T5-15 A02 — SQL direto rejeita '+name,async()=>{
  const f=await setup();expect(()=>copy(f,attack)).toThrow();expect(Object.values(f.groupCounts()).every(x=>x===0)).toBe(true);
  expect(f.revision()).toBe(0);expect(f.store.db.inTransaction).toBe(false);
});
it('V02-T5-15 — fechamento antecipado e grupo/recibo imutáveis, inclusive REPLACE',async()=>{
  const f=await setup();
  expect(()=>transaction(f.store.db,()=>{
    f.store.db.prepare('UPDATE dataset_epoch SET revision=1 WHERE dataset_id=?').run(f.datasetId);
    const m:Record<string,any>={...snapshot.demo_manifest![0],dataset_id:f.datasetId,actor_id:f.installation.actorId};const keys=Object.keys(m);
    f.store.db.prepare(`INSERT INTO demo_manifest(${keys.join(',')}) VALUES(${keys.map(()=>'?')})`).run(...Object.values(m));
    f.store.db.prepare('INSERT INTO demo_seal VALUES(?,1,?)').run(f.datasetId,m.id);
  })).toThrow(/Incomplete/);
  expect((await f.generate()).statusCode).toBe(201);
  for(const t of ['demo_manifest','demo_member','demo_seal','operational_event','command_receipt']){
    const column=t==='demo_seal'?'manifest_id':t==='demo_member'?'logical_key':t==='command_receipt'?'request_hash':'id';
    expect(()=>f.store.db.exec(`UPDATE ${t} SET ${column}=${column}`)).toThrow();
    expect(()=>f.store.db.exec(`DELETE FROM ${t}`)).toThrow();
  }
  expect(()=>f.store.db.exec('INSERT OR REPLACE INTO demo_seal SELECT * FROM demo_seal')).toThrow();
  const e=f.store.db.prepare('SELECT * FROM operational_event LIMIT 1').get() as Record<string,any>;
  e.id=randomUUID();e.ordinal=27;e.command_id=randomUUID();const keys=Object.keys(e);
  expect(()=>f.store.db.prepare(`INSERT INTO operational_event(${keys}) VALUES(${keys.map(()=>'?')})`).run(...Object.values(e))).toThrow(/Closed/);
});
it('V02-T5-15 — rollback após cada fronteira persistente e serialização',async()=>{
  for(const table of ['organization','demo_manifest','resource','equipment','agent','resource_location','current_state','maintenance_request','demo_member','operational_event','demo_seal','command_receipt']){
    const f=await setup();f.store.db.exec(`CREATE TEMP TRIGGER fail_test AFTER INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'test-fault'); END`);
    const r=await f.generate();expect(r.statusCode,table+': '+r.body).toBe(500);expect(Object.values(f.groupCounts()).every(x=>x===0),table).toBe(true);expect(f.revision()).toBe(0);
  }
});
it('V02-T5-01/04/17 — mesmos UUIDs no mesmo banco, FKs de contexto completas',async()=>{
  const f=await setup(),other=randomUUID();addDataset(f.store,other,2,f.installation.actorId);
  const first=await f.generate(),second=await f.app.inject({method:'POST',url:`/api/v1/datasets/${other}/epochs/2/demo-data`,headers:f.headers,payload:generation()});
  expect(second.statusCode,second.body).toBe(201);expect(first.json().resources).toEqual(second.json().resources);
  expect(first.json().manifest.contentHash).toBe(second.json().manifest.contentHash);expect(f.store.db.pragma('foreign_key_check')).toEqual([]);
});
it('V02-T5-15 — resposta não serializável reverte inclusive manifesto e fechamento',async()=>{
  const f=await setup(),prepare=f.store.db.prepare.bind(f.store.db);
  const spy=vi.spyOn(f.store.db,'prepare').mockImplementation(((sql:string)=>{
    const statement=prepare(sql);
    if(sql==='SELECT * FROM demo_manifest WHERE dataset_id=? AND epoch=?')return {get:(...args:unknown[])=>({...statement.get(...args) as Record<string,unknown>,id:undefined})};
    return statement;
  }) as typeof f.store.db.prepare);
  try{expect((await f.generate()).statusCode).toBe(500);expect(Object.values(f.groupCounts()).every(x=>x===0)).toBe(true);expect(f.revision()).toBe(0);}
  finally{spy.mockRestore();}
});
it('V02-T5-23 — upgrade 3 populado, backup e rollback preservam dados/recibos legados',()=>{
  const f=schema2Fixture();try{
    const sql=readFileSync(new URL('../migrations/0003-heterogeneous-inventory.sql',import.meta.url),'utf8').replace(/\r\n/g,'\n');
    transaction(f.store.db,()=>{f.store.db.exec(sql);f.store.db.prepare('INSERT INTO schema_migration VALUES(3,?)').run(createHash('sha256').update(sql).digest('hex'));f.store.db.pragma('user_version=3');});
    const before=oldData(f.store);f.store.db.exec("CREATE TEMP TRIGGER migration_fault AFTER INSERT ON schema_migration WHEN NEW.version=4 BEGIN SELECT RAISE(ABORT,'t5-migration-fault'); END");
    expect(()=>f.store.migrate()).toThrow(/t5-migration-fault/);expect(oldData(f.store)).toEqual(before);expect(f.store.db.pragma('user_version',{simple:true})).toBe(3);
    f.store.db.exec('DROP TRIGGER migration_fault');f.store.migrate();expect(oldData(f.store)).toEqual(before);expect(f.store.ready()).toBe(true);
    const backups=readdirSync(f.directory).filter(p=>p.includes('.schema3-'));expect(backups.length).toBeGreaterThan(0);
    const backup=new Database(f.directory+'/'+backups[0],{readonly:true});try{expect(backup.pragma('user_version',{simple:true})).toBe(3);expect(backup.pragma('integrity_check',{simple:true})).toBe('ok');}finally{backup.close();}
  }finally{f.cleanup();}
});
it('V02-T5-19 — referências divergentes e dados existentes preservados',async()=>{
  const f=await setup();f.store.db.prepare("INSERT INTO organization VALUES(?,1,?,'OTHER','Órgão divergente')").run(f.datasetId,randomUUID());
  const before=f.store.db.prepare('SELECT * FROM organization').all();expect((await f.generate()).json().code).toBe('DEMO_REFERENCE_CONFLICT');
  expect(f.store.db.prepare('SELECT * FROM organization').all()).toEqual(before);expect(f.revision()).toBe(0);
});
