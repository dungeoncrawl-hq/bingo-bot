// Preset item-name lists a host can load into an itemCount/itemSetCollected
// tile instead of typing every item by hand. More sets can be added here
// without touching any other file.

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
