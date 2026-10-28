-- T0004: reconstruct the entire dependent graph with foreign_keys ON.
-- Data copies and DDL share the caller's BEGIN IMMEDIATE transaction.
PRAGMA defer_foreign_keys = ON;
CREATE TEMP TABLE t4_validation(ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO t4_validation SELECT CASE WHEN (SELECT count(*) FROM category_version WHERE category_code='fixed_speed_radar' AND schema_version=1 AND profile_json='{"code":"fixed_speed_radar","version":1,"name":"Radar de velocidade fixo","mobility":"fixed","attributes":{"regulatedSpeedLimitKmh":{"type":"integer","unit":"km/h","minimum":1,"maximum":200,"required":true,"nullable":false,"demonstrationOnly":true}}}')=1 THEN 1 ELSE 0 END;
CREATE TEMP TABLE t4_old_resource AS SELECT * FROM resource;
CREATE TEMP TABLE t4_old_equipment AS SELECT * FROM equipment;
CREATE TEMP TABLE t4_old_resource_location AS SELECT * FROM resource_location;
CREATE TEMP TABLE t4_old_current_state AS SELECT * FROM current_state;
CREATE TEMP TABLE t4_old_maintenance_request AS SELECT * FROM maintenance_request;
CREATE TEMP TABLE t4_old_operational_event AS SELECT * FROM operational_event;
DROP TABLE operational_event;
DROP TABLE maintenance_request;
DROP TABLE current_state;
DROP TABLE resource_location;
DROP TABLE equipment;
DROP TABLE resource;
INSERT INTO category_version VALUES ('red_light_radar',1,'{"code":"red_light_radar","version":1,"name":"Radar de semáforo","mobility":"fixed","attributes":{"monitoredLaneCount":{"type":"integer","unit":"faixas","minimum":1,"maximum":32,"required":true,"nullable":false,"demonstrationOnly":true}}}');
INSERT INTO category_version VALUES ('turn_radar',1,'{"code":"turn_radar","version":1,"name":"Radar de conversão","mobility":"fixed","attributes":{"restrictedMovement":{"type":"string","unit":null,"enum":["left","right","u_turn"],"required":true,"nullable":false,"demonstrationOnly":true}}}');
INSERT INTO category_version VALUES ('camera',1,'{"code":"camera","version":1,"name":"Câmera","mobility":"fixed","attributes":{"cameraType":{"type":"string","unit":null,"enum":["fixed_view","ptz"],"required":true,"nullable":false,"demonstrationOnly":true}}}');
INSERT INTO category_version VALUES ('weighing_scale',1,'{"code":"weighing_scale","version":1,"name":"Balança","mobility":"fixed","attributes":{"capacityKg":{"type":"number","unit":"kg","exclusiveMinimum":0,"maximum":100000,"required":true,"nullable":false,"demonstrationOnly":true}}}');
INSERT INTO category_version VALUES ('inspection_vehicle',1,'{"code":"inspection_vehicle","version":1,"name":"Veículo de fiscalização","mobility":"mobile","attributes":{"occupantCapacity":{"type":"integer","unit":"pessoas incluindo condutor","minimum":1,"maximum":100,"required":true,"nullable":false,"demonstrationOnly":true}}}');
INSERT INTO category_version VALUES ('barrier_gate',1,'{"code":"barrier_gate","version":1,"name":"Cancela","mobility":"fixed","attributes":{"openingWidthM":{"type":"number","unit":"m","exclusiveMinimum":0,"maximum":20,"required":true,"nullable":false,"demonstrationOnly":true}}}');
INSERT INTO category_version VALUES ('taxi',1,'{"code":"taxi","version":1,"name":"Táxi","mobility":"mobile","attributes":{"occupantCapacity":{"type":"integer","unit":"pessoas incluindo condutor","minimum":1,"maximum":20,"required":true,"nullable":false,"demonstrationOnly":true}}}');
INSERT INTO category_version VALUES ('motorcycle_taxi',1,'{"code":"motorcycle_taxi","version":1,"name":"Mototáxi","mobility":"mobile","attributes":{"occupantCapacity":{"type":"integer","unit":"pessoas incluindo condutor","minimum":1,"maximum":2,"required":true,"nullable":false,"demonstrationOnly":true}}}');
INSERT INTO category_version VALUES ('school_transport_vehicle',1,'{"code":"school_transport_vehicle","version":1,"name":"Transporte escolar","mobility":"mobile","attributes":{"occupantCapacity":{"type":"integer","unit":"pessoas incluindo condutor","minimum":1,"maximum":100,"required":true,"nullable":false,"demonstrationOnly":true}}}');
INSERT INTO category_version VALUES ('parking_totem',1,'{"code":"parking_totem","version":1,"name":"Totem de estacionamento","mobility":"fixed","attributes":{"parkingSpaceCount":{"type":"integer","unit":"vagas","minimum":1,"maximum":1000,"required":true,"nullable":false,"demonstrationOnly":true}}}');
INSERT INTO category_version VALUES ('scooter',1,'{"code":"scooter","version":1,"name":"Patinete","mobility":"mobile","attributes":{"occupantCapacity":{"type":"integer","unit":"pessoas incluindo condutor","minimum":1,"maximum":2,"required":true,"nullable":false,"demonstrationOnly":true}}}');
INSERT INTO category_version VALUES ('motorcycle',1,'{"code":"motorcycle","version":1,"name":"Motocicleta","mobility":"mobile","attributes":{"occupantCapacity":{"type":"integer","unit":"pessoas incluindo condutor","minimum":1,"maximum":2,"required":true,"nullable":false,"demonstrationOnly":true}}}');
INSERT INTO category_version VALUES ('official_vehicle',1,'{"code":"official_vehicle","version":1,"name":"Viatura","mobility":"mobile","attributes":{"occupantCapacity":{"type":"integer","unit":"pessoas incluindo condutor","minimum":1,"maximum":20,"required":true,"nullable":false,"demonstrationOnly":true}}}');
CREATE TABLE category_policy (
  category_code TEXT NOT NULL, category_version INTEGER NOT NULL, mobility TEXT NOT NULL CHECK(mobility IN ('fixed','mobile')),
  cause_code TEXT NOT NULL, policy_json TEXT NOT NULL CHECK(json_valid(policy_json)),
  PRIMARY KEY(category_code,category_version), UNIQUE(category_code,category_version,mobility),
  FOREIGN KEY(category_code,category_version) REFERENCES category_version(category_code,schema_version)
);
INSERT INTO category_policy VALUES ('fixed_speed_radar',1,'fixed','initial_preventive_check','{"code":"fixed_speed_radar","version":1,"kind":"equipment","initialMaintenance":{"supported":true,"causeCode":"initial_preventive_check","scheduleApplicable":true,"scheduleRequired":false,"allowedScheduleStatuses":["dated","unknown","not_applicable"]},"allowedInitialStates":["not_installed"],"initialStateDefault":"not_installed","initialStateReasonRequiredFor":[]}');
INSERT INTO category_policy VALUES ('red_light_radar',1,'fixed','initial_red_light_inspection','{"code":"red_light_radar","version":1,"kind":"equipment","initialMaintenance":{"supported":true,"causeCode":"initial_red_light_inspection","scheduleApplicable":true,"scheduleRequired":false,"allowedScheduleStatuses":["dated","unknown","not_applicable"]},"allowedInitialStates":["not_installed","operational"],"initialStateDefault":"not_installed","initialStateReasonRequiredFor":["operational"]}');
INSERT INTO category_policy VALUES ('turn_radar',1,'fixed','initial_turn_inspection','{"code":"turn_radar","version":1,"kind":"equipment","initialMaintenance":{"supported":true,"causeCode":"initial_turn_inspection","scheduleApplicable":true,"scheduleRequired":false,"allowedScheduleStatuses":["dated","unknown","not_applicable"]},"allowedInitialStates":["not_installed","operational"],"initialStateDefault":"not_installed","initialStateReasonRequiredFor":["operational"]}');
INSERT INTO category_policy VALUES ('camera',1,'fixed','initial_camera_inspection','{"code":"camera","version":1,"kind":"equipment","initialMaintenance":{"supported":true,"causeCode":"initial_camera_inspection","scheduleApplicable":true,"scheduleRequired":false,"allowedScheduleStatuses":["dated","unknown","not_applicable"]},"allowedInitialStates":["not_installed","operational"],"initialStateDefault":"not_installed","initialStateReasonRequiredFor":["operational"]}');
INSERT INTO category_policy VALUES ('weighing_scale',1,'fixed','initial_scale_inspection','{"code":"weighing_scale","version":1,"kind":"equipment","initialMaintenance":{"supported":true,"causeCode":"initial_scale_inspection","scheduleApplicable":true,"scheduleRequired":false,"allowedScheduleStatuses":["dated","unknown","not_applicable"]},"allowedInitialStates":["not_installed","operational"],"initialStateDefault":"not_installed","initialStateReasonRequiredFor":["operational"]}');
INSERT INTO category_policy VALUES ('inspection_vehicle',1,'mobile','initial_inspection_vehicle_review','{"code":"inspection_vehicle","version":1,"kind":"equipment","initialMaintenance":{"supported":true,"causeCode":"initial_inspection_vehicle_review","scheduleApplicable":true,"scheduleRequired":false,"allowedScheduleStatuses":["dated","unknown","not_applicable"]},"allowedInitialStates":["not_installed","operational"],"initialStateDefault":"not_installed","initialStateReasonRequiredFor":["operational"]}');
INSERT INTO category_policy VALUES ('barrier_gate',1,'fixed','initial_barrier_inspection','{"code":"barrier_gate","version":1,"kind":"equipment","initialMaintenance":{"supported":true,"causeCode":"initial_barrier_inspection","scheduleApplicable":true,"scheduleRequired":false,"allowedScheduleStatuses":["dated","unknown","not_applicable"]},"allowedInitialStates":["not_installed","operational"],"initialStateDefault":"not_installed","initialStateReasonRequiredFor":["operational"]}');
INSERT INTO category_policy VALUES ('taxi',1,'mobile','initial_taxi_review','{"code":"taxi","version":1,"kind":"equipment","initialMaintenance":{"supported":true,"causeCode":"initial_taxi_review","scheduleApplicable":true,"scheduleRequired":false,"allowedScheduleStatuses":["dated","unknown","not_applicable"]},"allowedInitialStates":["not_installed","operational"],"initialStateDefault":"not_installed","initialStateReasonRequiredFor":["operational"]}');
INSERT INTO category_policy VALUES ('motorcycle_taxi',1,'mobile','initial_motorcycle_taxi_review','{"code":"motorcycle_taxi","version":1,"kind":"equipment","initialMaintenance":{"supported":true,"causeCode":"initial_motorcycle_taxi_review","scheduleApplicable":true,"scheduleRequired":false,"allowedScheduleStatuses":["dated","unknown","not_applicable"]},"allowedInitialStates":["not_installed","operational"],"initialStateDefault":"not_installed","initialStateReasonRequiredFor":["operational"]}');
INSERT INTO category_policy VALUES ('school_transport_vehicle',1,'mobile','initial_school_transport_review','{"code":"school_transport_vehicle","version":1,"kind":"equipment","initialMaintenance":{"supported":true,"causeCode":"initial_school_transport_review","scheduleApplicable":true,"scheduleRequired":false,"allowedScheduleStatuses":["dated","unknown","not_applicable"]},"allowedInitialStates":["not_installed","operational"],"initialStateDefault":"not_installed","initialStateReasonRequiredFor":["operational"]}');
INSERT INTO category_policy VALUES ('parking_totem',1,'fixed','initial_totem_inspection','{"code":"parking_totem","version":1,"kind":"equipment","initialMaintenance":{"supported":true,"causeCode":"initial_totem_inspection","scheduleApplicable":true,"scheduleRequired":false,"allowedScheduleStatuses":["dated","unknown","not_applicable"]},"allowedInitialStates":["not_installed","operational"],"initialStateDefault":"not_installed","initialStateReasonRequiredFor":["operational"]}');
INSERT INTO category_policy VALUES ('scooter',1,'mobile','initial_scooter_review','{"code":"scooter","version":1,"kind":"equipment","initialMaintenance":{"supported":true,"causeCode":"initial_scooter_review","scheduleApplicable":true,"scheduleRequired":false,"allowedScheduleStatuses":["dated","unknown","not_applicable"]},"allowedInitialStates":["not_installed","operational"],"initialStateDefault":"not_installed","initialStateReasonRequiredFor":["operational"]}');
INSERT INTO category_policy VALUES ('motorcycle',1,'mobile','initial_motorcycle_review','{"code":"motorcycle","version":1,"kind":"equipment","initialMaintenance":{"supported":true,"causeCode":"initial_motorcycle_review","scheduleApplicable":true,"scheduleRequired":false,"allowedScheduleStatuses":["dated","unknown","not_applicable"]},"allowedInitialStates":["not_installed","operational"],"initialStateDefault":"not_installed","initialStateReasonRequiredFor":["operational"]}');
INSERT INTO category_policy VALUES ('official_vehicle',1,'mobile','initial_official_vehicle_review','{"code":"official_vehicle","version":1,"kind":"equipment","initialMaintenance":{"supported":true,"causeCode":"initial_official_vehicle_review","scheduleApplicable":true,"scheduleRequired":false,"allowedScheduleStatuses":["dated","unknown","not_applicable"]},"allowedInitialStates":["not_installed","operational"],"initialStateDefault":"not_installed","initialStateReasonRequiredFor":["operational"]}');
CREATE TRIGGER policy_immutable_update BEFORE UPDATE ON category_policy BEGIN SELECT RAISE(ABORT,'Immutable category policy'); END;
CREATE TRIGGER policy_immutable_delete BEFORE DELETE ON category_policy BEGIN SELECT RAISE(ABORT,'Immutable category policy'); END;
CREATE TABLE resource (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('equipment','agent')),
  organization_id TEXT NOT NULL, public_label TEXT NOT NULL CHECK(length(public_label) BETWEEN 1 AND 256),
  version INTEGER NOT NULL CHECK(typeof(version)='integer' AND version BETWEEN 1 AND 9007199254740991),
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
  equipment_id TEXT GENERATED ALWAYS AS (CASE WHEN kind='equipment' THEN id END) STORED,
  agent_id TEXT GENERATED ALWAYS AS (CASE WHEN kind='agent' THEN id END) STORED,
  registration_role TEXT GENERATED ALWAYS AS ('registration') STORED,
  PRIMARY KEY (dataset_id, epoch, id), UNIQUE(dataset_id,epoch,id,kind),
  FOREIGN KEY(dataset_id,epoch,organization_id) REFERENCES organization(dataset_id,epoch,id),
  FOREIGN KEY(dataset_id,epoch,equipment_id) REFERENCES equipment(dataset_id,epoch,id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(dataset_id,epoch,agent_id) REFERENCES agent(dataset_id,epoch,id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(dataset_id,epoch,id,registration_role) REFERENCES resource_location(dataset_id,epoch,resource_id,role) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(dataset_id,epoch,id) REFERENCES current_state(dataset_id,epoch,resource_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX resource_organization ON resource(dataset_id,epoch,kind,organization_id);
CREATE TABLE equipment (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, id TEXT NOT NULL, category_code TEXT NOT NULL, category_version INTEGER NOT NULL CHECK(category_version=1),
  serial_normalized TEXT NOT NULL CHECK(length(trim(serial_normalized)) BETWEEN 1 AND 256),
  brand TEXT NOT NULL CHECK(length(trim(brand)) BETWEEN 1 AND 256),
  model TEXT NOT NULL CHECK(length(trim(model)) BETWEEN 1 AND 256),
  criticality INTEGER NOT NULL CHECK(typeof(criticality)='integer' AND criticality BETWEEN 1 AND 5),
  mobility TEXT NOT NULL CHECK(mobility IN ('fixed','mobile')),
  attributes_json TEXT NOT NULL CHECK(json_valid(attributes_json) AND json_type(attributes_json)='object'),
  kind TEXT GENERATED ALWAYS AS ('equipment') STORED,
  PRIMARY KEY (dataset_id, epoch, id), UNIQUE(dataset_id,epoch,serial_normalized),
  FOREIGN KEY(dataset_id,epoch,id,kind) REFERENCES resource(dataset_id,epoch,id,kind),
  FOREIGN KEY(category_code,category_version) REFERENCES category_version(category_code,schema_version),
  FOREIGN KEY(category_code,category_version,mobility) REFERENCES category_policy(category_code,category_version,mobility),
  CHECK(COALESCE(CASE category_code
    WHEN 'fixed_speed_radar' THEN json_type(attributes_json,'$.regulatedSpeedLimitKmh') = 'integer' AND json_extract(attributes_json,'$.regulatedSpeedLimitKmh') >= 1 AND json_extract(attributes_json,'$.regulatedSpeedLimitKmh')<=200
    WHEN 'red_light_radar' THEN json_type(attributes_json,'$.monitoredLaneCount') = 'integer' AND json_extract(attributes_json,'$.monitoredLaneCount') >= 1 AND json_extract(attributes_json,'$.monitoredLaneCount')<=32
    WHEN 'turn_radar' THEN json_type(attributes_json,'$.restrictedMovement')='text' AND json_extract(attributes_json,'$.restrictedMovement') IN ('left','right','u_turn')
    WHEN 'camera' THEN json_type(attributes_json,'$.cameraType')='text' AND json_extract(attributes_json,'$.cameraType') IN ('fixed_view','ptz')
    WHEN 'weighing_scale' THEN json_type(attributes_json,'$.capacityKg') IN ('integer','real') AND json_extract(attributes_json,'$.capacityKg') > 0 AND json_extract(attributes_json,'$.capacityKg')<=100000
    WHEN 'inspection_vehicle' THEN json_type(attributes_json,'$.occupantCapacity') = 'integer' AND json_extract(attributes_json,'$.occupantCapacity') >= 1 AND json_extract(attributes_json,'$.occupantCapacity')<=100
    WHEN 'barrier_gate' THEN json_type(attributes_json,'$.openingWidthM') IN ('integer','real') AND json_extract(attributes_json,'$.openingWidthM') > 0 AND json_extract(attributes_json,'$.openingWidthM')<=20
    WHEN 'taxi' THEN json_type(attributes_json,'$.occupantCapacity') = 'integer' AND json_extract(attributes_json,'$.occupantCapacity') >= 1 AND json_extract(attributes_json,'$.occupantCapacity')<=20
    WHEN 'motorcycle_taxi' THEN json_type(attributes_json,'$.occupantCapacity') = 'integer' AND json_extract(attributes_json,'$.occupantCapacity') >= 1 AND json_extract(attributes_json,'$.occupantCapacity')<=2
    WHEN 'school_transport_vehicle' THEN json_type(attributes_json,'$.occupantCapacity') = 'integer' AND json_extract(attributes_json,'$.occupantCapacity') >= 1 AND json_extract(attributes_json,'$.occupantCapacity')<=100
    WHEN 'parking_totem' THEN json_type(attributes_json,'$.parkingSpaceCount') = 'integer' AND json_extract(attributes_json,'$.parkingSpaceCount') >= 1 AND json_extract(attributes_json,'$.parkingSpaceCount')<=1000
    WHEN 'scooter' THEN json_type(attributes_json,'$.occupantCapacity') = 'integer' AND json_extract(attributes_json,'$.occupantCapacity') >= 1 AND json_extract(attributes_json,'$.occupantCapacity')<=2
    WHEN 'motorcycle' THEN json_type(attributes_json,'$.occupantCapacity') = 'integer' AND json_extract(attributes_json,'$.occupantCapacity') >= 1 AND json_extract(attributes_json,'$.occupantCapacity')<=2
    WHEN 'official_vehicle' THEN json_type(attributes_json,'$.occupantCapacity') = 'integer' AND json_extract(attributes_json,'$.occupantCapacity') >= 1 AND json_extract(attributes_json,'$.occupantCapacity')<=20
    ELSE 0 END,0))
);
CREATE INDEX equipment_category ON equipment(dataset_id,epoch,category_code,category_version);
CREATE TABLE agent (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, id TEXT NOT NULL, enrollment_normalized TEXT NOT NULL CHECK(length(trim(enrollment_normalized)) BETWEEN 1 AND 256),
  fictitious_name TEXT NOT NULL CHECK(length(trim(fictitious_name)) BETWEEN 1 AND 256),
  function TEXT NOT NULL CHECK(length(trim(function)) BETWEEN 1 AND 256),
  kind TEXT GENERATED ALWAYS AS ('agent') STORED,
  PRIMARY KEY (dataset_id, epoch, id), UNIQUE(dataset_id,epoch,enrollment_normalized),
  FOREIGN KEY(dataset_id,epoch,id,kind) REFERENCES resource(dataset_id,epoch,id,kind)
);
CREATE INDEX agent_function ON agent(dataset_id,epoch,function,id);
CREATE TABLE resource_location (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, resource_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('registration', 'base')),
  reference_type TEXT NOT NULL CHECK (reference_type IN ('base', 'installation', 'institutional')),
  postal_code TEXT NOT NULL CHECK (length(postal_code) = 8 AND postal_code NOT GLOB '*[^0-9]*'),
  neighborhood TEXT NOT NULL, city TEXT NOT NULL,
  uf TEXT NOT NULL CHECK (uf IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  address TEXT NOT NULL, reference TEXT NOT NULL,
  latitude REAL, longitude REAL,
  CHECK ((latitude IS NULL AND longitude IS NULL) OR
    (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)),
  CHECK (role != 'base' OR reference_type = 'base'),
  PRIMARY KEY (dataset_id, epoch, resource_id, role),
  FOREIGN KEY (dataset_id, epoch, resource_id) REFERENCES resource(dataset_id, epoch, id)
);
CREATE TABLE current_state (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, resource_id TEXT NOT NULL,
  operational_state TEXT, version INTEGER NOT NULL CHECK(typeof(version)='integer' AND version BETWEEN 1 AND 9007199254740991),
  activity TEXT,
  kind TEXT GENERATED ALWAYS AS (CASE WHEN activity IS NULL THEN 'equipment' ELSE 'agent' END) STORED,
  CHECK((operational_state IS NOT NULL AND activity IS NULL AND operational_state IN ('not_installed','operational','malfunction','maintenance','disabled','stolen'))
    OR (operational_state IS NULL AND activity IS NOT NULL AND activity IN ('available','assigned','off_duty','unknown'))),
  PRIMARY KEY(dataset_id,epoch,resource_id),
  FOREIGN KEY(dataset_id,epoch,resource_id,kind) REFERENCES resource(dataset_id,epoch,id,kind)
);
CREATE TABLE maintenance_request (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, id TEXT NOT NULL, equipment_id TEXT NOT NULL,
  cause_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status = 'open'), version INTEGER NOT NULL CHECK (version = 1),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 256),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  schedule_status TEXT NOT NULL CHECK (schedule_status IN ('dated', 'unknown', 'not_applicable')),
  due_date TEXT, not_applicable_reason TEXT,
  CHECK ((schedule_status = 'dated' AND due_date IS NOT NULL AND not_applicable_reason IS NULL)
    OR (schedule_status = 'unknown' AND due_date IS NULL AND not_applicable_reason IS NULL)
    OR (schedule_status = 'not_applicable' AND due_date IS NULL AND not_applicable_reason IS NOT NULL AND length(trim(not_applicable_reason)) BETWEEN 1 AND 256)),
  PRIMARY KEY (dataset_id, epoch, id),
  FOREIGN KEY (dataset_id, epoch, equipment_id) REFERENCES equipment(dataset_id, epoch, id)
);
CREATE UNIQUE INDEX maintenance_active_cause ON maintenance_request(dataset_id, epoch, equipment_id, cause_code) WHERE status = 'open';
CREATE TABLE operational_event (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, id TEXT NOT NULL, resource_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('inventory.equipment.create.v1', 'inventory.equipment.update.v1', 'inventory.agent.create.v1', 'inventory.agent.update.v1')),
  actor_id TEXT NOT NULL REFERENCES actor(id), command_id TEXT NOT NULL,
  resource_version INTEGER NOT NULL, revision INTEGER NOT NULL, ordinal INTEGER NOT NULL CHECK (ordinal = 1),
  effective_at TEXT NOT NULL, recorded_at TEXT NOT NULL, received_at TEXT NOT NULL,
  changes_json TEXT NOT NULL CHECK (json_valid(changes_json)),
  PRIMARY KEY (dataset_id, epoch, id), UNIQUE (dataset_id, epoch, revision, ordinal),
  FOREIGN KEY (dataset_id, epoch, resource_id) REFERENCES resource(dataset_id, epoch, id)
);
CREATE INDEX operational_event_resource ON operational_event(dataset_id, epoch, resource_id, effective_at, id);
CREATE TRIGGER event_append_only_update BEFORE UPDATE ON operational_event
BEGIN SELECT RAISE(ABORT, 'Append-only event'); END;
CREATE TRIGGER event_append_only_delete BEFORE DELETE ON operational_event
BEGIN SELECT RAISE(ABORT, 'Append-only event'); END;


INSERT INTO resource(dataset_id,epoch,id,kind,organization_id,public_label,version,archived)
  SELECT dataset_id,epoch,id,kind,organization_id,public_label,version,archived FROM t4_old_resource;
INSERT INTO equipment(dataset_id,epoch,id,category_code,category_version,serial_normalized,brand,model,criticality,mobility,attributes_json)
  SELECT * FROM t4_old_equipment;
INSERT INTO resource_location SELECT * FROM t4_old_resource_location;
INSERT INTO current_state(dataset_id,epoch,resource_id,operational_state,version) SELECT * FROM t4_old_current_state;
INSERT INTO maintenance_request SELECT * FROM t4_old_maintenance_request;
INSERT INTO operational_event SELECT * FROM t4_old_operational_event;
INSERT INTO t4_validation SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM equipment e WHERE (SELECT count(*) FROM json_each(e.attributes_json))!=1) THEN 1 ELSE 0 END;
DROP TABLE t4_validation;
DROP TABLE t4_old_resource;
DROP TABLE t4_old_equipment;
DROP TABLE t4_old_resource_location;
DROP TABLE t4_old_current_state;
DROP TABLE t4_old_maintenance_request;
DROP TABLE t4_old_operational_event;
CREATE TRIGGER equipment_attributes_insert BEFORE INSERT ON equipment
  WHEN (SELECT count(*) FROM json_each(NEW.attributes_json)) != 1
  BEGIN SELECT RAISE(ABORT,'Invalid category attributes'); END;
