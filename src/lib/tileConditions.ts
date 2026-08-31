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
  | { type: 'cluesCompleted'; threshold: number }
  | { type: 'hardCluesCompleted'; threshold: number }
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
  hardCluesCompleted: number;
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
      return { done: stats.cluesCompleted >= cond.threshold, progress: stats.cluesCompleted, goal: cond.threshold };
    case 'hardCluesCompleted':
      return {
        done: stats.hardCluesCompleted >= cond.threshold,
        progress: stats.hardCluesCompleted,
        goal: cond.threshold,
      };
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
    case 'hardCluesCompleted':
      return `${cond.threshold.toLocaleString()} Hard clue scrolls`;
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
