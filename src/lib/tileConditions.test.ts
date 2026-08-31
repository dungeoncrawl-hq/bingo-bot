import { describe, expect, it } from 'vitest';
import {
  checkTile,
  formatTileProgress,
  gridLines,
  progressPercent,
  type ParticipantStats,
  type TileCondition,
} from './tileConditions';

const ZERO_STATS: ParticipantStats = {
  xpGained: 0,
  bossKcGained: 0,
  kcGainedByActivity: {},
  slayerTasksCompleted: 0,
  lootValueGained: 0,
  biggestDropValue: 0,
  cluesCompleted: 0,
  beginnerCluesCompleted: 0,
  easyCluesCompleted: 0,
  mediumCluesCompleted: 0,
  hardCluesCompleted: 0,
  eliteCluesCompleted: 0,
  masterCluesCompleted: 0,
  collectionLogGained: 0,
  skillLevelsGained: {},
  skillXpGained: {},
  deathsInPeriod: 0,
  itemCounts: {},
  petsObtained: 0,
};

function stats(overrides: Partial<ParticipantStats>): ParticipantStats {
  return { ...ZERO_STATS, ...overrides };
}

describe('checkTile', () => {
  it('is not done below threshold and done at/above it', () => {
    const cond: TileCondition = { type: 'xpGained', threshold: 1000 };
    expect(checkTile(cond, stats({ xpGained: 999 })).done).toBe(false);
    expect(checkTile(cond, stats({ xpGained: 1000 })).done).toBe(true);
    expect(checkTile(cond, stats({ xpGained: 5000 })).done).toBe(true);
  });

  it('kcGained reads only its own activity, not bossKcGained', () => {
    const cond: TileCondition = { type: 'kcGained', activity: 'Vorkath', threshold: 10 };
    const s = stats({ bossKcGained: 999, kcGainedByActivity: { Zulrah: 50, Vorkath: 5 } });
    expect(checkTile(cond, s)).toEqual({ done: false, progress: 5, goal: 10 });
  });

  it('skillLevelGained and skillXpGained key off the specific skill only', () => {
    const s = stats({
      skillLevelsGained: { Attack: 2, Strength: 5 },
      skillXpGained: { Attack: 10_000, Strength: 999_999 },
    });
    expect(checkTile({ type: 'skillLevelGained', skill: 'Attack', threshold: 2 }, s).done).toBe(true);
    expect(checkTile({ type: 'skillLevelGained', skill: 'Defence', threshold: 1 }, s).done).toBe(false);
    expect(checkTile({ type: 'skillXpGained', skill: 'Attack', threshold: 10_000 }, s).done).toBe(true);
  });

  it('itemCount sums matching item names case-insensitively', () => {
    const cond: TileCondition = {
      type: 'itemCount',
      itemNames: ["Dharok's helm", "Dharok's platebody"],
      setName: 'Barrows pieces',
      threshold: 2,
    };
    const s = stats({ itemCounts: { "dharok's helm": 1, "dharok's platebody": 1, "verac's flail": 5 } });
    expect(checkTile(cond, s)).toEqual({ done: true, progress: 2, goal: 2 });
  });

  it('maxDeaths starts complete and flips to failed once the limit is broken', () => {
    const cond: TileCondition = { type: 'maxDeaths', threshold: 3 };
    expect(checkTile(cond, stats({ deathsInPeriod: 0 }))).toEqual({ done: true, progress: 0, goal: 3, failed: false });
    expect(checkTile(cond, stats({ deathsInPeriod: 3 }))).toEqual({ done: true, progress: 3, goal: 3, failed: false });
    expect(checkTile(cond, stats({ deathsInPeriod: 4 }))).toEqual({ done: false, progress: 4, goal: 3, failed: true });
  });

  it('each clue tier reads its own field, not the others', () => {
    const s = stats({ cluesCompleted: 50, hardCluesCompleted: 2, masterCluesCompleted: 0 });
    expect(checkTile({ type: 'cluesCompleted', threshold: 10 }, s).done).toBe(true);
    expect(checkTile({ type: 'hardCluesCompleted', threshold: 2 }, s).done).toBe(true);
    expect(checkTile({ type: 'masterCluesCompleted', threshold: 1 }, s).done).toBe(false);
    expect(checkTile({ type: 'easyCluesCompleted', threshold: 1 }, s).done).toBe(false);
  });

  it('itemSetCollected counts distinct items obtained at least once -- duplicates of one item do not substitute for another', () => {
    const cond: TileCondition = {
      type: 'itemSetCollected',
      itemNames: ["Dharok's helm", "Dharok's platebody", "Dharok's platelegs", "Dharok's greataxe"],
      setName: "Dharok's set",
      threshold: 4,
    };
    // Five copies of the same piece -- only 1 distinct item, nowhere near the set.
    const s = stats({ itemCounts: { "dharok's helm": 5 } });
    expect(checkTile(cond, s)).toEqual({ done: false, progress: 1, goal: 4 });
  });

  it('itemSetCollected completes once every distinct item has at least one copy', () => {
    const cond: TileCondition = {
      type: 'itemSetCollected',
      itemNames: ["Dharok's helm", "Dharok's platebody"],
      setName: "Dharok's set",
      threshold: 2,
    };
    const s = stats({ itemCounts: { "dharok's helm": 1, "dharok's platebody": 3 } });
    expect(checkTile(cond, s)).toEqual({ done: true, progress: 2, goal: 2 });
  });

  it('itemSetCollected supports a partial-set threshold (any N of M)', () => {
    const cond: TileCondition = {
      type: 'itemSetCollected',
      itemNames: ['a', 'b', 'c', 'd', 'e'],
      setName: 'Some set',
      threshold: 3,
    };
    const s = stats({ itemCounts: { a: 1, b: 1 } });
    expect(checkTile(cond, s).done).toBe(false);
    const s2 = stats({ itemCounts: { a: 1, b: 1, c: 1 } });
    expect(checkTile(cond, s2).done).toBe(true);
  });

  it('tbd never completes', () => {
    expect(checkTile({ type: 'tbd' }, stats({ xpGained: 999_999_999 }))).toEqual({
      done: false,
      progress: 0,
      goal: 0,
    });
  });
});

