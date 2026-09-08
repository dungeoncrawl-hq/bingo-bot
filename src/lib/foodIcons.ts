// Food-themed profile icons (ProfileIconPicker.tsx/profileIcons.ts's "Food"
// group). Kept as its own small catalog rather than folded into
// itemSets.ts's PRESET_ITEM_SETS: that catalog also drives
// isNotableLootItem (src/server/dinkWebhook.ts's per-drop-row logging),
// and food is common, mundane loot that shouldn't get its own notable-
// drop row just for appearing here.
const WIKI = 'https://oldschool.runescape.wiki/images/';

export interface FoodIconEntry {
  name: string;
  icon: string;
}

// Every filename verified with a live HEAD request against the wiki.
// Roughly low- to high-tier fish/food, drinks last.
export const ALL_FOOD: FoodIconEntry[] = [
  { name: 'Potato', icon: `${WIKI}Potato.png` },
  { name: 'Shrimps', icon: `${WIKI}Shrimps.png` },
  { name: 'Trout', icon: `${WIKI}Trout.png` },
  { name: 'Cooked chicken', icon: `${WIKI}Cooked_chicken.png` },
  { name: 'Burnt meat', icon: `${WIKI}Burnt_meat.png` },
  { name: 'Lobster', icon: `${WIKI}Lobster.png` },
  { name: 'Swordfish', icon: `${WIKI}Swordfish.png` },
  { name: 'Monkfish', icon: `${WIKI}Monkfish.png` },
  { name: 'Shark', icon: `${WIKI}Shark.png` },
  { name: 'Anglerfish', icon: `${WIKI}Anglerfish.png` },
  { name: 'Cooked karambwan', icon: `${WIKI}Cooked_karambwan.png` },
  { name: 'Cake', icon: `${WIKI}Cake.png` },
  { name: 'Pineapple pizza', icon: `${WIKI}Pineapple_pizza.png` },
  { name: 'Jug of wine', icon: `${WIKI}Jug_of_wine.png` },
  { name: 'Beer', icon: `${WIKI}Beer.png` },
];
