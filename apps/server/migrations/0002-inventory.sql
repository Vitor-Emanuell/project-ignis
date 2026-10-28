CREATE TABLE category_version (
  category_code TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  profile_json TEXT NOT NULL CHECK (json_valid(profile_json)),
  PRIMARY KEY (category_code, schema_version)
);
INSERT INTO category_version VALUES ('fixed_speed_radar', 1,
  '{"code":"fixed_speed_radar","version":1,"name":"Radar de velocidade fixo","mobility":"fixed","attributes":{"regulatedSpeedLimitKmh":{"type":"integer","unit":"km/h","minimum":1,"maximum":200,"required":true,"nullable":false,"demonstrationOnly":true}}}');
CREATE TRIGGER category_immutable_update BEFORE UPDATE ON category_version
BEGIN SELECT RAISE(ABORT, 'Immutable category version'); END;
CREATE TRIGGER category_immutable_delete BEFORE DELETE ON category_version
BEGIN SELECT RAISE(ABORT, 'Immutable category version'); END;

CREATE TABLE organization (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, id TEXT NOT NULL,
  code TEXT NOT NULL, name TEXT NOT NULL,
  PRIMARY KEY (dataset_id, epoch, id), UNIQUE (dataset_id, epoch, code),
  FOREIGN KEY (dataset_id, epoch) REFERENCES dataset_epoch(dataset_id, epoch)
);
CREATE TABLE resource (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind = 'equipment'), organization_id TEXT NOT NULL,
  public_label TEXT NOT NULL CHECK (length(public_label) BETWEEN 1 AND 256),
  version INTEGER NOT NULL CHECK (version BETWEEN 1 AND 9007199254740991),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  PRIMARY KEY (dataset_id, epoch, id),
  FOREIGN KEY (dataset_id, epoch, organization_id) REFERENCES organization(dataset_id, epoch, id)
);
CREATE INDEX resource_organization ON resource(dataset_id, epoch, kind, organization_id);
CREATE TABLE equipment (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, id TEXT NOT NULL,
  category_code TEXT NOT NULL CHECK (category_code = 'fixed_speed_radar'),
  category_version INTEGER NOT NULL CHECK (category_version = 1),
  serial_normalized TEXT NOT NULL CHECK (length(serial_normalized) BETWEEN 1 AND 256),
  brand TEXT NOT NULL CHECK (length(trim(brand)) BETWEEN 1 AND 256),
  model TEXT NOT NULL CHECK (length(trim(model)) BETWEEN 1 AND 256),
  criticality INTEGER NOT NULL CHECK (typeof(criticality) = 'integer' AND criticality BETWEEN 1 AND 5),
  mobility TEXT NOT NULL CHECK (mobility = 'fixed'),
  attributes_json TEXT NOT NULL CHECK (json_valid(attributes_json)
    AND json_type(attributes_json, '$.regulatedSpeedLimitKmh') = 'integer'
    AND json_extract(attributes_json, '$.regulatedSpeedLimitKmh') BETWEEN 1 AND 200),
  PRIMARY KEY (dataset_id, epoch, id), UNIQUE (dataset_id, epoch, serial_normalized),
  FOREIGN KEY (dataset_id, epoch, id) REFERENCES resource(dataset_id, epoch, id),
  FOREIGN KEY (category_code, category_version) REFERENCES category_version(category_code, schema_version)
);
CREATE TABLE resource_location (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, resource_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('registration', 'base')),
  reference_type TEXT NOT NULL CHECK (reference_type IN ('base', 'installation')),
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
  operational_state TEXT NOT NULL CHECK (operational_state = 'not_installed'),
  version INTEGER NOT NULL CHECK (version > 0),
  PRIMARY KEY (dataset_id, epoch, resource_id),
  FOREIGN KEY (dataset_id, epoch, resource_id) REFERENCES equipment(dataset_id, epoch, id)
);
CREATE TABLE maintenance_request (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, id TEXT NOT NULL, equipment_id TEXT NOT NULL,
  cause_code TEXT NOT NULL CHECK (cause_code = 'initial_preventive_check'),
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
  action TEXT NOT NULL CHECK (action IN ('inventory.equipment.create.v1', 'inventory.equipment.update.v1')),
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
