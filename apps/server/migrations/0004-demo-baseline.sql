CREATE TABLE t5_event (
 dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, id TEXT NOT NULL, resource_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('inventory.equipment.create.v1','inventory.equipment.update.v1','inventory.agent.create.v1','inventory.agent.update.v1')),
 actor_id TEXT NOT NULL REFERENCES actor(id), command_id TEXT NOT NULL,
 resource_version INTEGER NOT NULL, revision INTEGER NOT NULL,
 ordinal INTEGER NOT NULL CHECK(typeof(ordinal)='integer' AND ordinal BETWEEN 1 AND 230),
 effective_at TEXT NOT NULL, recorded_at TEXT NOT NULL, received_at TEXT NOT NULL,
 changes_json TEXT NOT NULL CHECK(json_valid(changes_json)),
 PRIMARY KEY(dataset_id,epoch,id), UNIQUE(dataset_id,epoch,revision,ordinal),
 FOREIGN KEY(dataset_id,epoch,resource_id) REFERENCES resource(dataset_id,epoch,id)
);
INSERT INTO t5_event SELECT * FROM operational_event;
DROP TABLE operational_event;
ALTER TABLE t5_event RENAME TO operational_event;
CREATE INDEX operational_event_resource ON operational_event(dataset_id,epoch,resource_id,effective_at,id);
CREATE UNIQUE INDEX t5_event_binding ON operational_event(dataset_id,epoch,id,resource_id,revision,ordinal,actor_id,command_id);
CREATE UNIQUE INDEX t5_receipt_binding ON command_receipt(dataset_id,epoch,actor_id,operation,command_id,resulting_revision);
CREATE UNIQUE INDEX t5_maintenance_binding ON maintenance_request(dataset_id,epoch,id,equipment_id);
CREATE TRIGGER event_append_only_update BEFORE UPDATE ON operational_event BEGIN SELECT RAISE(ABORT,'Append-only event'); END;
CREATE TRIGGER event_append_only_delete BEFORE DELETE ON operational_event BEGIN SELECT RAISE(ABORT,'Append-only event'); END;
CREATE TRIGGER event_resource_kind BEFORE INSERT ON operational_event
 WHEN NOT EXISTS(SELECT 1 FROM resource r WHERE r.dataset_id=NEW.dataset_id AND r.epoch=NEW.epoch AND r.id=NEW.resource_id
 AND ((r.kind='equipment' AND NEW.action IN ('inventory.equipment.create.v1','inventory.equipment.update.v1'))
 OR(r.kind='agent' AND NEW.action IN ('inventory.agent.create.v1','inventory.agent.update.v1'))))
 BEGIN SELECT RAISE(ABORT,'Invalid resource event'); END;

