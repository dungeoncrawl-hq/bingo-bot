// Default icon URLs per TileCondition type, so a host doesn't have to hunt
// down a wiki image URL for every tile by hand. Ported from
// rs/src/lib/skillIcons.ts (same OSRS Wiki image host/convention).
import type { TileCondition } from './tileConditions.js';

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

// Every condition maps to exactly one icon -- hosts can't pick their own
// (no hotlinking/embedding arbitrary images), and there's nothing left to
// choose: the icon is entirely determined by the condition itself (and its
// skill, for the per-skill conditions). null for 'tbd' (a placeholder with
// nothing to depict) and 'freeSpace' (nothing to depict either).
export function defaultIconFor(type: TileCondition['type'], skill?: string): string | null {
  switch (type) {
    case 'xpGained':
      return TOTAL_LEVEL_ICON_URL;
    case 'bossKcGained':
    case 'kcGained':
      return COMBAT_ICON_URL;
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
    case 'itemCount':
    case 'itemSetCollected':
      return COLLECTION_LOG_ICON_URL;
    case 'freeSpace':
    case 'tbd':
      return null;
  }
}
