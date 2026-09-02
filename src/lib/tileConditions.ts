// Auto-detection engine for tile completion -- evaluates a tile's stored
// `condition` (see tiles.condition in supabase/schema.sql) against one
// participant's own stat gains within their challenge's date window. Ported
// from rs/src/lib/seasonalBingoConditions.ts (SeasonalTileCondition ->
// TileCondition; "seasonal" was rs-specific framing for its one hardcoded
// board, dropped here since tiles are host-defined data now).
import { formatCompactNumber } from './format.js';

export type TileCondition =
  | { type: 'xpGained'; threshold: number }
  | { type: 'bossKcGained'; threshold: number }
  // KC gained on one specific boss/minigame during the event -- unlike
  // 'bossKcGained', which sums every boss together.
  | { type: 'kcGained'; activity: string; threshold: number }
  | { type: 'slayerTasksCompleted'; threshold: number }
  | { type: 'lootValueGained'; threshold: number }
  // The single biggest drop's own value, not a running total.
  | { type: 'singleDropValue'; threshold: number }
  // Any tier combined -- separate from the per-tier variants below, mirrors
  // how OSRS hiscores tracks "Clue Scrolls (all)" as its own stat alongside
  // each individual tier.
  | { type: 'cluesCompleted'; threshold: number }
  | { type: 'beginnerCluesCompleted'; threshold: number }
  | { type: 'easyCluesCompleted'; threshold: number }
  | { type: 'mediumCluesCompleted'; threshold: number }
  | { type: 'hardCluesCompleted'; threshold: number }
  | { type: 'eliteCluesCompleted'; threshold: number }
  | { type: 'masterCluesCompleted'; threshold: number }
  | { type: 'collectionLogGained'; threshold: number }
  // At least one level gained in a specific skill (threshold is usually 1).
  | { type: 'skillLevelGained'; skill: string; threshold: number }
  // XP gained in one specific skill during the event -- unlike 'xpGained',
  // which sums every skill together.
  | { type: 'skillXpGained'; skill: string; threshold: number }
  // Total quantity obtained across a named set of items during the event
  // (e.g. the 24 Barrows uniques) -- itemNames matched
  // case-insensitively against loot item names. setName is a human-readable
  // name for that set, used only by describeTileCondition below (the
  // tile's own on-board label handles the item names themselves).
  | { type: 'itemCount'; itemNames: string[]; setName: string; threshold: number }
  // A distinct condition from itemCount above: progress is how many of the
  // named items have been obtained at LEAST ONCE (each capped at 1 toward
  // progress -- duplicates don't help), not a running total. threshold is
  // usually itemNames.length ("collect the full set"), but a host can ask
  // for fewer ("any N of these M items").
  | { type: 'itemSetCollected'; itemNames: string[]; setName: string; threshold: number }
  // A drop counts if its own total_value clears dropValueThreshold (not a
  // running sum) -- e.g. "3 drops worth 1,000,000+ GP each". Distinct
  // from singleDropValue above (a boolean -- did any one drop clear a
  // bar): this counts how many separate times it happened, toward
  // threshold. dropValueThreshold has a 100,000 floor enforced by
  // TileEditorForm.tsx, so a host can't set it low enough to defeat
  // loot_drops bucketing (src/server/dinkWebhook.ts's handleLoot).
  | { type: 'bigDropsCount'; dropValueThreshold: number; threshold: number }
  // Inverted from every condition above: this tile starts complete (0
  // deaths is always "under the limit") and is LOST once deaths climb past
  // the threshold, rather than being earned by reaching one.
  | { type: 'maxDeaths'; threshold: number }
  // Any pet obtained during the event (threshold is usually 1) -- a
  // duplicate-pet ping doesn't count.
  | { type: 'petsObtained'; threshold: number }
  // XP gained in whichever skill was the participant's own lowest-XP skill
  // at their baseline snapshot (see ParticipantStats.lowestSkillCandidates
  // below) -- unlike skillXpGained, the skill isn't host-chosen and can be
  // different for every participant on the same tile. Ties (commonly
  // several untrained skills all at 0 XP) are resolved by the player
  // picking one of the tied skills, not automatically.
  | { type: 'xpGainedLowestSkill'; threshold: number }
  // Same per-participant lowest-skill resolution as xpGainedLowestSkill
  // above, tracking levels gained instead of XP gained.
  | { type: 'levelsGainedLowestSkill'; threshold: number }
  // Always complete for every participant, the moment checkTile ever runs
  // for them (typically right on joining -- see api/sync-participant.ts) --
  // no stats involved, nothing to earn. Points/first_completer_bonus are
  // forced to 0 for this type in TileEditorForm.tsx, so it never actually
  // affects the leaderboard; it exists purely to fill a grid slot for
  // line/board completion (see gridLines below).
  | { type: 'freeSpace' }
  // Placeholder for a slot whose real task hasn't been decided yet -- never
  // completes, rendered distinctly in the UI rather than as a real 0/0 goal.
  | { type: 'tbd' };

