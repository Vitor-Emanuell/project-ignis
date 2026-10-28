import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { inventoryFixture, valid } from './support/inventory-fixture.js';
import { OPERATIONAL_ID } from '../src/inventory/contract.js';

const fixtures: Awaited<ReturnType<typeof inventoryFixture>>[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.cleanup(); });

it('consulta autenticada, isolamento, score nulo e nenhuma mutação', async () => {
  const f = await inventoryFixture(); fixtures.push(f);
  const created = await f.call('POST', '/equipment', valid());
  expect(created.statusCode).toBe(201);
  const id = created.json().equipment.id as string;
  const before = f.counts(), rev = f.revision();
  const response = await f.call('GET', '/prediction/history');
  expect(response.statusCode, response.body).toBe(200);
  expect(response.json()).toMatchObject({ datasetId: OPERATIONAL_ID, epoch: 1, revision: rev, score: null, status: 'insufficient_data' });
  expect(response.json().items).toEqual([expect.objectContaining({ id, occurrences: 0, failures: 0, score: null })]);
  expect(f.counts()).toEqual(before); expect(f.revision()).toBe(rev);
  expect((await f.app.inject({ url: `/api/v1/datasets/${OPERATIONAL_ID}/epochs/1/prediction/history` })).statusCode).toBe(401);
  expect((await f.app.inject({ url: `/api/v1/datasets/${f.installation.datasetId}/epochs/1/prediction/history`, headers: f.headers })).json().items).toEqual([]);
  expect((await f.call('GET', '/prediction/history?asOf=1')).statusCode).toBe(400);
  expect((await f.app.inject({ url: `/api/v1/datasets/${OPERATIONAL_ID}/epochs/2/prediction/history`, headers: f.headers })).statusCode).toBe(409);
});

it('episódios conhecidos no corte são contados e ordenados sem incluir futuro', async () => {
  const f = await inventoryFixture(); fixtures.push(f);
  const a = (await f.call('POST', '/equipment', valid({ serialNumber: 'AA', categoryCode: 'camera', attributes: { cameraType: 'fixed_view' } }))).json().equipment.id as string;
  const b = (await f.call('POST', '/equipment', valid({ serialNumber: 'BB' }))).json().equipment.id as string;
  const sourceId = randomUUID(), now = Date.now();
  f.store.db.prepare("INSERT INTO telemetry_source(id, source_kind, provisioned_by, active, created_at_ms) VALUES (?, 'fixture', ?, 1, ?)").run(sourceId, f.installation.actorId, now - 10000);
  const insert = f.store.db.prepare('INSERT INTO telemetry_episode(dataset_id, epoch, resource_id, episode_id, cause_code, source_id, episode_started_at_ms, recorded_at_ms) VALUES (?, 1, ?, ?, ?, ?, ?, ?)');
  insert.run(OPERATIONAL_ID, a, randomUUID(), 'fault_a', sourceId, now - 4000, now - 3000);
  insert.run(OPERATIONAL_ID, a, randomUUID(), 'fault_b', sourceId, now - 2000, now - 1000);
  insert.run(OPERATIONAL_ID, b, randomUUID(), 'fault_c', sourceId, now + 600000, now + 600000);
  insert.run(OPERATIONAL_ID, b, randomUUID(), 'fault_d', sourceId, now - 1000, now + 600000);

  f.store.db.prepare(`INSERT INTO telemetry_profile(id,version,usage,resource_kind,category_code,category_version,emitter_expected,expected_interval_ms,position_ttl_ms,configuration_json,provenance)
    VALUES ('FX-FIXED-v1',1,'fixture','equipment','camera',1,1,10000,NULL,'{}','test')`).run();
  f.store.db.prepare(`INSERT INTO telemetry_resource_profile(dataset_id,epoch,resource_id,resource_kind,profile_id,profile_version,active,assigned_at_ms)
    VALUES (?,1,?,'equipment','FX-FIXED-v1',1,1,?)`).run(OPERATIONAL_ID, a, now - 10000);
  const binding = randomUUID();
  f.store.db.prepare(`INSERT INTO telemetry_binding(dataset_id,epoch,id,source_id,resource_id,resource_kind,channel,projection_field,profile_id,profile_version,active,resource_born_at_ms,history_allowed_from_ms)
    VALUES (?,1,?,?,?,'equipment','heartbeat','communication','FX-FIXED-v1',1,1,?,?)`).run(OPERATIONAL_ID, binding, sourceId, a, now - 10000, now - 10000);
  const addEvent = f.store.db.prepare(`INSERT INTO telemetry_event(dataset_id,epoch,source_id,event_id,resource_id,channel,binding_id,sequence,observation_type,canonical_version,event_hash,canonical_json,occurred_at_ms,received_at_ms,recorded_at_ms,observation_effective_at_ms,is_simulated,disposition,effects_json,reason_code,resulting_revision,response_status,response_body)
    VALUES (?,1,?,?,?,'heartbeat',?,?,'heartbeat',1,?,'{}',?,?,?,?,1,'applied','{}','ok',1,200,'{}')`);
  const addSlot = f.store.db.prepare(`INSERT INTO telemetry_sequence_slot(dataset_id,epoch,source_id,resource_id,channel,sequence,event_id) VALUES (?,1,?,?,'heartbeat',?,?)`);
  f.store.db.transaction(() => {
    for (const [seq, occurred, recorded, effective] of [[1,now-3000,now-3000,now-3000],[2,now+600000,now-2000,now-2000],[3,now-1000,now+600000,now-1000]]) {
      const id = randomUUID();
      addEvent.run(OPERATIONAL_ID, sourceId, id, a, binding, seq, 'a'.repeat(64), occurred, recorded, recorded, effective);
      addSlot.run(OPERATIONAL_ID, sourceId, a, seq, id);
    }
  })();
  const before = f.counts(), rev = f.revision();
  const response = await f.call('GET', '/prediction/history');
  expect(response.statusCode, response.body).toBe(200);
  const items = response.json().items;
  expect(items.map((x: { id: string }) => x.id)).toEqual([a, b]);
  expect(items.map((x: { failures: number }) => x.failures)).toEqual([2, 0]);
  expect(items.map((x: { occurrences: number }) => x.occurrences)).toEqual([1, 0]);
  expect(items[0].simulatedOccurrences).toBe(1);
  expect(f.counts()).toEqual(before); expect(f.revision()).toBe(rev);
});


it('empates são ordenados pelo ID e grant ausente é recusado', async () => {
  const f = await inventoryFixture(); fixtures.push(f);
  const a = (await f.call('POST', '/equipment', valid({ serialNumber: 'TIE-A' }))).json().equipment.id as string;
  const b = (await f.call('POST', '/equipment', valid({ serialNumber: 'TIE-B' }))).json().equipment.id as string;
  const first = await f.call('GET', '/prediction/history');
  expect(first.statusCode, first.body).toBe(200);
  const expected = [a,b].sort();
  expect(first.json().items.map((x: {id: string}) => x.id)).toEqual(expected);
  expect((await f.call('GET', '/prediction/history')).json().items.map((x: {id: string}) => x.id)).toEqual(expected);
  f.store.db.prepare('DELETE FROM dataset_grant WHERE dataset_id=? AND actor_id=?').run(OPERATIONAL_ID, f.installation.actorId);
  expect((await f.call('GET', '/prediction/history')).statusCode).toBe(403);
});
