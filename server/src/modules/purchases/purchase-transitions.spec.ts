import { decidePurchaseTransition } from './purchase-transitions';

describe('decidePurchaseTransition', () => {
  it.each`
    status       | event                          | expected
    ${'pending'} | ${'checkout_session_attached'} | ${{ isAllowed: true, nextStatus: 'pending' }}
    ${'pending'} | ${'payment_confirmed'}         | ${{ isAllowed: true, nextStatus: 'paid' }}
    ${'paid'}    | ${'checkout_session_attached'} | ${{ isAllowed: false }}
    ${'paid'}    | ${'payment_confirmed'}         | ${{ isAllowed: false }}
  `('$status + $event → $expected', ({ status, event, expected }) => {
    expect(decidePurchaseTransition(status, event)).toEqual(expected);
  });
});
