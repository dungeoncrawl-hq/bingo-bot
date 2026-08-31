import { describe, expect, it } from 'vitest';
import { formatCompactNumber } from './format';

describe('formatCompactNumber', () => {
  it('matches the exact examples given for this feature', () => {
    expect(formatCompactNumber(1_500_000)).toBe('1.5M');
    expect(formatCompactNumber(12_000)).toBe('12K');
    expect(formatCompactNumber(3_254)).toBe('3,254');
    expect(formatCompactNumber(1_524_000)).toBe('1.524M');
  });

  it('stays exact (comma-formatted) below the 10,000 shorthand threshold', () => {
    expect(formatCompactNumber(9_999)).toBe('9,999');
    expect(formatCompactNumber(0)).toBe('0');
  });

  it('rounds down rather than to-nearest when roundDown is set, so progress never reads as having reached a threshold it hasn\'t', () => {
    // Without roundDown, this would round to "2M" -- indistinguishable
    // from having actually hit a 2,000,000 threshold.
    expect(formatCompactNumber(1_999_999, { roundDown: true })).toBe('1.999M');
    expect(formatCompactNumber(1_999_999)).toBe('2M'); // default (goal display) rounds normally
  });

  it('round-down still shows the exact value when it divides evenly (no false precision)', () => {
    expect(formatCompactNumber(12_000, { roundDown: true })).toBe('12K');
    expect(formatCompactNumber(1_500_000, { roundDown: true })).toBe('1.5M');
  });
});
