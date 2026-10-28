-- T0010 / PKG-01. Additive persistence for alert domain and alert lifecycle events.
-- Aligned with Table 2 (Alert entity) and Section 3/4 (AlertChanged contract, rules and transitions).
-- Strict SQLite mode, contextual foreign keys (dataset_id, epoch), immutable lifecycle triggers,
-- and unique active alerts per (dataset_id, epoch, resource_id, rule_code).

CREATE TABLE alert (
  dataset_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  id TEXT NOT NULL CHECK(length(id) = 36),
  resource_id TEXT NOT NULL,
  rule_code TEXT NOT NULL CHECK(rule_code IN ('equipment_fault', 'communication_missing', 'maintenance_due')),
  rule_version INTEGER NOT NULL CHECK(rule_version = 1),
  cycle INTEGER NOT NULL CHECK(cycle >= 1),
  severity TEXT NOT NULL CHECK(severity IN ('warning', 'high', 'critical')),
  status TEXT NOT NULL CHECK(status IN ('open', 'acknowledged', 'resolved')),
  cause_code TEXT CHECK(cause_code IS NULL OR length(cause_code) BETWEEN 1 AND 256),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json) AND json_type(evidence_json) = 'object'),
  opened_at_ms INTEGER NOT NULL CHECK(opened_at_ms BETWEEN -62135596800000 AND 253402300799999),
  acknowledged_at_ms INTEGER CHECK(acknowledged_at_ms IS NULL OR acknowledged_at_ms BETWEEN -62135596800000 AND 253402300799999),
  acknowledged_by TEXT REFERENCES actor(id),
  resolved_at_ms INTEGER CHECK(resolved_at_ms IS NULL OR resolved_at_ms BETWEEN -62135596800000 AND 253402300799999),
  resolved_by TEXT REFERENCES actor(id),

  CHECK(
    (status = 'open' AND acknowledged_at_ms IS NULL AND acknowledged_by IS NULL AND resolved_at_ms IS NULL AND resolved_by IS NULL)
    OR (status = 'acknowledged' AND acknowledged_at_ms IS NOT NULL AND acknowledged_at_ms >= opened_at_ms AND resolved_at_ms IS NULL AND resolved_by IS NULL)
    OR (status = 'resolved' AND resolved_at_ms IS NOT NULL AND resolved_at_ms >= opened_at_ms AND (
      (acknowledged_at_ms IS NULL AND acknowledged_by IS NULL)
      OR (acknowledged_at_ms IS NOT NULL AND acknowledged_at_ms >= opened_at_ms AND resolved_at_ms >= acknowledged_at_ms)
    ))
  ),

  PRIMARY KEY (dataset_id, epoch, id),
  UNIQUE (dataset_id, epoch, id, resource_id, rule_code, cycle),
  UNIQUE (dataset_id, epoch, resource_id, rule_code, cycle),
  FOREIGN KEY (dataset_id, epoch, resource_id) REFERENCES resource(dataset_id, epoch, id)
) STRICT;

CREATE UNIQUE INDEX alert_active_unique ON alert(dataset_id, epoch, resource_id, rule_code)
  WHERE status IN ('open', 'acknowledged');

CREATE INDEX alert_resource_status ON alert(dataset_id, epoch, resource_id, status);
CREATE INDEX alert_status_rule ON alert(dataset_id, epoch, status, rule_code);
CREATE INDEX alert_opened_at ON alert(dataset_id, epoch, opened_at_ms);

CREATE TRIGGER alert_no_delete BEFORE DELETE ON alert
  BEGIN SELECT RAISE(ABORT, 'Retain alert history'); END;

CREATE TRIGGER alert_immutable_identity BEFORE UPDATE ON alert
  WHEN NEW.dataset_id != OLD.dataset_id
    OR NEW.epoch != OLD.epoch
    OR NEW.id != OLD.id
    OR NEW.resource_id != OLD.resource_id
    OR NEW.rule_code != OLD.rule_code
    OR NEW.rule_version != OLD.rule_version
    OR NEW.cycle != OLD.cycle
    OR NEW.opened_at_ms != OLD.opened_at_ms
  BEGIN SELECT RAISE(ABORT, 'Immutable alert identity and cycle'); END;

