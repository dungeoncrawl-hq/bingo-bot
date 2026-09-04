import { describe, expect, it } from 'vitest';
import { defaultLabelFor } from './tileIcons';

describe('defaultLabelFor', () => {
  it('itemCount uses the item\'s own name when exactly one is selected -- any/all mean the same thing for one item', () => {
    expect(defaultLabelFor('itemCount', '', '', 'any', undefined, ["Verac's flail"])).toBe("Verac's flail");
    expect(defaultLabelFor('itemCount', '', '', 'all', undefined, ["Verac's flail"])).toBe("Verac's flail");
  });

  it('itemCount falls back to the generic any/all text for more than one item', () => {
    expect(defaultLabelFor('itemCount', '', '', 'any', undefined, ["Verac's flail", "Verac's helm"])).toBe('Any Uniques from list');
    expect(defaultLabelFor('itemCount', '', '', 'all', undefined, ["Verac's flail", "Verac's helm"])).toBe('All Uniques from list');
  });

  it('itemCount falls back to the generic text when no item list is passed at all', () => {
    expect(defaultLabelFor('itemCount', '', '', 'any')).toBe('Any Uniques from list');
  });
});
