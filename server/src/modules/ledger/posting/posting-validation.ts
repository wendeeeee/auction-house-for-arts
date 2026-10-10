import { InvalidLedgerPostingError } from '../ledger.errors';
import { LedgerAccountReference, PostingLine, USER_PAYABLE_ACCOUNT_KINDS } from '../ledger.types';

/**
 * The ledger's rules, checked before anything is written:
 * - at least two lines (one line cannot balance);
 * - every amount a non-zero safe integer of cents;
 * - each account's owner matches its kind (payables have one, platform accounts do not);
 * - the lines sum to exactly zero.
 *
 * The database enforces the zero sum again at commit (the `ledger_entries_balanced` trigger),
 * so a path that skips this function still cannot commit an unbalanced transaction.
 */
export function assertPostingBalances(lines: readonly PostingLine[]): void {
  if (lines.length < 2) {
    throw new InvalidLedgerPostingError('A posting needs at least two lines.', { lineCount: lines.length });
  }

  // BigInt, so a sum of many large amounts cannot lose precision on its way to zero.
  let sumCents = 0n;
  for (const [index, line] of lines.entries()) {
    if (!Number.isSafeInteger(line.amountCents) || line.amountCents === 0) {
      throw new InvalidLedgerPostingError('Every posting line must be a non-zero whole number of cents.', {
        lineIndex: index,
        amountCents: String(line.amountCents),
      });
    }
    assertOwnerMatchesKind(line.account, index);
    sumCents += BigInt(line.amountCents);
  }

  if (sumCents !== 0n) {
    throw new InvalidLedgerPostingError('A posting’s lines must sum to zero.', { imbalanceCents: sumCents.toString() });
  }
}

function assertOwnerMatchesKind(account: LedgerAccountReference, lineIndex: number): void {
  const isUserPayable = (USER_PAYABLE_ACCOUNT_KINDS as readonly string[]).includes(account.kind);
  const hasOwner = account.ownerUserId !== null;
  if (isUserPayable !== hasOwner) {
    throw new InvalidLedgerPostingError(
      isUserPayable ? 'A payable account needs an owner.' : 'A platform account has no owner.',
      { lineIndex, kind: account.kind },
    );
  }
}
