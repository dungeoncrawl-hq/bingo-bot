// Auto-detection engine for tile completion -- evaluates a tile's stored
// `condition` (see tiles.condition in supabase/schema.sql) against one
// participant's own stat gains within their challenge's date window. Ported
// from rs/src/lib/seasonalBingoConditions.ts (SeasonalTileCondition ->
// TileCondition; "seasonal" was rs-specific framing for its one hardcoded
// board, dropped here since tiles are host-defined data now).
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
  // (e.g. the 24 Barrows equipment pieces) -- itemNames matched
  // case-insensitively against loot item names. setName is a human-readable
  // name for that set, used only by describeTileCondition below (the
  // tile's own on-board label handles the item names themselves).
  | { type: 'itemCount'; itemNames: string[]; setName: string; threshold: number }
  // Inverted from every condition above: this tile starts complete (0
  // deaths is always "under the limit") and is LOST once deaths climb past
  // the threshold, rather than being earned by reaching one.
  | { type: 'maxDeaths'; threshold: number }
  // Any pet obtained during the event (threshold is usually 1) -- a
  // duplicate-pet ping doesn't count.
  | { type: 'petsObtained'; threshold: number }
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
}

export interface TileStatus {
  done: boolean;
  progress: number;
  goal: number;
  // Only meaningful for 'maxDeaths': true once a tile that started complete
  // has since been broken, so the UI can render that as a distinct "lost
  // it" state rather than an ordinary "not done yet".
  failed?: boolean;
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
    case 'maxDeaths': {
      const done = stats.deathsInPeriod <= cond.threshold;
      return { done, progress: stats.deathsInPeriod, goal: cond.threshold, failed: !done };
    }
    case 'petsObtained':
      return { done: stats.petsObtained >= cond.threshold, progress: stats.petsObtained, goal: cond.threshold };
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
    case 'maxDeaths':
      return `${cond.threshold.toLocaleString()} deaths or fewer`;
    case 'petsObtained':
      return cond.threshold > 1 ? `${cond.threshold} pets` : 'a pet';
    case 'tbd':
      return 'this task';
  }
}

// A short, tile-caption-sized rendering of just the goal number -- unlike
// describeTileCondition's full sentence, this is meant to sit directly
// under a tile's label on the board grid itself. null for 'tbd', which has
// no real goal to show.
export function formatTileGoal(cond: TileCondition): string | null {
  switch (cond.type) {
    case 'tbd':
      return null;
    case 'maxDeaths':
      return `≤${cond.threshold.toLocaleString()} deaths`;
    case 'xpGained':
    case 'skillXpGained':
      return `${cond.threshold.toLocaleString()} XP`;
    case 'skillLevelGained':
      return `${cond.threshold.toLocaleString()} level${cond.threshold === 1 ? '' : 's'}`;
    case 'bossKcGained':
    case 'kcGained':
      return `${cond.threshold.toLocaleString()} KC`;
    case 'slayerTasksCompleted':
      return `${cond.threshold.toLocaleString()} tasks`;
    case 'lootValueGained':
      return `${cond.threshold.toLocaleString()} gp`;
    case 'singleDropValue':
      return `${cond.threshold.toLocaleString()}+ gp`;
    case 'itemCount':
      return `${cond.threshold.toLocaleString()}x`;
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
  if (cond.type === 'singleDropValue' || cond.type === 'tbd') return null;
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
