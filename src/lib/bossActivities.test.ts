import { describe, expect, it } from 'vitest';
import { BOSS_ACTIVITIES, bossActivityIcon } from './bossActivities';

describe('BOSS_ACTIVITIES', () => {
  it('has no duplicate names', () => {
    const names = BOSS_ACTIVITIES.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every entry has a non-empty icon URL', () => {
    for (const b of BOSS_ACTIVITIES) {
      expect(b.icon).toMatch(/^https:\/\/oldschool\.runescape\.wiki\/images\//);
    }
  });
});

describe('bossActivityIcon', () => {
  it('resolves a catalog boss to its icon', () => {
    expect(bossActivityIcon('Scurrius')).toBe('https://oldschool.runescape.wiki/images/Scurry_(follower).png');
  });

  it("resolves a pet-less boss to its hand-picked icon", () => {
    expect(bossActivityIcon('Barrows Chests')).toBe("https://oldschool.runescape.wiki/images/Dharok's_platebody.png");
  });

  it('returns null for a name outside the catalog', () => {
    expect(bossActivityIcon('Barrows')).toBeNull();
    expect(bossActivityIcon('')).toBeNull();
  });
});
