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
    name: 'Barrows equipment',
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
];

const NOTABLE_LOOT_ITEMS_LOWER = new Set(
  PRESET_ITEM_SETS.flatMap((set) => set.items).map((name) => name.toLowerCase()),
);

export function isNotableLootItem(name: string): boolean {
  return NOTABLE_LOOT_ITEMS_LOWER.has(name.toLowerCase());
}