CREATE TRIGGER maintenance_category_insert BEFORE INSERT ON maintenance_request
  WHEN NOT EXISTS(SELECT 1 FROM equipment e JOIN category_policy p ON p.category_code=e.category_code AND p.category_version=e.category_version
    WHERE e.dataset_id=NEW.dataset_id AND e.epoch=NEW.epoch AND e.id=NEW.equipment_id AND p.cause_code=NEW.cause_code)
  BEGIN SELECT RAISE(ABORT,'Invalid category maintenance cause'); END;
CREATE TRIGGER location_kind_insert BEFORE INSERT ON resource_location
  WHEN NEW.role='registration' AND EXISTS(SELECT 1 FROM resource r LEFT JOIN equipment e USING(dataset_id,epoch,id)
    WHERE r.dataset_id=NEW.dataset_id AND r.epoch=NEW.epoch AND r.id=NEW.resource_id AND
    ((r.kind='agent' AND NEW.reference_type!='institutional') OR (r.kind='equipment' AND
    (NEW.reference_type='institutional' OR (e.mobility='mobile' AND NEW.reference_type!='base')))))
  BEGIN SELECT RAISE(ABORT,'Invalid resource location reference'); END;
CREATE TRIGGER state_installation_insert BEFORE INSERT ON current_state
  WHEN NEW.operational_state='operational' AND EXISTS(SELECT 1 FROM equipment e
    WHERE e.dataset_id=NEW.dataset_id AND e.epoch=NEW.epoch AND e.id=NEW.resource_id AND
    (e.category_code='fixed_speed_radar' OR (e.mobility='fixed' AND NOT EXISTS(SELECT 1 FROM resource_location l
     WHERE l.dataset_id=e.dataset_id AND l.epoch=e.epoch AND l.resource_id=e.id AND l.role='registration'
       AND l.reference_type='installation' AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL))))
  BEGIN SELECT RAISE(ABORT,'Invalid initial installation'); END;
