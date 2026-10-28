-- T0007 / PKG-01. Additive persistence only; no provisioning or observation backfill.
-- In particular current_state, operator receipts and the T0005 baseline are untouched.
-- *_at_ms stores normalized UTC instants as integer milliseconds (C02 years 0001..9999).
-- Normalized Ce bytes, Cc/Ce hashes and confirmed responses are stored independently
-- of processing metadata. Canonicalization/hash verification belongs to the domain.
-- DDL enforces identity, ownership uniqueness, contextual FKs and immutable evidence.
-- Future domain transactions must validate Cc/Ce/hashes, credentials, active epoch,
-- approved profile capabilities, clocks/windows, Kc-before-Ke replay, causal eligibility,
-- CAS, revision increments and the atomic event/cursor/projection/receipt unit.

CREATE TABLE telemetry_source (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
  principal_id TEXT GENERATED ALWAYS AS ('source:' || id) STORED UNIQUE,
  source_kind TEXT NOT NULL CHECK(length(source_kind) BETWEEN 1 AND 256),
  provisioned_by TEXT NOT NULL REFERENCES actor(id),
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms BETWEEN -62135596800000 AND 253402300799999),
  UNIQUE(id,principal_id)
) STRICT;
CREATE TRIGGER telemetry_source_identity BEFORE UPDATE ON telemetry_source
  WHEN NEW.id!=OLD.id OR NEW.source_kind!=OLD.source_kind OR NEW.provisioned_by!=OLD.provisioned_by OR NEW.created_at_ms!=OLD.created_at_ms
  BEGIN SELECT RAISE(ABORT,'Immutable source identity'); END;
CREATE TRIGGER telemetry_source_no_delete BEFORE DELETE ON telemetry_source
  BEGIN SELECT RAISE(ABORT,'Retain source identity'); END;
CREATE TRIGGER telemetry_source_operator_collision BEFORE INSERT ON telemetry_source
  WHEN EXISTS(SELECT 1 FROM actor WHERE id='source:' || NEW.id)
  BEGIN SELECT RAISE(ABORT,'Machine/operator principal collision'); END;
CREATE TRIGGER telemetry_actor_namespace_insert BEFORE INSERT ON actor
  WHEN NEW.id GLOB 'source:*'
  BEGIN SELECT RAISE(ABORT,'Reserved machine principal namespace'); END;
CREATE TRIGGER telemetry_actor_namespace_update BEFORE UPDATE OF id ON actor
  WHEN NEW.id GLOB 'source:*'
  BEGIN SELECT RAISE(ABORT,'Reserved machine principal namespace'); END;

CREATE TABLE telemetry_credential (
  token_hash TEXT PRIMARY KEY NOT NULL CHECK(length(token_hash)=64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  source_id TEXT NOT NULL REFERENCES telemetry_source(id),
  issued_at_ms INTEGER NOT NULL CHECK(issued_at_ms BETWEEN -62135596800000 AND 253402300799999),
  expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms BETWEEN -62135596800000 AND 253402300799999 AND expires_at_ms>issued_at_ms),
  revoked_at_ms INTEGER CHECK(revoked_at_ms BETWEEN issued_at_ms AND 253402300799999)
) STRICT;
CREATE INDEX telemetry_credential_source ON telemetry_credential(source_id);
CREATE TRIGGER telemetry_credential_identity BEFORE UPDATE ON telemetry_credential
  WHEN NEW.token_hash!=OLD.token_hash OR NEW.source_id!=OLD.source_id OR NEW.issued_at_ms!=OLD.issued_at_ms
    OR NEW.expires_at_ms!=OLD.expires_at_ms OR (OLD.revoked_at_ms IS NOT NULL AND NEW.revoked_at_ms IS NOT OLD.revoked_at_ms)
  BEGIN SELECT RAISE(ABORT,'Immutable credential identity/revocation'); END;
CREATE TRIGGER telemetry_credential_no_delete BEFORE DELETE ON telemetry_credential
  BEGIN SELECT RAISE(ABORT,'Retain telemetry credential'); END;

