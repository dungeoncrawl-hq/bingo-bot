import { describe, expect, it } from 'vitest';
import { isNotableLootItem } from './itemSets';

describe('isNotableLootItem', () => {
  it('matches a catalog item case-insensitively', () => {
    expect(isNotableLootItem("Dharok's helm")).toBe(true);
    expect(isNotableLootItem("dharok's HELM")).toBe(true);
  });

  it('does not match an item outside every catalog set', () => {
    expect(isNotableLootItem('Bones')).toBe(false);
    expect(isNotableLootItem('Grimy ranarr weed')).toBe(false);
  });

  it('does not match an empty string', () => {
    expect(isNotableLootItem('')).toBe(false);
  });
});
