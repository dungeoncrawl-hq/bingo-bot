// Default icon URLs per TileCondition type, so a host doesn't have to hunt
// down a wiki image URL for every tile by hand. Ported from
// rs/src/lib/skillIcons.ts (same OSRS Wiki image host/convention).
import type { TileCondition } from './tileConditions';

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

// Closed pool of selectable icons -- hosts pick from this rather than
// pasting an arbitrary image URL, so tiles can't be used to hotlink/embed
// unrelated or inappropriate images.
export const PRESET_ICONS: { url: string; label: string }[] = [
  { url: TOTAL_LEVEL_ICON_URL, label: 'Total level / XP' },
  { url: COMBAT_ICON_URL, label: 'Combat / KC' },
  { url: COINS_ICON_URL, label: 'Coins / loot' },
  { url: CLUE_ICON_URL, label: 'Clue scroll (any)' },
  { url: BEGINNER_CLUE_ICON_URL, label: 'Beginner clue scroll' },
  { url: EASY_CLUE_ICON_URL, label: 'Easy clue scroll' },
  { url: MEDIUM_CLUE_ICON_URL, label: 'Medium clue scroll' },
  { url: HARD_CLUE_ICON_URL, label: 'Hard clue scroll' },
  { url: ELITE_CLUE_ICON_URL, label: 'Elite clue scroll' },
  { url: MASTER_CLUE_ICON_URL, label: 'Master clue scroll' },
  { url: COLLECTION_LOG_ICON_URL, label: 'Collection log' },
  { url: DEATH_ICON_URL, label: 'Deaths' },
  { url: PETS_ICON_URL, label: 'Pets' },
  ...SKILL_ORDER.map((s) => ({ url: skillIconUrl(s), label: s })),
];

// null means there's no sensible default (itemCount is host-specific by
// nature; tbd is a placeholder) -- the host picks one from PRESET_ICONS.
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
    case 'tbd':
      return null;
  }
}
