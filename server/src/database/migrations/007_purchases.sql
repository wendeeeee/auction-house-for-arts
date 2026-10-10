-- Owned by the purchases module.

CREATE TABLE purchases (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id           UUID NOT NULL REFERENCES auctions (id) ON DELETE RESTRICT,
  buyer_user_id        UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  amount_cents         BIGINT NOT NULL,
  currency             TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending',
  provider_session_id  TEXT,
  created_at           TIMESTAMPTZ NOT NULL,
  paid_at              TIMESTAMPTZ,

  CONSTRAINT purchases_one_per_auction UNIQUE (auction_id),
  CONSTRAINT purchases_provider_session_id_unique UNIQUE (provider_session_id),
  CONSTRAINT purchases_amount_positive CHECK (amount_cents > 0),
  CONSTRAINT purchases_currency_known CHECK (currency = 'usd'),
  CONSTRAINT purchases_status_known CHECK (status IN ('pending', 'paid')),
  CONSTRAINT purchases_paid_at_matches_status CHECK ((status = 'paid') = (paid_at IS NOT NULL)),
  CONSTRAINT purchases_paid_has_session CHECK (status = 'pending' OR provider_session_id IS NOT NULL)
);

CREATE INDEX purchases_buyer_user_id_index ON purchases (buyer_user_id);

-- The terms of a purchase are fixed when it is created, and paid is final.
CREATE FUNCTION reject_purchase_terms_change() RETURNS trigger AS $$
BEGIN
  IF NEW.auction_id <> OLD.auction_id
     OR NEW.buyer_user_id <> OLD.buyer_user_id
     OR NEW.amount_cents <> OLD.amount_cents
     OR NEW.currency <> OLD.currency
     OR (OLD.status = 'paid' AND NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'purchase % terms cannot change', OLD.id
      USING ERRCODE = 'integrity_constraint_violation', CONSTRAINT = 'purchases_terms_immutable';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER purchases_terms_immutable
  BEFORE UPDATE ON purchases
  FOR EACH ROW EXECUTE FUNCTION reject_purchase_terms_change();
