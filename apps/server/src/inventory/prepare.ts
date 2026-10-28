import type { Store } from '../persistence/store.js';
import { transaction } from '../persistence/store.js';
import { canonicalJson, parseJson } from '../idempotency/json.js';
import { CATEGORY, OPERATIONAL_ID, ORGANIZATION_ID } from './contract.js';
import { CATEGORIES, CATEGORY_POLICIES } from './catalog.js';

export function prepareOperational(store: Store) {
  store.assertReady();
  return transaction(store.db, () => {
    const db = store.db;
    const fail = (): never => { throw new Error('Preparo operational recusado: referências/grant/perfil ou geração divergentes. Revisão administrativa necessária.'); };
    const actor = db.prepare("SELECT id FROM actor WHERE local_key = 'local-operator' AND kind = 'operator'").get() as { id: string } | undefined;
    if (!actor) fail();
    const category = db.prepare('SELECT profile_json FROM category_version WHERE category_code = ? AND schema_version = ?').get(CATEGORY.code, CATEGORY.version) as { profile_json: string } | undefined;
    if (!category || canonicalJson(parseJson(category.profile_json)) !== canonicalJson(CATEGORY)) fail();
    for (const expected of CATEGORIES) {
      const actual = db.prepare('SELECT profile_json FROM category_version WHERE category_code=? AND schema_version=?').get(expected.code,expected.version) as {profile_json:string}|undefined;
      const expectedPolicy = CATEGORY_POLICIES.find(p => p.code === expected.code)!;
      const actualPolicy = db.prepare('SELECT policy_json FROM category_policy WHERE category_code=? AND category_version=?').get(expected.code,expected.version) as {policy_json:string}|undefined;
      if (!actual || canonicalJson(parseJson(actual.profile_json)) !== canonicalJson(expected)
        || !actualPolicy || canonicalJson(parseJson(actualPolicy.policy_json)) !== canonicalJson(expectedPolicy)) fail();
    }
    const datasets = db.prepare("SELECT id, code, kind, active_epoch FROM dataset WHERE id = ? OR code = 'local-operational'").all(OPERATIONAL_ID) as { id: string; code: string; kind: string; active_epoch: number }[];
    if (datasets.length) {
      const d = datasets[0]!;
      if (datasets.length !== 1 || d.id !== OPERATIONAL_ID || d.code !== 'local-operational' || d.kind !== 'operational' || d.active_epoch !== 1) fail();
      const epoch = db.prepare('SELECT status FROM dataset_epoch WHERE dataset_id = ? AND epoch = 1').get(d.id) as { status: string } | undefined;
      const grant = db.prepare('SELECT can_write FROM dataset_grant WHERE dataset_id = ? AND actor_id = ?').get(d.id, actor!.id) as { can_write: number } | undefined;
      const org = db.prepare("SELECT id, code, name FROM organization WHERE dataset_id = ? AND epoch = 1 AND (id = ? OR code = 'ORG_LOCAL')").all(d.id, ORGANIZATION_ID);
      if (epoch?.status !== 'ready' || grant?.can_write !== 1 || canonicalJson(org as never) !== canonicalJson([{ id: ORGANIZATION_ID, code: 'ORG_LOCAL', name: 'Órgão municipal fictício' }])) fail();
    } else {
      db.prepare("INSERT INTO dataset VALUES (?, 'local-operational', 'operational', 1)").run(OPERATIONAL_ID);
      db.prepare("INSERT INTO dataset_epoch VALUES (?, 1, 'ready', 0)").run(OPERATIONAL_ID);
      db.prepare('INSERT INTO dataset_grant VALUES (?, ?, 1)').run(OPERATIONAL_ID, actor!.id);
      db.prepare("INSERT INTO organization VALUES (?, 1, ?, 'ORG_LOCAL', 'Órgão municipal fictício')").run(OPERATIONAL_ID, ORGANIZATION_ID);
    }
    return { datasetId: OPERATIONAL_ID, epoch: 1, organizationId: ORGANIZATION_ID,
      categoryCode: CATEGORY.code, categoryVersion: CATEGORY.version };
  });
}
