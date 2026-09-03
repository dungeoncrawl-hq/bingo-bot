import { describe, expect, it } from 'vitest';
import { computeParticipantStats, poolStats, type RawParticipantData } from './participantStats';
import type { HiscoresRecap } from './hiscoresRecap';
import type { ParticipantStats } from './tileConditions';

const EMPTY_RAW: RawParticipantData = {
  bossKills: [],
  slayerTasks: [],
  lootDrops: [],
  deaths: [],
  collectionLogEntries: [],
  petObtains: [],
};

const WINDOW = { start: '2026-08-31', end: '2026-09-03' };

describe('computeParticipantStats', () => {
  it('zero-fills every hiscores-backed field when no recap exists yet', () => {
    const s = computeParticipantStats(EMPTY_RAW, WINDOW, null);
    expect(s.xpGained).toBe(0);
    expect(s.cluesCompleted).toBe(0);
    expect(s.skillLevelsGained).toEqual({});
    expect(s.skillXpGained).toEqual({});
  });

  it('passes through hiscores recap fields unchanged when present', () => {
    const recap: HiscoresRecap = {
      xpGained: 50_000,
      skillXpGained: { Attack: 50_000 },
      skillLevelsGained: { Attack: 2 },
      cluesCompleted: 5,
      beginnerCluesCompleted: 1,
      easyCluesCompleted: 2,
      mediumCluesCompleted: 1,
      hardCluesCompleted: 1,
      eliteCluesCompleted: 0,
      masterCluesCompleted: 0,
      lowestSkillCandidates: ['Farming'],
    };
    const s = computeParticipantStats(EMPTY_RAW, WINDOW, recap);
    expect(s.xpGained).toBe(50_000);
    expect(s.skillLevelsGained).toEqual({ Attack: 2 });
    expect(s.hardCluesCompleted).toBe(1);
    expect(s.lowestSkillCandidates).toEqual(['Farming']);
  });

  it('defaults lowestSkillCandidates to empty and chosenLowestSkill to null with no recap/choice', () => {
    const s = computeParticipantStats(EMPTY_RAW, WINDOW, null);
    expect(s.lowestSkillCandidates).toEqual([]);
    expect(s.chosenLowestSkill).toBeNull();
  });

  it('passes through the chosen tie-break skill unchanged', () => {
    const recap: HiscoresRecap = {
      xpGained: 0,
      skillXpGained: {},
      skillLevelsGained: {},
      cluesCompleted: 0,
      beginnerCluesCompleted: 0,
      easyCluesCompleted: 0,
      mediumCluesCompleted: 0,
      hardCluesCompleted: 0,
      eliteCluesCompleted: 0,
      masterCluesCompleted: 0,
      lowestSkillCandidates: ['Farming', 'Runecraft'],
    };
    const s = computeParticipantStats(EMPTY_RAW, WINDOW, recap, 'Runecraft');
    expect(s.chosenLowestSkill).toBe('Runecraft');
  });

  it('only counts events whose date falls inside the window', () => {
    const raw: RawParticipantData = {
      ...EMPTY_RAW,
      deaths: [
        { created_at: '2026-08-30T23:59:59Z' }, // before window
        { created_at: '2026-08-31T00:00:00Z' }, // window start, inclusive
        { created_at: '2026-09-03T23:59:59Z' }, // window end, inclusive
        { created_at: '2026-09-04T00:00:00Z' }, // after window
      ],
    };
    expect(computeParticipantStats(raw, WINDOW, null).deathsInPeriod).toBe(2);
  });

  it('accepts a full ISO timestamp as window.start for instant precision, not just a bare date (BACKLOG.md #4)', () => {
    const instantWindow = { start: '2026-09-01T14:00:00.000Z', end: WINDOW.end };
    const raw: RawParticipantData = {
      ...EMPTY_RAW,
      deaths: [
        { created_at: '2026-09-01T13:59:59.999Z' }, // 1ms before the boundary -- excluded
        { created_at: '2026-09-01T14:00:00.000Z' }, // exactly at the boundary -- included
        { created_at: '2026-09-01T14:00:00.001Z' }, // 1ms after -- included
      ],
    };
    expect(computeParticipantStats(raw, instantWindow, null).deathsInPeriod).toBe(2);
  });

  it('gives kcGainedByBoss the same instant precision via a full ISO timestamp window.start', () => {
    const instantWindow = { start: '2026-09-01T14:00:00.000Z', end: WINDOW.end };
    const raw: RawParticipantData = {
      ...EMPTY_RAW,
      bossKills: [
        { boss: 'Vorkath', kc: 10, created_at: '2026-09-01T13:59:59.999Z' }, // baseline, just before the boundary
        { boss: 'Vorkath', kc: 13, created_at: '2026-09-02T00:00:00.000Z' }, // 3 KC gained after
      ],
    };
    expect(computeParticipantStats(raw, instantWindow, null).kcGainedByActivity.Vorkath).toBe(3);
  });

  it('sums loot value and tracks the single biggest drop, in-window only', () => {
    const raw: RawParticipantData = {
      ...EMPTY_RAW,
      lootDrops: [
        { items: [], total_value: 1000, created_at: '2026-09-01T00:00:00Z' },
        { items: [], total_value: 5000, created_at: '2026-09-02T00:00:00Z' },
        { items: [], total_value: 999_999, created_at: '2026-08-01T00:00:00Z' }, // outside window
      ],
    };
    const s = computeParticipantStats(raw, WINDOW, null);
    expect(s.lootValueGained).toBe(6000);
    expect(s.biggestDropValue).toBe(5000);
  });

  it('uses max_single_value (not total_value) for a bucketed misc row, so it cannot masquerade as one huge single drop', () => {
    const raw: RawParticipantData = {
      ...EMPTY_RAW,
      lootDrops: [
        { items: [], total_value: 5000, created_at: '2026-09-01T00:00:00Z' },
        // A bucket row's total_value (50) is a SUM across many small
        // drops folded in over the day -- max_single_value (30) is the
        // largest individual drop actually in it.
        { items: [], total_value: 50, is_misc: true, max_single_value: 30, created_at: '2026-09-02T00:00:00Z' },
      ],
    };
    const s = computeParticipantStats(raw, WINDOW, null);
    expect(s.biggestDropValue).toBe(5000);
    expect(s.lootValueGained).toBe(5050);
    expect(s.dropValues).toEqual([5000]);
  });

  it('aggregates item quantities case-insensitively across drops', () => {
    const raw: RawParticipantData = {
      ...EMPTY_RAW,
      lootDrops: [
        { items: [{ name: "Dharok's helm", quantity: 1 }], total_value: 1, created_at: '2026-09-01T00:00:00Z' },
        { items: [{ name: "dharok's HELM", quantity: 1 }], total_value: 1, created_at: '2026-09-02T00:00:00Z' },
      ],
    };
    const s = computeParticipantStats(raw, WINDOW, null);
    expect(s.itemCounts["dharok's helm"]).toBe(2);
  });

  it('KC gained diffs the latest KC before the window against the latest at/before its end', () => {
    const raw: RawParticipantData = {
      ...EMPTY_RAW,
      bossKills: [
        { boss: 'Vorkath', kc: 10, created_at: '2026-08-20T00:00:00Z' }, // baseline before window
        { boss: 'Vorkath', kc: 15, created_at: '2026-09-01T00:00:00Z' }, // in window
        { boss: 'Vorkath', kc: 18, created_at: '2026-09-05T00:00:00Z' }, // after window end, ignored
      ],
    };
    const s = computeParticipantStats(raw, WINDOW, null);
    expect(s.kcGainedByActivity.Vorkath).toBe(5); // 15 - 10, not 18 - 10
    expect(s.bossKcGained).toBe(5);
  });

  it('treats the first in-window event as establishing the baseline, not full credit, when there is no event prior to the window', () => {
    const raw: RawParticipantData = {
      ...EMPTY_RAW,
      bossKills: [{ boss: 'Zulrah', kc: 3, created_at: '2026-09-01T00:00:00Z' }],
    };
    const s = computeParticipantStats(raw, WINDOW, null);
    expect(s.kcGainedByActivity.Zulrah).toBeUndefined();
    expect(s.bossKcGained).toBe(0);
  });

  it('counts real gains after that first in-window event establishes the baseline', () => {
    const raw: RawParticipantData = {
      ...EMPTY_RAW,
      bossKills: [
        { boss: 'Zulrah', kc: 3, created_at: '2026-09-01T00:00:00Z' }, // first ever -- baseline, no credit
        { boss: 'Zulrah', kc: 5, created_at: '2026-09-02T00:00:00Z' }, // 2 real kills after
      ],
    };
    const s = computeParticipantStats(raw, WINDOW, null);
    expect(s.kcGainedByActivity.Zulrah).toBe(2);
  });

  it('omits a boss from kcGainedByActivity entirely when gained is 0 (or negative)', () => {
    const raw: RawParticipantData = {
      ...EMPTY_RAW,
      bossKills: [
        { boss: 'Vorkath', kc: 10, created_at: '2026-08-20T00:00:00Z' },
        { boss: 'Vorkath', kc: 10, created_at: '2026-09-01T00:00:00Z' }, // no change
      ],
    };
    const s = computeParticipantStats(raw, WINDOW, null);
    expect(s.kcGainedByActivity.Vorkath).toBeUndefined();
    expect(s.bossKcGained).toBe(0);
  });

  it('sums KC gained across multiple bosses for bossKcGained', () => {
    const raw: RawParticipantData = {
      ...EMPTY_RAW,
      bossKills: [
        { boss: 'Vorkath', kc: 5, created_at: '2026-08-20T00:00:00Z' },
        { boss: 'Vorkath', kc: 10, created_at: '2026-09-01T00:00:00Z' },
        { boss: 'Zulrah', kc: 3, created_at: '2026-08-20T00:00:00Z' },
        { boss: 'Zulrah', kc: 6, created_at: '2026-09-01T00:00:00Z' },
      ],
    };
    expect(computeParticipantStats(raw, WINDOW, null).bossKcGained).toBe(8); // 5 + 3
  });
});