CREATE TABLE demo_manifest (
 dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, id TEXT NOT NULL,
 operation TEXT NOT NULL CHECK(operation='demo.generate.v1'), actor_id TEXT NOT NULL, command_id TEXT NOT NULL,
 created_revision INTEGER NOT NULL CHECK(typeof(created_revision)='integer' AND created_revision BETWEEN 1 AND 9007199254740991),
 expected_equipment INTEGER NOT NULL CHECK(typeof(expected_equipment)='integer' AND expected_equipment BETWEEN 0 AND 200),
 expected_agents INTEGER NOT NULL CHECK(typeof(expected_agents)='integer' AND expected_agents BETWEEN 0 AND 30),
 parameters_json TEXT NOT NULL CHECK(json_valid(parameters_json) AND json_type(parameters_json)='object'),
 parameters_hash TEXT NOT NULL CHECK(length(parameters_hash)=64 AND parameters_hash NOT GLOB '*[^0-9a-f]*'),
 projection_json TEXT NOT NULL CHECK(json_valid(projection_json) AND json_type(projection_json)='object'),
 content_hash TEXT NOT NULL CHECK(length(content_hash)=64 AND content_hash NOT GLOB '*[^0-9a-f]*'),
 counts_json TEXT NOT NULL CHECK(json_valid(counts_json) AND json_type(counts_json)='object'),
 base_time TEXT NOT NULL, received_at TEXT NOT NULL, wall_recorded_at TEXT NOT NULL,
 CHECK(expected_equipment+expected_agents BETWEEN 1 AND 230),
 PRIMARY KEY(dataset_id,epoch), UNIQUE(dataset_id,epoch,id),
 UNIQUE(dataset_id,epoch,id,created_revision,actor_id,command_id),
 FOREIGN KEY(dataset_id,epoch) REFERENCES dataset_epoch(dataset_id,epoch),
 FOREIGN KEY(dataset_id,epoch,id) REFERENCES demo_seal(dataset_id,epoch,manifest_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(dataset_id,epoch,actor_id,operation,command_id,created_revision)
 REFERENCES command_receipt(dataset_id,epoch,actor_id,operation,command_id,resulting_revision) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE demo_member (
 dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, manifest_id TEXT NOT NULL,
 ordinal INTEGER NOT NULL CHECK(typeof(ordinal)='integer' AND ordinal BETWEEN 1 AND 230),
 logical_key TEXT NOT NULL, resource_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('equipment','agent')),
 event_id TEXT NOT NULL, maintenance_id TEXT, revision INTEGER NOT NULL, actor_id TEXT NOT NULL, command_id TEXT NOT NULL,
 CHECK(kind='equipment' OR maintenance_id IS NULL),
 PRIMARY KEY(dataset_id,epoch,manifest_id,ordinal), UNIQUE(dataset_id,epoch,logical_key),
 UNIQUE(dataset_id,epoch,resource_id), UNIQUE(dataset_id,epoch,event_id),
 FOREIGN KEY(dataset_id,epoch,manifest_id,revision,actor_id,command_id)
 REFERENCES demo_manifest(dataset_id,epoch,id,created_revision,actor_id,command_id),
 FOREIGN KEY(dataset_id,epoch,resource_id,kind) REFERENCES resource(dataset_id,epoch,id,kind),
 FOREIGN KEY(dataset_id,epoch,event_id,resource_id,revision,ordinal,actor_id,command_id)
 REFERENCES operational_event(dataset_id,epoch,id,resource_id,revision,ordinal,actor_id,command_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(dataset_id,epoch,maintenance_id,resource_id)
 REFERENCES maintenance_request(dataset_id,epoch,id,equipment_id)
);
CREATE TABLE demo_seal (
 dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, manifest_id TEXT NOT NULL,
 PRIMARY KEY(dataset_id,epoch,manifest_id),
 FOREIGN KEY(dataset_id,epoch,manifest_id) REFERENCES demo_manifest(dataset_id,epoch,id)
);
CREATE TRIGGER demo_manifest_validate BEFORE INSERT ON demo_manifest BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM dataset d JOIN dataset_epoch e ON e.dataset_id=d.id AND e.epoch=d.active_epoch
 WHERE d.id=NEW.dataset_id AND d.kind='demo' AND d.active_epoch=NEW.epoch AND e.status='ready' AND e.revision=NEW.created_revision)
 THEN RAISE(ABORT,'Invalid baseline context/revision') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM resource WHERE dataset_id=NEW.dataset_id AND epoch=NEW.epoch)
 OR EXISTS(SELECT 1 FROM equipment WHERE dataset_id=NEW.dataset_id AND epoch=NEW.epoch)
 OR EXISTS(SELECT 1 FROM agent WHERE dataset_id=NEW.dataset_id AND epoch=NEW.epoch)
 OR EXISTS(SELECT 1 FROM resource_location WHERE dataset_id=NEW.dataset_id AND epoch=NEW.epoch)
 OR EXISTS(SELECT 1 FROM current_state WHERE dataset_id=NEW.dataset_id AND epoch=NEW.epoch)
 OR EXISTS(SELECT 1 FROM maintenance_request WHERE dataset_id=NEW.dataset_id AND epoch=NEW.epoch)
 OR EXISTS(SELECT 1 FROM operational_event WHERE dataset_id=NEW.dataset_id AND epoch=NEW.epoch)
 THEN RAISE(ABORT,'Nonempty baseline context') END;
 SELECT CASE WHEN COALESCE(json_type(NEW.parameters_json,'$.equipmentByCategory')!='array',1)
 OR COALESCE(json_extract(NEW.parameters_json,'$.agentCount')!=NEW.expected_agents,1)
 OR COALESCE((SELECT sum(json_extract(value,'$.count')) FROM json_each(NEW.parameters_json,'$.equipmentByCategory')),0)!=NEW.expected_equipment
 OR COALESCE(json_extract(NEW.counts_json,'$.resources')!=NEW.expected_equipment+NEW.expected_agents,1)
 OR COALESCE(json_extract(NEW.counts_json,'$.equipment')!=NEW.expected_equipment,1)
 OR COALESCE(json_extract(NEW.counts_json,'$.agents')!=NEW.expected_agents,1)
 THEN RAISE(ABORT,'Invalid baseline counts') END;
