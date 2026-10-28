import type {FastifyInstance} from 'fastify';
import type {Authorization} from '../auth.js';
import {credentials} from '../foundation-routes.js';
import {uuid,normalize,normalizeBody} from '../idempotency/normalize.js';
import {AppError} from '../errors.js';
import {generateDemo,readDemo} from './service.js';
export function registerDemo(app:FastifyInstance,auth:Authorization) {
  const path='/api/v1/datasets/:datasetId/epochs/:epoch/demo-data';
  for(const method of ['GET','POST'] as const)app.route<{Params:{datasetId:string;epoch:string}}>({method,url:path,
    handler:async(request,reply)=>{
      normalizeBody(request.query,{});
      if(!/^\d+$/.test(request.params.epoch))throw new AppError(400,'INVALID_REQUEST','Geração inválida.');
      const id=uuid(request.params.datasetId),epoch=normalize(Number(request.params.epoch),{type:'integer',min:1}) as number;
      reply.header('Cache-Control','no-store');
      if(method==='GET')return readDemo(auth,credentials(request),id,epoch);
      const result=generateDemo(auth,credentials(request),id,epoch,request.body);
      return reply.headers(result.headers).code(result.status).send(result.body);
    }});
}
