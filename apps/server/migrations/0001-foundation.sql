CREATE TABLE actor (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind = 'operator'),
  local_key TEXT UNIQUE
);

CREATE TABLE dataset (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('demo', 'operational')),
  active_epoch INTEGER NOT NULL CHECK (active_epoch BETWEEN 1 AND 9007199254740991),
  FOREIGN KEY (id, active_epoch) REFERENCES dataset_epoch(dataset_id, epoch)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE dataset_epoch (
  dataset_id TEXT NOT NULL REFERENCES dataset(id),
  epoch INTEGER NOT NULL CHECK (epoch BETWEEN 1 AND 9007199254740991),
  status TEXT NOT NULL CHECK (status IN ('preparing', 'ready', 'retired', 'failed')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY (dataset_id, epoch)
);
CREATE UNIQUE INDEX one_ready_epoch ON dataset_epoch(dataset_id) WHERE status = 'ready';

CREATE TABLE dataset_grant (
  dataset_id TEXT NOT NULL REFERENCES dataset(id),
  actor_id TEXT NOT NULL REFERENCES actor(id),
  can_write INTEGER NOT NULL CHECK (can_write IN (0, 1)),
  PRIMARY KEY (dataset_id, actor_id)
);

CREATE TABLE local_session (
  token_hash TEXT PRIMARY KEY NOT NULL CHECK (length(token_hash) = 64),
  actor_id TEXT NOT NULL REFERENCES actor(id),
  csrf_hash TEXT NOT NULL CHECK (length(csrf_hash) = 64),
  expires_at INTEGER NOT NULL
);

CREATE TABLE command_receipt (
  dataset_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  actor_id TEXT NOT NULL REFERENCES actor(id),
  operation TEXT NOT NULL,
  command_id TEXT NOT NULL,
  canonical_version INTEGER NOT NULL CHECK (canonical_version = 1),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64 AND request_hash NOT GLOB '*[^0-9a-f]*'),
  response_status INTEGER NOT NULL CHECK (response_status BETWEEN 200 AND 299),
  response_body TEXT CHECK (response_body IS NULL OR json_valid(response_body)),
  resulting_revision INTEGER CHECK (resulting_revision BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY (dataset_id, epoch, actor_id, operation, command_id),
  FOREIGN KEY (dataset_id, epoch) REFERENCES dataset_epoch(dataset_id, epoch)
);