-- Only the four ratified FX profiles can be provisioned in this stage. Empty on upgrade.
-- configuration_json carries the explicit channels/causes/metric declarations, validated
-- by a future isolated bootstrap. This table does not authorize operational activation.
CREATE TABLE telemetry_profile (
  id TEXT NOT NULL CHECK(id IN ('FX-NONE-v1','FX-FIXED-v1','FX-MOBILE-v1','FX-AGENT-v1')),
  version INTEGER NOT NULL CHECK(version=1),
  usage TEXT NOT NULL CHECK(usage='fixture'),
  resource_kind TEXT NOT NULL CHECK(resource_kind IN ('equipment','agent')),
  category_code TEXT, category_version INTEGER,
  emitter_expected INTEGER CHECK(emitter_expected IN (0,1)),
  expected_interval_ms INTEGER CHECK(expected_interval_ms>0 AND expected_interval_ms<=9007199254740991),
  position_ttl_ms INTEGER CHECK(position_ttl_ms>0 AND position_ttl_ms<=9007199254740991),
  configuration_json TEXT NOT NULL CHECK(json_valid(configuration_json) AND json_type(configuration_json)='object'),
  provenance TEXT NOT NULL CHECK(length(provenance) BETWEEN 1 AND 256),
  PRIMARY KEY(id,version), UNIQUE(id,version,resource_kind),
  FOREIGN KEY(category_code,category_version) REFERENCES category_version(category_code,schema_version),
  CHECK(COALESCE(
    (id='FX-NONE-v1' AND resource_kind='equipment' AND category_code='camera' AND category_version=1
      AND emitter_expected=0 AND expected_interval_ms IS NULL AND position_ttl_ms IS NULL)
    OR (id='FX-FIXED-v1' AND resource_kind='equipment' AND category_code='camera' AND category_version=1
      AND emitter_expected=1 AND expected_interval_ms=10000 AND position_ttl_ms IS NULL)
    OR (id='FX-MOBILE-v1' AND resource_kind='equipment' AND category_code='inspection_vehicle' AND category_version=1
      AND emitter_expected=1 AND expected_interval_ms=10000 AND position_ttl_ms=30000)
    OR (id='FX-AGENT-v1' AND resource_kind='agent' AND category_code IS NULL AND category_version IS NULL
      AND emitter_expected IS NULL AND expected_interval_ms IS NULL AND position_ttl_ms=30000),0))
) STRICT;
CREATE TRIGGER telemetry_profile_no_update BEFORE UPDATE ON telemetry_profile
  BEGIN SELECT RAISE(ABORT,'Immutable telemetry profile'); END;
CREATE TRIGGER telemetry_profile_no_delete BEFORE DELETE ON telemetry_profile
  BEGIN SELECT RAISE(ABORT,'Immutable telemetry profile'); END;

-- A resource may explicitly use FX-NONE without any source/channel binding.
-- Absence of an assignment is distinct from an explicit no-emitter declaration.
CREATE TABLE telemetry_resource_profile (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, resource_id TEXT NOT NULL, resource_kind TEXT NOT NULL,
  profile_id TEXT NOT NULL, profile_version INTEGER NOT NULL,
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  assigned_at_ms INTEGER NOT NULL CHECK(assigned_at_ms BETWEEN -62135596800000 AND 253402300799999),
  PRIMARY KEY(dataset_id,epoch,resource_id,profile_id,profile_version),
  FOREIGN KEY(dataset_id,epoch,resource_id,resource_kind) REFERENCES resource(dataset_id,epoch,id,kind),
  FOREIGN KEY(profile_id,profile_version,resource_kind) REFERENCES telemetry_profile(id,version,resource_kind)
) STRICT;
CREATE UNIQUE INDEX telemetry_resource_profile_active ON telemetry_resource_profile(dataset_id,epoch,resource_id) WHERE active=1;
CREATE TRIGGER telemetry_resource_profile_category BEFORE INSERT ON telemetry_resource_profile
  WHEN NEW.resource_kind='equipment' AND NOT EXISTS(
    SELECT 1 FROM equipment e JOIN telemetry_profile p ON p.id=NEW.profile_id AND p.version=NEW.profile_version
    WHERE e.dataset_id=NEW.dataset_id AND e.epoch=NEW.epoch AND e.id=NEW.resource_id
      AND e.category_code=p.category_code AND e.category_version=p.category_version)
  BEGIN SELECT RAISE(ABORT,'Incompatible resource telemetry profile'); END;
CREATE TRIGGER telemetry_resource_profile_identity BEFORE UPDATE ON telemetry_resource_profile
  WHEN NEW.dataset_id!=OLD.dataset_id OR NEW.epoch!=OLD.epoch OR NEW.resource_id!=OLD.resource_id
    OR NEW.resource_kind!=OLD.resource_kind OR NEW.profile_id!=OLD.profile_id OR NEW.profile_version!=OLD.profile_version
    OR NEW.assigned_at_ms!=OLD.assigned_at_ms
  BEGIN SELECT RAISE(ABORT,'Immutable resource profile identity'); END;