export interface ParticipantStats {
  xpGained: number;
  bossKcGained: number;
  kcGainedByActivity: Record<string, number>;
  slayerTasksCompleted: number;
  lootValueGained: number;
  biggestDropValue: number;
  cluesCompleted: number;
  beginnerCluesCompleted: number;
  easyCluesCompleted: number;
  mediumCluesCompleted: number;
  hardCluesCompleted: number;
  eliteCluesCompleted: number;
  masterCluesCompleted: number;
  collectionLogGained: number;
  skillLevelsGained: Record<string, number>;
  skillXpGained: Record<string, number>;
  deathsInPeriod: number;
  // Lowercased item name -> total quantity obtained during the event.
  itemCounts: Record<string, number>;
  petsObtained: number;
  // Every individual (non-bucketed) drop's own total_value in the
  // window -- backs bigDropsCount, which needs to count how many
  // separate drops cleared an arbitrary per-tile threshold, not just an
  // aggregate. A bucketed/misc loot_drops row's total_value is a sum
  // across many drops, not one drop's real value, so it's excluded here
  // (see participantStats.ts).
  dropValues: number[];
  // Every skill tied for lowest XP at this participant's baseline
  // snapshot (see hiscoresRecap.ts) -- backs xpGainedLowestSkill/
  // levelsGainedLowestSkill. Length 1 when unambiguous, >1 on a tie,
  // empty when there's no baseline snapshot yet at all.
  lowestSkillCandidates: string[];
  // The participant's own tie-break pick (challenge_participants.
  // chosen_lowest_skill), only meaningful when lowestSkillCandidates has
  // more than one entry. null if they haven't chosen (or there's nothing
  // to choose).
  chosenLowestSkill: string | null;
}

export interface TileStatus {
  done: boolean;
  progress: number;
  goal: number;
  // Only meaningful for 'maxDeaths': true once a tile that started complete
  // has since been broken, so the UI can render that as a distinct "lost
  // it" state rather than an ordinary "not done yet".
  failed?: boolean;
  // Only set for xpGainedLowestSkill/levelsGainedLowestSkill. true when
  // the participant has more than one skill tied for lowest and hasn't
  // picked one yet -- done is always false in this state regardless of
  // any stat, since there's no single skill to measure progress against.
  needsSkillChoice?: boolean;
  // The tied skill names to choose from, only present alongside
  // needsSkillChoice.
  skillChoices?: string[];
  // Only set for xpGainedLowestSkill/levelsGainedLowestSkill once a skill
  // is resolved (unambiguous, or chosen) -- which skill progress/goal
  // above are actually measuring, so the UI can show it (e.g. "(Mining)").
  resolvedSkill?: string;
}

// Which skill counts as "the lowest" for this participant right now: the
// single candidate if there's no tie, their stored tie-break choice if
// they've made one and it's still among the tied candidates (a stale
// choice from before the candidate set could theoretically change is
// treated as unresolved rather than trusted blindly), or null if it's
// still an unresolved tie.
function resolveLowestSkill(stats: ParticipantStats): string | null {
  const { lowestSkillCandidates, chosenLowestSkill } = stats;
  if (lowestSkillCandidates.length === 1) return lowestSkillCandidates[0];
  if (lowestSkillCandidates.length > 1 && chosenLowestSkill && lowestSkillCandidates.includes(chosenLowestSkill)) {
    return chosenLowestSkill;
  }
  return null;
}