END;
CREATE TRIGGER demo_member_open BEFORE INSERT ON demo_member BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM demo_seal WHERE dataset_id=NEW.dataset_id AND epoch=NEW.epoch AND manifest_id=NEW.manifest_id)
 OR NEW.ordinal>(SELECT expected_equipment+expected_agents FROM demo_manifest WHERE dataset_id=NEW.dataset_id AND epoch=NEW.epoch AND id=NEW.manifest_id)
 THEN RAISE(ABORT,'Closed/invalid baseline member') END;
END;
CREATE TRIGGER demo_event_group BEFORE INSERT ON operational_event BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM demo_manifest m JOIN demo_seal s ON s.dataset_id=m.dataset_id AND s.epoch=m.epoch AND s.manifest_id=m.id
 WHERE m.dataset_id=NEW.dataset_id AND m.epoch=NEW.epoch AND m.created_revision=NEW.revision)
 THEN RAISE(ABORT,'Closed baseline event group') END;
 SELECT CASE WHEN (NEW.ordinal!=1 OR EXISTS(SELECT 1 FROM demo_manifest m WHERE m.dataset_id=NEW.dataset_id AND m.epoch=NEW.epoch AND m.created_revision=NEW.revision))
 AND NOT EXISTS(SELECT 1 FROM demo_member x WHERE x.dataset_id=NEW.dataset_id AND x.epoch=NEW.epoch AND x.event_id=NEW.id
 AND x.resource_id=NEW.resource_id AND x.ordinal=NEW.ordinal AND x.revision=NEW.revision AND x.actor_id=NEW.actor_id AND x.command_id=NEW.command_id)
 THEN RAISE(ABORT,'Unbound baseline event') END;
END;
CREATE TRIGGER demo_seal_complete BEFORE INSERT ON demo_seal BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM demo_manifest m JOIN dataset d ON d.id=m.dataset_id
 JOIN dataset_epoch e ON e.dataset_id=m.dataset_id AND e.epoch=m.epoch
 WHERE m.dataset_id=NEW.dataset_id AND m.epoch=NEW.epoch AND m.id=NEW.manifest_id
 AND d.kind='demo' AND d.active_epoch=m.epoch AND e.status='ready' AND e.revision=m.created_revision)
 THEN RAISE(ABORT,'Baseline context changed before seal') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM demo_manifest m WHERE m.dataset_id=NEW.dataset_id AND m.epoch=NEW.epoch AND m.id=NEW.manifest_id
 AND (SELECT count(*) FROM demo_member x JOIN operational_event e ON e.dataset_id=x.dataset_id AND e.epoch=x.epoch AND e.id=x.event_id
 WHERE x.dataset_id=m.dataset_id AND x.epoch=m.epoch AND x.manifest_id=m.id)=m.expected_equipment+m.expected_agents
 AND (SELECT min(ordinal) FROM demo_member WHERE dataset_id=m.dataset_id AND epoch=m.epoch AND manifest_id=m.id)=1
 AND (SELECT max(ordinal) FROM demo_member WHERE dataset_id=m.dataset_id AND epoch=m.epoch AND manifest_id=m.id)=m.expected_equipment+m.expected_agents
 AND (SELECT count(*) FROM demo_member WHERE dataset_id=m.dataset_id AND epoch=m.epoch AND manifest_id=m.id AND kind='equipment')=m.expected_equipment
 AND (SELECT count(*) FROM demo_member WHERE dataset_id=m.dataset_id AND epoch=m.epoch AND manifest_id=m.id AND kind='agent')=m.expected_agents)
 THEN RAISE(ABORT,'Incomplete baseline group') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM demo_member x JOIN operational_event e ON e.dataset_id=x.dataset_id AND e.epoch=x.epoch AND e.id=x.event_id
 WHERE x.dataset_id=NEW.dataset_id AND x.epoch=NEW.epoch AND x.manifest_id=NEW.manifest_id
 AND (e.resource_version!=1 OR e.action!=CASE x.kind WHEN 'agent' THEN 'inventory.agent.create.v1' ELSE 'inventory.equipment.create.v1' END
 OR e.effective_at!=(SELECT base_time FROM demo_manifest WHERE dataset_id=x.dataset_id AND epoch=x.epoch)
 OR e.recorded_at!=e.effective_at
 OR e.received_at!=(SELECT received_at FROM demo_manifest WHERE dataset_id=x.dataset_id AND epoch=x.epoch))) THEN RAISE(ABORT,'Invalid baseline fact') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM demo_manifest m,json_each(m.parameters_json,'$.equipmentByCategory') p
 WHERE m.dataset_id=NEW.dataset_id AND m.epoch=NEW.epoch AND m.id=NEW.manifest_id
 AND (SELECT count(*) FROM demo_member x JOIN equipment e ON e.dataset_id=x.dataset_id AND e.epoch=x.epoch AND e.id=x.resource_id
 WHERE x.dataset_id=m.dataset_id AND x.epoch=m.epoch AND x.manifest_id=m.id
 AND e.category_code=json_extract(p.value,'$.code') AND e.category_version=json_extract(p.value,'$.version'))!=json_extract(p.value,'$.count'))
 THEN RAISE(ABORT,'Invalid baseline category distribution') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM demo_manifest m WHERE m.dataset_id=NEW.dataset_id AND m.epoch=NEW.epoch
 AND ((SELECT count(maintenance_id) FROM demo_member WHERE dataset_id=m.dataset_id AND epoch=m.epoch)!=json_extract(m.counts_json,'$.maintenanceRequests')
 OR (SELECT count(*) FROM maintenance_request WHERE dataset_id=m.dataset_id AND epoch=m.epoch)!=json_extract(m.counts_json,'$.maintenanceRequests')
 OR (SELECT count(*) FROM operational_event WHERE dataset_id=m.dataset_id AND epoch=m.epoch AND revision=m.created_revision)!=m.expected_equipment+m.expected_agents))
 THEN RAISE(ABORT,'Invalid baseline associated counts') END;
