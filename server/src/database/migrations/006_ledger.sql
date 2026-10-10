-- The double-entry ledger, owned by the ledger module. See docs/adr/0004-ledger-and-royalties.md.
--
-- Entries are signed: a debit is positive, a credit negative. A balance is never stored; it is
-- the sum of an account's entries, so the only way to change one is to post a transaction.

CREATE TABLE ledger_accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           TEXT NOT NULL,
  -- The user the platform owes; NULL for the platform's own accounts.
  owner_user_id  UUID REFERENCES users (id) ON DELETE RESTRICT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ledger_accounts_kind_known CHECK (
    kind IN ('platform_cash', 'platform_revenue', 'artist_payable', 'seller_payable')
  ),
  -- Payables belong to a user; the platform's accounts belong to no one.
  CONSTRAINT ledger_accounts_owner_matches_kind CHECK (
    (kind IN ('artist_payable', 'seller_payable')) = (owner_user_id IS NOT NULL)
  ),
  -- NULLS NOT DISTINCT (Postgres 15+): with the default, two platform_cash rows (both owners
  -- NULL) would count as different and both be allowed.
  CONSTRAINT ledger_accounts_one_per_kind_and_owner UNIQUE NULLS NOT DISTINCT (kind, owner_user_id)
);

CREATE TABLE ledger_transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Not a foreign key: the ledger records money movements without depending on the purchases
  -- module's table. One transaction per purchase is the last line of defence against a
  -- double credit.
  purchase_id  UUID NOT NULL,
  -- What the money was for, so a statement can be read without joining other modules' tables.
  memo         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL,

  CONSTRAINT ledger_transactions_one_per_purchase UNIQUE (purchase_id),
  CONSTRAINT ledger_transactions_memo_length CHECK (char_length(btrim(memo)) BETWEEN 1 AND 300)
);

CREATE TABLE ledger_entries (
  id              BIGSERIAL PRIMARY KEY,
  transaction_id  UUID NOT NULL REFERENCES ledger_transactions (id) ON DELETE RESTRICT,
  account_id      UUID NOT NULL REFERENCES ledger_accounts (id) ON DELETE RESTRICT,
  amount_cents    BIGINT NOT NULL,

  -- A zero line moves nothing; the code leaves it out (a 0% royalty, say).
  CONSTRAINT ledger_entries_amount_not_zero CHECK (amount_cents <> 0)
);

CREATE INDEX ledger_entries_transaction_id_index ON ledger_entries (transaction_id);
-- Balances and statements read by account.
CREATE INDEX ledger_entries_account_id_index ON ledger_entries (account_id);

-- Every transaction's entries sum to zero. A CHECK sees one row at a time, so this is a
-- constraint trigger, DEFERRED to commit: the entries of a transaction are inserted one by one
-- and only balance once all are in. Any code path (a bug, a script, a manual INSERT) that
-- commits an unbalanced transaction is rolled back.
CREATE FUNCTION assert_ledger_transaction_balances() RETURNS trigger AS $$
DECLARE
  imbalance_cents NUMERIC;
BEGIN
  SELECT COALESCE(sum(amount_cents), 0) INTO imbalance_cents
    FROM ledger_entries
   WHERE transaction_id = NEW.transaction_id;
  IF imbalance_cents <> 0 THEN
    RAISE EXCEPTION 'ledger transaction % does not balance: its entries sum to % cents',
      NEW.transaction_id, imbalance_cents
      USING ERRCODE = 'check_violation', CONSTRAINT = 'ledger_entries_balanced';
  END IF;
  RETURN NULL;
END
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_entries_balanced
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_ledger_transaction_balances();

-- Append-only: a mistake is corrected by posting a reversing transaction, never by editing
-- history. (Row triggers do not fire on TRUNCATE, which the test suite uses to reset.)
CREATE FUNCTION reject_ledger_history_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation', CONSTRAINT = 'ledger_append_only';
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_history_change();

CREATE TRIGGER ledger_transactions_append_only
  BEFORE UPDATE OR DELETE ON ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_history_change();
