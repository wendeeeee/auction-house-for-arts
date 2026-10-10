import { DomainError, ErrorCode } from '../../common/errors';

export class AuctionNotFoundError extends DomainError {
  readonly code = ErrorCode.AUCTION_NOT_FOUND;
  readonly httpStatus = 404;

  constructor(slug: string) {
    super(`No auction with slug "${slug}".`, { slug });
  }
}

export class NotArtworkOwnerError extends DomainError {
  readonly code = ErrorCode.NOT_ARTWORK_OWNER;
  readonly httpStatus = 403;

  constructor(artworkSlug: string) {
    super('Only the artwork’s current owner can put it up for auction.', { artworkSlug });
  }
}

export class ArtworkAlreadyAtAuctionError extends DomainError {
  readonly code = ErrorCode.ARTWORK_ALREADY_AT_AUCTION;
  readonly httpStatus = 409;

  constructor(artworkSlug: string) {
    super('This artwork already has an auction that has not closed.', { artworkSlug });
  }
}

/** The maximum is below what a new bid must reach. `details.minimumNextBidCents` tells the UI what would be accepted. */
export class BidTooLowError extends DomainError {
  readonly code = ErrorCode.BID_TOO_LOW;
  readonly httpStatus = 409;

  constructor(details: { maxBidCents: number; minimumNextBidCents: number }) {
    super('Your maximum bid is below the minimum next bid.', details);
  }
}

/** The leader tried to "raise" to an amount that is not above their current maximum. */
export class MaximumNotRaisedError extends DomainError {
  readonly code = ErrorCode.MAX_NOT_RAISED;
  readonly httpStatus = 409;

  constructor(details: { maxBidCents: number; yourMaxBidCents: number }) {
    super('You are leading; a new maximum must be above your current maximum.', details);
  }
}

export class AuctionEndedError extends DomainError {
  readonly code = ErrorCode.AUCTION_ENDED;
  readonly httpStatus = 409;

  constructor(details: { endsAt: string }) {
    super('This auction has ended.', details);
  }
}

export type BidderIneligibilityReason = 'seller' | 'owner';

export class BidderNotEligibleError extends DomainError {
  readonly code = ErrorCode.NOT_ALLOWED_TO_BID;
  readonly httpStatus = 409;

  constructor(reason: BidderIneligibilityReason) {
    super(
      reason === 'seller' ? 'You cannot bid on your own auction.' : 'You cannot bid on an artwork you own.',
      { reason },
    );
  }
}
