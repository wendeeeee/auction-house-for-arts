-- Owned by the payments module. One row per verified provider event: the dedupe key and the audit log.

CREATE TABLE payment_events (
  provider_event_id    TEXT PRIMARY KEY,
  event_type           TEXT NOT NULL,
  provider_session_id  TEXT,
  -- As claimed by the event; not a foreign key, because an unknown purchase is recorded too.
  claimed_purchase_id  TEXT,
  outcome              TEXT NOT NULL,
  details              JSONB NOT NULL DEFAULT '{}',
  received_at          TIMESTAMPTZ NOT NULL,

  CONSTRAINT payment_events_outcome_known CHECK (
    outcome IN (
      'received', 'settled', 'ignored_event_type', 'unknown_purchase', 'already_paid',
      'session_mismatch', 'not_paid', 'amount_mismatch', 'currency_mismatch'
    )
  )
);

CREATE INDEX payment_events_provider_session_id_index ON payment_events (provider_session_id);
