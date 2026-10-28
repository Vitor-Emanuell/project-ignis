import type Database from 'better-sqlite3';
import {canonicalJson,hashJson} from '../idempotency/json.js';
import type {ObjectJson} from '../inventory/contract.js';
import {projectItem} from './engine.js';

export class BaselineIntegrityError extends Error {
  constructor(){super('Integridade do baseline divergente.');this.name='BaselineIntegrityError';}
}
type ManifestRow=Record<string,string|number>;
type Member={manifest_id:string;logical_key:string;resource_id:string;kind:'equipment'|'agent';event_id:string;
  maintenance_id:string|null;revision:number;ordinal:number;actor_id:string;command_id:string};
type StoredEvent={id:string;resource_id:string;action:string;actor_id:string;command_id:string;resource_version:number;
  revision:number;ordinal:number;effective_at:string;recorded_at:string;received_at:string;changes_json:string};
const fail=():never=>{throw new BaselineIntegrityError();};
function object(value:unknown):ObjectJson {
  if(!value||typeof value!=='object'||Array.isArray(value))return fail();
  return value as ObjectJson;
}
function storedJson(value:string|number|undefined){
  // Internal snapshots can exceed the HTTP parser's 64 KiB limit. Stored JSON must
  // already be canonical: this also rejects duplicate keys or lossy numeric input.
  try{if(typeof value!=='string')return fail();const parsed:unknown=JSON.parse(value);
    if(canonicalJson(parsed)!==value)return fail();return parsed;
  }catch{return fail();}
}
const exactKeys=(value:ObjectJson,keys:string[])=>{
  if(canonicalJson(Object.keys(value).sort())!==canonicalJson([...keys].sort()))fail();
};

// Creation events contain enriched Inventory views. Map their stored changes to the
// ratified semantic projection; never regenerate reason/evidence/facts from the recipe.
function persistedResource(member:Member,event:StoredEvent,organizations:ObjectJson[]):ObjectJson {
  const payload=object(storedJson(event.changes_json));exactKeys(payload,['reason','evidenceIds','changes']);
  if(typeof payload.reason!=='string'||!Array.isArray(payload.evidenceIds)||!Array.isArray(payload.changes))return fail();
  const view:ObjectJson={};
  for(const value of payload.changes){
    const change=object(value);exactKeys(change,['fieldPath','before','after']);
    if(typeof change.fieldPath!=='string'||change.before!==null||Object.hasOwn(view,change.fieldPath))return fail();
    Object.defineProperty(view,change.fieldPath,{value:change.after,enumerable:true});
  }
  exactKeys(view,['id','kind','publicLabel','version','organization','registrationLocation','baseLocation',
    ...(member.kind==='agent'?['enrollmentNumber','fictitiousName','function','activity']:
      ['category','serialNumber','brand','model','criticality','mobility','attributes','operationalState','maintenance'])]);
  const organization=object(view.organization);
  if(!organizations.some(o=>o.logicalKey==='organization/ORG_LOCAL'&&o.id===organization.id&&o.code===organization.code&&o.name===organization.name))return fail();
  try{
    const result=projectItem({logicalKey:member.logical_key,id:member.resource_id,kind:member.kind,eventId:event.id,
      maintenanceId:member.maintenance_id,ordinal:event.ordinal,body:{}},view,event.effective_at);
    if(result.id!==member.resource_id||view.kind!==member.kind||
      (result.initialMaintenance===null?null:object(result.initialMaintenance).id)!==member.maintenance_id)return fail();
    result.event={id:event.id,action:event.action,resourceVersion:event.resource_version,ordinal:event.ordinal,
      effectiveAt:event.effective_at,recordedAt:event.recorded_at,reason:payload.reason,evidenceIds:payload.evidenceIds,
      changes:object(result.event).changes!};
    return result;
  }catch(error){if(error instanceof BaselineIntegrityError)throw error;return fail();}
}

// Reads immutable initial events, not current editable resources. The caller owns
// a consistent transaction (also used before the generation's COMMIT).
export function assertBaselineIntegrity(db:Database.Database,datasetId:string,epoch:number,m:ManifestRow):void {
  const snapshot=object(storedJson(m.projection_json)),parameters=object(storedJson(m.parameters_json));
  if(hashJson(snapshot).hash!==m.content_hash||hashJson(parameters).hash!==m.parameters_hash||
    !Array.isArray(snapshot.resources)||!Array.isArray(snapshot.organizations))return fail();
  const expected=snapshot.resources.map(object),organizations=snapshot.organizations.map(object);
  const members=db.prepare(`SELECT * FROM demo_member WHERE dataset_id=? AND epoch=? AND manifest_id=?
    ORDER BY revision,ordinal`).all(datasetId,epoch,m.id) as Member[];
  const events=db.prepare(`SELECT * FROM operational_event WHERE dataset_id=? AND epoch=? AND revision=?
    ORDER BY revision,ordinal`).all(datasetId,epoch,m.created_revision) as StoredEvent[];
  if(expected.length!==Number(m.expected_equipment)+Number(m.expected_agents)||members.length!==expected.length||events.length!==expected.length)return fail();
  const resources=events.map((event,i)=>{
    const member=members[i]!,b=expected[i]!,initial=object(b.event);
    if(member.manifest_id!==m.id||member.revision!==m.created_revision||event.revision!==m.created_revision||
      member.ordinal!==i+1||event.ordinal!==i+1||member.actor_id!==m.actor_id||event.actor_id!==m.actor_id||
      member.command_id!==m.command_id||event.command_id!==m.command_id||event.received_at!==m.received_at||
      member.resource_id!==event.resource_id||member.resource_id!==b.id||member.kind!==b.kind||
      member.logical_key!==b.logicalKey||member.event_id!==event.id||member.event_id!==initial.id)return fail();
    return persistedResource(member,event,organizations);
  });
  const actual={projectionVersion:1,mode:'baseline',parameters,organizations:snapshot.organizations,resources};
  if(canonicalJson(actual)!==canonicalJson(snapshot)||hashJson(actual).hash!==m.content_hash)fail();
}
