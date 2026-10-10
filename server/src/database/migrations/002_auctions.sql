-- Auctions, maximum (proxy) bids, and the visible bid history.
-- Owned by the auctions module. Bids are serialized by locking the auction row
-- (`SELECT … FOR UPDATE`); see bidding.service.ts for the lock order.

CREATE TABLE auctions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  TEXT NOT NULL,
  artwork_id            UUID NOT NULL REFERENCES artworks (id) ON DELETE RESTRICT,
  seller_user_id        UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  starting_price_cents  BIGINT NOT NULL,
  -- Hidden. Only "none / not met / met" ever leaves the server.
  reserve_price_cents   BIGINT,
  ends_at               TIMESTAMPTZ NOT NULL,
  -- The end the seller chose; ends_at moves later with each soft-close extension.
  original_ends_at      TIMESTAMPTZ NOT NULL,
  extension_count       INTEGER NOT NULL DEFAULT 0,
  -- Denormalized from max_bids by resolveProxyBids, and written in the same transaction
  -- under the auction row lock, so they cannot drift. They make the list sortable by price
  -- and bid count in SQL.
  current_price_cents   BIGINT NOT NULL,
  leader_user_id        UUID REFERENCES users (id) ON DELETE RESTRICT,
  -- The number of visible bid_history rows.
  bid_count             INTEGER NOT NULL DEFAULT 0,
  -- Set by the close worker (phase 4). Ending is a matter of time (ends_at); closing is the
  -- recorded outcome.
  closed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT auctions_slug_unique UNIQUE (slug),
  CONSTRAINT auctions_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 140),
  CONSTRAINT auctions_starting_price_positive CHECK (starting_price_cents > 0),
  CONSTRAINT auctions_reserve_at_least_starting CHECK (
    reserve_price_cents IS NULL OR reserve_price_cents >= starting_price_cents
  ),
  -- Extensions only ever push the end later.
  CONSTRAINT auctions_ends_at_not_before_original CHECK (ends_at >= original_ends_at),
  CONSTRAINT auctions_extension_count_non_negative CHECK (extension_count >= 0),
  CONSTRAINT auctions_price_at_least_starting CHECK (current_price_cents >= starting_price_cents),
  CONSTRAINT auctions_bid_count_non_negative CHECK (bid_count >= 0),
  -- A leader exists exactly when at least one bid has been recorded.
  CONSTRAINT auctions_leader_matches_bid_count CHECK ((leader_user_id IS NULL) = (bid_count = 0)),
  -- No self-bidding can survive even a bug in the eligibility check.
  CONSTRAINT auctions_leader_is_not_seller CHECK (leader_user_id IS DISTINCT FROM seller_user_id)
);

-- At most one auction per artwork that has not been closed. "Not ended" cannot be the
-- predicate: it depends on now(), and an index predicate must be immutable. So an artwork can
-- be relisted only after the close worker has recorded the previous auction's outcome.
CREATE UNIQUE INDEX auctions_one_unclosed_per_artwork ON auctions (artwork_id) WHERE closed_at IS NULL;
-- ?status=open|ended and ?sort=ending_soon; phase 4's close worker also scans by ends_at.
CREATE INDEX auctions_ends_at_index ON auctions (ends_at, id);
CREATE INDEX auctions_seller_user_id_index ON auctions (seller_user_id);
CREATE INDEX auctions_leader_user_id_index ON auctions (leader_user_id);

-- Orders maximum-bid placements across all auctions. Bids on one auction are serialized by
-- its row lock, so within an auction the order of these numbers is the order of placement.
-- Used instead of a timestamp to break ties, because two bids can share a clock millisecond.
CREATE SEQUENCE max_bid_placement_sequence AS BIGINT;

CREATE TABLE max_bids (
  auction_id          UUID NOT NULL REFERENCES auctions (id) ON DELETE CASCADE,
  bidder_user_id      UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  max_cents           BIGINT NOT NULL,
  -- Taken again on every raise: the raised amount was committed to at the time of the raise.
  placement_sequence  BIGINT NOT NULL DEFAULT nextval('max_bid_placement_sequence'),
  -- When the bidder first bid on this auction.
  placed_at           TIMESTAMPTZ NOT NULL,
  -- When the current max_cents was set.
  updated_at          TIMESTAMPTZ NOT NULL,

  -- One active maximum per bidder per auction: raising replaces it.
  PRIMARY KEY (auction_id, bidder_user_id),
  CONSTRAINT max_bids_max_positive CHECK (max_cents > 0),
  CONSTRAINT max_bids_updated_after_placed CHECK (updated_at >= placed_at)
);
CREATE INDEX max_bids_bidder_user_id_index ON max_bids (bidder_user_id);

CREATE TABLE bid_history (
  id              BIGSERIAL PRIMARY KEY,
  auction_id      UUID NOT NULL REFERENCES auctions (id) ON DELETE CASCADE,
  bidder_user_id  UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  amount_cents    BIGINT NOT NULL,
  kind            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL,

  CONSTRAINT bid_history_amount_positive CHECK (amount_cents > 0),
  CONSTRAINT bid_history_kind_known CHECK (kind IN ('placed', 'automatic'))
);
-- The detail page reads an auction's history newest first; the id is the insertion order
-- (rows are written under the auction lock, so it is also the bidding order).
CREATE INDEX bid_history_auction_id_index ON bid_history (auction_id, id DESC);
CREATE INDEX bid_history_bidder_user_id_index ON bid_history (bidder_user_id);
