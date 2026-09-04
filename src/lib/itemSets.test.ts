import { describe, expect, it } from 'vitest';
import { isNotableLootItem, itemIcon, PRESET_ITEM_SETS } from './itemSets';

describe('isNotableLootItem', () => {
  it('matches a catalog item case-insensitively', () => {
    expect(isNotableLootItem("Dharok's helm")).toBe(true);
    expect(isNotableLootItem("dharok's HELM")).toBe(true);
  });

  it('matches items from every raid/GWD set added alongside Barrows', () => {
    expect(isNotableLootItem('Twisted bow')).toBe(true);
    expect(isNotableLootItem('scythe of vitur (uncharged)')).toBe(true);
    expect(isNotableLootItem("Tumeken's Shadow (Uncharged)")).toBe(true);
    expect(isNotableLootItem('Bandos hilt')).toBe(true);
    expect(isNotableLootItem('Zamorak hilt')).toBe(true);
    expect(isNotableLootItem('dual macuahuitl')).toBe(true);
    expect(isNotableLootItem("Scurrius' spine")).toBe(true);
    expect(isNotableLootItem('Giantsoul amulet')).toBe(true);
    expect(isNotableLootItem('abyssal whip')).toBe(true);
    expect(isNotableLootItem('Black mask (10)')).toBe(true);
    expect(isNotableLootItem('Venator shard')).toBe(true);
    expect(isNotableLootItem('Claws of Callisto')).toBe(true);
    expect(isNotableLootItem("Skull of Vet'ion")).toBe(true);
    expect(isNotableLootItem('Fangs of Venenatis')).toBe(true);
    expect(isNotableLootItem("Craw's bow (u)")).toBe(true);
    expect(isNotableLootItem('Draconic visage')).toBe(true);
  });

  it('does not match an item outside every catalog set', () => {
    expect(isNotableLootItem('Bones')).toBe(false);
    expect(isNotableLootItem('Grimy ranarr weed')).toBe(false);
  });

  it('does not match an empty string', () => {
    expect(isNotableLootItem('')).toBe(false);
  });
});

describe('PRESET_ITEM_SETS', () => {
  it('has no duplicate set names', () => {
    const names = PRESET_ITEM_SETS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every set at least one item', () => {
    for (const set of PRESET_ITEM_SETS) expect(set.items.length).toBeGreaterThan(0);
  });

  it('has no duplicate items within any one set', () => {
    for (const set of PRESET_ITEM_SETS) {
      const lower = set.items.map((i) => i.toLowerCase());
      expect(new Set(lower).size).toBe(lower.length);
    }
  });

  it('has exactly 95 items in the Slayer monster uniques set, matching the OSRS Wiki collection log tab', () => {
    const set = PRESET_ITEM_SETS.find((s) => s.name === 'Slayer monster uniques');
    expect(set?.items.length).toBe(95);
  });

  it('includes all 12 requested Wilderness/misc bosses', () => {
    const names = PRESET_ITEM_SETS.map((s) => s.name);
    for (const boss of [
      'Callisto',
      "Vet'ion",
      'Venenatis',
      'Artio',
      "Calvar'ion",
      'Spindel',
      'Revenant maledictus',
      'Chaos Elemental',
      'Chaos Fanatic',
      'Crazy archaeologist',
      'Scorpia',
      'King Black Dragon',
    ]) {
      expect(names.some((n) => n.startsWith(boss))).toBe(true);
    }
  });
});

describe('itemIcon', () => {
  it('resolves a plain item name via the naive URL convention', () => {
    expect(itemIcon('Twisted bow')).toBe('https://oldschool.runescape.wiki/images/Twisted_bow.png');
  });

  it('resolves every item in the catalog to a well-formed URL', () => {
    for (const set of PRESET_ITEM_SETS) {
      for (const item of set.items) {
        expect(itemIcon(item)).toMatch(/^https:\/\/oldschool\.runescape\.wiki\/images\/.+\.png$/);
      }
    }
  });

  it('uses an override for items whose real drop name does not match their wiki image filename', () => {
    expect(itemIcon('Scythe of vitur (uncharged)')).toBe(
      'https://oldschool.runescape.wiki/images/Scythe_of_Vitur_(uncharged).png',
    );
    expect(itemIcon('Crawling hand')).toBe('https://oldschool.runescape.wiki/images/Crawling_hand_(item).png');
    expect(itemIcon('Ancient essence')).toBe('https://oldschool.runescape.wiki/images/Ancient_essence_500.png');
  });
});
