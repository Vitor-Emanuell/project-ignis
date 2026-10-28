import {randomUUID} from 'node:crypto';
import {inventoryFixture} from './inventory-fixture.js';
import {PRESET} from '../../src/demo/engine.js';
export const generation=(changes:Record<string,unknown>={})=>({commandId:randomUUID(),expectedRevision:0,...structuredClone(PRESET),...changes});
export async function demoFixture(){
  const f=await inventoryFixture(false),datasetId=f.installation.datasetId,epoch=1;
  const path=`/api/v1/datasets/${datasetId}/epochs/${epoch}`;
  return {...f,datasetId,epoch,databasePath:f.path,path,
    read:()=>f.app.inject({method:'GET',url:path+'/demo-data',headers:f.headers}),
    generate:(body:Record<string,unknown>=generation())=>f.app.inject({method:'POST',url:path+'/demo-data',headers:f.headers,payload:body}),
    revision:()=> (f.store.db.prepare('SELECT revision FROM dataset_epoch WHERE dataset_id=? AND epoch=?').get(datasetId,epoch) as {revision:number}).revision,
    groupCounts:()=>Object.fromEntries(['resource','equipment','agent','maintenance_request','operational_event','demo_manifest','demo_member','demo_seal','command_receipt']
      .map(t=>[t,(f.store.db.prepare(`SELECT count(*) AS n FROM ${t} WHERE dataset_id=? AND epoch=?`).get(datasetId,epoch) as {n:number}).n])),
  };
}
