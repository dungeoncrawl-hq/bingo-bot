import { describe, expect, it } from 'vitest';
import { isNotableLootItem, PRESET_ITEM_SETS } from './itemSets';

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
});