export function checkTile(cond: TileCondition, stats: ParticipantStats): TileStatus {
  switch (cond.type) {
    case 'xpGained':
      return { done: stats.xpGained >= cond.threshold, progress: stats.xpGained, goal: cond.threshold };
    case 'bossKcGained':
      return { done: stats.bossKcGained >= cond.threshold, progress: stats.bossKcGained, goal: cond.threshold };
    case 'kcGained': {
      const progress = stats.kcGainedByActivity[cond.activity] ?? 0;
      return { done: progress >= cond.threshold, progress, goal: cond.threshold };
    }
    case 'slayerTasksCompleted':
      return {
        done: stats.slayerTasksCompleted >= cond.threshold,
        progress: stats.slayerTasksCompleted,
        goal: cond.threshold,
      };
    case 'lootValueGained':
      return { done: stats.lootValueGained >= cond.threshold, progress: stats.lootValueGained, goal: cond.threshold };
    case 'singleDropValue':
      return { done: stats.biggestDropValue >= cond.threshold, progress: stats.biggestDropValue, goal: cond.threshold };
    case 'cluesCompleted':
    case 'beginnerCluesCompleted':
    case 'easyCluesCompleted':
    case 'mediumCluesCompleted':
    case 'hardCluesCompleted':
    case 'eliteCluesCompleted':
    case 'masterCluesCompleted': {
      const progress = stats[cond.type];
      return { done: progress >= cond.threshold, progress, goal: cond.threshold };
    }
    case 'collectionLogGained':
      return {
        done: stats.collectionLogGained >= cond.threshold,
        progress: stats.collectionLogGained,
        goal: cond.threshold,
      };
    case 'skillLevelGained': {
      const progress = stats.skillLevelsGained[cond.skill] ?? 0;
      return { done: progress >= cond.threshold, progress, goal: cond.threshold };
    }
    case 'skillXpGained': {
      const progress = stats.skillXpGained[cond.skill] ?? 0;
      return { done: progress >= cond.threshold, progress, goal: cond.threshold };
    }
    case 'itemCount': {
      const progress = cond.itemNames.reduce((sum, name) => sum + (stats.itemCounts[name.toLowerCase()] ?? 0), 0);
      return { done: progress >= cond.threshold, progress, goal: cond.threshold };
    }
    case 'itemSetCollected': {
      const progress = cond.itemNames.filter((name) => (stats.itemCounts[name.toLowerCase()] ?? 0) > 0).length;
      return { done: progress >= cond.threshold, progress, goal: cond.threshold };
    }
    case 'bigDropsCount': {
      const progress = stats.dropValues.filter((v) => v >= cond.dropValueThreshold).length;
      return { done: progress >= cond.threshold, progress, goal: cond.threshold };
    }
    case 'maxDeaths': {
      const done = stats.deathsInPeriod <= cond.threshold;
      return { done, progress: stats.deathsInPeriod, goal: cond.threshold, failed: !done };
    }
    case 'petsObtained':
      return { done: stats.petsObtained >= cond.threshold, progress: stats.petsObtained, goal: cond.threshold };
    case 'xpGainedLowestSkill': {
      const skill = resolveLowestSkill(stats);
      if (skill) {
        const progress = stats.skillXpGained[skill] ?? 0;
        return { done: progress >= cond.threshold, progress, goal: cond.threshold, resolvedSkill: skill };
      }
      // A real tie (>1 candidate) needs the player to pick one -- no
      // baseline snapshot at all yet (0 candidates) is just "no progress
      // to show," same as any other condition with no data, not a choice
      // to prompt for.
      if (stats.lowestSkillCandidates.length > 1) {
        return { done: false, progress: 0, goal: cond.threshold, needsSkillChoice: true, skillChoices: stats.lowestSkillCandidates };
      }
      return { done: false, progress: 0, goal: cond.threshold };
    }
    case 'levelsGainedLowestSkill': {
      const skill = resolveLowestSkill(stats);
      if (skill) {
        const progress = stats.skillLevelsGained[skill] ?? 0;
        return { done: progress >= cond.threshold, progress, goal: cond.threshold, resolvedSkill: skill };
      }
      if (stats.lowestSkillCandidates.length > 1) {
        return { done: false, progress: 0, goal: cond.threshold, needsSkillChoice: true, skillChoices: stats.lowestSkillCandidates };
      }
      return { done: false, progress: 0, goal: cond.threshold };
    }
    case 'freeSpace':
      return { done: true, progress: 1, goal: 1 };
    case 'tbd':
      return { done: false, progress: 0, goal: 0 };
  }
}

