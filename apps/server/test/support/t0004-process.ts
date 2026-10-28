import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
type Job={path:string;token:string;csrf:string;kind:'equipment'|'agent';body:unknown;id?:string;point?:'before_commit'|'after_commit'|'migration'};
export async function runT4Jobs(jobs:Job[]){
  const children=jobs.map(job=>spawn(process.execPath,['--import','tsx',fileURLToPath(new URL('./t0004-child.ts',import.meta.url))],{
    env:{...process.env,IGNIS_T4_JOB:JSON.stringify(job)},windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],
  }));
  const exits=children.map(c=>once(c,'exit'));let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    return await Promise.race([(async()=>{
      await Promise.all(children.map(c=>once(c,'message')));
      const next=children.map(c=>once(c,'message').then(([r])=>r as {status?:number;code?:string;body?:any;replayed?:boolean;fence?:string}));
      children.forEach(c=>c.send('go'));const results=await Promise.all(next);
      children.forEach((c,i)=>{if(results[i]?.fence)c.kill();});await Promise.all(exits);return results;
    })(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('T0004 child timeout')),12000);})]);
  }finally{clearTimeout(timer);children.forEach(c=>{if(c.exitCode===null&&c.signalCode===null)c.kill();});await Promise.all(exits);}
}
