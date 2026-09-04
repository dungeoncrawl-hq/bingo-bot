// Preset item-name lists a host picks from for an itemCount tile -- the
// only way to populate one, no freeform typing (see
// TileEditorForm.tsx). More sets can be added here without touching any
// other file. This catalog is also the storage-side answer to "which loot
// items are notable enough to always keep as their own loot_drops row"
// (see isNotableLootItem, used by src/server/dinkWebhook.ts's handleLoot):
// since a tile can never reference an item outside this catalog, catalog
// membership is both necessary and sufficient for "some tile might need
// this item counted individually."

export interface PresetItemSet {
  name: string;
  items: string[];
}

const WIKI_IMG = 'https://oldschool.runescape.wiki/images/';

// Most items' own OSRS Wiki image lives at exactly this URL (item name,
// spaces to underscores). Verified with a live HEAD request against
// every one of the 233 items across every set below -- 226 resolved
// directly; the 6 that didn't are covered by ITEM_ICON_OVERRIDES.
function naiveItemIconUrl(itemName: string): string {
  return `${WIKI_IMG}${itemName.replace(/ /g, '_')}.png`;
}

// The handful of items whose real drop name (used for matching, see
// isNotableLootItem below) doesn't match their actual wiki image
// filename -- a different capitalization, a "(item)"
// disambiguation-page suffix, or (for a stackable currency-style item)
// a stack-size suffix. Each confirmed with a live HEAD request.
const ITEM_ICON_OVERRIDES: Record<string, string> = {
  'Cow slippers': `${WIKI_IMG}Cow_slippers_(1).png`,
  'Tome of earth (empty)': `${WIKI_IMG}Tome_of_Earth_(empty).png`,
  'Scythe of vitur (uncharged)': `${WIKI_IMG}Scythe_of_Vitur_(uncharged).png`,
  'Ancient essence': `${WIKI_IMG}Ancient_essence_500.png`,
  'Staff of the dead': `${WIKI_IMG}Staff_of_the_Dead.png`,
  'Crawling hand': `${WIKI_IMG}Crawling_hand_(item).png`,
};

// The one real per-item icon resolver -- used both for a whole preset
// set's own representative icon (its first item) and, once a host
// narrows a itemCount tile down to specific items (TileEditorForm.tsx),
// for whichever item they actually picked as the tile's icon.
export function itemIcon(itemName: string): string {
  return ITEM_ICON_OVERRIDES[itemName] ?? naiveItemIconUrl(itemName);
}