CREATE TRIGGER telemetry_resource_profile_deactivate BEFORE UPDATE OF active ON telemetry_resource_profile
  WHEN OLD.active=1 AND NEW.active=0 AND EXISTS(
    SELECT 1 FROM telemetry_binding b
    WHERE b.dataset_id=OLD.dataset_id AND b.epoch=OLD.epoch AND b.resource_id=OLD.resource_id
      AND b.profile_id=OLD.profile_id AND b.profile_version=OLD.profile_version AND b.active=1)
  BEGIN SELECT RAISE(ABORT,'Cannot deactivate profile while active binding exists'); END;
CREATE TRIGGER telemetry_resource_profile_no_delete BEFORE DELETE ON telemetry_resource_profile
  BEGIN SELECT RAISE(ABORT,'Retain resource telemetry profile'); END;

CREATE TABLE telemetry_binding (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, id TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES telemetry_source(id), resource_id TEXT NOT NULL,
  resource_kind TEXT NOT NULL, channel TEXT NOT NULL CHECK(length(channel) BETWEEN 1 AND 256),
  projection_field TEXT NOT NULL CHECK(length(projection_field) BETWEEN 1 AND 256),
  profile_id TEXT NOT NULL, profile_version INTEGER NOT NULL,
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  resource_born_at_ms INTEGER NOT NULL CHECK(resource_born_at_ms BETWEEN -62135596800000 AND 253402300799999),
  history_allowed_from_ms INTEGER NOT NULL CHECK(history_allowed_from_ms BETWEEN -62135596800000 AND 253402300799999),
  PRIMARY KEY(dataset_id,epoch,id),
  UNIQUE(dataset_id,epoch,id,source_id,resource_id,channel),
  FOREIGN KEY(dataset_id,epoch,resource_id,resource_kind) REFERENCES resource(dataset_id,epoch,id,kind),
  FOREIGN KEY(dataset_id,epoch,resource_id,profile_id,profile_version)
    REFERENCES telemetry_resource_profile(dataset_id,epoch,resource_id,profile_id,profile_version),
  FOREIGN KEY(profile_id,profile_version,resource_kind) REFERENCES telemetry_profile(id,version,resource_kind)
) STRICT;
CREATE UNIQUE INDEX telemetry_binding_active_channel ON telemetry_binding(dataset_id,epoch,resource_id,channel) WHERE active=1;
CREATE UNIQUE INDEX telemetry_binding_active_field ON telemetry_binding(dataset_id,epoch,resource_id,projection_field) WHERE active=1;
CREATE INDEX telemetry_binding_source ON telemetry_binding(dataset_id,epoch,source_id,active);
CREATE TRIGGER telemetry_binding_profile BEFORE INSERT ON telemetry_binding
  WHEN NEW.profile_id='FX-NONE-v1' OR (NEW.resource_kind='equipment' AND NOT EXISTS(
    SELECT 1 FROM equipment e JOIN telemetry_profile p ON p.id=NEW.profile_id AND p.version=NEW.profile_version
    WHERE e.dataset_id=NEW.dataset_id AND e.epoch=NEW.epoch AND e.id=NEW.resource_id
      AND e.category_code=p.category_code AND e.category_version=p.category_version))
    OR (NEW.active=1 AND NOT EXISTS(
      SELECT 1 FROM telemetry_resource_profile rp
      WHERE rp.dataset_id=NEW.dataset_id AND rp.epoch=NEW.epoch AND rp.resource_id=NEW.resource_id
        AND rp.profile_id=NEW.profile_id AND rp.profile_version=NEW.profile_version AND rp.active=1))
    OR (NEW.active=1 AND EXISTS(
      SELECT 1 FROM telemetry_resource_profile rp
      WHERE rp.dataset_id=NEW.dataset_id AND rp.epoch=NEW.epoch AND rp.resource_id=NEW.resource_id
        AND rp.profile_id='FX-NONE-v1' AND rp.active=1))
  BEGIN SELECT RAISE(ABORT,'Incompatible or inactive telemetry binding: requires active profile'); END;
CREATE TRIGGER telemetry_binding_identity BEFORE UPDATE ON telemetry_binding
  WHEN NEW.dataset_id!=OLD.dataset_id OR NEW.epoch!=OLD.epoch OR NEW.id!=OLD.id OR NEW.source_id!=OLD.source_id
    OR NEW.resource_id!=OLD.resource_id OR NEW.resource_kind!=OLD.resource_kind OR NEW.channel!=OLD.channel
    OR NEW.projection_field!=OLD.projection_field OR NEW.profile_id!=OLD.profile_id OR NEW.profile_version!=OLD.profile_version
    OR NEW.resource_born_at_ms!=OLD.resource_born_at_ms OR NEW.history_allowed_from_ms!=OLD.history_allowed_from_ms
  BEGIN SELECT RAISE(ABORT,'Immutable binding identity'); END;