END;
CREATE TRIGGER demo_receipt_required BEFORE INSERT ON command_receipt WHEN NEW.operation='demo.generate.v1' BEGIN
 SELECT CASE WHEN NEW.response_status!=201 OR NOT EXISTS(SELECT 1 FROM demo_manifest m JOIN demo_seal s
 ON s.dataset_id=m.dataset_id AND s.epoch=m.epoch AND s.manifest_id=m.id WHERE m.dataset_id=NEW.dataset_id AND m.epoch=NEW.epoch
 AND m.actor_id=NEW.actor_id AND m.command_id=NEW.command_id AND m.created_revision=NEW.resulting_revision
 AND json_extract(NEW.response_body,'$.manifest.manifestId')=m.id AND json_extract(NEW.response_body,'$.revision')=m.created_revision
 AND json_extract(NEW.response_body,'$.datasetId')=m.dataset_id AND json_extract(NEW.response_body,'$.epoch')=m.epoch)
 THEN RAISE(ABORT,'Missing/invalid baseline receipt group') END;
END;
CREATE TRIGGER demo_manifest_immutable_update BEFORE UPDATE ON demo_manifest BEGIN SELECT RAISE(ABORT,'Immutable baseline manifest'); END;
CREATE TRIGGER demo_manifest_immutable_delete BEFORE DELETE ON demo_manifest BEGIN SELECT RAISE(ABORT,'Immutable baseline manifest'); END;
CREATE TRIGGER demo_member_immutable_update BEFORE UPDATE ON demo_member BEGIN SELECT RAISE(ABORT,'Immutable baseline member'); END;
CREATE TRIGGER demo_member_immutable_delete BEFORE DELETE ON demo_member BEGIN SELECT RAISE(ABORT,'Immutable baseline member'); END;
CREATE TRIGGER demo_seal_immutable_update BEFORE UPDATE ON demo_seal BEGIN SELECT RAISE(ABORT,'Immutable baseline seal'); END;
CREATE TRIGGER demo_seal_immutable_delete BEFORE DELETE ON demo_seal BEGIN SELECT RAISE(ABORT,'Immutable baseline seal'); END;
CREATE TRIGGER demo_receipt_immutable_update BEFORE UPDATE ON command_receipt WHEN OLD.operation='demo.generate.v1' OR NEW.operation='demo.generate.v1'
 BEGIN SELECT RAISE(ABORT,'Immutable baseline receipt'); END;
CREATE TRIGGER demo_receipt_immutable_delete BEFORE DELETE ON command_receipt WHEN OLD.operation='demo.generate.v1'
 BEGIN SELECT RAISE(ABORT,'Immutable baseline receipt'); END;
