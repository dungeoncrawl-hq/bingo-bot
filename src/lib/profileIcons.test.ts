import { describe, expect, it } from 'vitest';
import { PROFILE_ICON_GROUPS, isValidProfileIcon } from './profileIcons';

describe('PROFILE_ICON_GROUPS', () => {
  it('every group has at least one subgroup, and every subgroup has at least one option', () => {
    for (const group of PROFILE_ICON_GROUPS) {
      expect(group.subgroups.length).toBeGreaterThan(0);
      for (const subgroup of group.subgroups) {
        expect(subgroup.options.length).toBeGreaterThan(0);
      }
    }
  });

  it('every option has a wiki icon URL (the same domain schema.sql\'s CHECK enforces)', () => {
    for (const group of PROFILE_ICON_GROUPS) {
      for (const subgroup of group.subgroups) {
        for (const option of subgroup.options) {
          expect(option.icon).toMatch(/^https:\/\/oldschool\.runescape\.wiki\/images\//);
        }
      }
    }
  });

  it('has the expected top-level groups', () => {
    expect(PROFILE_ICON_GROUPS.map((g) => g.group)).toEqual(['Skills', 'Bosses', 'Items', 'Clue Scrolls', 'Pets', 'Other']);
  });

  it('Items has one subgroup per item-catalog set, and Pets has its 3 categories', () => {
    const items = PROFILE_ICON_GROUPS.find((g) => g.group === 'Items')!;
    expect(items.subgroups.length).toBeGreaterThan(20);
    const pets = PROFILE_ICON_GROUPS.find((g) => g.group === 'Pets')!;
    expect(pets.subgroups.map((sg) => sg.name)).toEqual(['Boss pets', 'Skilling pets', 'Other pets']);
  });
});

describe('isValidProfileIcon', () => {
  it('accepts an icon actually in the catalog', () => {
    const anyIcon = PROFILE_ICON_GROUPS[0].subgroups[0].options[0].icon;
    expect(isValidProfileIcon(anyIcon)).toBe(true);
  });

  it('rejects a URL not in the catalog, even from the same wiki domain', () => {
    expect(isValidProfileIcon('https://oldschool.runescape.wiki/images/Some_random_thing.png')).toBe(false);
  });

  it('rejects an arbitrary external URL', () => {
    expect(isValidProfileIcon('https://example.com/evil.png')).toBe(false);
  });
});
