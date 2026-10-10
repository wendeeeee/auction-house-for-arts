/** Mirrors the `ledger_accounts_kind_known` CHECK constraint in 006_ledger.sql. */
export const LEDGER_ACCOUNT_KINDS = ['platform_cash', 'platform_revenue', 'artist_payable', 'seller_payable'] as const;
export type LedgerAccountKind = (typeof LEDGER_ACCOUNT_KINDS)[number];

/** What the platform owes a user. Credit-normal: money owed shows as negative entries. */
export const USER_PAYABLE_ACCOUNT_KINDS = ['artist_payable', 'seller_payable'] as const;
export type UserPayableAccountKind = (typeof USER_PAYABLE_ACCOUNT_KINDS)[number];

export type PlatformAccountKind = Exclude<LedgerAccountKind, UserPayableAccountKind>;

/**
 * An account named by what it is, not by its row ID: the ledger creates it on first use. The
 * union mirrors `ledger_accounts_owner_matches_kind`.
 */
export type LedgerAccountReference =
  | { readonly kind: PlatformAccountKind; readonly ownerUserId: null }
  | { readonly kind: UserPayableAccountKind; readonly ownerUserId: string };

/** Signed: a debit is positive, a credit negative. Never zero. */
export interface PostingLine {
  readonly account: LedgerAccountReference;
  readonly amountCents: number;
}

export interface Posting {
  readonly purchaseId: string;
  readonly memo: string;
  readonly lines: readonly PostingLine[];
}

export interface SaleProceedsSplit {
  readonly platformFeeCents: number;
  readonly artistRoyaltyCents: number;
  readonly sellerProceedsCents: number;
}

/** A sale to record once its payment is confirmed. */
export interface SaleToRecord {
  readonly purchaseId: string;
  readonly memo: string;
  readonly hammerPriceCents: number;
  /** The auction's seller: the artist for a primary sale, a collector for a resale. */
  readonly sellerUserId: string;
  readonly artistUserId: string;
  readonly artistRoyaltyBps: number;
}

export interface RecordedSale {
  readonly transactionId: string;
  readonly split: SaleProceedsSplit;
}

/** One line of a user's statement: money the platform now owes them. */
export interface EarningsEntry {
  readonly purchaseId: string;
  readonly accountKind: UserPayableAccountKind;
  /** Positive: the credit to the user, shown as an amount earned. */
  readonly earnedCents: number;
  readonly memo: string;
  readonly postedAt: Date;
}

export interface Earnings {
  readonly sellerProceedsCents: number;
  readonly artistRoyaltiesCents: number;
  /** Newest first. */
  readonly recentEntries: readonly EarningsEntry[];
}
