// Default icon URLs per TileCondition type, so a host doesn't have to hunt
// down a wiki image URL for every tile by hand. Ported from
// rs/src/lib/skillIcons.ts (same OSRS Wiki image host/convention).
import type { TileCondition } from './tileConditions.js';
import { bossActivityIcon } from './bossActivities.js';

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

// The label is entirely derived from the condition (and its skill/activity/
// item-catalog parameters) -- not a separate host-editable field in
// TileEditorForm.tsx, and reused as-is by randomizeBoard.ts's auto-generated
// tiles. Every branch is deterministic, so there's nothing for a host (or
// the randomizer) to choose here either.
export function defaultLabelFor(type: TileCondition['type'], skill: string, activity: string, setName: string): string {
  switch (type) {
    case 'xpGained':
      return 'Total XP';
    case 'skillXpGained':
      return `${skill} XP`;
    case 'skillLevelGained':
      return `${skill} Level`;
    case 'bossKcGained':
      return 'Boss KC';
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
      return 'Loot Value';
    case 'singleDropValue':
      return 'Big Drop';
    case 'bigDropsCount':
      return 'Big Drops';
    case 'itemCount':
    case 'itemSetCollected':
      return setName;
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
// skill, for the per-skill conditions, or activity, for kcGained). null for
// 'tbd' (a placeholder with nothing to depict) and 'freeSpace' (nothing to
// depict either).
export function defaultIconFor(type: TileCondition['type'], skill?: string, activity?: string): string | null {
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
    case 'itemSetCollected':
      return COLLECTION_LOG_ICON_URL;
    case 'freeSpace':
    case 'tbd':
      return null;
  }
}
