import { describe, expect, it } from 'vitest';
import { randomizeBoard } from './randomizeBoard';
import { DEFAULT_RANDOMIZE_SETTINGS } from './randomizeSettings';
import { defaultIconFor, defaultLabelFor } from './tileIcons';
import { PRESET_ITEM_SETS } from './itemSets';
import type { GridLayout } from '../db/types';
import type { TileCondition } from './tileConditions';

// rng: () => 0 always picks index 0 of whatever pool it's consulted
// against (group, then type-within-group) -- deterministically lands on
// RANDOMIZABLE_CONDITION_GROUPS[0][0], 'xpGained', which needs no further
// param pick. Same pattern as discordBanter.test.ts's first/last.
const first = () => 0;
// Always picks the pool's LAST index -- RANDOMIZABLE_CONDITION_GROUPS'
// last group is Pets (a single, param-less entry), so this deterministically
// lands on petsObtained regardless of how many rng calls a slot makes.
const last = () => 0.999;

// A fixed sequence of values, consumed one per rng() call and cycling once
// exhausted -- lets a test aim at a specific (group, type[, param]) triple
// without depending on Math.random.
function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

// A tiny seeded PRNG (not Math.random) for tests that need real variety
// across many slots -- deterministic, so a failure reproduces exactly.
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function slots(n: number): GridLayout[] {
  return Array.from({ length: n }, (_, i) => ({ row: Math.floor(i / 5), col: i % 5 }));
}

function keyOf(cond: TileCondition): string {
  if (cond.type === 'kcGained') return `${cond.type}:${cond.activity}`;
  if (cond.type === 'skillLevelGained' || cond.type === 'skillXpGained') return `${cond.type}:${cond.skill}`;
  if (cond.type === 'itemCount' || cond.type === 'itemSetCollected') return `${cond.type}:${cond.setName}`;
  return cond.type;
}

