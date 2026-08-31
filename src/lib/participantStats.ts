// Computes one participant's ParticipantStats (tileConditions.ts) from raw
// Dink-webhook event rows -- pure in-memory reduction, no SQL aggregation,
// mirroring rs's seasonalBingoStats.ts for the subset of fields that are
// event-driven (see the Milestone 3 plan for why xpGained/skillXpGained/
// skillLevelGained/cluesCompleted/hardCluesCompleted need hiscores polling
// instead and are zero-filled here, deferred to Milestone 4).
//
// Date-window filtering compares plain UTC calendar dates (created_at's
// date portion vs. the challenge's start/end date strings) -- simpler than
// rs's Eastern-timezone-aware dateInEastern, which was specific to that
// one friend group. Revisit if hosts in other timezones report boundary
// tiles completing a day early/late.
import type { ParticipantStats } from './tileConditions';

export interface RawParticipantData {
  bossKills: { boss: string; kc: number; created_at: string }[];
  slayerTasks: { created_at: string }[];
  lootDrops: { items: { name: string; quantity: number }[]; total_value: number; created_at: string }[];
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

export function computeParticipantStats(raw: RawParticipantData, window: DateWindow): ParticipantStats {
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
    xpGained: 0,
    bossKcGained,
    kcGainedByActivity,
    slayerTasksCompleted: raw.slayerTasks.filter((t) => inWindow(t.created_at, window)).length,
    lootValueGained: lootInWindow.reduce((sum, d) => sum + d.total_value, 0),
    biggestDropValue: lootInWindow.reduce((max, d) => Math.max(max, d.total_value), 0),
    cluesCompleted: 0,
    hardCluesCompleted: 0,
    collectionLogGained: raw.collectionLogEntries.filter((e) => inWindow(e.created_at, window)).length,
    skillLevelsGained: {},
    skillXpGained: {},
    deathsInPeriod: raw.deaths.filter((d) => inWindow(d.created_at, window)).length,
    itemCounts,
    petsObtained: raw.petObtains.filter((p) => inWindow(p.updated_at, window)).length,
  };
}
