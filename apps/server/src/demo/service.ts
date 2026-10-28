import type Database from 'better-sqlite3';
import type { Authorization,Credentials,Context } from '../auth.js';
import { AppError } from '../errors.js';
import { executeCommand } from '../idempotency/command.js';
import type { CommandMetrics } from '../idempotency/command.js';
import { canonicalJson,hashJson,parseJson } from '../idempotency/json.js';
import type { ObjectJson } from '../inventory/contract.js';
import { createEquipmentInUnit,event } from '../inventory/service.js';
import { createAgentInUnit } from '../inventory/agents.js';
import { demoReferenceIssue,prepareDemoReferences } from '../inventory/demo-references.js';
import { generationInput,generationFields,makePlan,projection,VERSIONS,CREATION_REASON } from './engine.js';
import { assertBaselineIntegrity } from './integrity.js';

function kind(db:Database.Database,c:Context) {return (db.prepare('SELECT kind FROM dataset WHERE id=?').get(c.datasetId) as {kind:string}).kind;}
function currentManifest(db:Database.Database,c:Context):ObjectJson|null {
  const m=db.prepare('SELECT * FROM demo_manifest WHERE dataset_id=? AND epoch=?').get(c.datasetId,c.epoch) as Record<string,string|number>|undefined;
  if(!m)return null;
  assertBaselineIntegrity(db,c.datasetId,c.epoch,m);
  return {manifestVersion:1,projectionVersion:1,mode:'baseline',manifestId:m.id!,datasetId:c.datasetId,epoch:c.epoch,
    createdRevision:m.created_revision!,configuration:parseJson(m.parameters_json as string),seed:(parseJson(m.parameters_json as string) as ObjectJson).seed!,
    baseTime:m.base_time!,tickDuration:null,regionVersion:null,counts:parseJson(m.counts_json as string),parametersHash:m.parameters_hash!,
    contentHash:m.content_hash!,eventCount:(parseJson(m.counts_json as string) as ObjectJson).resources!,provenance:'synthetic_baseline',
    origin:{actorId:m.actor_id!,operation:m.operation!,commandId:m.command_id!},audit:{receivedAt:m.received_at!,wallRecordedAt:m.wall_recorded_at!}};
}
export function domainIssue(db:Database.Database,c:Context):string|null {
  if(db.prepare('SELECT 1 FROM demo_manifest WHERE dataset_id=? AND epoch=?').get(c.datasetId,c.epoch))return 'DEMO_BASELINE_EXISTS';
  for(const table of ['resource','equipment','agent','resource_location','current_state','maintenance_request','operational_event'])
    if(db.prepare(`SELECT 1 FROM ${table} WHERE dataset_id=? AND epoch=? LIMIT 1`).get(c.datasetId,c.epoch))return 'DEMO_NOT_EMPTY';
  return demoReferenceIssue(db,c);
}
export function readDemo(auth:Authorization,credentials:Credentials,datasetId:string,epoch:number) {
  return auth.store.db.transaction(()=>{
    const c=auth.context(credentials,datasetId,epoch),db=auth.store.db,datasetKind=kind(db,c);
    const reason=auth.writeAvailability(c)??(datasetKind!=='demo'?'DEMO_ONLY':domainIssue(db,c));
    return {datasetId:c.datasetId,epoch:c.epoch,revision:c.revision,datasetKind,eligibility:{eligible:reason===null,reason},
      limits:{equipment:200,agents:30},versions:{...VERSIONS},manifest:datasetKind==='demo'?currentManifest(db,c):null};
  }).deferred();
}
export function generateDemo(auth:Authorization,credentials:Credentials,datasetId:string,epoch:number,input:unknown,
  metrics?:CommandMetrics,receivedAt=new Date().toISOString()) {
  const {commandId,body}=generationInput(input),initial=auth.context(credentials,datasetId,epoch,true);
  if(kind(auth.store.db,initial)!=='demo')throw new AppError(403,'DEMO_ONLY','Geração disponível somente no contexto demonstrativo.');
  const plan=makePlan(body); // Pure bounded planning, outside the SQLite writer lock.
  return executeCommand(auth,credentials,{operation:'demo.generate.v1',fields:generationFields,demoOnly:true,...(metrics?{metrics}:{}),
    apply(db,c) {
      const issue=domainIssue(db,c);if(issue)throw new AppError(409,issue,'Contexto demonstrativo não elegível. Consulte o manifesto e os cadastros.');
      if(c.revision!==body.expectedRevision||c.revision===Number.MAX_SAFE_INTEGER)throw new AppError(409,'VERSION_CONFLICT','Revisão alterada. Confira o contexto antes de gerar.');
      const revision=c.revision+1;
      const changed=db.prepare('UPDATE dataset_epoch SET revision=? WHERE dataset_id=? AND epoch=? AND revision=?').run(revision,c.datasetId,c.epoch,c.revision);
      if(changed.changes!==1)throw new AppError(409,'VERSION_CONFLICT','Revisão alterada.');
      prepareDemoReferences(db,c);
      db.prepare(`INSERT INTO demo_manifest(dataset_id,epoch,id,operation,actor_id,command_id,created_revision,expected_equipment,expected_agents,
        parameters_json,parameters_hash,projection_json,content_hash,counts_json,base_time,received_at,wall_recorded_at)
        VALUES(?,?,?,'demo.generate.v1',?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(c.datasetId,c.epoch,plan.manifestId,c.actorId,commandId,revision,
        plan.counts.equipment,plan.counts.agents,canonicalJson(plan.configuration),plan.parametersHash,canonicalJson(plan.projection),plan.contentHash,
        canonicalJson(plan.counts),plan.baseTime,receivedAt,new Date().toISOString());
      const member=db.prepare(`INSERT INTO demo_member VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`),views:ObjectJson[]=[];
      for(const i of plan.items){
        const rawView=i.kind==='equipment'?createEquipmentInUnit(db,c,i.body,commandId,{resourceId:i.id,...(i.maintenanceId?{maintenanceId:i.maintenanceId}:{})})
          :createAgentInUnit(db,c,i.body,commandId,i.id),view:ObjectJson={...rawView,registrationLocation:{...(rawView.registrationLocation as ObjectJson),regionId:null}};
        member.run(c.datasetId,c.epoch,plan.manifestId,i.ordinal,i.logicalKey,i.id,i.kind,i.eventId,i.maintenanceId,revision,c.actorId,commandId);
        event(db,c,i.id,1,commandId,`inventory.${i.kind}.create.v1`,null,view,CREATION_REASON,
          {id:i.eventId,revision,ordinal:i.ordinal,baseTime:plan.baseTime,receivedAt});
        views.push(view);
      }
      const actual=projection(plan.configuration,plan.items,views,plan.baseTime);
      if(canonicalJson(actual)!==canonicalJson(plan.projection)||hashJson(actual).hash!==plan.contentHash)throw new Error('Projeção do domínio diverge do plano.');
      db.prepare('INSERT INTO demo_seal VALUES(?,?,?)').run(c.datasetId,c.epoch,plan.manifestId);
      return {status:201,body:{datasetId:c.datasetId,epoch:c.epoch,revision,manifest:currentManifest(db,c),
        resources:plan.items.map(i=>({logicalKey:i.logicalKey,id:i.id}))},resultingRevision:revision};
    }},{datasetId,epoch,commandId,body});
}
