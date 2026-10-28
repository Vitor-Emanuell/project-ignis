import { createHash } from 'node:crypto';
import { AppError } from '../errors.js';
import { canonicalJson, hashJson } from '../idempotency/json.js';
import type { Json } from '../idempotency/json.js';
import { normalizeBody } from '../idempotency/normalize.js';
import type { Field } from '../idempotency/normalize.js';
import { CATEGORIES, profile, policy } from '../inventory/catalog.js';
import { ORGANIZATION_ID, inventoryInput, agentInput } from '../inventory/contract.js';
import type { ObjectJson } from '../inventory/contract.js';

export const VERSIONS = { scenarioCode:'ignis-baseline', scenarioVersion:1,
  generatorVersion:'t5-baseline-v1', prngVersion:'sha256-counter32-v1' } as const;
export const ORGANIZATION = { id:ORGANIZATION_ID, code:'ORG_LOCAL', name:'Órgão municipal fictício' };
const sorted = [...CATEGORIES].sort((a,b)=>a.code<b.code?-1:a.code>b.code?1:a.version-b.version);
const double = new Set(['camera','fixed_speed_radar','motorcycle','official_vehicle','school_transport_vehicle','taxi']);
export const PRESET = { ...VERSIONS, seed:'ignis-t5-001', baseTime:'2026-10-24T12:00:00.000Z',
  equipmentByCategory:sorted.map(p=>({code:p.code,version:p.version,count:double.has(p.code)?2:1})), agentCount:6 };
export const generationFields: Readonly<Record<string,Field>> = {
  expectedRevision:{type:'integer',min:0}, scenarioCode:{type:'string',min:1}, scenarioVersion:{type:'integer',min:1},
  generatorVersion:{type:'string',min:1},prngVersion:{type:'string',min:1}, seed:{type:'string',min:1,max:256},
  baseTime:{type:'timestamp'}, equipmentByCategory:{type:'array',items:{type:'object',fields:{
    code:{type:'string',min:1},version:{type:'integer',min:1},count:{type:'integer',min:1,max:200}}}},
  agentCount:{type:'integer',min:0,max:30},
};
export type Generation = {
  expectedRevision:number; scenarioCode:string;scenarioVersion:number;generatorVersion:string;prngVersion:string;
  seed:string;baseTime:string;equipmentByCategory:{code:string;version:number;count:number}[];agentCount:number;
};
const invalid = ():never=>{throw new AppError(422,'INVALID_VALUE','Configuração demonstrativa inválida.');};
export function generationInput(input:unknown) {
  const n=normalizeBody(input,{commandId:{type:'uuid'},...generationFields});
  const {commandId,...body}=n;
  for(const [key,value] of Object.entries(VERSIONS)) if(body[key]!==value)invalid();
  const g=body as unknown as Generation;
  if(g.equipmentByCategory.length>14 || new Set(g.equipmentByCategory.map(p=>p.code+'/'+p.version)).size!==g.equipmentByCategory.length
    ||g.equipmentByCategory.some(p=>!profile(p.code,p.version)) ||g.equipmentByCategory.reduce((a,p)=>a+p.count,0)>200
    ||g.equipmentByCategory.reduce((a,p)=>a+p.count,0)+g.agentCount===0)invalid();
  g.equipmentByCategory.sort((a,b)=>a.code<b.code?-1:a.code>b.code?1:a.version-b.version);
  dueDate(g.baseTime); // Validate the full versioned recipe before hashing, including calendar overflow.
  return {commandId:commandId as string,body:g};
}
const sha=(value:Json)=>createHash('sha256').update(canonicalJson(value),'utf8').digest();
export const root=(g:Pick<Generation,'scenarioCode'|'scenarioVersion'|'generatorVersion'|'prngVersion'|'seed'>)=>
  sha(['IGNIS/T5/root/v1',g.scenarioCode,g.scenarioVersion,g.generatorVersion,g.prngVersion,g.seed]).toString('hex');
export const draw=(key:string,logical:string,field:string,counter:number)=>
  sha(['IGNIS/T5/draw/v1',key,logical,field,counter]);
