import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Context, Credentials, Authorization } from '../auth.js';
import { AppError } from '../errors.js';
import { executeCommand } from '../idempotency/command.js';
import { canonicalJson } from '../idempotency/json.js';
import { agentInput, agentCreateFields, agentUpdateFields, ORGANIZATION_ID, invalid } from './contract.js';
import type { ObjectJson } from './contract.js';
import { locations, writeLocation, event } from './service.js';

export function agentView(db: Database.Database, c: Context, id: string): ObjectJson {
  const row = db.prepare(`SELECT r.id,r.public_label AS publicLabel,r.version,
    a.enrollment_normalized AS enrollmentNumber,a.fictitious_name AS fictitiousName,a.function,s.activity,
    o.id AS organizationId,o.code AS organizationCode,o.name AS organizationName
    FROM resource r JOIN agent a USING(dataset_id,epoch,id)
    JOIN current_state s ON s.dataset_id=r.dataset_id AND s.epoch=r.epoch AND s.resource_id=r.id
    JOIN organization o ON o.dataset_id=r.dataset_id AND o.epoch=r.epoch AND o.id=r.organization_id
    WHERE r.dataset_id=? AND r.epoch=? AND r.id=? AND r.archived=0`).get(c.datasetId,c.epoch,id) as
    {id:string;publicLabel:string;version:number;enrollmentNumber:string;fictitiousName:string;function:string;activity:string;organizationId:string;organizationCode:string;organizationName:string} | undefined;
  if (!row) throw new AppError(404,'NOT_FOUND','Agente não disponível neste contexto.');
  const loc = locations(db,c,id);
  return {id:row.id,kind:'agent',publicLabel:row.publicLabel,version:row.version,
    enrollmentNumber:row.enrollmentNumber,fictitiousName:row.fictitiousName,function:row.function,activity:row.activity,
    organization:{id:row.organizationId,code:row.organizationCode,name:row.organizationName},
    registrationLocation:loc.registration!,baseLocation:loc.base ?? null};
}
function unique(db: Database.Database,c:Context,enrollment:unknown,except:string|null=null) {
  if (db.prepare('SELECT 1 FROM agent WHERE dataset_id=? AND epoch=? AND enrollment_normalized=? AND (? IS NULL OR id!=?)')
    .get(c.datasetId,c.epoch,enrollment,except,except)) throw new AppError(409,'ENROLLMENT_CONFLICT','Matrícula já cadastrada neste contexto.');
}
export function createAgentInUnit(db:Database.Database,c:Context,input:ObjectJson,commandId:string,resourceId?:string) {
  if(!db.inTransaction)throw new Error('Cadastro exige unidade de trabalho.');
  const value=agentInput({commandId,...input}).body;
      if (value.organizationId !== ORGANIZATION_ID || !db.prepare('SELECT 1 FROM organization WHERE dataset_id=? AND epoch=? AND id=?')
        .get(c.datasetId,c.epoch,value.organizationId)) invalid('Organização não admitida neste contexto.');
      unique(db,c,value.enrollmentNumber);
      const id=resourceId ?? randomUUID();
      db.prepare("INSERT INTO resource(dataset_id,epoch,id,kind,organization_id,public_label,version) VALUES (?,?,?,'agent',?,?,1)")
        .run(c.datasetId,c.epoch,id,value.organizationId,value.enrollmentNumber);
      db.prepare('INSERT INTO agent(dataset_id,epoch,id,enrollment_normalized,fictitious_name,function) VALUES (?,?,?,?,?,?)')
        .run(c.datasetId,c.epoch,id,value.enrollmentNumber,value.fictitiousName,value.function);
      writeLocation(db,c,id,'registration',value.registrationLocation as ObjectJson);
      writeLocation(db,c,id,'base',value.baseLocation as ObjectJson|null);
      db.prepare("INSERT INTO current_state(dataset_id,epoch,resource_id,activity,version) VALUES (?,?,?,'unknown',1)").run(c.datasetId,c.epoch,id);
  return agentView(db,c,id);
}
export function createAgent(auth:Authorization, credentials:Credentials,datasetId:string,epoch:number,input:unknown) {
  const {commandId,body} = agentInput(input);
  return executeCommand(auth,credentials,{
    operation:'inventory.agent.create.v1',fields:agentCreateFields,
    apply(db,c,value) {
      const view=createAgentInUnit(db,c,value,commandId);
      const revision=event(db,c,view.id as string,1,commandId,'inventory.agent.create.v1',null,view);
      return {status:201,body:{datasetId:c.datasetId,epoch:c.epoch,revision,agent:view},resultingRevision:revision};
    },
  },{datasetId,epoch,commandId,body});
}
export function updateAgent(auth:Authorization,credentials:Credentials,datasetId:string,epoch:number,id:string,input:unknown) {
  const {commandId,body}=agentInput(input,true);
  return executeCommand(auth,credentials,{
    operation:'inventory.agent.update.v1',fields:agentUpdateFields,
    apply(db,c,value) {
      const before=agentView(db,c,id);
      if (before.version!==value.expectedVersion) throw new AppError(409,'VERSION_CONFLICT','Versão alterada. Consulte o cadastro e revise sua edição.');
      const changed=Object.keys(value).filter(k=>k!=='expectedVersion').some(k=>{
        const previous=before[k];
        const compared=k.endsWith('Location') && previous ? Object.fromEntries(Object.entries(previous as ObjectJson).filter(([name])=>name!=='regionId')) : previous;
        return canonicalJson(compared!)!==canonicalJson(value[k]!);
      });
      if (!changed) return {status:200,body:{datasetId:c.datasetId,epoch:c.epoch,revision:c.revision,agent:before},resultingRevision:c.revision};
      const merged={...before,...value},version=(before.version as number)+1;
      unique(db,c,merged.enrollmentNumber,id);
      db.prepare('UPDATE resource SET public_label=?,version=? WHERE dataset_id=? AND epoch=? AND id=? AND version=?')
        .run(merged.enrollmentNumber,version,c.datasetId,c.epoch,id,value.expectedVersion);
      db.prepare('UPDATE agent SET enrollment_normalized=?,fictitious_name=?,function=? WHERE dataset_id=? AND epoch=? AND id=?')
        .run(merged.enrollmentNumber,merged.fictitiousName,merged.function,c.datasetId,c.epoch,id);
      for (const [key,role] of [['registrationLocation','registration'],['baseLocation','base']] as const) if(Object.hasOwn(value,key))
        writeLocation(db,c,id,role,value[key] as ObjectJson|null);
      const view=agentView(db,c,id),revision=event(db,c,id,version,commandId,'inventory.agent.update.v1',before,view);
      return {status:200,body:{datasetId:c.datasetId,epoch:c.epoch,revision,agent:view},resultingRevision:revision};
    },
  },{datasetId,epoch,commandId,target:{type:'agent',id},body});
}
