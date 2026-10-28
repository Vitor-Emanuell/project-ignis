import {Store} from '../../src/persistence/store.js';
import {Authorization} from '../../src/auth.js';
import {createEquipment,updateEquipment} from '../../src/inventory/service.js';
import {createAgent,updateAgent} from '../../src/inventory/agents.js';
import {OPERATIONAL_ID} from '../../src/inventory/contract.js';
import {SECRET,ORIGIN} from './foundation-fixture.js';
import {AppError} from '../../src/errors.js';
const job=JSON.parse(process.env.IGNIS_T4_JOB!) as {path:string;token:string;csrf:string;kind:'equipment'|'agent';id?:string;body:unknown;point?:'before_commit'|'after_commit'|'migration'};
const store=new Store(job.path);
const fence=()=>{process.send?.({fence:job.point});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);return 0;};
if(job.point==='before_commit'||job.point==='migration'){
  store.db.function('t4_test_fence',fence);
  store.db.exec(job.point==='migration'?
    'CREATE TEMP TRIGGER t4_fault AFTER INSERT ON schema_migration WHEN NEW.version=3 BEGIN SELECT t4_test_fence(); END':
    'CREATE TEMP TRIGGER t4_fault AFTER INSERT ON command_receipt BEGIN SELECT t4_test_fence(); END');
}
process.send?.({ready:true});
process.once('message',()=>{
  try{
    if(job.point==='migration'){store.migrate();throw new Error('Migration fence not reached');}
    const auth=new Authorization(store,{operatorSecret:SECRET,allowedOrigins:()=>[ORIGIN]}),credentials={token:job.token,csrf:job.csrf,origin:ORIGIN};
    const result=job.kind==='agent'?(job.id?updateAgent(auth,credentials,OPERATIONAL_ID,1,job.id,job.body):createAgent(auth,credentials,OPERATIONAL_ID,1,job.body)):
      (job.id?updateEquipment(auth,credentials,OPERATIONAL_ID,1,job.id,job.body):createEquipment(auth,credentials,OPERATIONAL_ID,1,job.body));
    if(job.point==='after_commit')fence();
    process.send?.({status:result.status,body:result.body,replayed:result.replayed});
  }catch(error){process.send?.({status:error instanceof AppError?error.statusCode:500,code:error instanceof AppError?error.code:String(error)});}
  finally{store.close();process.disconnect?.();}
});
