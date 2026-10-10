import { describe, expect, it } from 'vitest';
import { centsToDollarInput, formatCents, parseDollarsToCents } from './money';

describe('formatCents', () => {
  it.each([
    [0, '$0'],
    [5, '$0.05'],
    [31000, '$310'],
    [105001, '$1,050.01'],
    [2500000, '$25,000'],
    [123456789, '$1,234,567.89'],
    [-500, '-$5'],
  ])('%i cents → %s', (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });
});

describe('parseDollarsToCents', () => {
  it.each([
    ['310', 31000],
    ['$310', 31000],
    ['1,050.01', 105001],
    ['80.5', 8050],
    ['0.29', 29],
    ['  42 ', 4200],
  ])('reads %j as %i cents', (text, expected) => {
    expect(parseDollarsToCents(text)).toBe(expected);
  });

  it.each(['', 'abc', '10.005', '-5', '1,00', '1e3', '$'])('rejects %j', (text) => {
    expect(parseDollarsToCents(text)).toBeNull();
  });
});

describe('centsToDollarInput', () => {
  it('round-trips through the parser', () => {
    for (const cents of [100, 31000, 105001, 2500050]) {
      expect(parseDollarsToCents(centsToDollarInput(cents))).toBe(cents);
    }
  });
});