// A full sentence-ready description of what a condition requires -- unlike
// a tile's own `label`, which is deliberately terse and relies on its icon
// for the rest of the meaning. Used where there's no icon to lean on, e.g.
// Discord completion announcements.
export function describeTileCondition(cond: TileCondition): string {
  switch (cond.type) {
    case 'xpGained':
      return `${cond.threshold.toLocaleString()} total XP`;
    case 'bossKcGained':
      return `${cond.threshold.toLocaleString()} total boss KC`;
    case 'kcGained':
      return `${cond.threshold.toLocaleString()} ${cond.activity} KC`;
    case 'slayerTasksCompleted':
      return `${cond.threshold.toLocaleString()} Slayer tasks`;
    case 'lootValueGained':
      return `${cond.threshold.toLocaleString()} GP looted`;
    case 'singleDropValue':
      return `a single drop worth ${cond.threshold.toLocaleString()}+ GP`;
    case 'cluesCompleted':
      return `${cond.threshold.toLocaleString()} clue scrolls`;
    case 'beginnerCluesCompleted':
      return `${cond.threshold.toLocaleString()} Beginner clue scrolls`;
    case 'easyCluesCompleted':
      return `${cond.threshold.toLocaleString()} Easy clue scrolls`;
    case 'mediumCluesCompleted':
      return `${cond.threshold.toLocaleString()} Medium clue scrolls`;
    case 'hardCluesCompleted':
      return `${cond.threshold.toLocaleString()} Hard clue scrolls`;
    case 'eliteCluesCompleted':
      return `${cond.threshold.toLocaleString()} Elite clue scrolls`;
    case 'masterCluesCompleted':
      return `${cond.threshold.toLocaleString()} Master clue scrolls`;
    case 'collectionLogGained':
      return `${cond.threshold.toLocaleString()} new collection log items`;
    case 'skillLevelGained':
      return cond.threshold > 1 ? `${cond.threshold} levels in ${cond.skill}` : `a level in ${cond.skill}`;
    case 'skillXpGained':
      return `${cond.threshold.toLocaleString()} ${cond.skill} XP`;
    case 'itemCount':
      return `${cond.threshold.toLocaleString()} ${cond.setName}`;
    case 'itemSetCollected':
      return cond.threshold >= cond.itemNames.length
        ? `the full ${cond.setName} set (${cond.itemNames.length} items, each counts once)`
        : `${cond.threshold} of the ${cond.itemNames.length} items in ${cond.setName} (each counts once)`;
    case 'bigDropsCount':
      return `${cond.threshold.toLocaleString()} drops worth ${cond.dropValueThreshold.toLocaleString()}+ GP each`;
    case 'maxDeaths':
      return `${cond.threshold.toLocaleString()} deaths or fewer`;
    case 'petsObtained':
      return cond.threshold > 1 ? `${cond.threshold} pets` : 'a pet';
    case 'xpGainedLowestSkill':
      return `${cond.threshold.toLocaleString()} XP in your lowest-level skill`;
    case 'levelsGainedLowestSkill':
      return cond.threshold > 1 ? `${cond.threshold} levels in your lowest-level skill` : 'a level in your lowest-level skill';
    case 'freeSpace':
      return 'a free space -- always complete';
    case 'tbd':
      return 'this task';
  }
}

