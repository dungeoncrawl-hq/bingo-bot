import { describe, expect, it } from 'vitest';
import { tileCompletionFlavor, boardCompletionFlavor } from './discordBanter';

// rng: () => 0 always picks the pool's first entry; () => 0.999 always
// picks the last -- deterministic without hardcoding pool size/order,
// so these stay correct even as lines get added/reworded.
const first = () => 0;
const last = () => 0.999;

describe('tileCompletionFlavor', () => {
  it('bakes the point total into the first-place line for a regular tile', () => {
    const line = tileCompletionFlavor({ isFirst: true, isBoss: false, points: 8, firstCompleterRsn: 'otototo' }, first);
    expect(line).toContain('8 pts');
  });

  it('bakes the first-completer name into the non-first line for a regular tile', () => {
    const line = tileCompletionFlavor({ isFirst: false, isBoss: false, points: 8, firstCompleterRsn: 'otototo' }, first);
    expect(line).toContain('otototo');
  });

  it('draws from a distinct boss pool -- not the same lines as a regular tile', () => {
    const tileLine = tileCompletionFlavor({ isFirst: true, isBoss: false, points: 5, firstCompleterRsn: 'x' }, first);
    const bossLine = tileCompletionFlavor({ isFirst: true, isBoss: true, points: 5, firstCompleterRsn: 'x' }, first);
    expect(bossLine).not.toBe(tileLine);
  });

  it('bakes the point total into the first-place boss line', () => {
    const line = tileCompletionFlavor({ isFirst: true, isBoss: true, points: 12, firstCompleterRsn: 'x' }, first);
    expect(line).toContain('12 pts');
  });

  it('bakes the first-completer name into the non-first boss line', () => {
    const line = tileCompletionFlavor({ isFirst: false, isBoss: true, points: 12, firstCompleterRsn: '26 Limont' }, first);
    expect(line).toContain('26 Limont');
  });

  it('varies the selection when rng picks a different index (first vs last of the pool)', () => {
    const a = tileCompletionFlavor({ isFirst: true, isBoss: false, points: 3, firstCompleterRsn: 'x' }, first);
    const b = tileCompletionFlavor({ isFirst: true, isBoss: false, points: 3, firstCompleterRsn: 'x' }, last);
    expect(a).not.toBe(b);
  });

  it('defaults to Math.random when no rng is supplied, returning a non-empty string', () => {
    const line = tileCompletionFlavor({ isFirst: true, isBoss: false, points: 1, firstCompleterRsn: 'x' });
    expect(typeof line).toBe('string');
    expect(line.length).toBeGreaterThan(0);
  });
});

describe('boardCompletionFlavor', () => {
  it('returns a non-empty line', () => {
    expect(boardCompletionFlavor(first).length).toBeGreaterThan(0);
  });

  it('varies the selection across the pool', () => {
    expect(boardCompletionFlavor(first)).not.toBe(boardCompletionFlavor(last));
  });
});