CREATE TRIGGER telemetry_binding_activate BEFORE UPDATE OF active ON telemetry_binding
  WHEN OLD.active=0 AND NEW.active=1 AND (NOT EXISTS(
    SELECT 1 FROM telemetry_resource_profile rp
    WHERE rp.dataset_id=NEW.dataset_id AND rp.epoch=NEW.epoch AND rp.resource_id=NEW.resource_id
      AND rp.profile_id=NEW.profile_id AND rp.profile_version=NEW.profile_version AND rp.active=1)
    OR EXISTS(
      SELECT 1 FROM telemetry_resource_profile rp
      WHERE rp.dataset_id=NEW.dataset_id AND rp.epoch=NEW.epoch AND rp.resource_id=NEW.resource_id
        AND rp.profile_id='FX-NONE-v1' AND rp.active=1))
  BEGIN SELECT RAISE(ABORT,'Cannot activate binding for inactive profile'); END;
CREATE TRIGGER telemetry_resource_profile_none_active BEFORE INSERT ON telemetry_resource_profile
  WHEN NEW.active=1 AND NEW.profile_id='FX-NONE-v1' AND EXISTS(
    SELECT 1 FROM telemetry_binding b
    WHERE b.dataset_id=NEW.dataset_id AND b.epoch=NEW.epoch AND b.resource_id=NEW.resource_id AND b.active=1)
  BEGIN SELECT RAISE(ABORT,'Cannot activate FX-NONE with active binding'); END;
CREATE TRIGGER telemetry_resource_profile_none_update BEFORE UPDATE OF active ON telemetry_resource_profile
  WHEN OLD.active=0 AND NEW.active=1 AND NEW.profile_id='FX-NONE-v1' AND EXISTS(
    SELECT 1 FROM telemetry_binding b
    WHERE b.dataset_id=NEW.dataset_id AND b.epoch=NEW.epoch AND b.resource_id=NEW.resource_id AND b.active=1)
  BEGIN SELECT RAISE(ABORT,'Cannot activate FX-NONE with active binding'); END;
CREATE TRIGGER telemetry_binding_no_delete BEFORE DELETE ON telemetry_binding
  BEGIN SELECT RAISE(ABORT,'Retain telemetry binding'); END;

CREATE TABLE telemetry_episode (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, resource_id TEXT NOT NULL, episode_id TEXT NOT NULL,
  cause_code TEXT NOT NULL CHECK(length(cause_code) BETWEEN 1 AND 256 AND cause_code NOT GLOB 'initial_*'),
  source_id TEXT NOT NULL REFERENCES telemetry_source(id),
  episode_started_at_ms INTEGER NOT NULL CHECK(episode_started_at_ms BETWEEN -62135596800000 AND 253402300799999),
  recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms BETWEEN -62135596800000 AND 253402300799999),
  PRIMARY KEY(dataset_id,epoch,resource_id,episode_id),
  UNIQUE(dataset_id,epoch,resource_id,cause_code,episode_started_at_ms),
  UNIQUE(dataset_id,epoch,resource_id,episode_id,cause_code,source_id,episode_started_at_ms),
  FOREIGN KEY(dataset_id,epoch,resource_id) REFERENCES equipment(dataset_id,epoch,id)
) STRICT;
CREATE TRIGGER telemetry_episode_no_update BEFORE UPDATE ON telemetry_episode
  BEGIN SELECT RAISE(ABORT,'Immutable causal episode'); END;
CREATE TRIGGER telemetry_episode_no_delete BEFORE DELETE ON telemetry_episode
  BEGIN SELECT RAISE(ABORT,'Immutable causal episode'); END;