// A bare noun-phrase (no leading article) describing what a condition
// requires -- sized to drop into "completed the {phrase} task" for
// Discord completion embeds (discordEmbeds.ts). Unlike describeTileCondition
// above (a standalone full sentence, e.g. "a single drop worth 1,000,000+
// GP"), this must never start with "a"/"the", or the surrounding sentence
// reads "the a ..."/"the the ...". Loot-value quantities use compact
// shorthand (formatCompactNumber) here specifically for a punchier read;
// every other quantity stays exact, matching describeTileCondition's own
// convention.
export function tileTaskPhrase(cond: TileCondition): string {
  switch (cond.type) {
    case 'xpGained':
      return `${cond.threshold.toLocaleString()} total XP`;
    case 'bossKcGained':
      return `${cond.threshold.toLocaleString()} total boss KC`;
    case 'kcGained':
      return `${cond.threshold.toLocaleString()} ${cond.activity} KC`;
    case 'slayerTasksCompleted':
      return `${cond.threshold.toLocaleString()} Slayer tasks`;
    case 'lootValueGained':
      return `${formatCompactNumber(cond.threshold)} GP looted`;
    case 'singleDropValue':
      return `single drop worth ${formatCompactNumber(cond.threshold)}+ GP`;
    case 'bigDropsCount':
      return `${cond.threshold.toLocaleString()} drops worth ${formatCompactNumber(cond.dropValueThreshold)}+ GP each`;
    case 'cluesCompleted':
      return `${cond.threshold.toLocaleString()} clue scrolls`;
    case 'beginnerCluesCompleted':
      return `${cond.threshold.toLocaleString()} Beginner clue scrolls`;
    case 'easyCluesCompleted':
      return `${cond.threshold.toLocaleString()} Easy clue scrolls`;
    case 'mediumCluesCompleted':
      return `${cond.threshold.toLocaleString()} Medium clue scrolls`;
    case 'hardCluesCompleted':
      return `${cond.threshold.toLocaleString()} Hard clue scrolls`;
    case 'eliteCluesCompleted':
      return `${cond.threshold.toLocaleString()} Elite clue scrolls`;
    case 'masterCluesCompleted':
      return `${cond.threshold.toLocaleString()} Master clue scrolls`;
    case 'collectionLogGained':
      return `${cond.threshold.toLocaleString()} new collection log items`;
    case 'skillLevelGained':
      return cond.threshold === 1 ? `1 ${cond.skill} level` : `${cond.threshold} ${cond.skill} levels`;
    case 'skillXpGained':
      return `${cond.threshold.toLocaleString()} ${cond.skill} XP`;
    case 'itemCount':
      return `${cond.threshold.toLocaleString()} ${cond.setName}`;
    case 'itemSetCollected':
      // Deliberately short -- the item-count/"each counts once" detail
      // lives in tileTaskDetail below instead, so this stays a clean,
      // headline-sized phrase.
      return cond.threshold >= cond.itemNames.length ? `full ${cond.setName}` : `${cond.threshold} of the ${cond.itemNames.length} items in ${cond.setName}`;
    case 'maxDeaths':
      return `${cond.threshold.toLocaleString()} deaths or fewer`;
    case 'petsObtained':
      return cond.threshold === 1 ? '1 pet' : `${cond.threshold} pets`;
    case 'xpGainedLowestSkill':
      return `${cond.threshold.toLocaleString()} XP in their lowest skill`;
    case 'levelsGainedLowestSkill':
      return cond.threshold === 1 ? '1 level in their lowest skill' : `${cond.threshold} levels in their lowest skill`;
    case 'freeSpace':
      // Unreachable in practice -- challengeProgress.ts never builds a
      // completion embed for a freeSpace tile (see its own comment).
      return 'free space';
    case 'tbd':
      // Unreachable in practice -- checkTile never marks a 'tbd' tile
      // done (see its own comment), so no completion embed is ever built
      // for one.
      return 'mystery';
  }
}

// Extra context that doesn't fit in tileTaskPhrase's headline-sized
// phrase -- appended as its own line in the Discord embed's description
// (discordEmbeds.ts), ahead of the "not as fast as"/"showing off" flavor
// line. null for every condition whose phrase is already fully
// self-contained.
export function tileTaskDetail(cond: TileCondition): string | null {
  switch (cond.type) {
    case 'itemSetCollected':
      return cond.threshold >= cond.itemNames.length
        ? `${cond.itemNames.length} items -- each one only counts once.`
        : 'Each item only counts once toward this.';
    default:
      return null;
  }
}

