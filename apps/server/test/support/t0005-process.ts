import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
export type DemoJob={path:string;datasetId:string;epoch:number;token:string;csrf:string;body:unknown;point?:'before_commit'|'after_commit'|'partial'};
export async function runDemoJobs(jobs:DemoJob[],beforeGo?:()=>void,atFence?:()=>Promise<void>){
  const children=jobs.map(job=>spawn(process.execPath,['--import','tsx',fileURLToPath(new URL('./t0005-child.ts',import.meta.url))],{
    env:{...process.env,IGNIS_T5_JOB:JSON.stringify(job)},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']}));
  const exits=children.map(c=>once(c,'exit'));let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([(async()=>{
    await Promise.all(children.map(c=>once(c,'message')));beforeGo?.();
    const next=children.map(c=>once(c,'message').then(([r])=>r as {status?:number;code?:string;body?:any;replayed?:boolean;fence?:string}));
    children.forEach(c=>c.send('go'));const results=await Promise.all(next);
    if(results.some(r=>r.fence))await atFence?.();
    children.forEach((c,i)=>{if(results[i]?.fence)c.kill();});await Promise.all(exits);return results;
  })(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('T0005 child timeout')),12000);})]);}
  finally{clearTimeout(timer);children.forEach(c=>{if(c.exitCode===null&&c.signalCode===null)c.kill();});await Promise.all(exits);}
}