CREATE TABLE telemetry_event (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, source_id TEXT NOT NULL,
  event_id TEXT NOT NULL, resource_id TEXT NOT NULL, channel TEXT NOT NULL, binding_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK(sequence BETWEEN 0 AND 9007199254740991),
  observation_type TEXT NOT NULL CHECK(observation_type IN ('heartbeat','position','metric','fault_detected','fault_cleared','agent_activity')),
  canonical_version INTEGER NOT NULL CHECK(canonical_version=1),
  event_hash TEXT NOT NULL CHECK(length(event_hash)=64 AND event_hash NOT GLOB '*[^0-9a-f]*'),
  canonical_json TEXT NOT NULL CHECK(json_valid(canonical_json) AND json_type(canonical_json)='object'),
  occurred_at_ms INTEGER NOT NULL CHECK(occurred_at_ms BETWEEN -62135596800000 AND 253402300799999),
  received_at_ms INTEGER NOT NULL CHECK(received_at_ms BETWEEN -62135596800000 AND 253402300799999),
  recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms BETWEEN -62135596800000 AND 253402300799999),
  observation_effective_at_ms INTEGER NOT NULL CHECK(observation_effective_at_ms BETWEEN -62135596800000 AND occurred_at_ms),
  is_simulated INTEGER NOT NULL CHECK(is_simulated IN (0,1)),
  episode_id TEXT, cause_code TEXT, episode_started_at_ms INTEGER,
  disposition TEXT NOT NULL CHECK(disposition IN ('applied','historical','ignored')),
  effects_json TEXT NOT NULL CHECK(json_valid(effects_json) AND json_type(effects_json)='object'),
  reason_code TEXT NOT NULL CHECK(length(reason_code) BETWEEN 1 AND 256),
  resulting_revision INTEGER NOT NULL CHECK(resulting_revision BETWEEN 1 AND 9007199254740991),
  response_status INTEGER NOT NULL CHECK(response_status=200),
  response_body TEXT NOT NULL CHECK(json_valid(response_body) AND json_type(response_body)='object'),
  PRIMARY KEY(dataset_id,epoch,source_id,event_id),
  UNIQUE(dataset_id,epoch,source_id,resource_id,channel,sequence,event_id),
  UNIQUE(dataset_id,epoch,source_id,event_id,resource_id,channel),
  FOREIGN KEY(dataset_id,epoch,binding_id,source_id,resource_id,channel)
    REFERENCES telemetry_binding(dataset_id,epoch,id,source_id,resource_id,channel),
  FOREIGN KEY(dataset_id,epoch,resource_id,episode_id,cause_code,source_id,episode_started_at_ms)
    REFERENCES telemetry_episode(dataset_id,epoch,resource_id,episode_id,cause_code,source_id,episode_started_at_ms),
  FOREIGN KEY(dataset_id,epoch,source_id,resource_id,channel,sequence,event_id)
    REFERENCES telemetry_sequence_slot(dataset_id,epoch,source_id,resource_id,channel,sequence,event_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK((observation_type IN ('fault_detected','fault_cleared') AND episode_id IS NOT NULL AND cause_code IS NOT NULL
      AND episode_started_at_ms IS NOT NULL AND episode_started_at_ms<=occurred_at_ms)
    OR (observation_type NOT IN ('fault_detected','fault_cleared') AND episode_id IS NULL AND cause_code IS NULL AND episode_started_at_ms IS NULL))
) STRICT;
CREATE INDEX telemetry_event_resource_time ON telemetry_event(dataset_id,epoch,resource_id,occurred_at_ms,event_id);
CREATE INDEX telemetry_event_episode ON telemetry_event(dataset_id,epoch,resource_id,episode_id);
CREATE TRIGGER telemetry_event_history_bound BEFORE INSERT ON telemetry_event
  WHEN EXISTS(SELECT 1 FROM telemetry_binding b WHERE b.dataset_id=NEW.dataset_id AND b.epoch=NEW.epoch AND b.id=NEW.binding_id
    AND (NEW.occurred_at_ms<max(b.resource_born_at_ms,b.history_allowed_from_ms)
      OR NEW.episode_started_at_ms<max(b.resource_born_at_ms,b.history_allowed_from_ms)))
  BEGIN SELECT RAISE(ABORT,'Observation precedes authorized history'); END;
CREATE TRIGGER telemetry_event_no_update BEFORE UPDATE ON telemetry_event
  BEGIN SELECT RAISE(ABORT,'Immutable telemetry event'); END;
CREATE TRIGGER telemetry_event_no_delete BEFORE DELETE ON telemetry_event
  BEGIN SELECT RAISE(ABORT,'Immutable telemetry event'); END;