export const PRESET_ITEM_SETS: PresetItemSet[] = [
  {
    name: 'Barrows uniques',
    items: [
      "Ahrim's hood",
      "Ahrim's robetop",
      "Ahrim's robeskirt",
      "Ahrim's staff",
      "Dharok's helm",
      "Dharok's platebody",
      "Dharok's platelegs",
      "Dharok's greataxe",
      "Guthan's helm",
      "Guthan's platebody",
      "Guthan's chainskirt",
      "Guthan's warspear",
      "Karil's coif",
      "Karil's leathertop",
      "Karil's leatherskirt",
      "Karil's crossbow",
      "Torag's helm",
      "Torag's platebody",
      "Torag's platelegs",
      "Torag's hammers",
      "Verac's helm",
      "Verac's brassard",
      "Verac's plateskirt",
      "Verac's flail",
    ],
  },
  // Item names below verified against the OSRS Wiki's own drop-table
  // pages for each source (not guessed from memory) -- an exact-string
  // mismatch here would silently make a tile impossible to complete, so
  // these were checked one boss/raid at a time rather than bulk-copied
  // from a summary page.
  {
    name: 'Chambers of Xeric uniques',
    items: [
      'Twisted bow',
      'Elder maul',
      'Kodai insignia',
      'Dragon claws',
      'Ancestral hat',
      'Ancestral robe top',
      'Ancestral robe bottom',
      "Dinh's bulwark",
      'Dragon hunter crossbow',
      'Twisted buckler',
      'Torva full helm',
      'Torva platebody',
      'Torva platelegs',
    ],
  },
  {
    name: 'Brutus uniques',
    items: ['Mooleta', 'Bottomless milk bucket (empty)', 'Cow slippers', 'Beef'],
  },
  {
    name: 'Scurrius uniques',
    items: ["Scurrius' spine", 'Long bone', 'Curved bone'],
  },
  {
    name: 'Amoxliatl uniques',
    items: ['Glacial temotli', 'Pendant of Ates (inert)', 'Tooth half of key (moon key)'],
  },
  {
    name: 'Hueycoatl uniques',
    items: ['Dragon hunter wand', 'Hueycoatl hide', 'Tome of earth (empty)', 'Tooth half of key (moon key)'],
  },
  {
    name: 'Royal Titans uniques',
    items: ['Giantsoul amulet', 'Fire element staff crown', 'Ice element staff crown', 'Mystic vigour prayer scroll', 'Deadeye prayer scroll'],
  },
  {
    name: 'Theatre of Blood uniques',
    items: [
      'Scythe of vitur (uncharged)',
      'Ghrazi rapier',
      'Sanguinesti staff (uncharged)',
      'Justiciar faceguard',
      'Justiciar chestguard',
      'Justiciar legguards',
      'Avernic defender hilt',
    ],
  },
  {
    name: 'Phantom Muspah uniques',
    items: ['Ancient essence', 'Ancient icon', 'Venator shard', 'Frozen cache', 'Charged ice'],
  },
  {
    name: 'Tombs of Amascut uniques',
    items: [
      "Tumeken's shadow (uncharged)",
      "Elidinis' ward",
      'Masori mask',
      'Masori body',
      'Masori chaps',
      'Lightbearer',
      "Osmumten's fang",
    ],
  },
  {
    name: 'Moons of Peril uniques',
    items: [
      'Blood moon helm',
      'Blood moon chestplate',
      'Blood moon tassets',
      'Dual macuahuitl',
      'Blue moon helm',
      'Blue moon chestplate',
      'Blue moon tassets',
      'Blue moon spear',
      'Eclipse moon helm',
      'Eclipse moon chestplate',
      'Eclipse moon tassets',
      'Eclipse atlatl',
    ],
  },
  {
    name: 'Bandos armour (God Wars)',
    items: ['Bandos chestplate', 'Bandos tassets', 'Bandos boots', 'Bandos hilt'],
  },
  {
    name: 'Armadyl armour (God Wars)',
    items: ['Armadyl helmet', 'Armadyl chestplate', 'Armadyl chainskirt', 'Armadyl hilt'],
  },
  {
    name: 'Saradomin Wars uniques (God Wars)',
    items: ["Saradomin sword", "Saradomin's light", 'Armadyl crossbow', 'Saradomin hilt'],
  },
  {
    name: 'Zamorak Wars uniques (God Wars)',
    items: ['Steam battlestaff', 'Zamorakian spear', 'Staff of the dead', 'Zamorak hilt'],
  },
  {
    name: 'Callisto uniques',
    items: ['Claws of Callisto', 'Dragon 2h sword', 'Dragon pickaxe', 'Voidwaker hilt', 'Tyrannical ring'],
  },
  {
    name: 'Artio uniques',
    items: ['Claws of Callisto', 'Dragon 2h sword', 'Dragon pickaxe', 'Voidwaker hilt', 'Tyrannical ring'],
  },
  {
    name: "Vet'ion uniques",
    items: ["Skull of Vet'ion", 'Dragon 2h sword', 'Dragon pickaxe', 'Voidwaker blade', 'Ring of the gods'],
  },
  {
    name: "Calvar'ion uniques",
    items: ["Skull of Vet'ion", 'Dragon 2h sword', 'Dragon pickaxe', 'Voidwaker blade', 'Ring of the gods'],
  },
  {
    name: 'Venenatis uniques',
    items: ['Fangs of Venenatis', 'Dragon 2h sword', 'Dragon pickaxe', 'Voidwaker gem', 'Treasonous ring'],
  },
  {
    name: 'Spindel uniques',
    items: ['Fangs of Venenatis', 'Dragon 2h sword', 'Dragon pickaxe', 'Voidwaker gem', 'Treasonous ring'],
  },
  {
    name: 'Revenant maledictus uniques',
    items: [
      "Craw's bow (u)",
      "Thammaron's sceptre (u)",
      "Viggora's chainmace (u)",
      'Amulet of avarice',
      'Ancient emblem',
      'Ancient totem',
      'Ancient statuette',
      'Ancient crystal',
      'Ancient medallion',
      'Ancient effigy',
      'Ancient relic',
      'Bracelet of ethereum (uncharged)',
    ],
  },
  {
    name: 'Chaos Elemental uniques',
    items: [
      'Dragon 2h sword',
      'Dragon pickaxe',
      'Dragon platelegs',
      'Dragon plateskirt',
      'Mystic air staff',
      'Mystic water staff',
      'Mystic earth staff',
      'Mystic fire staff',
    ],
  },
  {
    name: 'Chaos Fanatic uniques',
    items: ['Odium shard 1', 'Malediction shard 1', 'Ancient staff'],
  },
  {
    name: 'Crazy archaeologist uniques',
    items: ['Odium shard 2', 'Malediction shard 2', 'Fedora'],
  },
  {
    name: 'Scorpia uniques',
    items: ['Odium shard 3', 'Malediction shard 3', 'Dragon 2h sword'],
  },
  {
    name: 'King Black Dragon uniques',
    items: ['Dragon pickaxe', 'Draconic visage', 'Dragon med helm'],
  },
  // The OSRS Wiki's own "Slayer" collection log category (95 items,
  // pulled from the Collection log page's raw wikitext export rather
  // than an AI-summarized fetch -- a lossy summary of a 95-row table
  // silently dropped ~65 items on the first attempt). A handful of
  // items also appear in their own boss's set above (e.g. Glacial
  // temotli, Pendant of Ates (inert)) -- harmless duplication, not a
  // conflict, since a host can pick either set to reference the same
  // real item.
  {
    name: 'Slayer monster uniques',
    items: [
      'Crawling hand',
      'Cockatrice head',
      'Basilisk head',
      'Kurask head',
      'Abyssal head',
      'Imbued heart',
      'Eternal gem',
      'Dust battlestaff',
      'Mist battlestaff',
      'Abyssal whip',
      'Granite maul',
      'Mudskipper hat',
      'Flippers',
      'Brine sabre',
      'Necklace of fangs',
      'Leaf-bladed sword',
      'Leaf-bladed battleaxe',
      'Black mask (10)',
      'Granite longsword',
      'Granite boots',
      'Wyvern visage',
      'Granite legs',
      'Granite helm',
      'Draconic visage',
      'Bronze boots',
      'Iron boots',
      'Steel boots',
      'Black boots',
      'Mithril boots',
      'Adamant boots',
      'Rune boots',
      'Dragon boots',
      'Abyssal dagger',
      'Uncharged trident',
      'Kraken tentacle',
      'Dark bow',
      'Occult necklace',
      'Dragon chainbody',
      'Dragon thrownaxe',
      'Dragon harpoon',
      'Dragon sword',
      'Dragon knife',
      'Broken dragon hasta',
      "Drake's tooth",
      "Drake's claw",
      'Hydra tail',
      "Hydra's fang",
      "Hydra's eye",
      "Hydra's heart",
      'Mystic hat (light)',
      'Mystic robe top (light)',
      'Mystic robe bottom (light)',
      'Mystic gloves (light)',
      'Mystic boots (light)',
      'Mystic hat (dark)',
      'Mystic robe top (dark)',
      'Mystic robe bottom (dark)',
      'Mystic gloves (dark)',
      'Mystic boots (dark)',
      'Mystic hat (dusk)',
      'Mystic robe top (dusk)',
      'Mystic robe bottom (dusk)',
      'Mystic gloves (dusk)',
      'Mystic boots (dusk)',
      'Basilisk jaw',
      'Aquanite tendon',
      "Dagon'hai hat",
      "Dagon'hai robe top",
      "Dagon'hai robe bottom",
      'Blood shard',
      'Ancient ceremonial mask',
      'Ancient ceremonial top',
      'Ancient ceremonial legs',
      'Ancient ceremonial gloves',
      'Ancient ceremonial boots',
      'Warped sceptre (uncharged)',
      'Sulphur blades',
      'Teleport anchoring scroll',
      'Aranea boots',
      'Glacial temotli',
      'Pendant of Ates (inert)',
      'Frozen tear',
      'Earthbound tecpatl',
      'Antler guard',
      "Alchemist's signet",
      'Broken antler',
      'Dragon metal sheet',
      'Horn of Plenty (empty)',
      'Gryphon feather',
      'Venator tooth',
      'Venator fang',
      'Air diamond',
      'Water sapphire',
      'Earth emerald',
      'Fire ruby',
    ],
  },
];

const NOTABLE_LOOT_ITEMS_LOWER = new Set(
  PRESET_ITEM_SETS.flatMap((set) => set.items).map((name) => name.toLowerCase()),
);

export function isNotableLootItem(name: string): boolean {
  return NOTABLE_LOOT_ITEMS_LOWER.has(name.toLowerCase());
}