CREATE TRIGGER equipment_attributes_update BEFORE UPDATE ON equipment
  WHEN (SELECT count(*) FROM json_each(NEW.attributes_json)) != 1
  BEGIN SELECT RAISE(ABORT,'Invalid category attributes'); END;
CREATE TRIGGER maintenance_category_update BEFORE UPDATE ON maintenance_request
  WHEN NOT EXISTS(SELECT 1 FROM equipment e JOIN category_policy p ON p.category_code=e.category_code AND p.category_version=e.category_version
    WHERE e.dataset_id=NEW.dataset_id AND e.epoch=NEW.epoch AND e.id=NEW.equipment_id AND p.cause_code=NEW.cause_code)
  BEGIN SELECT RAISE(ABORT,'Invalid category maintenance cause'); END;
CREATE TRIGGER location_kind_update BEFORE UPDATE ON resource_location
  WHEN NEW.role='registration' AND EXISTS(SELECT 1 FROM resource r LEFT JOIN equipment e USING(dataset_id,epoch,id)
    WHERE r.dataset_id=NEW.dataset_id AND r.epoch=NEW.epoch AND r.id=NEW.resource_id AND
    ((r.kind='agent' AND NEW.reference_type!='institutional') OR (r.kind='equipment' AND
    (NEW.reference_type='institutional' OR (e.mobility='mobile' AND NEW.reference_type!='base')))))
  BEGIN SELECT RAISE(ABORT,'Invalid resource location reference'); END;
