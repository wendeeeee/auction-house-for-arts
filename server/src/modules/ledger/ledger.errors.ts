import { DomainError, ErrorCode } from '../../common/errors';

/**
 * A posting that would break the ledger's rules. Never the client's fault, so 500; the database
 * trigger would reject an unbalanced transaction anyway, but this names the problem first.
 */
export class InvalidLedgerPostingError extends DomainError {
  readonly code = ErrorCode.INVALID_LEDGER_POSTING;
  readonly httpStatus = 500;
}

/** The purchase already has its ledger transaction, so paying it out again would double-credit. */
export class PurchaseAlreadyPostedError extends DomainError {
  readonly code = ErrorCode.PURCHASE_ALREADY_POSTED;
  readonly httpStatus = 409;

  constructor(purchaseId: string) {
    super('This purchase has already been recorded in the ledger.', { purchaseId });
  }
}