describe('formatTileProgress', () => {
  it('formats current/goal in shorthand for xpGained, current rounded down', () => {
    const cond: TileCondition = { type: 'xpGained', threshold: 1_500_000 };
    const status = checkTile(cond, stats({ xpGained: 1_999_999 }));
    expect(formatTileProgress(cond, status)).toBe('1.99M / 1.5M XP');
  });

  it('formats current/goal in shorthand for lootValueGained', () => {
    const cond: TileCondition = { type: 'lootValueGained', threshold: 12_000 };
    const status = checkTile(cond, stats({ lootValueGained: 3_254 }));
    expect(formatTileProgress(cond, status)).toBe('3,254 / 12K gp');
  });

  it('formats current/goal for skillXpGained using the skill-specific progress', () => {
    const cond: TileCondition = { type: 'skillXpGained', skill: 'Attack', threshold: 1_524_000 };
    const status = checkTile(cond, stats({ skillXpGained: { Attack: 1_524_000 } }));
    expect(formatTileProgress(cond, status)).toBe('1.52M / 1.52M XP');
  });

  it('formats itemSetCollected as a plain progress/goal item count', () => {
    const cond: TileCondition = {
      type: 'itemSetCollected',
      itemNames: ["Dharok's helm", "Dharok's platebody", "Dharok's platelegs", "Dharok's greataxe"],
      setName: "Dharok's set",
      threshold: 4,
    };
    const status = checkTile(cond, stats({ itemCounts: { "dharok's helm": 1, "dharok's platebody": 1 } }));
    expect(formatTileProgress(cond, status)).toBe('2/4 items');
  });

  it('returns null for condition types outside XP/loot scope (avoid clutter)', () => {
    const cond: TileCondition = { type: 'bossKcGained', threshold: 10 };
    expect(formatTileProgress(cond, checkTile(cond, stats({ bossKcGained: 5 })))).toBeNull();
  });
});

describe('progressPercent', () => {
  it('returns null for singleDropValue and tbd (no meaningful bar)', () => {
    const cond1: TileCondition = { type: 'singleDropValue', threshold: 1000 };
    expect(progressPercent(cond1, checkTile(cond1, stats({ biggestDropValue: 500 })))).toBeNull();
    const cond2: TileCondition = { type: 'tbd' };
    expect(progressPercent(cond2, checkTile(cond2, ZERO_STATS))).toBeNull();
  });

  it('is proportional to progress/goal for a standard condition, clamped to 100', () => {
    const cond: TileCondition = { type: 'xpGained', threshold: 1000 };
    expect(progressPercent(cond, checkTile(cond, stats({ xpGained: 250 })))).toBe(25);
    expect(progressPercent(cond, checkTile(cond, stats({ xpGained: 5000 })))).toBe(100);
    expect(progressPercent(cond, checkTile(cond, stats({ xpGained: 0 })))).toBe(0);
  });

  it('is inverted for maxDeaths -- full at 0 deaths, draining toward 0 as the limit is approached/broken', () => {
    const cond: TileCondition = { type: 'maxDeaths', threshold: 4 };
    expect(progressPercent(cond, checkTile(cond, stats({ deathsInPeriod: 0 })))).toBe(100);
    expect(progressPercent(cond, checkTile(cond, stats({ deathsInPeriod: 2 })))).toBe(50);
    expect(progressPercent(cond, checkTile(cond, stats({ deathsInPeriod: 4 })))).toBe(0);
    // Broken the limit entirely -- clamped to 0, not negative.
    expect(progressPercent(cond, checkTile(cond, stats({ deathsInPeriod: 10 })))).toBe(0);
  });
});

describe('gridLines', () => {
  it('produces 5 rows + 5 cols + 2 diagonals for a 5x5 board', () => {
    const lines = gridLines(5);
    expect(lines).toHaveLength(12);
    expect(lines.every((line) => line.length === 5)).toBe(true);
  });

  it('rows are contiguous index ranges', () => {
    const lines = gridLines(3);
    expect(lines[0]).toEqual([0, 1, 2]);
    expect(lines[1]).toEqual([3, 4, 5]);
  });

  it('diagonals hit the correct corners', () => {
    const lines = gridLines(3);
    const mainDiagonal = lines.find((l) => l[0] === 0 && l[l.length - 1] === 8);
    const antiDiagonal = lines.find((l) => l[0] === 2 && l[l.length - 1] === 6);
    expect(mainDiagonal).toEqual([0, 4, 8]);
    expect(antiDiagonal).toEqual([2, 4, 6]);
  });
});
