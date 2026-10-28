import {afterEach,expect,it} from 'vitest';
import {statSync,writeFileSync,mkdirSync} from 'node:fs';
import Database from 'better-sqlite3';
import {demoFixture,generation} from './support/t0005-fixture.js';
import {runDemoJobs} from './support/t0005-process.js';
import {authorization,sessionFor} from './support/foundation-fixture.js';
import {generateDemo} from '../src/demo/service.js';
const fixtures:Awaited<ReturnType<typeof demoFixture>>[]=[];
afterEach(async()=>{for(const f of fixtures.splice(0))await f.cleanup();});
async function setup(){const f=await demoFixture();fixtures.push(f);return f;}
const job=(f:Awaited<ReturnType<typeof demoFixture>>,body:unknown)=>({path:f.databasePath,datasetId:f.datasetId,epoch:1,token:f.cookie.slice('ignis_session='.length),csrf:f.csrf,body});
for(const divergent of [false,true])it('V02-T5-13/14 — corrida real '+(divergent?'entre Kcs':'mesma Kc equivalente'),async()=>{
  const f=await setup(),input=generation(),results=await runDemoJobs([job(f,input),job(f,divergent?generation():{...input,equipmentByCategory:[...input.equipmentByCategory].reverse()})]);
  expect(results.filter(r=>r.status===201).length).toBe(divergent?1:2);
  if(divergent)expect(results.find(r=>r.status!==201)?.code).toBe('DEMO_BASELINE_EXISTS');else expect(results.filter(r=>r.replayed).length).toBe(1);
  expect(f.groupCounts().resource).toBe(26);expect(f.revision()).toBe(1);
});
for(const point of ['partial','before_commit','after_commit'] as const)it('V02-T5-16 — interrupção real '+point,async()=>{
  const f=await setup(),input=generation();const results=await runDemoJobs([{...job(f,input),point}],undefined,async()=>{
    const during=await f.read();expect(during.statusCode,during.body).toBe(200);
    expect(during.json().revision).toBe(point==='after_commit'?1:0);
    expect(during.json().manifest===null).toBe(point!=='after_commit');
    expect(f.groupCounts().resource).toBe(point==='after_commit'?26:0);
  });expect(results[0]?.fence).toBe(point);
  expect(f.groupCounts().resource).toBe(point==='after_commit'?26:0);expect(f.groupCounts().command_receipt).toBe(point==='after_commit'?1:0);
  expect(f.store.ready()).toBe(true);const retry=await f.generate(input);expect(retry.statusCode,retry.body).toBe(201);
  expect(retry.headers['idempotency-replayed']).toBe(point==='after_commit'?'true':undefined);expect(f.revision()).toBe(1);
});
it('V02-T5-13 — espera limitada com escritor independente',async()=>{
  const f=await setup(),lock=new Database(f.databasePath);try{
    const results=await runDemoJobs([job(f,generation())],()=>lock.exec('BEGIN IMMEDIATE'));
    expect(results[0]).toMatchObject({status:503,code:'DATABASE_UNAVAILABLE'});expect(f.groupCounts().resource).toBe(0);
  }finally{if(lock.inTransaction)lock.exec('ROLLBACK');lock.close();}
});
it('V02-T5-21 A05 — máximo 200/30 medido, persistido, reaberto e repetido',async()=>{
  const f=await setup(),body=generation({equipmentByCategory:[{code:'camera',version:1,count:200}],agentCount:30}),metrics={waitMs:0,lockMs:0};
  const memoryBefore=process.memoryUsage(),size=()=>['','-wal','-shm'].reduce((n,s)=>{try{return n+statSync(f.databasePath+s).size;}catch{return n;}},0),bytesBefore=size();
  const creds={token:f.cookie.slice('ignis_session='.length),csrf:f.csrf,origin:'http://127.0.0.1:3000'};
  const start=performance.now();const result=generateDemo(authorization(f.store),creds,f.datasetId,1,body,metrics);const totalMs=performance.now()-start;
  expect(result.status).toBe(201);expect(f.groupCounts()).toMatchObject({resource:230,equipment:200,agent:30,operational_event:230,demo_member:230});expect(f.revision()).toBe(1);
  const after=process.memoryUsage(),bytesAfter=size(),diagnostics=f.store.diagnostics();
  const fresh=new Database(f.databasePath,{readonly:true});try{expect(fresh.pragma('integrity_check',{simple:true})).toBe('ok');expect(fresh.pragma('foreign_key_check')).toEqual([]);}finally{fresh.close();}
  const replayStart=performance.now();const replays=await runDemoJobs([job(f,body),job(f,body)]);const concurrentReplayMs=performance.now()-replayStart;
  expect(replays.every(r=>r.status===201&&r.replayed)).toBe(true);expect(f.groupCounts().resource).toBe(230);
  const concurrent=await setup(),raceStart=performance.now();
  const maxRace=await runDemoJobs([job(concurrent,body),job(concurrent,body)]),maxConcurrentGenerationMs=performance.now()-raceStart;
  expect(maxRace.some(r=>r.status===201&&!r.replayed)).toBe(true);
  expect(maxRace.every(r=>r.status===201||r.status===503)).toBe(true);
  expect((await concurrent.generate(body)).statusCode).toBe(201);expect(concurrent.groupCounts().resource).toBe(230);expect(concurrent.revision()).toBe(1);
  const http=await setup(),httpStart=performance.now(),httpResult=await http.generate(body),httpMs=performance.now()-httpStart;
  expect(httpResult.statusCode,httpResult.body).toBe(201);expect(http.groupCounts().resource).toBe(230);
  mkdirSync('.tmp/t0005-evidence',{recursive:true});
  writeFileSync('.tmp/t0005-evidence/maximum.json',JSON.stringify({node:process.version,os:process.platform,method:'authorized synchronous service; file/WAL real; fresh processes reopen/replay',
    equipment:200,agents:30,totalMs,...metrics,memoryBefore,memoryAfter:after,processHighWaterRssKiB:process.resourceUsage().maxRSS,
    responseBytes:Buffer.byteLength(JSON.stringify(result.body)),sqliteAndWalBefore:bytesBefore,sqliteAndWalAfter:bytesAfter,sqliteGrowth:bytesAfter-bytesBefore,
    concurrentReplayMs,concurrentReplay:replays.map(r=>({status:r.status,replayed:r.replayed})),
    maxConcurrentGenerationMs,maxConcurrentGeneration:maxRace.map(r=>({status:r.status,replayed:r.replayed,code:r.code})),
    httpMs,httpResponseBytes:Buffer.byteLength(httpResult.body),diagnostics},null,2));
});