-- Ke and Ks must name exactly the same event, including at COMMIT. Binding changes
-- cannot reset sequence: neither key includes binding_id or credential identity.
CREATE TABLE telemetry_sequence_slot (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, source_id TEXT NOT NULL,
  resource_id TEXT NOT NULL, channel TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK(sequence BETWEEN 0 AND 9007199254740991), event_id TEXT NOT NULL,
  PRIMARY KEY(dataset_id,epoch,source_id,resource_id,channel,sequence),
  UNIQUE(dataset_id,epoch,source_id,event_id),
  UNIQUE(dataset_id,epoch,source_id,resource_id,channel,sequence,event_id),
  FOREIGN KEY(dataset_id,epoch,source_id,resource_id,channel,sequence,event_id)
    REFERENCES telemetry_event(dataset_id,epoch,source_id,resource_id,channel,sequence,event_id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TRIGGER telemetry_slot_no_update BEFORE UPDATE ON telemetry_sequence_slot
  BEGIN SELECT RAISE(ABORT,'Immutable sequence slot'); END;
CREATE TRIGGER telemetry_slot_no_delete BEFORE DELETE ON telemetry_sequence_slot
  BEGIN SELECT RAISE(ABORT,'Immutable sequence slot'); END;

CREATE TABLE telemetry_command_receipt (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, actor_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation='telemetry.ingest.v1'), command_id TEXT NOT NULL,
  source_id TEXT NOT NULL, event_id TEXT NOT NULL,
  canonical_version INTEGER NOT NULL CHECK(canonical_version=1),
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64 AND request_hash NOT GLOB '*[^0-9a-f]*'),
  response_status INTEGER NOT NULL CHECK(response_status=200),
  response_body TEXT NOT NULL CHECK(json_valid(response_body) AND json_type(response_body)='object'),
  resulting_revision INTEGER NOT NULL CHECK(resulting_revision BETWEEN 1 AND 9007199254740991),
  PRIMARY KEY(dataset_id,epoch,actor_id,operation,command_id),
  FOREIGN KEY(dataset_id,epoch) REFERENCES dataset_epoch(dataset_id,epoch),
  FOREIGN KEY(source_id,actor_id) REFERENCES telemetry_source(id,principal_id),
  FOREIGN KEY(dataset_id,epoch,source_id,event_id) REFERENCES telemetry_event(dataset_id,epoch,source_id,event_id)
) STRICT;
CREATE INDEX telemetry_receipt_event ON telemetry_command_receipt(dataset_id,epoch,source_id,event_id);
CREATE TRIGGER telemetry_receipt_result BEFORE INSERT ON telemetry_command_receipt
  WHEN NOT EXISTS(SELECT 1 FROM telemetry_event e WHERE e.dataset_id=NEW.dataset_id AND e.epoch=NEW.epoch
    AND e.source_id=NEW.source_id AND e.event_id=NEW.event_id AND e.response_status=NEW.response_status
    AND e.response_body=NEW.response_body AND e.resulting_revision=NEW.resulting_revision)
  BEGIN SELECT RAISE(ABORT,'Receipt must preserve confirmed event result'); END;
CREATE TRIGGER telemetry_receipt_no_update BEFORE UPDATE ON telemetry_command_receipt
  BEGIN SELECT RAISE(ABORT,'Immutable telemetry receipt'); END;
CREATE TRIGGER telemetry_receipt_no_delete BEFORE DELETE ON telemetry_command_receipt
  BEGIN SELECT RAISE(ABORT,'Immutable telemetry receipt'); END;

CREATE TABLE telemetry_channel_cursor (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, source_id TEXT NOT NULL REFERENCES telemetry_source(id),
  resource_id TEXT NOT NULL, channel TEXT NOT NULL,
  max_sequence_seen INTEGER NOT NULL CHECK(max_sequence_seen BETWEEN 0 AND 9007199254740991),
  max_occurred_at_ms INTEGER CHECK(max_occurred_at_ms BETWEEN -62135596800000 AND 253402300799999),
  projected_effective_at_ms INTEGER CHECK(projected_effective_at_ms BETWEEN -62135596800000 AND 253402300799999),
  PRIMARY KEY(dataset_id,epoch,source_id,resource_id,channel),
  FOREIGN KEY(dataset_id,epoch,resource_id) REFERENCES resource(dataset_id,epoch,id),
  FOREIGN KEY(dataset_id,epoch,source_id,resource_id,channel,max_sequence_seen)
    REFERENCES telemetry_sequence_slot(dataset_id,epoch,source_id,resource_id,channel,sequence),
  CHECK(projected_effective_at_ms IS NULL OR (max_occurred_at_ms IS NOT NULL AND projected_effective_at_ms<=max_occurred_at_ms))
) STRICT;
CREATE TRIGGER telemetry_cursor_monotonic BEFORE UPDATE ON telemetry_channel_cursor
  WHEN NEW.dataset_id!=OLD.dataset_id OR NEW.epoch!=OLD.epoch OR NEW.source_id!=OLD.source_id
    OR NEW.resource_id!=OLD.resource_id OR NEW.channel!=OLD.channel OR NEW.max_sequence_seen<OLD.max_sequence_seen
    OR (OLD.max_occurred_at_ms IS NOT NULL AND (NEW.max_occurred_at_ms IS NULL OR NEW.max_occurred_at_ms<OLD.max_occurred_at_ms))
    OR (OLD.projected_effective_at_ms IS NOT NULL AND (NEW.projected_effective_at_ms IS NULL OR NEW.projected_effective_at_ms<OLD.projected_effective_at_ms))
  BEGIN SELECT RAISE(ABORT,'Cursor cannot regress/change identity'); END;
