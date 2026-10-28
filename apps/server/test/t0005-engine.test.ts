import {expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {generationInput,PRESET,root,draw,uniform,deterministicId,makePlan,dueDate} from '../src/demo/engine.js';
const input=(x:object={})=>({commandId:randomUUID(),expectedRevision:0,...structuredClone(PRESET),...x});
it('V02-T5-03 — vetores SHA, unsigned, UUID, precisão e rejeição',()=>{
  const k=root(PRESET),l='equipment/camera/v1/000001';
  expect(k).toBe('c34f30939c52547b789c2813f02d9334c4270de0801baed6f2c8c3a83e9d1809');
  expect(draw(k,l,'criticality',0).toString('hex')).toBe('b12f8b380e59c6e218e7684773ce2834635355f6da91f9b55e993a881f4b1ac3');
  expect(draw(k,l,'criticality',1).toString('hex')).toBe('3098980dee3fb388ee19cb7bf3d60cd0bd9bc2bd1dd52bbdef91154984e7461c');
  expect(uniform(k,l,'criticality',1,5)).toBe(5);expect(uniform(k,l,'attributes/cameraType',0,1)).toBe(1);
  expect(deterministicId(k,l,'resource')).toBe('bfa4f130-8707-8cdc-a917-9a3489efb4ba');
  expect(deterministicId(k,l,'creation-event')).toBe('d39bc62c-c2fc-8fd7-81a8-bed504e1d7a3');
  expect(deterministicId(k,l,'initial-maintenance')).toBe('e2021913-ba08-8c07-9922-7d58101f4441');
  expect(uniform(k,'equipment/barrier_gate/v1/000001','attributes/openingWidthM',1,20000)/1000).toBe(19.763);
  const calls:number[]=[];expect(uniform(k,l,'test',0,9,(_k,_l,_f,i)=>{calls.push(i);const b=Buffer.alloc(4);b.writeUInt32BE(i?4294967289:4294967295);return b;})).toBe(9);
  expect(calls).toEqual([0,1]);expect(()=>uniform(k,l,'test',0,9,()=>Buffer.from('ffffffff','hex'))).toThrow(/esgotada/);
});
it('V02-T5-01/02/04/08/09/10 — plano determinístico e preset ratificado',()=>{
  const a=makePlan(generationInput(input()).body),b=makePlan(generationInput(input({expectedRevision:15,equipmentByCategory:[...PRESET.equipmentByCategory].reverse()})).body);
  expect(a).toEqual(b);expect(a.counts).toMatchObject({resources:26,equipment:20,agents:6,categories:14,maintenanceRequests:15,
    missingCoordinates:6,completePairs:20,schedules:{none:5,unknown:5,dated:5,not_applicable:5}});
  expect(new Set(a.items.map(i=>i.id)).size).toBe(26);
  const c=makePlan(generationInput(input({seed:'another-seed'})).body);expect(c.contentHash).not.toBe(a.contentHash);
  expect(c.items.map(i=>i.body.attributes)).not.toEqual(a.items.map(i=>i.body.attributes));
  expect(root({...PRESET,seed:'é'})).not.toBe(root({...PRESET,seed:'e\u0301'}));
  expect(dueDate('2026-10-24T02:00:00.000Z')).toBe('2026-11-22');
});
it('V02-T5-20 — configuração estrita e limites',()=>{
  for(const x of [{agentCount:31},{agentCount:-1},{agentCount:1.5},{seed:''},{tickDuration:1},{scenarioVersion:2},
    {baseTime:'9999-12-31T12:00:00Z'},{equipmentByCategory:[PRESET.equipmentByCategory[0],PRESET.equipmentByCategory[0]]},
    {equipmentByCategory:[],agentCount:0},{equipmentByCategory:[{code:'camera',version:2,count:1}]},
    {equipmentByCategory:[{code:'camera',version:1,count:201}]}])expect(()=>generationInput(input(x))).toThrow();
});
