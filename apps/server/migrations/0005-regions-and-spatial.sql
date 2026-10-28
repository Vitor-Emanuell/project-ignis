-- T0006: contextual regions catalog, spatial classification and filter indexes.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE region (
  dataset_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  id TEXT NOT NULL CHECK (length(id) = 36),
  code TEXT NOT NULL CHECK (length(trim(code)) BETWEEN 1 AND 64),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 256),
  version INTEGER NOT NULL CHECK (version = 1),
  min_lon REAL NOT NULL CHECK (min_lon BETWEEN -180 AND 180),
  min_lat REAL NOT NULL CHECK (min_lat BETWEEN -90 AND 90),
  max_lon REAL NOT NULL CHECK (max_lon BETWEEN -180 AND 180 AND max_lon >= min_lon),
  max_lat REAL NOT NULL CHECK (max_lat BETWEEN -90 AND 90 AND max_lat >= min_lat),
  geometry_json TEXT NOT NULL CHECK (
    json_valid(geometry_json)
    AND json_type(geometry_json) = 'object'
    AND json_extract(geometry_json, '$.type') IN ('Polygon', 'MultiPolygon')
    AND json_type(geometry_json, '$.coordinates') = 'array'
  ),
  PRIMARY KEY (dataset_id, epoch, id),
  UNIQUE (dataset_id, epoch, code),
  FOREIGN KEY (dataset_id, epoch) REFERENCES dataset_epoch(dataset_id, epoch) ON DELETE RESTRICT ON UPDATE RESTRICT
) STRICT;

CREATE INDEX region_bbox ON region(dataset_id, epoch, min_lon, max_lon, min_lat, max_lat, code);
CREATE TRIGGER region_immutable_update BEFORE UPDATE ON region BEGIN SELECT RAISE(ABORT, 'Immutable region'); END;
CREATE TRIGGER region_immutable_delete BEFORE DELETE ON region BEGIN SELECT RAISE(ABORT, 'Immutable region'); END;

INSERT INTO region(dataset_id, epoch, id, code, name, version, min_lon, min_lat, max_lon, max_lat, geometry_json)
SELECT
  e.dataset_id,
  e.epoch,
  seed.id,
  seed.code,
  seed.name,
  1,
  seed.min_lon,
  seed.min_lat,
  seed.max_lon,
  seed.max_lat,
  seed.geometry_json
FROM dataset_epoch e
CROSS JOIN (
  SELECT
    '10000000-0000-4000-8000-000000000101' AS id,
    'REG-CENTRO' AS code,
    'Região Centro' AS name,
    -46.655 AS min_lon,
    -23.565 AS min_lat,
    -46.64 AS max_lon,
    -23.55 AS max_lat,
    '{"type":"Polygon","coordinates":[[[-46.655,-23.565],[-46.64,-23.565],[-46.64,-23.55],[-46.655,-23.55],[-46.655,-23.565]]]}' AS geometry_json
  UNION ALL
  SELECT
    '10000000-0000-4000-8000-000000000102',
    'REG-LESTE',
    'Região Leste',
    -46.64,
    -23.565,
    -46.625,
    -23.55,
    '{"type":"Polygon","coordinates":[[[-46.64,-23.565],[-46.625,-23.565],[-46.625,-23.55],[-46.64,-23.55],[-46.64,-23.565]]]}'
  UNION ALL
  SELECT
    '10000000-0000-4000-8000-000000000103',
    'REG-NORTE',
    'Região Norte',
    -46.64,
    -23.55,
    -46.625,
    -23.535,
    '{"type":"Polygon","coordinates":[[[-46.64,-23.55],[-46.625,-23.55],[-46.625,-23.535],[-46.64,-23.535],[-46.64,-23.55]]]}'
  UNION ALL
  SELECT
    '10000000-0000-4000-8000-000000000104',
    'REG-OESTE',
    'Região Oeste',
    -46.655,
    -23.55,
    -46.64,
    -23.535,
    '{"type":"Polygon","coordinates":[[[-46.655,-23.55],[-46.64,-23.55],[-46.64,-23.535],[-46.655,-23.535],[-46.655,-23.55]]]}'
  UNION ALL
  SELECT
    '10000000-0000-4000-8000-000000000105',
    'REG-ZONA-EXPANSAO',
    'Zona de Expansão',
    -46.67,
    -23.565,
    -46.656,
    -23.535,
    '{"type":"Polygon","coordinates":[[[-46.67,-23.565],[-46.656,-23.565],[-46.656,-23.535],[-46.67,-23.535],[-46.67,-23.565]]]}'
) AS seed;

