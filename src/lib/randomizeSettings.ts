// Config for randomizeBoard.ts's tile generation -- deliberately just
// types + data, no logic, so this same constant doubles as both the
// migration's seed value (supabase/schema.sql's randomize_settings insert
// must match DEFAULT_RANDOMIZE_SETTINGS below exactly -- SQL can't import a
// TS constant, so keep the two in sync by hand) and the in-app fallback if
// that settings row is ever missing (e.g. migration not run yet).
//
// These are launch-day starting values, not carefully calibrated ones --
// BACKLOG.md #5's whole reason for a DB table instead of hardcoded
// constants is that they'll need real-world tuning after actual boards get
// built with them, via /dungeon-master-admin/randomize-settings.
import type { TileCondition } from './tileConditions.js';

export type Difficulty = 'easy' | 'medium' | 'hard';
export type KcTier = 'fast' | 'slow' | 'verySlow';

// Every non-placeholder TileCondition type except 'kcGained' (its own
// per-boss tier lookup below, since one flat KC number can't span 72 bosses
// of wildly different farm rates), 'itemSetCollected' (a percentage of
// the chosen item-set's size, not a flat number -- see
// itemSetCollectedPercent below, kept separate so it stays sane as more
// PRESET_ITEM_SETS entries get added beyond today's single one), and
// 'gotrCompleted' (deliberately left out of the auto-randomizer for now --
// a single-activity condition doesn't carry its own weight here the way a
// whole threshold tier does; a host can still add it by hand via
// TileEditorForm.tsx).
export type ThresholdConditionType = Exclude<TileCondition['type'], 'freeSpace' | 'tbd' | 'kcGained' | 'itemSetCollected' | 'gotrCompleted'>;

export interface RandomizeSettings {
  thresholds: Record<ThresholdConditionType, Record<Difficulty, number>>;
  itemSetCollectedPercent: Record<Difficulty, number>;
  bigDropsCountDropValueThreshold: Record<Difficulty, number>;
  kcTiers: {
    // Keys are BOSS_ACTIVITIES names (bossActivities.ts). A boss missing
    // from this map (e.g. added to the catalog after settings were last
    // saved) falls back to 'slow' in randomizeBoard.ts, not a crash.
    bossToTier: Record<string, KcTier>;
    tierThresholds: Record<KcTier, Record<Difficulty, number>>;
  };
  pointsByDifficulty: Record<Difficulty, number>;
}

