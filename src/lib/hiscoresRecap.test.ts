import { describe, expect, it } from 'vitest';
import { computeHiscoresRecap, type SnapshotRow } from './hiscoresRecap';

const WINDOW = { start: '2026-08-31', end: '2026-09-03' };

function snapshot(recorded_on: string, total_xp: number, overrides: Partial<SnapshotRow> = {}): SnapshotRow {
  return { recorded_on, total_xp, skills: {}, activities: {}, ...overrides };
}

describe('computeHiscoresRecap', () => {
  it('returns null with no snapshots at all', () => {
    expect(computeHiscoresRecap([], WINDOW)).toBeNull();
  });

  it('returns null with only one snapshot ever (no "after" to diff against)', () => {
    expect(computeHiscoresRecap([snapshot('2026-08-31', 100)], WINDOW)).toBeNull();
  });

  it('diffs the last snapshot before the window against the last one within it', () => {
    const snapshots = [
      snapshot('2026-08-20', 1_000_000), // way before window, not used as "before" if a closer one exists
      snapshot('2026-08-30', 1_050_000), // last snapshot strictly before window.start -- this is "before"
      snapshot('2026-09-01', 1_075_000), // in window
      snapshot('2026-09-02', 1_090_000), // in window, latest -- this is "after"
      snapshot('2026-09-10', 5_000_000), // after window.end, ignored
    ];
    const recap = computeHiscoresRecap(snapshots, WINDOW);
    expect(recap?.xpGained).toBe(40_000); // 1,090,000 - 1,050,000
  });

  it('falls back to the earliest-ever snapshot when none exists before the window start', () => {
    // Participant joined mid-challenge -- their only snapshots are inside the window.
    const snapshots = [snapshot('2026-09-01', 100_000), snapshot('2026-09-03', 150_000)];
    const recap = computeHiscoresRecap(snapshots, WINDOW);
    expect(recap?.xpGained).toBe(50_000);
  });

  it('sorts unordered input before selecting before/after', () => {
    const snapshots = [snapshot('2026-09-02', 300), snapshot('2026-08-30', 100), snapshot('2026-09-01', 200)];
    const recap = computeHiscoresRecap(snapshots, WINDOW);
    expect(recap?.xpGained).toBe(200); // 300 - 100, not affected by array order
  });

  it('clamps xpGained to 0 rather than going negative', () => {
    const snapshots = [snapshot('2026-08-30', 500_000), snapshot('2026-09-01', 400_000)];
    expect(computeHiscoresRecap(snapshots, WINDOW)?.xpGained).toBe(0);
  });

  it('only records positive per-skill xp/level deltas, and treats a missing "before" skill as level 1 / 0 xp', () => {
    const before = snapshot('2026-08-30', 0, { skills: { Attack: { level: 50, xp: 100_000 } } });
    const after = snapshot('2026-09-01', 0, {
      skills: {
        Attack: { level: 52, xp: 150_000 }, // gained
        Hitpoints: { level: 40, xp: 80_000 }, // brand new this window (no "before" entry)
      },
    });
    const recap = computeHiscoresRecap([before, after], WINDOW);
    expect(recap?.skillXpGained.Attack).toBe(50_000);
    expect(recap?.skillLevelsGained.Attack).toBe(2);
    expect(recap?.skillXpGained.Hitpoints).toBe(80_000);
    expect(recap?.skillLevelsGained.Hitpoints).toBe(39); // 40 - 1 (default "before" level)
  });

  it('omits a skill from the gained maps entirely when there is no positive delta', () => {
    const before = snapshot('2026-08-30', 0, { skills: { Attack: { level: 50, xp: 100_000 } } });
    const after = snapshot('2026-09-01', 0, { skills: { Attack: { level: 50, xp: 100_000 } } });
    const recap = computeHiscoresRecap([before, after], WINDOW);
    expect(recap?.skillXpGained.Attack).toBeUndefined();
    expect(recap?.skillLevelsGained.Attack).toBeUndefined();
  });

  it('diffs each clue tier from its own hiscores activity name, independently', () => {
    const before = snapshot('2026-08-30', 0, {
      activities: {
        'Clue Scrolls (all)': { rank: 1, score: 10 },
        'Clue Scrolls (hard)': { rank: 1, score: 2 },
      },
    });
    const after = snapshot('2026-09-01', 0, {
      activities: {
        'Clue Scrolls (all)': { rank: 1, score: 15 },
        'Clue Scrolls (hard)': { rank: 1, score: 3 },
        'Clue Scrolls (easy)': { rank: 1, score: 1 }, // new this window, no "before" entry
      },
    });
    const recap = computeHiscoresRecap([before, after], WINDOW);
    expect(recap?.cluesCompleted).toBe(5);
    expect(recap?.hardCluesCompleted).toBe(1);
    expect(recap?.easyCluesCompleted).toBe(1);
    expect(recap?.mediumCluesCompleted).toBe(0);
  });
});
