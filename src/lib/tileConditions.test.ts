import { describe, expect, it } from 'vitest';
import {
  checkTile,
  conditionNeedsBaseline,
  formatTileProgress,
  gridLines,
  progressPercent,
  tileTaskPhrase,
  tileTaskDetail,
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
  gotrCompleted: 0,
  collectionLogGained: 0,
  skillLevelsGained: {},
  skillXpGained: {},
  deathsInPeriod: 0,
  itemCounts: {},
  petsObtained: 0,
  dropValues: [],
  lowestSkillCandidates: [],
  chosenLowestSkill: null,
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

  it('gotrCompleted is not done below threshold and done at/above it', () => {
    const cond: TileCondition = { type: 'gotrCompleted', threshold: 2 };
    expect(checkTile(cond, stats({ gotrCompleted: 1 })).done).toBe(false);
    expect(checkTile(cond, stats({ gotrCompleted: 2 })).done).toBe(true);
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

  it('bigDropsCount counts only drops that individually clear the per-drop threshold', () => {
    const cond: TileCondition = { type: 'bigDropsCount', dropValueThreshold: 1_000_000, threshold: 2 };
    const s = stats({ dropValues: [500_000, 1_000_000, 2_000_000, 999_999] });
    expect(checkTile(cond, s)).toEqual({ done: true, progress: 2, goal: 2 });
  });

  it('bigDropsCount is not done until the count goal is reached', () => {
    const cond: TileCondition = { type: 'bigDropsCount', dropValueThreshold: 1_000_000, threshold: 3 };
    const s = stats({ dropValues: [1_000_000, 2_000_000] });
    expect(checkTile(cond, s)).toEqual({ done: false, progress: 2, goal: 3 });
  });

  it('tbd never completes', () => {
    expect(checkTile({ type: 'tbd' }, stats({ xpGained: 999_999_999 }))).toEqual({
      done: false,
      progress: 0,
      goal: 0,
    });
  });

  it('freeSpace is always done, regardless of stats', () => {
    expect(checkTile({ type: 'freeSpace' }, ZERO_STATS)).toEqual({ done: true, progress: 1, goal: 1 });
  });

  it('xpGainedLowestSkill/levelsGainedLowestSkill need a choice when candidates are tied', () => {
    const s = stats({ lowestSkillCandidates: ['Farming', 'Runecraft'], chosenLowestSkill: null });
    expect(checkTile({ type: 'xpGainedLowestSkill', threshold: 1000 }, s)).toEqual({
      done: false,
      progress: 0,
      goal: 1000,
      needsSkillChoice: true,
      skillChoices: ['Farming', 'Runecraft'],
    });
    expect(checkTile({ type: 'levelsGainedLowestSkill', threshold: 1 }, s)).toEqual({
      done: false,
      progress: 0,
      goal: 1,
      needsSkillChoice: true,
      skillChoices: ['Farming', 'Runecraft'],
    });
  });

  it('xpGainedLowestSkill/levelsGainedLowestSkill resolve directly with a single candidate', () => {
    const s = stats({
      lowestSkillCandidates: ['Farming'],
      skillXpGained: { Farming: 500 },
      skillLevelsGained: { Farming: 2 },
    });
    expect(checkTile({ type: 'xpGainedLowestSkill', threshold: 1000 }, s)).toEqual({
      done: false,
      progress: 500,
      goal: 1000,
      resolvedSkill: 'Farming',
    });
    expect(checkTile({ type: 'levelsGainedLowestSkill', threshold: 2 }, s)).toEqual({
      done: true,
      progress: 2,
      goal: 2,
      resolvedSkill: 'Farming',
    });
  });

  it('xpGainedLowestSkill resolves using a valid tie-break choice', () => {
    const s = stats({
      lowestSkillCandidates: ['Farming', 'Runecraft'],
      chosenLowestSkill: 'Runecraft',
      skillXpGained: { Runecraft: 1500 },
    });
    expect(checkTile({ type: 'xpGainedLowestSkill', threshold: 1000 }, s)).toEqual({
      done: true,
      progress: 1500,
      goal: 1000,
      resolvedSkill: 'Runecraft',
    });
  });

  it('ignores a stale tie-break choice no longer among the candidates', () => {
    const s = stats({ lowestSkillCandidates: ['Farming', 'Runecraft'], chosenLowestSkill: 'Mining' });
    expect(checkTile({ type: 'xpGainedLowestSkill', threshold: 1000 }, s).needsSkillChoice).toBe(true);
  });

  it('does not ask for a skill choice when there are zero candidates -- no baseline snapshot, not a tie', () => {
    const s = stats({ lowestSkillCandidates: [] });
    expect(checkTile({ type: 'xpGainedLowestSkill', threshold: 1000 }, s)).toEqual({ done: false, progress: 0, goal: 1000 });
    expect(checkTile({ type: 'levelsGainedLowestSkill', threshold: 1 }, s)).toEqual({ done: false, progress: 0, goal: 1 });
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

  it('formats bigDropsCount as a plain progress/goal drop count', () => {
    const cond: TileCondition = { type: 'bigDropsCount', dropValueThreshold: 1_000_000, threshold: 3 };
    const status = checkTile(cond, stats({ dropValues: [1_000_000, 5_000_000] }));
    expect(formatTileProgress(cond, status)).toBe('2/3 big drops');
  });

  it('formats bossKcGained/kcGained as a plain progress/goal KC count', () => {
    const total: TileCondition = { type: 'bossKcGained', threshold: 10 };
    expect(formatTileProgress(total, checkTile(total, stats({ bossKcGained: 5 })))).toBe('5 / 10 KC');
    const activity: TileCondition = { type: 'kcGained', activity: 'Zulrah', threshold: 4 };
    expect(formatTileProgress(activity, checkTile(activity, stats({ kcGainedByActivity: { Zulrah: 2 } })))).toBe('2 / 4 KC');
  });

  it('formats slayerTasksCompleted as a plain progress/goal task count', () => {
    const cond: TileCondition = { type: 'slayerTasksCompleted', threshold: 5 };
    expect(formatTileProgress(cond, checkTile(cond, stats({ slayerTasksCompleted: 3 })))).toBe('3 / 5 tasks');
  });

  it('formats every clue tier as a plain progress/goal clue count', () => {
    const cond: TileCondition = { type: 'hardCluesCompleted', threshold: 2 };
    expect(formatTileProgress(cond, checkTile(cond, stats({ hardCluesCompleted: 1 })))).toBe('1 / 2 clues');
  });

  it('formats collectionLogGained as a plain progress/goal item count', () => {
    const cond: TileCondition = { type: 'collectionLogGained', threshold: 3 };
    expect(formatTileProgress(cond, checkTile(cond, stats({ collectionLogGained: 1 })))).toBe('1 / 3 items');
  });

  it('formats gotrCompleted as a plain progress/goal rift count', () => {
    const cond: TileCondition = { type: 'gotrCompleted', threshold: 2 };
    expect(formatTileProgress(cond, checkTile(cond, stats({ gotrCompleted: 1 })))).toBe('1 / 2 rifts');
  });

  it('formats skillLevelGained/levelsGainedLowestSkill with goal-driven pluralization', () => {
    const multi: TileCondition = { type: 'skillLevelGained', skill: 'Attack', threshold: 3 };
    expect(formatTileProgress(multi, checkTile(multi, stats({ skillLevelsGained: { Attack: 1 } })))).toBe('1 / 3 levels');
    const single: TileCondition = { type: 'skillLevelGained', skill: 'Attack', threshold: 1 };
    expect(formatTileProgress(single, checkTile(single, stats({ skillLevelsGained: { Attack: 0 } })))).toBe('0 / 1 level');
  });

  it('formats petsObtained with goal-driven pluralization', () => {
    const cond: TileCondition = { type: 'petsObtained', threshold: 1 };
    expect(formatTileProgress(cond, checkTile(cond, stats({ petsObtained: 0 })))).toBe('0 / 1 pet');
  });

  it('formats itemCount as a plain progress/goal multiplier', () => {
    const cond: TileCondition = { type: 'itemCount', itemNames: ["Verac's flail"], setName: 'Barrows uniques', threshold: 3 };
    expect(formatTileProgress(cond, checkTile(cond, stats({ itemCounts: { "verac's flail": 1 } })))).toBe('1/3x');
  });

  it('formats maxDeaths as a plain progress/goal death count', () => {
    const cond: TileCondition = { type: 'maxDeaths', threshold: 5 };
    expect(formatTileProgress(cond, checkTile(cond, stats({ deathsInPeriod: 2 })))).toBe('2 / 5 deaths');
  });

  it('still returns null for condition types with no meaningful running count', () => {
    const singleDrop: TileCondition = { type: 'singleDropValue', threshold: 1_000_000 };
    expect(formatTileProgress(singleDrop, checkTile(singleDrop, stats({ biggestDropValue: 500_000 })))).toBeNull();
    expect(formatTileProgress({ type: 'freeSpace' }, checkTile({ type: 'freeSpace' }, ZERO_STATS))).toBeNull();
  });
});

describe('progressPercent', () => {
  it('returns null for singleDropValue, tbd, and freeSpace (no meaningful bar)', () => {
    const cond1: TileCondition = { type: 'singleDropValue', threshold: 1000 };
    expect(progressPercent(cond1, checkTile(cond1, stats({ biggestDropValue: 500 })))).toBeNull();
    const cond2: TileCondition = { type: 'tbd' };
    expect(progressPercent(cond2, checkTile(cond2, ZERO_STATS))).toBeNull();
    const cond3: TileCondition = { type: 'freeSpace' };
    expect(progressPercent(cond3, checkTile(cond3, ZERO_STATS))).toBeNull();
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

  it('returns null while a lowest-skill tie is unresolved, even though progress is 0', () => {
    const cond: TileCondition = { type: 'xpGainedLowestSkill', threshold: 1000 };
    const s = stats({ lowestSkillCandidates: ['Farming', 'Runecraft'] });
    expect(progressPercent(cond, checkTile(cond, s))).toBeNull();
  });

  it('is proportional once a lowest-skill tie resolves', () => {
    const cond: TileCondition = { type: 'xpGainedLowestSkill', threshold: 1000 };
    const s = stats({ lowestSkillCandidates: ['Farming'], skillXpGained: { Farming: 250 } });
    expect(progressPercent(cond, checkTile(cond, s))).toBe(25);
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

describe('tileTaskPhrase', () => {
  it('matches the exact phrasing examples given for Discord completion embeds', () => {
    expect(tileTaskPhrase({ type: 'kcGained', activity: 'Lunar Chests', threshold: 5 })).toBe('5 Lunar Chests KC');
    expect(tileTaskPhrase({ type: 'singleDropValue', threshold: 1_000_000 })).toBe('single drop worth 1M+ GP');
    expect(tileTaskPhrase({ type: 'hardCluesCompleted', threshold: 2 })).toBe('2 Hard clue scrolls');
    expect(tileTaskPhrase({ type: 'xpGained', threshold: 500_000 })).toBe('500,000 total XP');
    expect(tileTaskPhrase({ type: 'lootValueGained', threshold: 10_000_000 })).toBe('10M GP looted');
  });

  it('never starts with "a"/"the" -- singular skillLevelGained/petsObtained read as a count instead of an article', () => {
    expect(tileTaskPhrase({ type: 'skillLevelGained', skill: 'Attack', threshold: 1 })).toBe('1 Attack level');
    expect(tileTaskPhrase({ type: 'skillLevelGained', skill: 'Attack', threshold: 3 })).toBe('3 Attack levels');
    expect(tileTaskPhrase({ type: 'petsObtained', threshold: 1 })).toBe('1 pet');
    expect(tileTaskPhrase({ type: 'petsObtained', threshold: 2 })).toBe('2 pets');
  });

  it('itemSetCollected keeps the headline short -- no leading "the", no item-count detail', () => {
    const full: TileCondition = { type: 'itemSetCollected', itemNames: ['a', 'b'], setName: 'Barrows uniques', threshold: 2 };
    expect(tileTaskPhrase(full)).toBe('full Barrows uniques');
    const partial: TileCondition = { type: 'itemSetCollected', itemNames: ['a', 'b', 'c'], setName: 'Barrows uniques', threshold: 2 };
    expect(tileTaskPhrase(partial)).toBe('2 of the 3 items in Barrows uniques');
  });
});

describe('tileTaskDetail', () => {
  it('carries the item-count/"each counts once" context tileTaskPhrase leaves out', () => {
    const full: TileCondition = { type: 'itemSetCollected', itemNames: ['a', 'b'], setName: 'Barrows uniques', threshold: 2 };
    expect(tileTaskDetail(full)).toBe('2 items -- each one only counts once.');
    const partial: TileCondition = { type: 'itemSetCollected', itemNames: ['a', 'b', 'c'], setName: 'Barrows uniques', threshold: 2 };
    expect(tileTaskDetail(partial)).toBe('Each item only counts once toward this.');
  });

  it('is null for condition types whose phrase is already self-contained', () => {
    expect(tileTaskDetail({ type: 'xpGained', threshold: 500_000 })).toBeNull();
  });
});

describe('conditionNeedsBaseline', () => {
  it('is true for every hiscores-backed condition type', () => {
    const hiscoresBacked: TileCondition[] = [
      { type: 'xpGained', threshold: 1 },
      { type: 'skillXpGained', skill: 'Attack', threshold: 1 },
      { type: 'skillLevelGained', skill: 'Attack', threshold: 1 },
      { type: 'xpGainedLowestSkill', threshold: 1 },
      { type: 'levelsGainedLowestSkill', threshold: 1 },
      { type: 'cluesCompleted', threshold: 1 },
      { type: 'beginnerCluesCompleted', threshold: 1 },
      { type: 'easyCluesCompleted', threshold: 1 },
      { type: 'mediumCluesCompleted', threshold: 1 },
      { type: 'hardCluesCompleted', threshold: 1 },
      { type: 'eliteCluesCompleted', threshold: 1 },
      { type: 'masterCluesCompleted', threshold: 1 },
      { type: 'gotrCompleted', threshold: 1 },
    ];
    for (const cond of hiscoresBacked) expect(conditionNeedsBaseline(cond)).toBe(true);
  });

  it('is false for every Dink-event-driven condition type', () => {
    const dinkDriven: TileCondition[] = [
      { type: 'bossKcGained', threshold: 1 },
      { type: 'kcGained', activity: 'Zulrah', threshold: 1 },
      { type: 'slayerTasksCompleted', threshold: 1 },
      { type: 'lootValueGained', threshold: 1 },
      { type: 'singleDropValue', threshold: 1 },
      { type: 'bigDropsCount', dropValueThreshold: 100_000, threshold: 1 },
      { type: 'itemCount', itemNames: ['a'], setName: 'Set', threshold: 1 },
      { type: 'itemSetCollected', itemNames: ['a'], setName: 'Set', threshold: 1 },
      { type: 'collectionLogGained', threshold: 1 },
      { type: 'maxDeaths', threshold: 1 },
      { type: 'petsObtained', threshold: 1 },
      { type: 'freeSpace' },
      { type: 'tbd' },
    ];
    for (const cond of dinkDriven) expect(conditionNeedsBaseline(cond)).toBe(false);
  });
});