export const DEFAULT_RANDOMIZE_SETTINGS: RandomizeSettings = {
  thresholds: {
    xpGained: { easy: 200_000, medium: 500_000, hard: 1_500_000 },
    bossKcGained: { easy: 20, medium: 50, hard: 150 },
    slayerTasksCompleted: { easy: 5, medium: 15, hard: 40 },
    lootValueGained: { easy: 1_000_000, medium: 5_000_000, hard: 20_000_000 },
    singleDropValue: { easy: 250_000, medium: 1_000_000, hard: 5_000_000 },
    cluesCompleted: { easy: 3, medium: 10, hard: 25 },
    beginnerCluesCompleted: { easy: 2, medium: 5, hard: 15 },
    easyCluesCompleted: { easy: 2, medium: 5, hard: 15 },
    mediumCluesCompleted: { easy: 2, medium: 5, hard: 12 },
    hardCluesCompleted: { easy: 1, medium: 3, hard: 8 },
    eliteCluesCompleted: { easy: 1, medium: 2, hard: 5 },
    masterCluesCompleted: { easy: 1, medium: 1, hard: 3 },
    collectionLogGained: { easy: 2, medium: 5, hard: 15 },
    skillLevelGained: { easy: 1, medium: 3, hard: 8 },
    skillXpGained: { easy: 100_000, medium: 300_000, hard: 1_000_000 },
    xpGainedLowestSkill: { easy: 100_000, medium: 300_000, hard: 1_000_000 },
    levelsGainedLowestSkill: { easy: 1, medium: 3, hard: 8 },
    // Not pinned down in BACKLOG.md #5's writeup (only itemSetCollected
    // was) -- gap-filled here consistent with the other loot-tier numbers.
    itemCount: { easy: 1, medium: 4, hard: 10 },
    bigDropsCount: { easy: 1, medium: 3, hard: 6 },
    // Inverted -- fewer deaths is harder. The inversion lives entirely in
    // these seed values (easy is numerically higher than hard), not in any
    // special-cased lookup code: randomizeBoard.ts reads this exactly the
    // same way as every other type.
    maxDeaths: { easy: 20, medium: 10, hard: 3 },
    petsObtained: { easy: 1, medium: 1, hard: 2 },
  },
  itemSetCollectedPercent: { easy: 25, medium: 50, hard: 100 },
  bigDropsCountDropValueThreshold: { easy: 1_000_000, medium: 1_000_000, hard: 2_000_000 },
  kcTiers: {
    tierThresholds: {
      fast: { easy: 10, medium: 30, hard: 75 },
      slow: { easy: 3, medium: 10, hard: 25 },
      verySlow: { easy: 1, medium: 2, hard: 5 },
    },
    // Best-effort classification by realistic farm rate, not a precise
    // simulation -- a host can always hand-edit a generated tile's
    // threshold after randomizing, same as any other auto-generated tile.
    // Every BOSS_ACTIVITIES entry (bossActivities.ts) is covered.
    bossToTier: {
      // fast -- GWD/DKs/wildy bosses/minigames/easily-farmable solo bosses
      'Abyssal Sire': 'fast',
      Amoxliatl: 'fast',
      Artio: 'fast',
      'Barrows Chests': 'fast',
      Brutus: 'fast',
      Bryophyta: 'fast',
      Callisto: 'fast',
      "Calvar'ion": 'fast',
      Cerberus: 'fast',
      'Chaos Elemental': 'fast',
      'Chaos Fanatic': 'fast',
      'Commander Zilyana': 'fast',
      'Crazy Archaeologist': 'fast',
      'Dagannoth Prime': 'fast',
      'Dagannoth Rex': 'fast',
      'Dagannoth Supreme': 'fast',
      'Deranged Archaeologist': 'fast',
      'General Graardor': 'fast',
      'Giant Mole': 'fast',
      'Grotesque Guardians': 'fast',
      Hespori: 'fast',
      'Kalphite Queen': 'fast',
      'King Black Dragon': 'fast',
      Kraken: 'fast',
      "Kree'Arra": 'fast',
      "K'ril Tsutsaroth": 'fast',
      'Lunar Chests': 'fast',
      Mimic: 'fast',
      Obor: 'fast',
      'Rifts closed': 'fast',
      Sarachnis: 'fast',
      Scorpia: 'fast',
      Scurrius: 'fast',
      Skotizo: 'fast',
      Spindel: 'fast',
      Tempoross: 'fast',
      'The Gauntlet': 'fast',
      'Thermonuclear Smoke Devil': 'fast',
      Venenatis: 'fast',
      "Vet'ion": 'fast',
      Vorkath: 'fast',
      Wintertodt: 'fast',
      Zalcano: 'fast',
      Zulrah: 'fast',
      // slow -- harder solo bosses and standard-mode raids
      'Alchemical Hydra': 'slow',
      'Corporeal Beast': 'slow',
      Nex: 'slow',
      Nightmare: 'slow',
      'Phantom Muspah': 'slow',
      'The Corrupted Gauntlet': 'slow',
      'Duke Sucellus': 'slow',
      'The Leviathan': 'slow',
      'The Whisperer': 'slow',
      Vardorvis: 'slow',
      Araxxor: 'slow',
      'Doom of Mokhaiotl': 'slow',
      'The Hueycoatl': 'slow',
      'The Royal Titans': 'slow',
      Yama: 'slow',
      'Chambers of Xeric': 'slow',
      'Theatre of Blood': 'slow',
      'Tombs of Amascut': 'slow',
      'Shellbane Gryphon': 'slow',
      'Mad Angel': 'slow',
      'Maggot King': 'slow',
      // very slow -- Inferno/Colosseum/hard-mode-raid tier
      'TzTok-Jad': 'verySlow',
      'TzKal-Zuk': 'verySlow',
      'Sol Heredit': 'verySlow',
      "Phosani's Nightmare": 'verySlow',
      'Theatre of Blood: Hard Mode': 'verySlow',
      'Tombs of Amascut: Expert Mode': 'verySlow',
      'Chambers of Xeric: Challenge Mode': 'verySlow',
    },
  },
  pointsByDifficulty: { easy: 1, medium: 2, hard: 3 },
};
