import { describe, expect, it } from 'vitest';
import { checkTile, gridLines, type ParticipantStats, type TileCondition } from './tileConditions';

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

  it('tbd never completes', () => {
    expect(checkTile({ type: 'tbd' }, stats({ xpGained: 999_999_999 }))).toEqual({
      done: false,
      progress: 0,
      goal: 0,
    });
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
