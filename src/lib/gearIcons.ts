// Gear-themed profile icons (ProfileIconPicker.tsx/profileIcons.ts's "Gear"
// group) -- weapons/armor/cosmetics a player can pick as their profile
// icon. Kept as its own small catalog rather than folded into
// itemSets.ts's PRESET_ITEM_SETS, same reasoning as foodIcons.ts: that
// catalog also drives isNotableLootItem (src/server/dinkWebhook.ts's
// per-drop-row logging) and tile authoring, neither of which this list is
// meant to affect just by being a pickable icon.
const WIKI = 'https://oldschool.runescape.wiki/images/';

export interface GearIconEntry {
  name: string;
  icon: string;
}

// Every filename verified with a live HEAD request against the wiki.
// Cow slippers needs an explicit override -- same _(1) suffix quirk
// itemSets.ts's own ITEM_ICON_OVERRIDES already documents for it, the
// naive name-to-filename convention (spaces to underscores) doesn't
// resolve on its own for this one item.
export const ALL_GEAR: GearIconEntry[] = [
  // Weapons
  { name: 'Dragon scimitar', icon: `${WIKI}Dragon_scimitar.png` },
  { name: 'Rune scimitar', icon: `${WIKI}Rune_scimitar.png` },
  { name: 'Dragon dagger(p++)', icon: `${WIKI}Dragon_dagger(p++).png` },
  { name: 'Abyssal whip', icon: `${WIKI}Abyssal_whip.png` },
  // Kiteshields -- plain, the two treasure-trail trim tiers, then the
  // full set of six treasure-trail "god" kiteshields (Gilded is its own
  // separate hard-clue reward, not god-themed).
  { name: 'Rune kiteshield', icon: `${WIKI}Rune_kiteshield.png` },
  { name: 'Rune kiteshield (t)', icon: `${WIKI}Rune_kiteshield_(t).png` },
  { name: 'Rune kiteshield (g)', icon: `${WIKI}Rune_kiteshield_(g).png` },
  { name: 'Gilded kiteshield', icon: `${WIKI}Gilded_kiteshield.png` },
  { name: 'Guthix kiteshield', icon: `${WIKI}Guthix_kiteshield.png` },
  { name: 'Saradomin kiteshield', icon: `${WIKI}Saradomin_kiteshield.png` },
  { name: 'Zamorak kiteshield', icon: `${WIKI}Zamorak_kiteshield.png` },
  { name: 'Armadyl kiteshield', icon: `${WIKI}Armadyl_kiteshield.png` },
  { name: 'Bandos kiteshield', icon: `${WIKI}Bandos_kiteshield.png` },
  { name: 'Ancient kiteshield', icon: `${WIKI}Ancient_kiteshield.png` },
  // Other armor/cosmetics
  { name: 'Slayer helmet (i)', icon: `${WIKI}Slayer_helmet_(i).png` },
  { name: 'Barrows gloves', icon: `${WIKI}Barrows_gloves.png` },
  { name: 'Fire cape', icon: `${WIKI}Fire_cape.png` },
  { name: 'Robin hood hat', icon: `${WIKI}Robin_hood_hat.png` },
  { name: 'Ranger boots', icon: `${WIKI}Ranger_boots.png` },
  { name: 'Cow slippers', icon: `${WIKI}Cow_slippers_(1).png` },
];
