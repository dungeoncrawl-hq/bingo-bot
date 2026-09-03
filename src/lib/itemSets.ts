// Preset item-name lists a host picks from for an itemCount/itemSetCollected
// tile -- the only way to populate one, no freeform typing (see
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
];

const NOTABLE_LOOT_ITEMS_LOWER = new Set(
  PRESET_ITEM_SETS.flatMap((set) => set.items).map((name) => name.toLowerCase()),
);

export function isNotableLootItem(name: string): boolean {
  return NOTABLE_LOOT_ITEMS_LOWER.has(name.toLowerCase());
}
