// Computes one participant's ParticipantStats (tileConditions.ts) from raw
// Dink-webhook event rows plus a hiscores recap (hiscoresRecap.ts, for the
// fields Dink can't drive directly -- xpGained, skillXpGained,
// skillLevelGained, every clue-scroll tier). Pure in-memory reduction, no
// SQL aggregation, mirroring rs's seasonalBingoStats.ts.
//
// Date-window filtering compares plain UTC calendar dates (created_at's
// date portion vs. the challenge's start/end date strings) -- simpler than
// rs's Eastern-timezone-aware dateInEastern, which was specific to that
// one friend group. Revisit if hosts in other timezones report boundary
// tiles completing a day early/late.
import type { ParticipantStats } from './tileConditions.js';
import type { HiscoresRecap } from './hiscoresRecap.js';

export interface RawParticipantData {
  bossKills: { boss: string; kc: number; created_at: string }[];
  slayerTasks: { created_at: string }[];
  lootDrops: {
    items: { name: string; quantity: number }[];
    total_value: number;
    created_at: string;
    // Optional so older callers/fixtures keep compiling -- absent/false
    // means an ordinary single-drop row. A bucketed row (is_misc: true,
    // from src/server/dinkWebhook.ts's increment_misc_loot) has a
    // total_value that's a SUM across many drops, not one drop's real
    // value -- max_single_value is the largest individual drop folded
    // into it, used in its place (see biggestDropValue below).
    is_misc?: boolean;
    max_single_value?: number | null;
  }[];
  deaths: { created_at: string }[];
  collectionLogEntries: { created_at: string }[];
  petObtains: { updated_at: string }[];
}

export interface DateWindow {
  start: string; // "YYYY-MM-DD", inclusive
  end: string; // "YYYY-MM-DD", inclusive
}

function inWindow(isoTimestamp: string, window: DateWindow): boolean {
  const date = isoTimestamp.slice(0, 10);
  return date >= window.start && date <= window.end;
}

// KC gained in the window, per boss: Dink's KILL_COUNT notifier fires on
// every kill with the account's current lifetime KC, so this is the latest
// KC at/before the window's end minus the latest KC strictly before the
// window's start (defaulting to 0 if there's no earlier event) -- a diff
// entirely from stored events, no hiscores polling needed.
function kcGainedByBoss(bossKills: RawParticipantData['bossKills'], window: DateWindow): Record<string, number> {
  const byBoss = new Map<string, RawParticipantData['bossKills']>();
  for (const kill of bossKills) {
    const list = byBoss.get(kill.boss) ?? [];
    list.push(kill);
    byBoss.set(kill.boss, list);
  }

  const result: Record<string, number> = {};
  for (const [boss, events] of byBoss) {
    const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const beforeStart = sorted.filter((e) => e.created_at.slice(0, 10) < window.start);
    const atOrBeforeEnd = sorted.filter((e) => e.created_at.slice(0, 10) <= window.end);
    const kcBefore = beforeStart.length > 0 ? beforeStart[beforeStart.length - 1].kc : 0;
    const kcAtEnd = atOrBeforeEnd.length > 0 ? atOrBeforeEnd[atOrBeforeEnd.length - 1].kc : 0;
    const gained = Math.max(0, kcAtEnd - kcBefore);
    if (gained > 0) result[boss] = gained;
  }
  return result;
}

export function computeParticipantStats(
  raw: RawParticipantData,
  window: DateWindow,
  hiscoresRecap: HiscoresRecap | null,
  // The participant's own tie-break pick from challenge_participants
  // (chosen_lowest_skill) -- only meaningful when lowestSkillCandidates
  // has more than one entry (see xpGainedLowestSkill/
  // levelsGainedLowestSkill in tileConditions.ts). null when they haven't
  // chosen yet, or their board has no lowest-skill tile to begin with.
  chosenLowestSkill: string | null = null,
): ParticipantStats {
  const lootInWindow = raw.lootDrops.filter((d) => inWindow(d.created_at, window));

  const itemCounts: Record<string, number> = {};
  for (const drop of lootInWindow) {
    for (const item of drop.items) {
      const key = item.name.toLowerCase();
      itemCounts[key] = (itemCounts[key] ?? 0) + item.quantity;
    }
  }

  const kcGainedByActivity = kcGainedByBoss(raw.bossKills, window);
  const bossKcGained = Object.values(kcGainedByActivity).reduce((sum, n) => sum + n, 0);

  return {
    xpGained: hiscoresRecap?.xpGained ?? 0,
    bossKcGained,
    kcGainedByActivity,
    slayerTasksCompleted: raw.slayerTasks.filter((t) => inWindow(t.created_at, window)).length,
    lootValueGained: lootInWindow.reduce((sum, d) => sum + d.total_value, 0),
    biggestDropValue: lootInWindow.reduce((max, d) => Math.max(max, d.is_misc ? (d.max_single_value ?? 0) : d.total_value), 0),
    cluesCompleted: hiscoresRecap?.cluesCompleted ?? 0,
    beginnerCluesCompleted: hiscoresRecap?.beginnerCluesCompleted ?? 0,
    easyCluesCompleted: hiscoresRecap?.easyCluesCompleted ?? 0,
    mediumCluesCompleted: hiscoresRecap?.mediumCluesCompleted ?? 0,
    hardCluesCompleted: hiscoresRecap?.hardCluesCompleted ?? 0,
    eliteCluesCompleted: hiscoresRecap?.eliteCluesCompleted ?? 0,
    masterCluesCompleted: hiscoresRecap?.masterCluesCompleted ?? 0,
    collectionLogGained: raw.collectionLogEntries.filter((e) => inWindow(e.created_at, window)).length,
    skillLevelsGained: hiscoresRecap?.skillLevelsGained ?? {},
    skillXpGained: hiscoresRecap?.skillXpGained ?? {},
    deathsInPeriod: raw.deaths.filter((d) => inWindow(d.created_at, window)).length,
    itemCounts,
    petsObtained: raw.petObtains.filter((p) => inWindow(p.updated_at, window)).length,
    dropValues: lootInWindow.filter((d) => !d.is_misc).map((d) => d.total_value),
    lowestSkillCandidates: hiscoresRecap?.lowestSkillCandidates ?? [],
    chosenLowestSkill,
  };
}