CREATE TRIGGER alert_status_transition BEFORE UPDATE OF status ON alert
  WHEN (OLD.status = 'resolved')
    OR (OLD.status = 'acknowledged' AND NEW.status NOT IN ('acknowledged', 'resolved'))
    OR (OLD.status = 'open' AND NEW.status NOT IN ('open', 'acknowledged', 'resolved'))
  BEGIN SELECT RAISE(ABORT, 'Invalid alert status transition'); END;

CREATE TRIGGER alert_resolved_immutable BEFORE UPDATE ON alert
  WHEN OLD.status = 'resolved'
  BEGIN SELECT RAISE(ABORT, 'Resolved alert is immutable'); END;

CREATE TRIGGER alert_immutable_acknowledgment BEFORE UPDATE ON alert
  WHEN OLD.acknowledged_at_ms IS NOT NULL
    AND (
      NEW.acknowledged_at_ms IS NOT OLD.acknowledged_at_ms
      OR NEW.acknowledged_by IS NOT OLD.acknowledged_by
    )
  BEGIN SELECT RAISE(ABORT, 'Historical alert acknowledgment is immutable'); END;

CREATE TRIGGER alert_immutable_cause BEFORE UPDATE ON alert
  WHEN NEW.cause_code IS NOT OLD.cause_code
  BEGIN SELECT RAISE(ABORT, 'Alert cause_code is immutable'); END;

CREATE TABLE alert_event (
  dataset_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  id TEXT NOT NULL CHECK(length(id) = 36),
  alert_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  rule_code TEXT NOT NULL CHECK(rule_code IN ('equipment_fault', 'communication_missing', 'maintenance_due')),
  rule_version INTEGER NOT NULL CHECK(rule_version = 1),
  cycle INTEGER NOT NULL CHECK(cycle >= 1),
  severity TEXT NOT NULL CHECK(severity IN ('warning', 'high', 'critical')),
  previous_status TEXT CHECK(previous_status IS NULL OR previous_status IN ('open', 'acknowledged')),
  status TEXT NOT NULL CHECK(status IN ('open', 'acknowledged', 'resolved')),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json) AND json_type(evidence_json) = 'object'),
  occurred_at_ms INTEGER NOT NULL CHECK(occurred_at_ms BETWEEN -62135596800000 AND 253402300799999),
  recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms BETWEEN -62135596800000 AND 253402300799999),
  actor_id TEXT REFERENCES actor(id),

  CHECK (
    (status = 'open' AND previous_status IS NULL)
    OR (status = 'acknowledged' AND previous_status IS 'open')
    OR (status = 'resolved' AND (previous_status IS 'open' OR previous_status IS 'acknowledged'))
  ),

  PRIMARY KEY (dataset_id, epoch, id),
  UNIQUE (dataset_id, epoch, alert_id, status),
  FOREIGN KEY (dataset_id, epoch, alert_id, resource_id, rule_code, cycle)
    REFERENCES alert(dataset_id, epoch, id, resource_id, rule_code, cycle),
  FOREIGN KEY (dataset_id, epoch, resource_id) REFERENCES resource(dataset_id, epoch, id)
) STRICT;

CREATE INDEX alert_event_alert_occurred ON alert_event(dataset_id, epoch, alert_id, occurred_at_ms);
CREATE INDEX alert_event_resource_occurred ON alert_event(dataset_id, epoch, resource_id, occurred_at_ms);

CREATE TRIGGER alert_event_no_update BEFORE UPDATE ON alert_event
  BEGIN SELECT RAISE(ABORT, 'Immutable alert event'); END;

CREATE TRIGGER alert_event_no_delete BEFORE DELETE ON alert_event
  BEGIN SELECT RAISE(ABORT, 'Retain alert event history'); END;
