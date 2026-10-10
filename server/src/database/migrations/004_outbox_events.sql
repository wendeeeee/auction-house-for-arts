-- The transactional outbox, owned by the outbox module. See docs/adr/0003-transactional-outbox.md.

CREATE TABLE outbox_events (
  -- Also the broker message ID, which consumers deduplicate on.
  id                     UUID PRIMARY KEY,
  type                   TEXT NOT NULL,
  payload                JSONB NOT NULL,
  occurred_at            TIMESTAMPTZ NOT NULL,
  published_at           TIMESTAMPTZ,
  -- A publisher's lease, so publishing never holds a row lock across a network call.
  claim_expires_at       TIMESTAMPTZ,
  publish_attempt_count  INTEGER NOT NULL DEFAULT 0,
  last_publish_error     TEXT,

  CONSTRAINT outbox_events_type_format CHECK (type ~ '^[A-Z][A-Za-z]+$'),
  CONSTRAINT outbox_events_attempt_count_non_negative CHECK (publish_attempt_count >= 0)
);

CREATE INDEX outbox_events_pending_index ON outbox_events (occurred_at, id) WHERE published_at IS NULL;
