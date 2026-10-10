import { ErrorCode } from '../../../common/errors';
import { PostingLine } from '../ledger.types';
import { assertPostingBalances } from './posting-validation';

const SELLER = 'seller-user-id';

const cash = (amountCents: number): PostingLine => ({ account: { kind: 'platform_cash', ownerUserId: null }, amountCents });
const sellerPayable = (amountCents: number): PostingLine => ({
  account: { kind: 'seller_payable', ownerUserId: SELLER },
  amountCents,
});

const rejection = expect.objectContaining({ code: ErrorCode.INVALID_LEDGER_POSTING });

describe('assertPostingBalances', () => {
  it('accepts lines that sum to zero', () => {
    expect(() => assertPostingBalances([cash(500_00), sellerPayable(-500_00)])).not.toThrow();
  });

  it('rejects lines that do not sum to zero, naming the imbalance', () => {
    expect(() => assertPostingBalances([cash(500_00), sellerPayable(-499_99)])).toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_LEDGER_POSTING, details: { imbalanceCents: '1' } }),
    );
  });

  it('rejects a single line, which can never balance', () => {
    expect(() => assertPostingBalances([cash(0)])).toThrow(rejection);
    expect(() => assertPostingBalances([])).toThrow(rejection);
  });

  it.each([0, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('rejects an amount of %p', (amountCents) => {
    expect(() => assertPostingBalances([cash(amountCents), sellerPayable(-amountCents)])).toThrow(rejection);
  });

  it('sums exactly even when the amounts are near the safe-integer limit', () => {
    const large = Number.MAX_SAFE_INTEGER;
    expect(() => assertPostingBalances([cash(large), cash(large), sellerPayable(-large), sellerPayable(-large)])).not.toThrow();
  });

  it('rejects a payable without an owner and a platform account with one', () => {
    const ownerlessPayable = { account: { kind: 'seller_payable', ownerUserId: null }, amountCents: -100 } as unknown as PostingLine;
    const ownedCash = { account: { kind: 'platform_cash', ownerUserId: SELLER }, amountCents: 100 } as unknown as PostingLine;
    expect(() => assertPostingBalances([cash(100), ownerlessPayable])).toThrow(rejection);
    expect(() => assertPostingBalances([ownedCash, sellerPayable(-100)])).toThrow(rejection);
  });
});
