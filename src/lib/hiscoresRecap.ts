// Diffs two OSRS hiscores snapshots to compute the tile condition fields
// Dink can't drive directly (xpGained, skillXpGained, skillLevelGained, and
// every clue-scroll tier -- Dink has no continuous XP tracker or
// clue-completion notifier). Ported from rs's weeklyRecap.ts before/after
// snapshot-selection algorithm (verified this session against rs's actual
// source, not just its comments).
import { SKILL_ORDER } from './tileIcons.js';

export interface SnapshotRow {
  recorded_on: string; // "YYYY-MM-DD"
  total_xp: number;
  skills: Record<string, { level: number; xp: number }>;
  activities: Record<string, { rank: number; score: number }>;
}

export interface HiscoresRecap {
  xpGained: number;
  skillXpGained: Record<string, number>;
  skillLevelsGained: Record<string, number>;
  cluesCompleted: number;
  beginnerCluesCompleted: number;
  easyCluesCompleted: number;
  mediumCluesCompleted: number;
  hardCluesCompleted: number;
  eliteCluesCompleted: number;
  masterCluesCompleted: number;
  // Every skill tied for lowest XP in the `before` baseline snapshot (see
  // xpGainedLowestSkill/levelsGainedLowestSkill in tileConditions.ts) --
  // length 1 when there's a single unambiguous lowest skill, >1 on a
  // genuine tie (most commonly several untrained skills all sitting at 0
  // XP on a newer account). Sorted alphabetically for a stable order.
  lowestSkillCandidates: string[];
}

type ClueField =
  | 'cluesCompleted'
  | 'beginnerCluesCompleted'
  | 'easyCluesCompleted'
  | 'mediumCluesCompleted'
  | 'hardCluesCompleted'
  | 'eliteCluesCompleted'
  | 'masterCluesCompleted';

// Exact activity-name strings OSRS hiscores uses for each clue tier
// (confirmed against rs/src/lib/activities.ts's clueActivityName()).
const CLUE_TIER_ACTIVITY: Record<ClueField, string> = {
  cluesCompleted: 'Clue Scrolls (all)',
  beginnerCluesCompleted: 'Clue Scrolls (beginner)',
  easyCluesCompleted: 'Clue Scrolls (easy)',
  mediumCluesCompleted: 'Clue Scrolls (medium)',
  hardCluesCompleted: 'Clue Scrolls (hard)',
  eliteCluesCompleted: 'Clue Scrolls (elite)',
  masterCluesCompleted: 'Clue Scrolls (master)',
};

function activityScore(snapshot: SnapshotRow, activityName: string): number {
  return snapshot.activities[activityName]?.score ?? 0;
}

function resolveLowestSkillCandidates(snapshot: SnapshotRow): string[] {
  const entries = Object.entries(snapshot.skills);
  if (entries.length === 0) return [];
  const minXp = Math.min(...entries.map(([, s]) => s.xp));
  return entries
    .filter(([, s]) => s.xp === minXp)
    .map(([name]) => name)
    .sort();
}

export function computeHiscoresRecap(
  snapshots: SnapshotRow[],
  window: { start: string; end: string },
): HiscoresRecap | null {
  const sorted = [...snapshots].sort((a, b) => a.recorded_on.localeCompare(b.recorded_on));

  // "before" = the last snapshot strictly before window.start, falling
  // back to the earliest snapshot ever if none exists -- lets day-1
  // progress still show against a slightly-early baseline rather than
  // nothing, same as rs.
  const strictlyBefore = sorted.filter((s) => s.recorded_on < window.start);
  const before = strictlyBefore.length > 0 ? strictlyBefore[strictlyBefore.length - 1] : sorted[0];
  if (!before) return null;

  // "after" = the last snapshot strictly after `before`'s own date and
  // within the window's end.
  const afterCandidates = sorted.filter((s) => s.recorded_on > before.recorded_on && s.recorded_on <= window.end);
  const after = afterCandidates.length > 0 ? afterCandidates[afterCandidates.length - 1] : undefined;
  if (!after) return null;

  const xpGained = Math.max(0, after.total_xp - before.total_xp);

  const skillXpGained: Record<string, number> = {};
  const skillLevelsGained: Record<string, number> = {};
  for (const skill of SKILL_ORDER) {
    const beforeSkill = before.skills[skill];
    const afterSkill = after.skills[skill];
    if (!afterSkill) continue;
    const xpDelta = afterSkill.xp - (beforeSkill?.xp ?? 0);
    if (xpDelta > 0) skillXpGained[skill] = xpDelta;
    const levelDelta = afterSkill.level - (beforeSkill?.level ?? 1);
    if (levelDelta > 0) skillLevelsGained[skill] = levelDelta;
  }

  const clueDeltas = Object.fromEntries(
    (Object.entries(CLUE_TIER_ACTIVITY) as [ClueField, string][]).map(([field, activityName]) => [
      field,
      Math.max(0, activityScore(after, activityName) - activityScore(before, activityName)),
    ]),
  ) as Record<ClueField, number>;

  return {
    xpGained,
    skillXpGained,
    skillLevelsGained,
    ...clueDeltas,
    lowestSkillCandidates: resolveLowestSkillCandidates(before),
  };
}