describe('randomizeBoard', () => {
  it('fills exactly the requested empty slots, in the same layouts', () => {
    const target = slots(5);
    const result = randomizeBoard({
      emptySlots: target,
      existingConditions: [],
      difficulty: 'medium',
      settings: DEFAULT_RANDOMIZE_SETTINGS,
      rng: seededRng(1),
    });
    expect(result).toHaveLength(5);
    expect(result.map((r) => r.layout)).toEqual(target);
  });

  it('never produces a duplicate type+param combo across a full 25-tile board', () => {
    const result = randomizeBoard({
      emptySlots: slots(25),
      existingConditions: [],
      difficulty: 'medium',
      settings: DEFAULT_RANDOMIZE_SETTINGS,
      rng: seededRng(42),
    });
    const keys = result.map((r) => keyOf(r.condition));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('respects existingConditions already on the board when seeding the dedup set', () => {
    const existing: TileCondition[] = [{ type: 'petsObtained', threshold: 1 }];
    const result = randomizeBoard({
      emptySlots: slots(20),
      existingConditions: existing,
      difficulty: 'medium',
      settings: DEFAULT_RANDOMIZE_SETTINGS,
      rng: seededRng(7),
    });
    const keys = [...existing.map(keyOf), ...result.map((r) => keyOf(r.condition))];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('falls back to accepting a duplicate rather than dropping the slot once retries are exhausted', () => {
    // `last` deterministically lands on petsObtained every attempt (the
    // Pets group has exactly one, param-less entry) -- with that condition
    // already on the board, every retry collides, so this proves the slot
    // still gets filled instead of silently coming up empty.
    const existing: TileCondition[] = [{ type: 'petsObtained', threshold: 1 }];
    const result = randomizeBoard({
      emptySlots: slots(1),
      existingConditions: existing,
      difficulty: 'medium',
      settings: DEFAULT_RANDOMIZE_SETTINGS,
      rng: last,
    });
    expect(result).toHaveLength(1);
    expect(result[0].condition.type).toBe('petsObtained');
  });

  it("resolves every kcGained tile's threshold through its boss's farm-rate tier", () => {
    const result = randomizeBoard({
      emptySlots: slots(200),
      existingConditions: [],
      difficulty: 'hard',
      settings: DEFAULT_RANDOMIZE_SETTINGS,
      rng: seededRng(99),
    });
    const kcTiles = result.filter((r) => r.condition.type === 'kcGained') as (typeof result[number] & {
      condition: Extract<TileCondition, { type: 'kcGained' }>;
    })[];
    expect(kcTiles.length).toBeGreaterThan(0); // sanity: this seed/N actually exercises kcGained
    for (const tile of kcTiles) {
      const tier = DEFAULT_RANDOMIZE_SETTINGS.kcTiers.bossToTier[tile.condition.activity] ?? 'slow';
      expect(tile.condition.threshold).toBe(DEFAULT_RANDOMIZE_SETTINGS.kcTiers.tierThresholds[tier].hard);
    }
  });

  it("itemSetCollected's threshold is a rounded percentage of the preset's item count, per difficulty", () => {
    // group index 2 (Loot) -> type index 4 within it (itemSetCollected,
    // the last of 5 Loot entries) -> index 0 (Barrows uniques) of
    // PRESET_ITEM_SETS, pinned via rng()=0 so this stays deterministic
    // regardless of how many entries the catalog grows to.
    const rng = sequence([0.4, 0.9, 0]);
    const setSize = PRESET_ITEM_SETS[0].items.length;
    for (const [difficulty, percent] of Object.entries(DEFAULT_RANDOMIZE_SETTINGS.itemSetCollectedPercent) as [
      keyof typeof DEFAULT_RANDOMIZE_SETTINGS.itemSetCollectedPercent,
      number,
    ][]) {
      const result = randomizeBoard({
        emptySlots: slots(1),
        existingConditions: [],
        difficulty,
        settings: DEFAULT_RANDOMIZE_SETTINGS,
        rng,
      });
      expect(result[0].condition.type).toBe('itemSetCollected');
      expect((result[0].condition as Extract<TileCondition, { type: 'itemSetCollected' }>).threshold).toBe(
        Math.max(1, Math.round((setSize * percent) / 100)),
      );
    }
  });

  it('maxDeaths is inverted -- easy gets a higher (more forgiving) threshold than hard', () => {
    // group index 1 (Combat) -> type index 3 within it (maxDeaths, the
    // last of 4 Combat entries) -> no further param pick needed.
    const rng = sequence([0.2, 0.9]);
    const easy = randomizeBoard({ emptySlots: slots(1), existingConditions: [], difficulty: 'easy', settings: DEFAULT_RANDOMIZE_SETTINGS, rng });
    const hard = randomizeBoard({ emptySlots: slots(1), existingConditions: [], difficulty: 'hard', settings: DEFAULT_RANDOMIZE_SETTINGS, rng });
    const easyCond = easy[0].condition;
    const hardCond = hard[0].condition;
    if (easyCond.type !== 'maxDeaths' || hardCond.type !== 'maxDeaths') throw new Error('expected maxDeaths');
    expect(easyCond.threshold).toBeGreaterThan(hardCond.threshold);
  });

  it('points scale with difficulty and first_completer_bonus always starts at 0', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const result = randomizeBoard({
        emptySlots: slots(1),
        existingConditions: [],
        difficulty,
        settings: DEFAULT_RANDOMIZE_SETTINGS,
        rng: first,
      });
      expect(result[0].points).toBe(DEFAULT_RANDOMIZE_SETTINGS.pointsByDifficulty[difficulty]);
      expect(result[0].first_completer_bonus).toBe(0);
    }
  });

  it("a generated tile's label and icon match defaultLabelFor/defaultIconFor for its condition", () => {
    const result = randomizeBoard({
      emptySlots: slots(1),
      existingConditions: [],
      difficulty: 'medium',
      settings: DEFAULT_RANDOMIZE_SETTINGS,
      rng: first,
    });
    expect(result[0].condition.type).toBe('xpGained');
    expect(result[0].label).toBe(defaultLabelFor('xpGained', '', '', ''));
    expect(result[0].icon).toBe(defaultIconFor('xpGained'));
  });

  it('never generates a freeSpace or tbd tile', () => {
    const result = randomizeBoard({
      emptySlots: slots(25),
      existingConditions: [],
      difficulty: 'medium',
      settings: DEFAULT_RANDOMIZE_SETTINGS,
      rng: seededRng(123),
    });
    expect(result.some((r) => r.condition.type === 'freeSpace' || r.condition.type === 'tbd')).toBe(false);
  });
});
