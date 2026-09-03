import { describe, expect, it } from 'vitest';
import { computeHiscoresRecap, computeHiscoresRecapFromBaseline, type SnapshotRow } from './hiscoresRecap';

const WINDOW = { start: '2026-08-31', end: '2026-09-03' };

function snapshot(recorded_on: string, total_xp: number, overrides: Partial<SnapshotRow> = {}): SnapshotRow {
  return { recorded_on, total_xp, skills: {}, activities: {}, ...overrides };
}

describe('computeHiscoresRecap', () => {
  it('returns null with no snapshots at all', () => {
    expect(computeHiscoresRecap([], WINDOW)).toBeNull();
  });

  it('self-diffs against the "before" snapshot when there is no "after" to diff against, rather than returning null', () => {
    // A participant with exactly one snapshot ever, dated before the
    // window -- every delta is honestly 0 (nothing later to compare
    // against), but the result still exists.
    const recap = computeHiscoresRecap([snapshot('2026-08-31', 100)], WINDOW);
    expect(recap?.xpGained).toBe(0);
  });

  it('still resolves lowestSkillCandidates from a lone snapshot exactly on window.start (BACKLOG.md report: WheresMyGear, adventure-test)', () => {
    // Real production scenario: a participant's very first hiscores sync
    // landed on the challenge's own start date, so there's no earlier
    // snapshot to serve as "before" and no later one to serve as "after".
    // lowestSkillCandidates only ever needs "before", so it should still
    // resolve correctly even though xpGained can't mean anything yet.
    const lone = snapshot('2026-09-03', 0, {
      skills: { Attack: { level: 50, xp: 100_000 }, Prayer: { level: 30, xp: 5_000 } },
    });
    const recap = computeHiscoresRecap([lone], { start: '2026-09-03', end: '2026-09-12' });
    expect(recap?.lowestSkillCandidates).toEqual(['Prayer']);
    expect(recap?.xpGained).toBe(0);
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

  it('resolves a single unambiguous lowest-XP skill from the "before" baseline snapshot', () => {
    const before = snapshot('2026-08-30', 0, {
      skills: { Attack: { level: 50, xp: 100_000 }, Farming: { level: 1, xp: 0 } },
    });
    const after = snapshot('2026-09-01', 0, { skills: before.skills });
    expect(computeHiscoresRecap([before, after], WINDOW)?.lowestSkillCandidates).toEqual(['Farming']);
  });

  it('lists every skill tied for lowest XP in the baseline, sorted', () => {
    const before = snapshot('2026-08-30', 0, {
      skills: { Attack: { level: 50, xp: 100_000 }, Runecraft: { level: 1, xp: 0 }, Farming: { level: 1, xp: 0 } },
    });
    const after = snapshot('2026-09-01', 0, { skills: before.skills });
    expect(computeHiscoresRecap([before, after], WINDOW)?.lowestSkillCandidates).toEqual(['Farming', 'Runecraft']);
  });

  it('resolves lowest-skill candidates from the baseline, unaffected by gains during the window', () => {
    // Farming is lowest at baseline; even though it gains the most XP
    // during the window, the candidate list reflects the STARTING point,
    // not where things ended up.
    const before = snapshot('2026-08-30', 0, {
      skills: { Attack: { level: 50, xp: 100_000 }, Farming: { level: 1, xp: 0 } },
    });
    const after = snapshot('2026-09-01', 0, {
      skills: { Attack: { level: 50, xp: 100_000 }, Farming: { level: 30, xp: 500_000 } },
    });
    expect(computeHiscoresRecap([before, after], WINDOW)?.lowestSkillCandidates).toEqual(['Farming']);
  });
});

describe('computeHiscoresRecapFromBaseline', () => {
  it('diffs the baseline against the participant\'s single most recent snapshot', () => {
    const baseline = snapshot('2026-09-01', 1_000_000);
    const latest = snapshot('2026-09-03', 1_050_000);
    expect(computeHiscoresRecapFromBaseline(baseline, [latest])?.xpGained).toBe(50_000);
  });

  it('gives an accurate result for a same-day baseline-to-latest diff, unlike computeHiscoresRecap', () => {
    // Both snapshots share the SAME recorded_on date -- computeHiscoresRecap
    // has no strictly-later snapshot to use as "after", so it self-diffs
    // against "before" and reports 0 (technically non-null, but not the
    // real gain). The baseline was captured live at an exact instant
    // instead of a date, so a same-day resync gets the right answer.
    const baseline = snapshot('2026-09-01', 1_000_000);
    const laterSameDay = snapshot('2026-09-01', 1_010_000);
    expect(computeHiscoresRecap([baseline, laterSameDay], { start: '2026-09-01', end: '2026-09-01' })?.xpGained).toBe(0);
    expect(computeHiscoresRecapFromBaseline(baseline, [laterSameDay])?.xpGained).toBe(10_000);
  });

  it('picks the single most recent snapshot when more than one exists, ignoring order', () => {
    const baseline = snapshot('2026-08-31', 0);
    const middle = snapshot('2026-09-01', 100);
    const latest = snapshot('2026-09-03', 300);
    const recap = computeHiscoresRecapFromBaseline(baseline, [latest, middle]);
    expect(recap?.xpGained).toBe(300);
  });

  it('returns null when there are no snapshots to diff against at all', () => {
    expect(computeHiscoresRecapFromBaseline(snapshot('2026-09-01', 0), [])).toBeNull();
  });

  it('resolves lowest-skill candidates from the baseline, same as computeHiscoresRecap', () => {
    const baseline = snapshot('2026-08-31', 0, {
      skills: { Attack: { level: 50, xp: 100_000 }, Farming: { level: 1, xp: 0 } },
    });
    const latest = snapshot('2026-09-01', 0, { skills: baseline.skills });
    expect(computeHiscoresRecapFromBaseline(baseline, [latest])?.lowestSkillCandidates).toEqual(['Farming']);
  });
});
