import type Database from 'better-sqlite3';
import type { Context } from '../auth.js';
import { AppError } from '../errors.js';
import { CATEGORIES, CATEGORY_POLICIES } from './catalog.js';
import { ORGANIZATION_ID } from './contract.js';
import { canonicalJson,parseJson } from '../idempotency/json.js';

export function demoReferenceIssue(db:Database.Database,c:Context):string|null {
  const rows=db.prepare('SELECT id,code,name FROM organization WHERE dataset_id=? AND epoch=?').all(c.datasetId,c.epoch);
  if(rows.length && canonicalJson(rows)!==canonicalJson([{id:ORGANIZATION_ID,code:'ORG_LOCAL',name:'Órgão municipal fictício'}]))return 'DEMO_REFERENCE_CONFLICT';
  for(const p of CATEGORIES){const actual=db.prepare('SELECT profile_json FROM category_version WHERE category_code=? AND schema_version=?').get(p.code,p.version) as {profile_json:string}|undefined;
    const policy=CATEGORY_POLICIES.find(x=>x.code===p.code)!;
    const ap=db.prepare('SELECT policy_json FROM category_policy WHERE category_code=? AND category_version=?').get(p.code,p.version) as {policy_json:string}|undefined;
    if(!actual||!ap||canonicalJson(parseJson(actual.profile_json))!==canonicalJson(p)
      ||canonicalJson(parseJson(ap.policy_json))!==canonicalJson(policy))throw new AppError(503,'DATABASE_UNAVAILABLE','Catálogo demonstrativo incompatível.');
  }
  return null;
}
export function prepareDemoReferences(db:Database.Database,c:Context) {
  if(!db.inTransaction)throw new Error('Preparo exige unidade de trabalho.');
  if(demoReferenceIssue(db,c))throw new AppError(409,'DEMO_REFERENCE_CONFLICT','Referência demonstrativa incompatível.');
  if(!db.prepare('SELECT 1 FROM organization WHERE dataset_id=? AND epoch=?').get(c.datasetId,c.epoch))
    db.prepare("INSERT INTO organization VALUES(?,?,?,'ORG_LOCAL','Órgão municipal fictício')").run(c.datasetId,c.epoch,ORGANIZATION_ID);
}
