import { describe, expect, it } from 'vitest';
import { formatBytes, formatCompactNumber } from './format';

describe('formatCompactNumber', () => {
  it('matches the exact examples given for this feature', () => {
    expect(formatCompactNumber(1_500_000)).toBe('1.5M');
    expect(formatCompactNumber(12_000)).toBe('12K');
    expect(formatCompactNumber(3_254)).toBe('3,254');
    expect(formatCompactNumber(123_444)).toBe('123K');
    expect(formatCompactNumber(1_250_000)).toBe('1.25M');
  });

  it('stays exact (comma-formatted) below the 10,000 shorthand threshold', () => {
    expect(formatCompactNumber(9_999)).toBe('9,999');
    expect(formatCompactNumber(0)).toBe('0');
  });

  it('K range never shows decimals, even for a non-round value', () => {
    expect(formatCompactNumber(999_499)).toBe('999K');
  });

  it('M range caps at 2 decimals (not 3), trailing zeros trimmed', () => {
    expect(formatCompactNumber(1_524_000)).toBe('1.52M');
    expect(formatCompactNumber(2_000_000)).toBe('2M');
  });

  it('rounds down rather than to-nearest when roundDown is set, so progress never reads as having reached a threshold it hasn\'t', () => {
    // Without roundDown, this would round to "2M" -- indistinguishable
    // from having actually hit a 2,000,000 threshold.
    expect(formatCompactNumber(1_999_999, { roundDown: true })).toBe('1.99M');
    expect(formatCompactNumber(1_999_999)).toBe('2M'); // default (goal display) rounds normally
    // Same safety property at the K scale -- 12,999 shouldn't round up to "13K".
    expect(formatCompactNumber(12_999, { roundDown: true })).toBe('12K');
  });

  it('round-down still shows the exact value when it divides evenly (no false precision)', () => {
    expect(formatCompactNumber(12_000, { roundDown: true })).toBe('12K');
    expect(formatCompactNumber(1_500_000, { roundDown: true })).toBe('1.5M');
  });
});

describe('formatBytes', () => {
  it('stays in bytes below 1 KB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
  });

  it('switches to KB with one decimal below 1 MB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(50_000)).toBe('48.8 KB');
  });

  it('switches to MB with one decimal at 1 MB and above', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