CREATE TRIGGER telemetry_cursor_no_delete BEFORE DELETE ON telemetry_channel_cursor
  BEGIN SELECT RAISE(ABORT,'Retain channel cursor'); END;

-- Append-only evidence; the cause cutoff is MAX(completed_at_ms) for the CauseKey.
-- Coverage is evaluated inclusively at read/command time, not rewritten into episodes.
CREATE TABLE telemetry_cause_resolution (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, id TEXT NOT NULL, resource_id TEXT NOT NULL,
  cause_code TEXT NOT NULL CHECK(length(cause_code) BETWEEN 1 AND 256 AND cause_code NOT GLOB 'initial_*'),
  completed_at_ms INTEGER NOT NULL CHECK(completed_at_ms BETWEEN -62135596800000 AND 253402300799999),
  recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms BETWEEN -62135596800000 AND 253402300799999),
  actor_id TEXT NOT NULL REFERENCES actor(id),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json) AND json_type(evidence_json)='object'),
  PRIMARY KEY(dataset_id,epoch,id),
  FOREIGN KEY(dataset_id,epoch,resource_id) REFERENCES equipment(dataset_id,epoch,id)
) STRICT;
CREATE INDEX telemetry_resolution_cause_cut ON telemetry_cause_resolution(dataset_id,epoch,resource_id,cause_code,completed_at_ms);
CREATE TRIGGER telemetry_resolution_monotonic BEFORE INSERT ON telemetry_cause_resolution
  WHEN NEW.completed_at_ms<(SELECT max(completed_at_ms) FROM telemetry_cause_resolution
    WHERE dataset_id=NEW.dataset_id AND epoch=NEW.epoch AND resource_id=NEW.resource_id AND cause_code=NEW.cause_code)
  BEGIN SELECT RAISE(ABORT,'Cause resolution cutoff cannot regress'); END;
CREATE TRIGGER telemetry_resolution_no_update BEFORE UPDATE ON telemetry_cause_resolution
  BEGIN SELECT RAISE(ABORT,'Immutable causal resolution'); END;
CREATE TRIGGER telemetry_resolution_no_delete BEFORE DELETE ON telemetry_cause_resolution
  BEGIN SELECT RAISE(ABORT,'Immutable causal resolution'); END;

-- Global real UTC watermark, never initialized from a synthetic baseline or a GET.
-- No demo clock/run is created here. The caller must fail closed on regressed UTC,
-- not silently clamp it to this watermark; in-process maxima remain caller-owned.
CREATE TABLE telemetry_trusted_clock (
  singleton INTEGER PRIMARY KEY NOT NULL CHECK(singleton=1),
  trusted_utc_ms INTEGER NOT NULL CHECK(trusted_utc_ms BETWEEN -62135596800000 AND 253402300799999)
) STRICT;
CREATE TRIGGER telemetry_clock_monotonic BEFORE UPDATE ON telemetry_trusted_clock
  WHEN NEW.singleton!=OLD.singleton OR NEW.trusted_utc_ms<OLD.trusted_utc_ms
  BEGIN SELECT RAISE(ABORT,'Trusted UTC cannot regress'); END;
CREATE TRIGGER telemetry_clock_no_delete BEFORE DELETE ON telemetry_trusted_clock
  BEGIN SELECT RAISE(ABORT,'Retain trusted UTC'); END;

-- Store observation facts only. fresh/stale and position fallback are read-time
-- evaluations at a single cut, never persisted here or backfilled into current_state.
CREATE TABLE telemetry_communication_observation (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, resource_id TEXT NOT NULL,
  source_id TEXT NOT NULL, event_id TEXT NOT NULL, channel TEXT NOT NULL,
  observed_at_ms INTEGER NOT NULL CHECK(observed_at_ms BETWEEN -62135596800000 AND 253402300799999),
  PRIMARY KEY(dataset_id,epoch,resource_id),
  FOREIGN KEY(dataset_id,epoch,resource_id) REFERENCES equipment(dataset_id,epoch,id),
  FOREIGN KEY(dataset_id,epoch,source_id,event_id,resource_id,channel)
    REFERENCES telemetry_event(dataset_id,epoch,source_id,event_id,resource_id,channel)
) STRICT;
CREATE TRIGGER telemetry_comm_obs_insert BEFORE INSERT ON telemetry_communication_observation
  WHEN NOT EXISTS(SELECT 1 FROM telemetry_event e
    WHERE e.dataset_id=NEW.dataset_id AND e.epoch=NEW.epoch AND e.source_id=NEW.source_id AND e.event_id=NEW.event_id
      AND e.resource_id=NEW.resource_id AND e.channel=NEW.channel AND e.disposition='applied'
      AND e.observation_effective_at_ms=NEW.observed_at_ms)
  BEGIN SELECT RAISE(ABORT,'Observation must reference applied event with matching effective time'); END;
