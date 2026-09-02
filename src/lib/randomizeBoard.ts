// Pure tile generator backing BACKLOG.md #5's "Randomize a board" --
// EditChallengePage.tsx calls this with the challenge's currently-empty
// grid slots and a fetched RandomizeSettings row, then bulk-inserts the
// result. No DB access here (settings are fetched by the caller), same
// separation as every other src/lib module.
import type { GridLayout } from '../db/types.js';
import type { TileCondition } from './tileConditions.js';
import { SKILL_ORDER, defaultIconFor, defaultLabelFor } from './tileIcons.js';
import { BOSS_ACTIVITIES } from './bossActivities.js';
import { PRESET_ITEM_SETS } from './itemSets.js';
import type { Difficulty, RandomizeSettings, ThresholdConditionType } from './randomizeSettings.js';

export interface GeneratedTile {
  layout: GridLayout;
  label: string;
  icon: string | null;
  condition: TileCondition;
  points: number;
  first_completer_bonus: number;
}

interface RandomizeParams {
  emptySlots: GridLayout[];
  // Conditions already on the board (host-placed or from a prior
  // randomize pass) -- seeds the dedup set so a fresh fill never
  // duplicates a type+param combo that already exists.
  existingConditions: TileCondition[];
  difficulty: Difficulty;
  settings: RandomizeSettings;
  // Injectable for deterministic tests, same pattern as
  // src/server/discordBanter.ts's pick().
  rng?: () => number;
}

type RandomizableType = Exclude<TileCondition['type'], 'freeSpace' | 'tbd'>;

// Grouped the same way TileEditorForm.tsx's CONDITION_GROUPS presents them
// to a host -- picking the group first, then a type within it, keeps a
// generated board spread across categories instead of skewing toward
// whichever raw type happens to have the most variants (7 of the ~19 real
// types are clue-scroll tiers alone). Deliberately not importing
// TileEditorForm.tsx's own CONDITION_GROUPS -- that one carries UI display
// labels this module has no use for, so the ~6-group list is duplicated
// rather than sharing a differently-shaped structure.
const RANDOMIZABLE_CONDITION_GROUPS: RandomizableType[][] = [
  ['xpGained', 'skillXpGained', 'skillLevelGained', 'xpGainedLowestSkill', 'levelsGainedLowestSkill'],
  ['bossKcGained', 'kcGained', 'slayerTasksCompleted', 'maxDeaths'],
  ['lootValueGained', 'singleDropValue', 'bigDropsCount', 'itemCount', 'itemSetCollected'],
  ['cluesCompleted', 'beginnerCluesCompleted', 'easyCluesCompleted', 'mediumCluesCompleted', 'hardCluesCompleted', 'eliteCluesCompleted', 'masterCluesCompleted'],
  ['collectionLogGained'],
  ['petsObtained'],
];

// How many times a slot re-rolls before just accepting a duplicate
// type+param combo -- a real fallback, not theoretical: itemCount and
// itemSetCollected only ever have one possible param today, since
// PRESET_ITEM_SETS has exactly one entry.
const MAX_RETRIES_PER_SLOT = 40;

function pick<T>(pool: readonly T[], rng: () => number): T {
  return pool[Math.floor(rng() * pool.length)];
}

// Identifies a condition by its type plus whichever skill/boss/item-set
// parameter it's scoped to (or nothing, for a flat type) -- the unit
// "duplicate" is judged against.
function paramKeyFor(cond: TileCondition): string {
  switch (cond.type) {
    case 'kcGained':
      return `${cond.type}:${cond.activity}`;
    case 'skillLevelGained':
    case 'skillXpGained':
      return `${cond.type}:${cond.skill}`;
    case 'itemCount':
    case 'itemSetCollected':
      return `${cond.type}:${cond.setName}`;
    default:
      return cond.type;
  }
}

function thresholdFor(type: ThresholdConditionType, difficulty: Difficulty, settings: RandomizeSettings): number {
  return settings.thresholds[type][difficulty];
}

// One attempt at a condition for a given type -- may return null if this
// type needs a param but the catalog it draws from is empty (never true
// today, but PRESET_ITEM_SETS/BOSS_ACTIVITIES aren't guaranteed non-empty
// by their own types).
function buildCondition(type: RandomizableType, difficulty: Difficulty, settings: RandomizeSettings, rng: () => number): TileCondition | null {
  switch (type) {
    case 'kcGained': {
      if (BOSS_ACTIVITIES.length === 0) return null;
      const boss = pick(BOSS_ACTIVITIES, rng).name;
      const tier = settings.kcTiers.bossToTier[boss] ?? 'slow';
      return { type, activity: boss, threshold: settings.kcTiers.tierThresholds[tier][difficulty] };
    }
    case 'skillLevelGained':
    case 'skillXpGained':
      return { type, skill: pick(SKILL_ORDER, rng), threshold: thresholdFor(type, difficulty, settings) };
    case 'itemCount': {
      if (PRESET_ITEM_SETS.length === 0) return null;
      const set = pick(PRESET_ITEM_SETS, rng);
      return { type, itemNames: set.items, setName: set.name, threshold: thresholdFor(type, difficulty, settings) };
    }
    case 'itemSetCollected': {
      if (PRESET_ITEM_SETS.length === 0) return null;
      const set = pick(PRESET_ITEM_SETS, rng);
      const threshold = Math.max(1, Math.round((set.items.length * settings.itemSetCollectedPercent[difficulty]) / 100));
      return { type, itemNames: set.items, setName: set.name, threshold };
    }
    case 'bigDropsCount':
      return {
        type,
        dropValueThreshold: settings.bigDropsCountDropValueThreshold[difficulty],
        threshold: thresholdFor(type, difficulty, settings),
      };
    default:
      return { type, threshold: thresholdFor(type, difficulty, settings) };
  }
}

export function randomizeBoard({ emptySlots, existingConditions, difficulty, settings, rng = Math.random }: RandomizeParams): GeneratedTile[] {
  const used = new Set(existingConditions.map(paramKeyFor));
  const generated: GeneratedTile[] = [];

  for (const layout of emptySlots) {
    let condition: TileCondition | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES_PER_SLOT; attempt++) {
      const group = pick(RANDOMIZABLE_CONDITION_GROUPS, rng);
      const type = pick(group, rng);
      const candidate = buildCondition(type, difficulty, settings, rng);
      if (!candidate) continue;
      const key = paramKeyFor(candidate);
      if (!used.has(key) || attempt === MAX_RETRIES_PER_SLOT - 1) {
        condition = candidate;
        used.add(key);
        break;
      }
    }
    if (!condition) continue; // every attempt returned null -- catalogs empty, nothing to fill this slot with

    const skill = condition.type === 'skillLevelGained' || condition.type === 'skillXpGained' ? condition.skill : '';
    const activity = condition.type === 'kcGained' ? condition.activity : '';
    const setName = condition.type === 'itemCount' || condition.type === 'itemSetCollected' ? condition.setName : '';

    generated.push({
      layout,
      label: defaultLabelFor(condition.type, skill, activity, setName),
      icon: defaultIconFor(condition.type, skill, activity),
      condition,
      points: settings.pointsByDifficulty[difficulty],
      first_completer_bonus: 0,
    });
  }

  return generated;
}
