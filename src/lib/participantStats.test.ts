import { describe, expect, it } from 'vitest';
import { computeParticipantStats, type RawParticipantData } from './participantStats';
import type { HiscoresRecap } from './hiscoresRecap';

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
    };
    const s = computeParticipantStats(EMPTY_RAW, WINDOW, recap);
    expect(s.xpGained).toBe(50_000);
    expect(s.skillLevelsGained).toEqual({ Attack: 2 });
    expect(s.hardCluesCompleted).toBe(1);
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

  it('defaults KC-before to 0 when there is no event prior to the window (no baseline yet)', () => {
    const raw: RawParticipantData = {
      ...EMPTY_RAW,
      bossKills: [{ boss: 'Zulrah', kc: 3, created_at: '2026-09-01T00:00:00Z' }],
    };
    const s = computeParticipantStats(raw, WINDOW, null);
    expect(s.kcGainedByActivity.Zulrah).toBe(3);
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
        { boss: 'Vorkath', kc: 5, created_at: '2026-09-01T00:00:00Z' },
        { boss: 'Zulrah', kc: 3, created_at: '2026-09-01T00:00:00Z' },
      ],
    };
    expect(computeParticipantStats(raw, WINDOW, null).bossKcGained).toBe(8);
  });
});
