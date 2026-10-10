-- Notifications, owned by the notifications module: both the consumer's idempotency record and
-- the user's inbox.

CREATE TABLE notification_deliveries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The broker message ID. Not a foreign key: the consumer knows events only through the broker.
  event_id           UUID NOT NULL,
  recipient_user_id  UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  kind               TEXT NOT NULL,
  payload            JSONB NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL,
  read_at            TIMESTAMPTZ,

  -- Makes a redelivered event a no-op (INSERT … ON CONFLICT DO NOTHING).
  CONSTRAINT notification_deliveries_once_per_event UNIQUE (event_id, recipient_user_id, kind),
  CONSTRAINT notification_deliveries_kind_known CHECK (
    kind IN ('seller_auction_closed', 'bidder_auction_won', 'bidder_reserve_not_met')
  ),
  CONSTRAINT notification_deliveries_read_after_created CHECK (read_at IS NULL OR read_at >= created_at)
);

CREATE INDEX notification_deliveries_recipient_index ON notification_deliveries (recipient_user_id, created_at DESC);
