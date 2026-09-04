// Default icon URLs per TileCondition type, so a host doesn't have to hunt
// down a wiki image URL for every tile by hand. Ported from
// rs/src/lib/skillIcons.ts (same OSRS Wiki image host/convention).
import type { TileCondition } from './tileConditions.js';
import { bossActivityIcon } from './bossActivities.js';
import { itemIcon } from './itemSets.js';
import { formatCompactNumber } from './format.js';

// The OSRS Wiki hosts a small, stable icon asset at this URL pattern for
// every skill (verified against all 24 in SKILL_ORDER).
export function skillIconUrl(skill: string): string {
  return `https://oldschool.runescape.wiki/images/${encodeURIComponent(skill)}_icon.png`;
}

export const SKILL_ORDER = [
  'Attack', 'Defence', 'Strength', 'Hitpoints', 'Ranged', 'Prayer', 'Magic',
  'Cooking', 'Woodcutting', 'Fletching', 'Fishing', 'Firemaking', 'Crafting',
  'Smithing', 'Mining', 'Herblore', 'Agility', 'Thieving', 'Slayer',
  'Farming', 'Runecraft', 'Hunter', 'Construction', 'Sailing',
] as const;

const COMBAT_ICON_URL = 'https://oldschool.runescape.wiki/images/Combat_icon.png';
const TOTAL_LEVEL_ICON_URL = 'https://oldschool.runescape.wiki/images/Stats_icon.png';
const COLLECTION_LOG_ICON_URL = 'https://oldschool.runescape.wiki/images/Collection_log.png';
const CLUE_ICON_URL = 'https://oldschool.runescape.wiki/images/Clue_scroll.png';
const BEGINNER_CLUE_ICON_URL = 'https://oldschool.runescape.wiki/images/Clue_scroll_(beginner).png';
const EASY_CLUE_ICON_URL = 'https://oldschool.runescape.wiki/images/Clue_scroll_(easy).png';
const MEDIUM_CLUE_ICON_URL = 'https://oldschool.runescape.wiki/images/Clue_scroll_(medium).png';
const HARD_CLUE_ICON_URL = 'https://oldschool.runescape.wiki/images/Clue_scroll_(hard).png';
const ELITE_CLUE_ICON_URL = 'https://oldschool.runescape.wiki/images/Clue_scroll_(elite).png';
const MASTER_CLUE_ICON_URL = 'https://oldschool.runescape.wiki/images/Clue_scroll_(master).png';
const COINS_ICON_URL = 'https://oldschool.runescape.wiki/images/Coins_10000.png';
const DEATH_ICON_URL = 'https://oldschool.runescape.wiki/images/Items_kept_on_death.png';
// Baby Mole -- one of the most recognizable pets in OSRS, standing in for
// "a pet" generically since the wiki has no single generic pet icon.
const PETS_ICON_URL = 'https://oldschool.runescape.wiki/images/Baby_Mole.png';
const GOTR_ICON_URL = 'https://oldschool.runescape.wiki/images/Abyssal_lantern.png';

// The label is entirely derived from the condition (and its skill/activity/
// item-catalog/value-threshold parameters) -- not a separate host-editable
// field in TileEditorForm.tsx, and reused as-is by randomizeBoard.ts's
// auto-generated tiles. Every branch is deterministic, so there's nothing
// for a host (or the randomizer) to choose here either.
export function defaultLabelFor(
  type: TileCondition['type'],
  skill: string,
  activity: string,
  // Only meaningful for itemCount -- 'any'/omitted renders the same as
  // 'any' (its default), matching formFromCondition's own fallback.
  itemMode?: 'any' | 'all',
  // Only meaningful for bigDropsCount -- undefined only for a caller that
  // hasn't settled on one yet (there's no sensible default value to guess).
  dropValueThreshold?: number,
): string {
  switch (type) {
    case 'xpGained':
      return 'Total XP';
    case 'skillXpGained':
      return `${skill} XP`;
    case 'skillLevelGained':
      return `${skill} Level`;
    case 'bossKcGained':
      return 'Total Boss KC';
    case 'kcGained':
      // activity is always a catalog value once the dropdown below has
      // ever been touched -- the empty-string fallback only matters for a
      // tile saved before this catalog existed.
      return activity ? `${activity} KC` : 'Boss KC';
    case 'slayerTasksCompleted':
      return 'Slayer Tasks';
    case 'maxDeaths':
      return 'Max Deaths';
    case 'lootValueGained':
      return 'Total Loot';
    case 'singleDropValue':
      return 'Big Drop';
    case 'bigDropsCount':
      // The value bar itself lives in the label now (the goal caption
      // below just counts drops) -- undefined only for a tile still being
      // built in TileEditorForm.tsx before a threshold has been chosen.
      return dropValueThreshold != null ? `${formatCompactNumber(dropValueThreshold)}+ Drops` : 'Big Drops';
    case 'itemCount':
      // The specific catalog set (and its full item list) is still shown
      // in TileDetailModal/TileEditorForm -- the on-board label just says
      // how many of them are needed, which reads the same regardless of
      // which set a host picked.
      return itemMode === 'all' ? 'All Uniques from list' : 'Any Uniques from list';
    case 'cluesCompleted':
      return 'Clue Scrolls';
    case 'beginnerCluesCompleted':
      return 'Beginner Clues';
    case 'easyCluesCompleted':
      return 'Easy Clues';
    case 'mediumCluesCompleted':
      return 'Medium Clues';
    case 'hardCluesCompleted':
      return 'Hard Clues';
    case 'eliteCluesCompleted':
      return 'Elite Clues';
    case 'masterCluesCompleted':
      return 'Master Clues';
    case 'gotrCompleted':
      return 'Rifts Closed';
    case 'collectionLogGained':
      return 'Collection Log';
    case 'petsObtained':
      return 'Pet';
    case 'xpGainedLowestSkill':
      return 'Lowest Skill XP';
    case 'levelsGainedLowestSkill':
      return 'Lowest Skill Levels';
    case 'freeSpace':
      return 'Free Space';
    case 'tbd':
      return 'TBD';
  }
}

