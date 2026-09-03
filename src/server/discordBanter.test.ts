import { describe, expect, it } from 'vitest';
import { tileCompletionFlavor, boardCompletionFlavor, type BanterPools } from './discordBanter';

// rng: () => 0 always picks the pool's first entry; () => 0.999 always
// picks the last -- deterministic without hardcoding pool size/order,
// so these stay correct even as lines get added/reworded.
const first = () => 0;
const last = () => 0.999;

describe('tileCompletionFlavor', () => {
  it('does not repeat the point total in the first-place line for a regular tile (the embed has its own Points field)', () => {
    const line = tileCompletionFlavor({ isFirst: true, isBoss: false, points: 8, firstCompleterRsn: 'otototo' }, undefined, first);
    expect(line).not.toContain('pts');
  });

  it('bakes the first-completer name into the non-first line for a regular tile', () => {
    const line = tileCompletionFlavor({ isFirst: false, isBoss: false, points: 8, firstCompleterRsn: 'otototo' }, undefined, first);
    expect(line).toContain('otototo');
  });

  it('draws from a distinct boss pool -- not the same lines as a regular tile', () => {
    const tileLine = tileCompletionFlavor({ isFirst: true, isBoss: false, points: 5, firstCompleterRsn: 'x' }, undefined, first);
    const bossLine = tileCompletionFlavor({ isFirst: true, isBoss: true, points: 5, firstCompleterRsn: 'x' }, undefined, first);
    expect(bossLine).not.toBe(tileLine);
  });

  it('does not repeat the point total in the first-place boss line either', () => {
    const line = tileCompletionFlavor({ isFirst: true, isBoss: true, points: 12, firstCompleterRsn: 'x' }, undefined, first);
    expect(line).not.toContain('pts');
  });

  it('bakes the first-completer name into the non-first boss line', () => {
    const line = tileCompletionFlavor({ isFirst: false, isBoss: true, points: 12, firstCompleterRsn: '26 Limont' }, undefined, first);
    expect(line).toContain('26 Limont');
  });

  it('varies the selection when rng picks a different index (first vs last of the pool)', () => {
    const a = tileCompletionFlavor({ isFirst: true, isBoss: false, points: 3, firstCompleterRsn: 'x' }, undefined, first);
    const b = tileCompletionFlavor({ isFirst: true, isBoss: false, points: 3, firstCompleterRsn: 'x' }, undefined, last);
    expect(a).not.toBe(b);
  });

  it('defaults to Math.random when no rng is supplied, returning a non-empty string', () => {
    const line = tileCompletionFlavor({ isFirst: true, isBoss: false, points: 1, firstCompleterRsn: 'x' });
    expect(typeof line).toBe('string');
    expect(line.length).toBeGreaterThan(0);
  });

  it('uses a custom pools argument instead of the hardcoded defaults (BACKLOG.md #9)', () => {
    const customPools: BanterPools = {
      firstTile: ['Custom first-tile line, +{points} pts.'],
      notFirstTile: ['Custom not-first line, beaten by {rsn}.'],
      firstBoss: ['Custom first-boss line, +{points} pts.'],
      notFirstBoss: ['Custom not-first-boss line, beaten by {rsn}.'],
      boardCompletion: ['Custom board line.'],
    };
    expect(tileCompletionFlavor({ isFirst: true, isBoss: false, points: 7, firstCompleterRsn: 'x' }, customPools, first)).toBe(
      'Custom first-tile line, +7 pts.',
    );
    expect(tileCompletionFlavor({ isFirst: false, isBoss: false, points: 7, firstCompleterRsn: 'Someone' }, customPools, first)).toBe(
      'Custom not-first line, beaten by Someone.',
    );
    expect(tileCompletionFlavor({ isFirst: true, isBoss: true, points: 7, firstCompleterRsn: 'x' }, customPools, first)).toBe(
      'Custom first-boss line, +7 pts.',
    );
    expect(tileCompletionFlavor({ isFirst: false, isBoss: true, points: 7, firstCompleterRsn: 'Someone' }, customPools, first)).toBe(
      'Custom not-first-boss line, beaten by Someone.',
    );
  });

  it('substitutes {points}/{rsn} placeholders anywhere they appear, including more than once', () => {
    const customPools: BanterPools = {
      firstTile: ['{points} points! Yes, {points} whole points.'],
      notFirstTile: [],
      firstBoss: [],
      notFirstBoss: [],
      boardCompletion: [],
    };
    const line = tileCompletionFlavor({ isFirst: true, isBoss: false, points: 9, firstCompleterRsn: 'x' }, customPools, first);
    expect(line).toBe('9 points! Yes, 9 whole points.');
  });
});

describe('boardCompletionFlavor', () => {
  it('returns a non-empty line', () => {
    expect(boardCompletionFlavor(undefined, first).length).toBeGreaterThan(0);
  });

  it('varies the selection across the pool', () => {
    expect(boardCompletionFlavor(undefined, first)).not.toBe(boardCompletionFlavor(undefined, last));
  });

  it('uses a custom pools argument instead of the hardcoded defaults', () => {
    const customPools: BanterPools = {
      firstTile: [],
      notFirstTile: [],
      firstBoss: [],
      notFirstBoss: [],
      boardCompletion: ['The only line in this custom pool.'],
    };
    expect(boardCompletionFlavor(customPools, first)).toBe('The only line in this custom pool.');
    expect(boardCompletionFlavor(customPools, last)).toBe('The only line in this custom pool.');
  });
});
