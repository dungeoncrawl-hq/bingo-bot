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
});
