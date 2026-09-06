import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, colorForParticipant, isValidPlayerColor } from './playerColors';

describe('colorForParticipant', () => {
  it('is deterministic -- the same id always hashes to the same color', () => {
    const id = 'abc-123';
    expect(colorForParticipant(id)).toBe(colorForParticipant(id));
  });

  it('always returns a color from the curated palette', () => {
    for (const id of ['a', 'bb', 'ccc', 'participant-42', '']) {
      expect(PLAYER_COLORS).toContain(colorForParticipant(id));
    }
  });

  it('different ids commonly hash to different colors', () => {
    const colors = new Set(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'].map(colorForParticipant));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe('isValidPlayerColor', () => {
  it('accepts every palette color', () => {
    for (const c of PLAYER_COLORS) expect(isValidPlayerColor(c)).toBe(true);
  });

  it('rejects an arbitrary color not in the palette', () => {
    expect(isValidPlayerColor('#123456')).toBe(false);
    expect(isValidPlayerColor('red')).toBe(false);
  });
});