CREATE TRIGGER region_seed_epoch AFTER INSERT ON dataset_epoch
BEGIN
  INSERT INTO region(dataset_id, epoch, id, code, name, version, min_lon, min_lat, max_lon, max_lat, geometry_json) VALUES
    (NEW.dataset_id, NEW.epoch, '10000000-0000-4000-8000-000000000101', 'REG-CENTRO', 'Região Centro', 1, -46.655, -23.565, -46.64, -23.55, '{"type":"Polygon","coordinates":[[[-46.655,-23.565],[-46.64,-23.565],[-46.64,-23.55],[-46.655,-23.55],[-46.655,-23.565]]]}'),
    (NEW.dataset_id, NEW.epoch, '10000000-0000-4000-8000-000000000102', 'REG-LESTE', 'Região Leste', 1, -46.64, -23.565, -46.625, -23.55, '{"type":"Polygon","coordinates":[[[-46.64,-23.565],[-46.625,-23.565],[-46.625,-23.55],[-46.64,-23.55],[-46.64,-23.565]]]}'),
    (NEW.dataset_id, NEW.epoch, '10000000-0000-4000-8000-000000000103', 'REG-NORTE', 'Região Norte', 1, -46.64, -23.55, -46.625, -23.535, '{"type":"Polygon","coordinates":[[[-46.64,-23.55],[-46.625,-23.55],[-46.625,-23.535],[-46.64,-23.535],[-46.64,-23.55]]]}'),
    (NEW.dataset_id, NEW.epoch, '10000000-0000-4000-8000-000000000104', 'REG-OESTE', 'Região Oeste', 1, -46.655, -23.55, -46.64, -23.535, '{"type":"Polygon","coordinates":[[[-46.655,-23.55],[-46.64,-23.55],[-46.64,-23.535],[-46.655,-23.535],[-46.655,-23.55]]]}'),
    (NEW.dataset_id, NEW.epoch, '10000000-0000-4000-8000-000000000105', 'REG-ZONA-EXPANSAO', 'Zona de Expansão', 1, -46.67, -23.565, -46.656, -23.535, '{"type":"Polygon","coordinates":[[[-46.67,-23.565],[-46.656,-23.565],[-46.656,-23.535],[-46.67,-23.535],[-46.67,-23.565]]]}');
END;

CREATE TEMP TABLE t6_old_resource_location AS SELECT * FROM resource_location;
DROP TABLE resource_location;

CREATE TABLE resource_location (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, resource_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('registration', 'base')),
  reference_type TEXT NOT NULL CHECK (reference_type IN ('base', 'installation', 'institutional')),
  postal_code TEXT NOT NULL CHECK (length(postal_code) = 8 AND postal_code NOT GLOB '*[^0-9]*'),
  neighborhood TEXT NOT NULL, city TEXT NOT NULL,
  uf TEXT NOT NULL CHECK (uf IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  address TEXT NOT NULL, reference TEXT NOT NULL,
  latitude REAL, longitude REAL,
  region_id TEXT,
  CHECK ((latitude IS NULL AND longitude IS NULL AND region_id IS NULL) OR
    (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 AND (region_id IS NULL OR length(region_id) = 36))),
  CHECK (role != 'base' OR reference_type = 'base'),
  PRIMARY KEY (dataset_id, epoch, resource_id, role),
  FOREIGN KEY (dataset_id, epoch, resource_id) REFERENCES resource(dataset_id, epoch, id),
  FOREIGN KEY (dataset_id, epoch, region_id) REFERENCES region(dataset_id, epoch, id)
);

INSERT INTO resource_location(dataset_id, epoch, resource_id, role, reference_type, postal_code, neighborhood, city, uf, address, reference, latitude, longitude, region_id)
SELECT
  l.dataset_id, l.epoch, l.resource_id, l.role, l.reference_type, l.postal_code, l.neighborhood, l.city, l.uf, l.address, l.reference, l.latitude, l.longitude,
  CASE
    WHEN l.latitude IS NULL OR l.longitude IS NULL THEN NULL
    ELSE (
      SELECT r.id FROM region r
      WHERE r.dataset_id = l.dataset_id
        AND r.epoch = l.epoch
        AND l.longitude >= r.min_lon AND l.longitude <= r.max_lon
        AND l.latitude >= r.min_lat AND l.latitude <= r.max_lat
      ORDER BY r.code COLLATE BINARY ASC
      LIMIT 1
    )
  END
FROM t6_old_resource_location l;

DROP TABLE t6_old_resource_location;

CREATE INDEX resource_location_spatial ON resource_location(dataset_id, epoch, role, region_id, latitude, longitude);
CREATE INDEX resource_location_bbox ON resource_location(dataset_id, epoch, role, longitude, latitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE TRIGGER location_kind_insert BEFORE INSERT ON resource_location
  WHEN NEW.role='registration' AND EXISTS(SELECT 1 FROM resource r LEFT JOIN equipment e USING(dataset_id,epoch,id)
    WHERE r.dataset_id=NEW.dataset_id AND r.epoch=NEW.epoch AND r.id=NEW.resource_id AND
    ((r.kind='agent' AND NEW.reference_type!='institutional') OR (r.kind='equipment' AND
    (NEW.reference_type='institutional' OR (e.mobility='mobile' AND NEW.reference_type!='base')))))
  BEGIN SELECT RAISE(ABORT,'Invalid resource location reference'); END;

CREATE TRIGGER location_kind_update BEFORE UPDATE ON resource_location
  WHEN NEW.role='registration' AND EXISTS(SELECT 1 FROM resource r LEFT JOIN equipment e USING(dataset_id,epoch,id)
    WHERE r.dataset_id=NEW.dataset_id AND r.epoch=NEW.epoch AND r.id=NEW.resource_id AND
    ((r.kind='agent' AND NEW.reference_type!='institutional') OR (r.kind='equipment' AND
    (NEW.reference_type='institutional' OR (e.mobility='mobile' AND NEW.reference_type!='base')))))
  BEGIN SELECT RAISE(ABORT,'Invalid resource location reference'); END;

ALTER TABLE current_state ADD COLUMN communication_state TEXT
  CHECK (
    (activity IS NOT NULL AND communication_state IS NULL)
    OR (operational_state IS NOT NULL AND (communication_state IS NULL OR communication_state IN ('not_applicable', 'unknown', 'fresh', 'stale')))
  );

CREATE INDEX current_state_filter ON current_state(dataset_id, epoch, operational_state, activity, communication_state);
CREATE INDEX equipment_criticality ON equipment(dataset_id, epoch, criticality);
