-- The recorded outcome of each auction. Owned by the closing module; auctions.closed_at is set
-- in the same transaction.

CREATE TABLE auction_closes (
  -- The backstop against a double close.
  auction_id          UUID PRIMARY KEY REFERENCES auctions (id) ON DELETE RESTRICT,
  outcome             TEXT NOT NULL,
  winning_user_id     UUID REFERENCES users (id) ON DELETE RESTRICT,
  hammer_price_cents  BIGINT,
  closed_at           TIMESTAMPTZ NOT NULL,

  CONSTRAINT auction_closes_outcome_known CHECK (outcome IN ('sold', 'reserve_not_met', 'no_bids')),
  CONSTRAINT auction_closes_sale_has_winner CHECK ((outcome = 'sold') = (winning_user_id IS NOT NULL)),
  CONSTRAINT auction_closes_winner_has_price CHECK ((winning_user_id IS NULL) = (hammer_price_cents IS NULL)),
  CONSTRAINT auction_closes_hammer_price_positive CHECK (hammer_price_cents IS NULL OR hammer_price_cents > 0)
);
CREATE INDEX auction_closes_winning_user_id_index ON auction_closes (winning_user_id);

-- The close worker's scan. Unclosed auctions stay few while closed ones pile up.
CREATE INDEX auctions_unclosed_ends_at_index ON auctions (ends_at, id) WHERE closed_at IS NULL;