export function uniform(key:string,logical:string,field:string,a:number,b:number,
  source:typeof draw=draw) {
  const n=b-a+1;
  if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||n<1||n>2**32)throw new Error('Intervalo interno inválido.');
  const t=2**32-(2**32%n);
  for(let i=0;i<1024;i++){const x=source(key,logical,field,i).readUInt32BE(0);if(x<t)return a+x%n;}
  throw new Error('Seleção determinística esgotada.');
}
export function deterministicId(key:string,logical:string,purpose:string) {
  const b=Buffer.from(sha(['IGNIS/T5/uuid/v1',key,logical,purpose]).subarray(0,16));
  b[6]=(b[6]!&15)|128;b[8]=(b[8]!&63)|128;
  const h=b.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export function dueDate(baseTime:string) {
  const parts=new Intl.DateTimeFormat('en',{timeZone:'America/Sao_Paulo',era:'short',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(baseTime));
  if(parts.find(p=>p.type==='era')?.value!=='AD')invalid();
  const val=(type:string)=>Number(parts.find(p=>p.type===type)!.value);
  const date=new Date(0);date.setUTCFullYear(val('year'),val('month')-1,val('day'));date.setUTCHours(0,0,0,0);
  date.setUTCDate(date.getUTCDate()+30);
  if(date.getUTCFullYear()>9999||date.getUTCFullYear()<1)invalid();
  return date.toISOString().slice(0,10);
}
export type PlannedItem = {logicalKey:string;id:string;eventId:string;maintenanceId:string|null;
  kind:'equipment'|'agent';ordinal:number;body:ObjectJson};
export type Plan = {configuration:ObjectJson;parametersHash:string;manifestId:string;items:PlannedItem[];
  projection:ObjectJson;contentHash:string;counts:ObjectJson;baseTime:string};
export const CREATION_REASON='Cadastro inicial autorizado pelo operador.';
export function projectItem(item:PlannedItem,view:ObjectJson,baseTime:string):ObjectJson {
  const agent=item.kind==='agent', cat=view.category as ObjectJson;
  const requests=agent?[]:(view.maintenance as ObjectJson).requests as ObjectJson[];
  const request=requests[0];
  const b:ObjectJson={logicalKey:item.logicalKey,id:view.id!,kind:item.kind,organizationKey:'organization/ORG_LOCAL',
    publicLabel:view.publicLabel!,version:view.version!,registrationLocation:view.registrationLocation!,baseLocation:view.baseLocation!,
    equipment:agent?null:{category:{code:cat.code!,version:cat.version!},serialNumber:view.serialNumber!,brand:view.brand!,model:view.model!,
      criticality:view.criticality!,mobility:view.mobility!,attributes:view.attributes!,operationalState:view.operationalState!},
    agent:agent?{enrollmentNumber:view.enrollmentNumber!,fictitiousName:view.fictitiousName!,function:view.function!,activity:view.activity!}:null,
    initialMaintenance:request?{logicalKey:item.logicalKey+'/maintenance/initial',id:request.id!,causeCode:request.causeCode!,status:request.status!,
      version:request.version!,reason:request.reason!,priority:request.priority!,schedule:request.schedule!}:null};
  const changes=Object.keys(b).sort().map(fieldPath=>({fieldPath,before:null,after:b[fieldPath]!}));
  b.event={id:item.eventId,action:`inventory.${agent?'agent':'equipment'}.create.v1`,resourceVersion:1,ordinal:item.ordinal,
    effectiveAt:baseTime,recordedAt:baseTime,reason:CREATION_REASON,evidenceIds:[],changes};
  return b;
}
export function projection(configuration:ObjectJson,items:PlannedItem[],views:ObjectJson[],baseTime:string):ObjectJson {
  return {projectionVersion:1,mode:'baseline',parameters:configuration,
    organizations:[{logicalKey:'organization/ORG_LOCAL',...ORGANIZATION}],resources:items.map((item,i)=>projectItem(item,views[i]!,baseTime))};
}
function expectedView(item:PlannedItem):ObjectJson {
  const b=item.body,registration={...(b.registrationLocation as ObjectJson),regionId:null};
  const common={id:item.id,kind:item.kind,publicLabel:(b.serialNumber??b.enrollmentNumber)!,version:1,
    organization:{...ORGANIZATION},registrationLocation:registration,baseLocation:null};
  if(item.kind==='agent')return {...common,enrollmentNumber:b.enrollmentNumber!,fictitiousName:b.fictitiousName!,function:b.function!,activity:'unknown'};
  const p=profile(b.categoryCode,b.categoryVersion)!,m=b.initialMaintenance as ObjectJson|null;
  return {...common,category:{code:p.code,version:p.version,name:p.name},serialNumber:b.serialNumber!,brand:b.brand!,model:b.model!,criticality:b.criticality!,
    mobility:p.mobility,attributes:b.attributes!,operationalState:'not_installed',maintenance:{requests:m?[{id:item.maintenanceId!,causeCode:policy(p.code).initialMaintenance.causeCode,
      status:'open',version:1,...m}]:[],nextMaintenance:{status:m?(m.schedule as ObjectJson).status!:'unknown',date:m?(m.schedule as ObjectJson).dueDate!:null,
        reason:m?(m.schedule as ObjectJson).notApplicableReason!:null}}};
}
export function makePlan(g:Generation):Plan {
  const {expectedRevision:_guard,...config}=g;
  const configuration:ObjectJson={...config,catalogRefs:g.equipmentByCategory.map(p=>({code:p.code,version:p.version,
    profileHash:hashJson(profile(p.code,p.version)).hash,policyHash:hashJson(policy(p.code)).hash}))};
  const parametersHash=hashJson(configuration).hash,key=root(g),items:PlannedItem[]=[],ids=new Set<string>();
  const add=(kind:'equipment'|'agent',logicalKey:string,body:ObjectJson)=>{
    const id=deterministicId(key,logicalKey,'resource'),eventId=deterministicId(key,logicalKey,'creation-event');
    const maintenanceId=body.initialMaintenance?deterministicId(key,logicalKey,'initial-maintenance'):null;
    for(const uuid of [id,eventId,...(maintenanceId?[maintenanceId]:[])]){if(ids.has(uuid))throw new Error('Colisão determinística interna.');ids.add(uuid);}
    const normalize=kind==='agent'?agentInput:inventoryInput;
    const normalized=normalize({commandId:eventId,...body}).body;
    items.push({kind,logicalKey,id,eventId,maintenanceId,ordinal:items.length+1,body:normalized});
  };
  const location=(logical:string,referenceType:string,missing:boolean)=>({referenceType,postalCode:'01001000',neighborhood:'Bairro fictício',
    city:'Cidade demonstrativa',uf:'SP',address:'Rua fictícia, 1',reference:'Referência sintética '+logical,
    latitude:missing?null:uniform(key,logical,'registration/latitude',-23560000,-23540000)/1e6,
    longitude:missing?null:uniform(key,logical,'registration/longitude',-46650000,-46630000)/1e6});
  for(const selected of g.equipmentByCategory){const p=profile(selected.code,selected.version)!,rank=sorted.findIndex(x=>x.code===p.code)+1;
    for(let n=1;n<=selected.count;n++){
      const suffix=String(n).padStart(6,'0'),logical=`equipment/${p.code}/v1/${suffix}`;
      const attributes:ObjectJson={};
      for(const [name,a] of Object.entries(p.attributes)){
        const f='attributes/'+name;
        if(a.enum)attributes[name]=a.enum[uniform(key,logical,f,0,a.enum.length-1)]!;
        else if(a.type==='integer')attributes[name]=uniform(key,logical,f,a.minimum!,a.maximum!);
        else {const min=a.minimum===undefined?Math.floor(a.exclusiveMinimum!*1000)+1:Math.ceil(a.minimum*1000);
          attributes[name]=uniform(key,logical,f,min,Math.floor(a.maximum!*1000))/1000;}
      }
      const branch=(rank+n-2)%4,status=['','unknown','dated','not_applicable'][branch]!;
      add('equipment',logical,{organizationId:ORGANIZATION_ID,categoryCode:p.code,categoryVersion:p.version,
        serialNumber:`DEMO-${p.code.toUpperCase()}-${suffix}`,brand:'IGNIS Demo',model:'Modelo '+p.code,
        criticality:uniform(key,logical,'criticality',1,5),attributes,initialState:'not_installed',baseLocation:null,
        registrationLocation:location(logical,p.mobility==='fixed'?'installation':'base',(rank+n-2)%5===0),
        initialMaintenance:branch?{reason:'Pedido preventivo sintético da demonstração.',priority:'normal',schedule:{status,
          dueDate:status==='dated'?dueDate(g.baseTime):null,notApplicableReason:status==='not_applicable'?'Agenda não aplicável neste caso sintético.':null}}:null});
    }
  }
  for(let n=1;n<=g.agentCount;n++){const suffix=String(n).padStart(6,'0'),logical='agent/'+suffix;
    add('agent',logical,{organizationId:ORGANIZATION_ID,enrollmentNumber:'DEMO-AG-'+suffix,fictitiousName:'Agente fictício '+suffix,
      function:'Agente de demonstração',initialActivity:'unknown',registrationLocation:location(logical,'institutional',n%5===0),baseLocation:null});}
  const P=projection(configuration,items,items.map(expectedView),g.baseTime);
  const counts:ObjectJson={equipment:g.equipmentByCategory.reduce((s,p)=>s+p.count,0),agents:g.agentCount,resources:items.length,
    categories:g.equipmentByCategory.length,maintenanceRequests:items.filter(i=>i.maintenanceId).length,
    schedules:{none:0,unknown:0,dated:0,not_applicable:0},missingCoordinates:0,completePairs:0};
  for(const i of items){if(i.kind==='equipment'){const m=i.body.initialMaintenance as ObjectJson|null;
      const schedules=counts.schedules as Record<string,number>;schedules[m?(m.schedule as ObjectJson).status as string:'none']!++;}
    if((i.body.registrationLocation as ObjectJson).latitude===null)(counts.missingCoordinates as number)++;else(counts.completePairs as number)++;}
  return {configuration,parametersHash,manifestId:deterministicId(key,'manifest/'+parametersHash,'manifest'),items,
    projection:P,contentHash:hashJson(P).hash,counts,baseTime:g.baseTime};
}
