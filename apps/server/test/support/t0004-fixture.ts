import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store,transaction} from '../../src/persistence/store.js';
import {CATEGORIES} from '../../src/inventory/catalog.js';
import {valid,location} from './inventory-fixture.js';
export const agentInput=(changes:Record<string,unknown>={})=>({
  commandId:randomUUID(),organizationId:'10000000-0000-4000-8000-000000000004',
  enrollmentNumber:' ag-'+randomUUID()+' ',fictitiousName:'Agente fictício',function:'Fiscalização fictícia',
  registrationLocation:{...location(),referenceType:'institutional'},...changes,
});
export function attributeValue(code:string) {
  const [key,a]=Object.entries(CATEGORIES.find(p=>p.code===code)!.attributes)[0]!;
  return {[key]:a.enum?.[0]??a.minimum??1};
}
export const equipmentInput=(code:string,changes:Record<string,unknown>={})=>valid({categoryCode:code,attributes:attributeValue(code),...changes});
export const golden=JSON.parse(readFileSync(new URL('../fixtures/t0003-upgrade.json',import.meta.url),'utf8')) as {
  actorId:string;commands:{method:string;route:string;input:Record<string,unknown>;response:unknown}[];
  tables:Record<string,Record<string,unknown>[]>;
};
// Captured responses/hashes from the original T0003 service; do not recalculate old expectations.
export function schema2Fixture(){
  const directory=mkdtempSync(join(tmpdir(),'ignis-t0004-upgrade-')),path=join(directory,'schema2.sqlite'),store=new Store(path,true);
  transaction(store.db,()=>{
    store.db.exec('CREATE TABLE schema_migration(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL)');
    for(const [i,name] of ['0001-foundation.sql','0002-inventory.sql'].entries()){
      const sql=readFileSync(new URL('../../migrations/'+name,import.meta.url),'utf8').replace(/\r\n/g,'\n');
      store.db.exec(sql);store.db.prepare('INSERT INTO schema_migration VALUES (?,?)').run(i+1,createHash('sha256').update(sql).digest('hex'));
    }
    store.db.pragma('defer_foreign_keys=ON');
    for(const [table,rows] of Object.entries(golden.tables)){
      if(table==='category_version')continue;
      for(const row of rows){const keys=Object.keys(row);store.db.prepare('INSERT INTO '+table+'('+keys.join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')').run(...Object.values(row));}
    }
    store.db.pragma('user_version=2');
  });
  return {directory,path,store,cleanup(){store.close();rmSync(directory,{recursive:true,force:true});}};
}
export function oldData(store:Store){
  return Object.fromEntries(Object.entries(golden.tables).map(([table,rows])=>{
    const keys=Object.keys(rows[0]??{}),values=keys.length?store.db.prepare('SELECT '+keys.join(',')+' FROM '+table).all():[];
    return [table,table==='category_version'?(values as {category_code:string}[]).filter(r=>r.category_code==='fixed_speed_radar'):values];
  }));
}
