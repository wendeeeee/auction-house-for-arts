import { DomainError, ErrorCode } from '../../common/errors';
import type { AuctionOutcome } from '../closing';

export class AuctionNotSoldError extends DomainError {
  readonly code = ErrorCode.AUCTION_NOT_SOLD;
  readonly httpStatus = 409;

  constructor(details: { auctionSlug: string; outcome: AuctionOutcome | 'not_closed' }) {
    super('This auction did not end in a sale, so there is nothing to pay for.', details);
  }
}

export class NotAuctionWinnerError extends DomainError {
  readonly code = ErrorCode.NOT_AUCTION_WINNER;
  readonly httpStatus = 403;

  constructor(auctionSlug: string) {
    super('Only the winner of this auction can pay for it.', { auctionSlug });
  }
}

export class NotPurchasePartyError extends DomainError {
  readonly code = ErrorCode.NOT_PURCHASE_PARTY;
  readonly httpStatus = 403;

  constructor(auctionSlug: string) {
    super('Only the buyer and the seller can see the payment for this auction.', { auctionSlug });
  }
}

export class PurchaseAlreadyPaidError extends DomainError {
  readonly code = ErrorCode.PURCHASE_ALREADY_PAID;
  readonly httpStatus = 409;

  constructor(purchaseId: string) {
    super('This purchase has already been paid.', { purchaseId });
  }
}

export class PaymentInProgressError extends DomainError {
  readonly code = ErrorCode.PAYMENT_IN_PROGRESS;
  readonly httpStatus = 409;

  constructor(purchaseId: string) {
    super('Your payment was submitted and is being confirmed.', { purchaseId });
  }
}