CREATE TRIGGER telemetry_comm_obs_update BEFORE UPDATE ON telemetry_communication_observation
  WHEN NEW.dataset_id!=OLD.dataset_id OR NEW.epoch!=OLD.epoch OR NEW.resource_id!=OLD.resource_id
    OR NEW.observed_at_ms<OLD.observed_at_ms
    OR NOT EXISTS(SELECT 1 FROM telemetry_event e
      WHERE e.dataset_id=NEW.dataset_id AND e.epoch=NEW.epoch AND e.source_id=NEW.source_id AND e.event_id=NEW.event_id
        AND e.resource_id=NEW.resource_id AND e.channel=NEW.channel AND e.disposition='applied'
        AND e.observation_effective_at_ms=NEW.observed_at_ms)
  BEGIN SELECT RAISE(ABORT,'Communication observation cannot regress or reference invalid event'); END;
CREATE TRIGGER telemetry_comm_obs_no_delete BEFORE DELETE ON telemetry_communication_observation
  BEGIN SELECT RAISE(ABORT,'Retain communication observation'); END;

CREATE TABLE telemetry_position_observation (
  dataset_id TEXT NOT NULL, epoch INTEGER NOT NULL, resource_id TEXT NOT NULL,
  source_id TEXT NOT NULL, event_id TEXT NOT NULL, channel TEXT NOT NULL,
  observed_at_ms INTEGER NOT NULL CHECK(observed_at_ms BETWEEN -62135596800000 AND 253402300799999),
  latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),
  accuracy_m REAL CHECK(accuracy_m>=0 AND accuracy_m<=1.7976931348623157e308),
  region_id TEXT,
  PRIMARY KEY(dataset_id,epoch,resource_id),
  FOREIGN KEY(dataset_id,epoch,resource_id) REFERENCES resource(dataset_id,epoch,id),
  FOREIGN KEY(dataset_id,epoch,region_id) REFERENCES region(dataset_id,epoch,id),
  FOREIGN KEY(dataset_id,epoch,source_id,event_id,resource_id,channel)
    REFERENCES telemetry_event(dataset_id,epoch,source_id,event_id,resource_id,channel)
) STRICT;
CREATE INDEX telemetry_position_spatial ON telemetry_position_observation(dataset_id,epoch,region_id,longitude,latitude);
CREATE TRIGGER telemetry_position_mobile_insert BEFORE INSERT ON telemetry_position_observation
  WHEN EXISTS(SELECT 1 FROM equipment WHERE dataset_id=NEW.dataset_id AND epoch=NEW.epoch AND id=NEW.resource_id AND mobility='fixed')
    OR NOT EXISTS(SELECT 1 FROM telemetry_event e
      WHERE e.dataset_id=NEW.dataset_id AND e.epoch=NEW.epoch AND e.source_id=NEW.source_id AND e.event_id=NEW.event_id
        AND e.resource_id=NEW.resource_id AND e.channel=NEW.channel AND e.disposition='applied'
        AND e.observation_effective_at_ms=NEW.observed_at_ms)
  BEGIN SELECT RAISE(ABORT,'Invalid dynamic position observation or unapplied event'); END;
CREATE TRIGGER telemetry_position_mobile_update BEFORE UPDATE ON telemetry_position_observation
  WHEN NEW.dataset_id!=OLD.dataset_id OR NEW.epoch!=OLD.epoch OR NEW.resource_id!=OLD.resource_id
    OR NEW.observed_at_ms<OLD.observed_at_ms
    OR EXISTS(SELECT 1 FROM equipment WHERE dataset_id=NEW.dataset_id AND epoch=NEW.epoch AND id=NEW.resource_id AND mobility='fixed')
    OR NOT EXISTS(SELECT 1 FROM telemetry_event e
      WHERE e.dataset_id=NEW.dataset_id AND e.epoch=NEW.epoch AND e.source_id=NEW.source_id AND e.event_id=NEW.event_id
        AND e.resource_id=NEW.resource_id AND e.channel=NEW.channel AND e.disposition='applied'
        AND e.observation_effective_at_ms=NEW.observed_at_ms)
  BEGIN SELECT RAISE(ABORT,'Invalid dynamic position update or regressed time'); END;
CREATE TRIGGER telemetry_position_no_delete BEFORE DELETE ON telemetry_position_observation
  BEGIN SELECT RAISE(ABORT,'Retain position observation'); END;