// A short, tile-caption-sized rendering of just the goal number -- unlike
// describeTileCondition's full sentence, this is meant to sit directly
// under a tile's label on the board grid itself. null for 'tbd', which has
// no real goal to show.
export function formatTileGoal(cond: TileCondition): string | null {
  switch (cond.type) {
    case 'tbd':
    case 'freeSpace':
      return null;
    case 'maxDeaths':
      return `≤${cond.threshold.toLocaleString()} deaths`;
    case 'xpGained':
    case 'skillXpGained':
    case 'xpGainedLowestSkill':
      return `${formatCompactNumber(cond.threshold)} XP`;
    case 'skillLevelGained':
    case 'levelsGainedLowestSkill':
      return `${cond.threshold.toLocaleString()} level${cond.threshold === 1 ? '' : 's'}`;
    case 'bossKcGained':
    case 'kcGained':
      return `${cond.threshold.toLocaleString()} KC`;
    case 'slayerTasksCompleted':
      return `${cond.threshold.toLocaleString()} tasks`;
    case 'lootValueGained':
      return `${formatCompactNumber(cond.threshold)} gp`;
    case 'singleDropValue':
      return `${formatCompactNumber(cond.threshold)}+ gp`;
    case 'itemCount':
      return `${cond.threshold.toLocaleString()}x`;
    case 'itemSetCollected':
      return `${cond.threshold.toLocaleString()}/${cond.itemNames.length} items`;
    case 'bigDropsCount':
      return `${cond.threshold.toLocaleString()}x ${formatCompactNumber(cond.dropValueThreshold)}+ gp`;
    case 'cluesCompleted':
    case 'beginnerCluesCompleted':
    case 'easyCluesCompleted':
    case 'mediumCluesCompleted':
    case 'hardCluesCompleted':
    case 'eliteCluesCompleted':
    case 'masterCluesCompleted':
      return `${cond.threshold.toLocaleString()} clues`;
    case 'collectionLogGained':
      return `${cond.threshold.toLocaleString()} items`;
    case 'petsObtained':
      return `${cond.threshold.toLocaleString()} pet${cond.threshold === 1 ? '' : 's'}`;
  }
}

// A compact "620K / 1.5M XP" caption combining current progress with the
// goal, replacing formatTileGoal's goal-only text for the condition types
// where the running total is large enough that shorthand actually helps
// (XP and loot value -- other types' numbers are small enough that a
// combined caption would just be clutter for no benefit). Current progress
// is always rounded down (formatCompactNumber's roundDown) so a tile never
// visually reads as having reached the threshold before it actually has.
// null for every other condition type -- callers should fall back to
// formatTileGoal in that case.
export function formatTileProgress(cond: TileCondition, status: TileStatus): string | null {
  switch (cond.type) {
    case 'xpGained':
    case 'skillXpGained':
    case 'xpGainedLowestSkill':
      return `${formatCompactNumber(status.progress, { roundDown: true })} / ${formatCompactNumber(cond.threshold)} XP`;
    case 'lootValueGained':
      return `${formatCompactNumber(status.progress, { roundDown: true })} / ${formatCompactNumber(cond.threshold)} gp`;
    case 'itemSetCollected':
      return `${status.progress}/${status.goal} items`;
    case 'bigDropsCount':
      return `${status.progress}/${status.goal} big drops`;
    default:
      return null;
  }
}

// A 0-100 fill percentage for the tile's progress bar on the board, or
// null when a bar wouldn't tell a meaningful story:
// - 'singleDropValue' is binary luck (one big drop either happened or it
//   didn't) rather than a running total worth visualizing.
// - 'tbd' has no real goal.
// maxDeaths is inverted -- it starts complete (full bar) and drains
// toward empty as deaths climb toward the limit, detected structurally
// via `failed !== undefined` (only maxDeaths sets it) rather than
// hardcoding the type, so any future start-complete/degrade-style
// condition gets this behavior automatically.
export function progressPercent(cond: TileCondition, status: TileStatus): number | null {
  if (cond.type === 'singleDropValue' || cond.type === 'tbd' || cond.type === 'freeSpace') return null;
  // Still waiting on the player to break a tie -- 0 progress here doesn't
  // mean "no progress," it means "nothing to measure yet."
  if (status.needsSkillChoice) return null;
  if (status.failed !== undefined) {
    if (status.goal <= 0) return null;
    return Math.max(0, Math.min(100, ((status.goal - status.progress) / status.goal) * 100));
  }
  if (status.goal <= 0) return null;
  return Math.max(0, Math.min(100, (status.progress / status.goal) * 100));
}

// Every row, every column, and both diagonals of an NxN grid -- a completed
// line is classic bingo scoring. Specific to board_type='grid5x5' (called
// with size=5); a future irregular board_type brings its own scoring
// function instead of generalizing this one.
export function gridLines(size: number): number[][] {
  return [
    ...Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => r * size + c)),
    ...Array.from({ length: size }, (_, c) => Array.from({ length: size }, (_, r) => r * size + c)),
    Array.from({ length: size }, (_, i) => i * size + i),
    Array.from({ length: size }, (_, i) => i * size + (size - 1 - i)),
  ];
}