CREATE TRIGGER state_installation_update BEFORE UPDATE ON current_state
  WHEN NEW.operational_state='operational' AND EXISTS(SELECT 1 FROM equipment e
    WHERE e.dataset_id=NEW.dataset_id AND e.epoch=NEW.epoch AND e.id=NEW.resource_id AND
    (e.category_code='fixed_speed_radar' OR (e.mobility='fixed' AND NOT EXISTS(SELECT 1 FROM resource_location l
     WHERE l.dataset_id=e.dataset_id AND l.epoch=e.epoch AND l.resource_id=e.id AND l.role='registration'
       AND l.reference_type='installation' AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL))))
  BEGIN SELECT RAISE(ABORT,'Invalid initial installation'); END;
CREATE TRIGGER equipment_category_immutable BEFORE UPDATE OF category_code,category_version,mobility ON equipment
  WHEN NEW.category_code!=OLD.category_code OR NEW.category_version!=OLD.category_version OR NEW.mobility!=OLD.mobility
  BEGIN SELECT RAISE(ABORT,'Immutable equipment category'); END;
CREATE TRIGGER event_resource_kind BEFORE INSERT ON operational_event
  WHEN NOT EXISTS(SELECT 1 FROM resource r WHERE r.dataset_id=NEW.dataset_id AND r.epoch=NEW.epoch AND r.id=NEW.resource_id
    AND ((r.kind='equipment' AND NEW.action IN ('inventory.equipment.create.v1','inventory.equipment.update.v1'))
      OR (r.kind='agent' AND NEW.action IN ('inventory.agent.create.v1','inventory.agent.update.v1'))))
  BEGIN SELECT RAISE(ABORT,'Invalid resource event'); END;
