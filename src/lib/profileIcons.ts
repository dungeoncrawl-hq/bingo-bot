// Every icon a player can pick as their own profile icon (ProfileIconPicker.tsx,
// used from AccountPage.tsx) -- mostly icon sets this app already has
// elsewhere for tile authoring, grouped the same way those already are
// (skills, bosses, item catalog sets, pets) rather than curating a
// separate image library just for this. Food (foodIcons.js) and Gear
// (gearIcons.js) are the exceptions -- purely cosmetic, so each is its
// own small catalog rather than reusing itemSets.ts's tile-authoring/
// notable-loot list.
import {
  skillIconUrl,
  SKILL_ORDER,
  COMBAT_ICON_URL,
  TOTAL_LEVEL_ICON_URL,
  COLLECTION_LOG_ICON_URL,
  CLUE_ICON_URL,
  BEGINNER_CLUE_ICON_URL,
  EASY_CLUE_ICON_URL,
  MEDIUM_CLUE_ICON_URL,
  HARD_CLUE_ICON_URL,
  ELITE_CLUE_ICON_URL,
  MASTER_CLUE_ICON_URL,
  COINS_ICON_URL,
  DEATH_ICON_URL,
  GOTR_ICON_URL,
} from './tileIcons.js';
import { BOSS_ACTIVITIES } from './bossActivities.js';
import { PRESET_ITEM_SETS, itemIcon } from './itemSets.js';
import { ALL_PETS, type PetCategory } from './petIcons.js';
import { ALL_FOOD } from './foodIcons.js';
import { ALL_GEAR } from './gearIcons.js';

export interface IconOption {
  name: string;
  icon: string;
}

export interface IconSubgroup {
  name: string;
  options: IconOption[];
}

export interface IconGroup {
  group: string;
  subgroups: IconSubgroup[];
}

const PET_CATEGORY_LABEL: Record<PetCategory, string> = {
  Boss: 'Boss pets',
  Skilling: 'Skilling pets',
  Other: 'Other pets',
};

function petSubgroups(): IconSubgroup[] {
  return (['Boss', 'Skilling', 'Other'] as const).map((category) => ({
    name: PET_CATEGORY_LABEL[category],
    options: ALL_PETS.filter((p) => p.category === category).map((p) => ({ name: p.name, icon: p.icon })),
  }));
}

export const PROFILE_ICON_GROUPS: IconGroup[] = [
  {
    group: 'Skills',
    subgroups: [{ name: 'Skills', options: SKILL_ORDER.map((s) => ({ name: s, icon: skillIconUrl(s) })) }],
  },
  {
    group: 'Bosses',
    subgroups: [{ name: 'Bosses', options: BOSS_ACTIVITIES.map((b) => ({ name: b.name, icon: b.icon })) }],
  },
  {
    group: 'Items',
    // One subgroup per catalog set, matching TileEditorForm.tsx's own
    // item-catalog dropdown -- a flat list across all ~28 sets at once
    // would be hundreds of icons deep with no way to narrow it down.
    subgroups: PRESET_ITEM_SETS.map((set) => ({
      name: set.name,
      options: set.items.map((item) => ({ name: item, icon: itemIcon(item) })),
    })),
  },
  {
    group: 'Clue Scrolls',
    subgroups: [
      {
        name: 'Clue Scrolls',
        options: [
          { name: 'Any tier', icon: CLUE_ICON_URL },
          { name: 'Beginner', icon: BEGINNER_CLUE_ICON_URL },
          { name: 'Easy', icon: EASY_CLUE_ICON_URL },
          { name: 'Medium', icon: MEDIUM_CLUE_ICON_URL },
          { name: 'Hard', icon: HARD_CLUE_ICON_URL },
          { name: 'Elite', icon: ELITE_CLUE_ICON_URL },
          { name: 'Master', icon: MASTER_CLUE_ICON_URL },
        ],
      },
    ],
  },
  {
    group: 'Pets',
    subgroups: petSubgroups(),
  },
  {
    group: 'Food',
    subgroups: [{ name: 'Food', options: ALL_FOOD.map((f) => ({ name: f.name, icon: f.icon })) }],
  },
  {
    group: 'Gear',
    subgroups: [{ name: 'Gear', options: ALL_GEAR.map((g) => ({ name: g.name, icon: g.icon })) }],
  },
  {
    group: 'Other',
    subgroups: [
      {
        name: 'Other',
        options: [
          { name: 'Combat', icon: COMBAT_ICON_URL },
          { name: 'Total Level', icon: TOTAL_LEVEL_ICON_URL },
          { name: 'Collection Log', icon: COLLECTION_LOG_ICON_URL },
          { name: 'Coins', icon: COINS_ICON_URL },
          { name: 'Skull (Death)', icon: DEATH_ICON_URL },
          { name: 'Guardians of the Rift', icon: GOTR_ICON_URL },
        ],
      },
    ],
  },
];

// Only allow an icon that's actually somewhere in the catalog above --
// used both by AccountPage.tsx (so a stray/removed URL never gets
// re-saved) and available for any future server-side check. Kept as a
// flat Set built once, not recomputed per call.
const VALID_ICON_URLS = new Set(
  PROFILE_ICON_GROUPS.flatMap((g) => g.subgroups.flatMap((sg) => sg.options.map((o) => o.icon))),
);

export function isValidProfileIcon(url: string): boolean {
  return VALID_ICON_URLS.has(url);
}
