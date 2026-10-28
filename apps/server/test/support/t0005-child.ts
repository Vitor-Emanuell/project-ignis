import {Store} from '../../src/persistence/store.js';
import {Authorization} from '../../src/auth.js';
import {generateDemo} from '../../src/demo/service.js';
import {AppError} from '../../src/errors.js';
import {SECRET,ORIGIN} from './foundation-fixture.js';
const job=JSON.parse(process.env.IGNIS_T5_JOB!) as {path:string;datasetId:string;epoch:number;token:string;csrf:string;body:unknown;point?:'before_commit'|'after_commit'|'partial'};
const store=new Store(job.path);
const fence=()=>{process.send?.({fence:job.point});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);return 0;};
if(job.point==='before_commit'||job.point==='partial'){
  store.db.function('t5_test_fence',fence);
  store.db.exec(job.point==='partial'?'CREATE TEMP TRIGGER t5_fence AFTER INSERT ON demo_member WHEN NEW.ordinal=13 BEGIN SELECT t5_test_fence(); END':
    "CREATE TEMP TRIGGER t5_fence AFTER INSERT ON command_receipt WHEN NEW.operation='demo.generate.v1' BEGIN SELECT t5_test_fence(); END");
}
process.send?.({ready:true});
process.once('message',()=>{
  try{const auth=new Authorization(store,{operatorSecret:SECRET,allowedOrigins:()=>[ORIGIN]});
    const result=generateDemo(auth,{token:job.token,csrf:job.csrf,origin:ORIGIN},job.datasetId,job.epoch,job.body);
    if(job.point==='after_commit')fence();process.send?.({status:result.status,body:result.body,replayed:result.replayed});
  }catch(e){process.send?.({status:e instanceof AppError?e.statusCode:500,code:e instanceof AppError?e.code:String(e)});}
  finally{store.close();process.disconnect?.();}
});