function stats(overrides: Partial<ParticipantStats> = {}): ParticipantStats {
  return {
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
    dropValues: [],
    lowestSkillCandidates: [],
    chosenLowestSkill: null,
    ...overrides,
  };
}

describe('poolStats', () => {
  it('sums numeric fields across every member of the pool', () => {
    const pooled = poolStats([
      stats({ xpGained: 100, bossKcGained: 2, slayerTasksCompleted: 1, deathsInPeriod: 1, petsObtained: 1 }),
      stats({ xpGained: 250, bossKcGained: 3, slayerTasksCompleted: 4, deathsInPeriod: 0, petsObtained: 0 }),
    ]);
    expect(pooled.xpGained).toBe(350);
    expect(pooled.bossKcGained).toBe(5);
    expect(pooled.slayerTasksCompleted).toBe(5);
    expect(pooled.deathsInPeriod).toBe(1);
    expect(pooled.petsObtained).toBe(1);
  });

  it('takes the max, not the sum, of biggestDropValue -- one biggest drop across the whole pool', () => {
    const pooled = poolStats([stats({ biggestDropValue: 2_000_000 }), stats({ biggestDropValue: 5_000_000 }), stats({ biggestDropValue: 100 })]);
    expect(pooled.biggestDropValue).toBe(5_000_000);
  });

  it('merges per-key maps, summing overlapping keys and keeping disjoint ones', () => {
    const pooled = poolStats([
      stats({ kcGainedByActivity: { Vorkath: 5, Zulrah: 2 } }),
      stats({ kcGainedByActivity: { Vorkath: 3 } }),
    ]);
    expect(pooled.kcGainedByActivity).toEqual({ Vorkath: 8, Zulrah: 2 });
  });

  it('concatenates dropValues rather than deduping or summing them', () => {
    const pooled = poolStats([stats({ dropValues: [1_000_000, 2_000_000] }), stats({ dropValues: [1_500_000] })]);
    expect(pooled.dropValues).toEqual([1_000_000, 2_000_000, 1_500_000]);
  });

  it('never surfaces a lowest-skill candidate or choice -- not a coherent pooled concept', () => {
    const pooled = poolStats([
      stats({ lowestSkillCandidates: ['Farming'], chosenLowestSkill: null }),
      stats({ lowestSkillCandidates: ['Runecraft', 'Hunter'], chosenLowestSkill: 'Hunter' }),
    ]);
    expect(pooled.lowestSkillCandidates).toEqual([]);
    expect(pooled.chosenLowestSkill).toBeNull();
  });
});
