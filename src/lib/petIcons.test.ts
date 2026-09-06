import { describe, expect, it } from 'vitest';
import { ALL_PETS } from './petIcons';

describe('ALL_PETS', () => {
  it('every entry has a wiki icon URL', () => {
    for (const p of ALL_PETS) {
      expect(p.icon).toMatch(/^https:\/\/oldschool\.runescape\.wiki\/images\//);
    }
  });

  it('has no two entries pointing at the same icon -- reskinned boss pairs (Artio/Callisto etc.) must be deduped to one', () => {
    const icons = ALL_PETS.map((p) => p.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('has no duplicate names', () => {
    const names = ALL_PETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('derives a clean pet name from a boss pet\'s icon filename, not the boss name', () => {
    // Giant Mole's own pet is "Baby Mole", not "Giant Mole".
    expect(ALL_PETS.find((p) => p.name === 'Baby Mole')).toBeTruthy();
    expect(ALL_PETS.find((p) => p.name === 'Giant Mole')).toBeUndefined();
  });

  it('includes at least one entry in every category', () => {
    for (const category of ['Boss', 'Skilling', 'Other'] as const) {
      expect(ALL_PETS.some((p) => p.category === category)).toBe(true);
    }
  });
});