// Every condition maps to exactly one icon -- hosts can't pick their own
// (no hotlinking/embedding arbitrary images), and there's nothing left to
// choose: the icon is entirely determined by the condition itself (and its
// skill, for the per-skill conditions; activity, for kcGained; or
// itemNames, for itemCount -- itemNames[0]'s own icon, so a host who's
// narrowed a tile down to specific items (TileEditorForm.tsx) gets an
// icon from their actual selection, not just whichever item happens to
// lead the whole catalog set). null for 'tbd' (a placeholder with
// nothing to depict) and 'freeSpace' (nothing to depict either).
export function defaultIconFor(type: TileCondition['type'], skill?: string, activity?: string, itemNames?: string[]): string | null {
  switch (type) {
    case 'xpGained':
      return TOTAL_LEVEL_ICON_URL;
    case 'bossKcGained':
      // Sums every boss together -- no single boss to depict, unlike
      // kcGained below.
      return COMBAT_ICON_URL;
    case 'kcGained':
      // Falls back to the generic combat icon only for a stored tile whose
      // activity predates this catalog (or somehow isn't in it) -- every
      // value the dropdown in TileEditorForm.tsx can actually produce
      // resolves to a real icon.
      return (activity && bossActivityIcon(activity)) || COMBAT_ICON_URL;
    case 'slayerTasksCompleted':
      return skillIconUrl('Slayer');
    case 'lootValueGained':
    case 'singleDropValue':
    case 'bigDropsCount':
      return COINS_ICON_URL;
    case 'cluesCompleted':
      return CLUE_ICON_URL;
    case 'beginnerCluesCompleted':
      return BEGINNER_CLUE_ICON_URL;
    case 'easyCluesCompleted':
      return EASY_CLUE_ICON_URL;
    case 'mediumCluesCompleted':
      return MEDIUM_CLUE_ICON_URL;
    case 'hardCluesCompleted':
      return HARD_CLUE_ICON_URL;
    case 'eliteCluesCompleted':
      return ELITE_CLUE_ICON_URL;
    case 'masterCluesCompleted':
      return MASTER_CLUE_ICON_URL;
    case 'collectionLogGained':
      return COLLECTION_LOG_ICON_URL;
    case 'gotrCompleted':
      return GOTR_ICON_URL;
    case 'skillLevelGained':
    case 'skillXpGained':
      return skill ? skillIconUrl(skill) : null;
    case 'maxDeaths':
      return DEATH_ICON_URL;
    case 'petsObtained':
      return PETS_ICON_URL;
    // The lowest skill is resolved per participant, not fixed at
    // tile-creation time, so there's no one skill icon to show -- same
    // generic stats icon as xpGained.
    case 'xpGainedLowestSkill':
    case 'levelsGainedLowestSkill':
      return TOTAL_LEVEL_ICON_URL;
    case 'itemCount':
      // A real, recognizable unique -- whichever item is first in the
      // host's own selection. Falls back to the generic collection-log
      // book only for a stored tile with no items at all (shouldn't
      // happen once saved, but empty is possible mid-edit).
      return (itemNames && itemNames[0] && itemIcon(itemNames[0])) || COLLECTION_LOG_ICON_URL;
    case 'freeSpace':
    case 'tbd':
      return null;
  }
}
