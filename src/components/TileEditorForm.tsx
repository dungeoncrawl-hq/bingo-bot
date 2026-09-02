import { useState } from 'react';
import type { FormEvent } from 'react';
import type { TileCondition } from '../lib/tileConditions';
import type { Tile } from '../db/types';
import { SKILL_ORDER, defaultIconFor } from '../lib/tileIcons';
import { PRESET_ITEM_SETS, type PresetItemSet } from '../lib/itemSets';
import { BOSS_ACTIVITIES } from '../lib/bossActivities';

// A host can't set a "big drop" threshold below this -- otherwise most
// drops would clear it and defeat loot_drops bucketing (see
// src/server/dinkWebhook.ts's handleLoot/minBigDropsThreshold).
const MIN_DROP_VALUE_THRESHOLD = 100_000;
const DEFAULT_DROP_VALUE_THRESHOLD = 1_000_000;

const CONDITION_GROUPS: { group: string; options: { value: TileCondition['type']; label: string }[] }[] = [
  {
    group: 'Experience & Levels',
    options: [
      { value: 'xpGained', label: 'Total XP gained' },
      { value: 'skillXpGained', label: 'XP gained in a skill' },
      { value: 'skillLevelGained', label: 'Levels gained in a skill' },
      { value: 'xpGainedLowestSkill', label: "XP gained in the player's lowest skill" },
      { value: 'levelsGainedLowestSkill', label: "Levels gained in the player's lowest skill" },
    ],
  },
  {
    group: 'Combat',
    options: [
      { value: 'bossKcGained', label: 'Total boss KC gained' },
      { value: 'kcGained', label: 'KC gained on a specific boss' },
      { value: 'slayerTasksCompleted', label: 'Slayer tasks completed' },
      { value: 'maxDeaths', label: 'Stay under a death limit' },
    ],
  },
  {
    group: 'Loot',
    options: [
      { value: 'lootValueGained', label: 'Total GP looted' },
      { value: 'singleDropValue', label: 'A single drop worth at least...' },
      { value: 'bigDropsCount', label: 'Multiple drops worth at least...' },
      { value: 'itemCount', label: 'Obtain a set of items' },
      { value: 'itemSetCollected', label: 'Collect a full item set (each item once)' },
    ],
  },
  {
    group: 'Clue Scrolls',
    options: [
      { value: 'cluesCompleted', label: 'Clue scrolls completed (any tier)' },
      { value: 'beginnerCluesCompleted', label: 'Beginner clue scrolls completed' },
      { value: 'easyCluesCompleted', label: 'Easy clue scrolls completed' },
      { value: 'mediumCluesCompleted', label: 'Medium clue scrolls completed' },
      { value: 'hardCluesCompleted', label: 'Hard clue scrolls completed' },
      { value: 'eliteCluesCompleted', label: 'Elite clue scrolls completed' },
      { value: 'masterCluesCompleted', label: 'Master clue scrolls completed' },
    ],
  },
  {
    group: 'Collection Log',
    options: [{ value: 'collectionLogGained', label: 'New collection log items' }],
  },
  {
    group: 'Pets',
    options: [{ value: 'petsObtained', label: 'Pets obtained' }],
  },
  {
    group: 'Other',
    options: [
      { value: 'freeSpace', label: 'Free space (always complete, no points)' },
      { value: 'tbd', label: 'TBD (placeholder)' },
    ],
  },
];

function conditionFromForm(
  type: TileCondition['type'],
  threshold: number,
  activity: string,
  skill: string,
  itemSet: PresetItemSet,
  dropValueThreshold: number,
): TileCondition {
  switch (type) {
    case 'kcGained':
      return { type, activity, threshold };
    case 'skillLevelGained':
    case 'skillXpGained':
      return { type, skill, threshold };
    case 'itemCount':
    case 'itemSetCollected':
      return { type, itemNames: itemSet.items, setName: itemSet.name, threshold };
    case 'bigDropsCount':
      return { type, dropValueThreshold: Math.max(MIN_DROP_VALUE_THRESHOLD, dropValueThreshold), threshold };
    case 'freeSpace':
      return { type: 'freeSpace' };
    case 'tbd':
      return { type: 'tbd' };
    default:
      return { type, threshold };
  }
}

// The label is entirely derived from the condition (and its skill/activity/
// item-catalog parameters) -- not a separate host-editable field. Every
// branch is deterministic, so there's nothing for a host to choose here
// either.
function defaultLabelFor(type: TileCondition['type'], skill: string, activity: string, setName: string): string {
  switch (type) {
    case 'xpGained':
      return 'Total XP';
    case 'skillXpGained':
      return `${skill} XP`;
    case 'skillLevelGained':
      return `${skill} Level`;
    case 'bossKcGained':
      return 'Boss KC';
    case 'kcGained':
      // activity is always a catalog value once the dropdown below has
      // ever been touched -- the empty-string fallback only matters for a
      // tile saved before this catalog existed.
      return activity ? `${activity} KC` : 'Boss KC';
    case 'slayerTasksCompleted':
      return 'Slayer Tasks';
    case 'maxDeaths':
      return 'Max Deaths';
    case 'lootValueGained':
      return 'Loot Value';
    case 'singleDropValue':
      return 'Big Drop';
    case 'bigDropsCount':
      return 'Big Drops';
    case 'itemCount':
    case 'itemSetCollected':
      return setName;
    case 'cluesCompleted':
      return 'Clue Scrolls';
    case 'beginnerCluesCompleted':
      return 'Beginner Clues';
    case 'easyCluesCompleted':
      return 'Easy Clues';
    case 'mediumCluesCompleted':
      return 'Medium Clues';
    case 'hardCluesCompleted':
      return 'Hard Clues';
    case 'eliteCluesCompleted':
      return 'Elite Clues';
    case 'masterCluesCompleted':
      return 'Master Clues';
    case 'collectionLogGained':
      return 'Collection Log';
    case 'petsObtained':
      return 'Pet';
    case 'xpGainedLowestSkill':
      return 'Lowest Skill XP';
    case 'levelsGainedLowestSkill':
      return 'Lowest Skill Levels';
    case 'freeSpace':
      return 'Free Space';
    case 'tbd':
      return 'TBD';
  }
}

function formFromCondition(cond: TileCondition) {
  return {
    threshold: 'threshold' in cond ? cond.threshold : 1,
    activity: cond.type === 'kcGained' ? cond.activity : '',
    skill: cond.type === 'skillLevelGained' || cond.type === 'skillXpGained' ? cond.skill : '',
    itemSetName: cond.type === 'itemCount' || cond.type === 'itemSetCollected' ? cond.setName : '',
    dropValueThreshold: cond.type === 'bigDropsCount' ? cond.dropValueThreshold : DEFAULT_DROP_VALUE_THRESHOLD,
  };
}

interface Props {
  existing: Tile | null;
  // Once a challenge has started, its tiles' conditions can no longer be
  // changed -- editing one out from under in-progress players could
  // invalidate progress they've already made toward it (see BACKLOG.md).
  // Only meaningful alongside `existing`: a brand-new tile in a still-empty
  // slot has no progress to protect, so adding one stays allowed even on a
  // started challenge.
  locked: boolean;
  onSave: (fields: {
    label: string;
    icon: string | null;
    condition: TileCondition;
    points: number;
    first_completer_bonus: number;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

const inputClass =
  'mt-1 w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';

export default function TileEditorForm({ existing, locked, onSave, onDelete, onClose }: Props) {
  const fieldsLocked = locked && existing != null;
  const [type, setType] = useState<TileCondition['type']>(existing?.condition.type ?? 'xpGained');
  const initial = existing
    ? formFromCondition(existing.condition)
    : { threshold: 1, activity: '', skill: '', itemSetName: '', dropValueThreshold: DEFAULT_DROP_VALUE_THRESHOLD };
  const [threshold, setThreshold] = useState(initial.threshold);
  // A tile can only reference a boss/minigame/raid from the curated catalog
  // -- no freeform typing (see bossActivities.ts's own comment). Falls back
  // to the first catalog entry if the stored activity doesn't match
  // anything (e.g. a tile saved before this restriction existed, with a
  // typo'd or blank activity).
  const [activity, setActivity] = useState(
    BOSS_ACTIVITIES.find((b) => b.name === initial.activity)?.name ?? BOSS_ACTIVITIES[0].name,
  );
  const [skill, setSkill] = useState(initial.skill || SKILL_ORDER[0]);
  // A tile can only reference items from the curated catalog -- no
  // freeform typing (see PRESET_ITEM_SETS' own comment). Falls back to
  // the first catalog entry if the stored setName doesn't match anything
  // (e.g. a tile saved before this restriction existed).
  const [selectedItemSet, setSelectedItemSet] = useState(
    PRESET_ITEM_SETS.find((p) => p.name === initial.itemSetName)?.name ?? PRESET_ITEM_SETS[0].name,
  );
  const [dropValueThreshold, setDropValueThreshold] = useState(initial.dropValueThreshold);
  const [points, setPoints] = useState(existing?.points ?? 1);
  const [firstCompleterBonus, setFirstCompleterBonus] = useState(existing?.first_completer_bonus ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedSet = PRESET_ITEM_SETS.find((p) => p.name === selectedItemSet) ?? PRESET_ITEM_SETS[0];

  // Label and icon are pure functions of the fields above -- no state of
  // their own, no manual override. Any label/icon a tile was saved with
  // before this restriction existed is superseded the moment it's reopened.
  const label = defaultLabelFor(type, skill, activity, selectedSet.name);
  const icon = defaultIconFor(type, skill, activity);

  function selectItemSet(name: string) {
    setSelectedItemSet(name);
    const set = PRESET_ITEM_SETS.find((p) => p.name === name);
    // "Collect a full item set" defaults to requiring every item in the
    // catalog entry -- itemCount's threshold is a different scale
    // entirely (a total-quantity goal), so it's left for the host to set
    // by hand.
    if (set && type === 'itemSetCollected') setThreshold(set.items.length);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({
        label,
        icon,
        condition: conditionFromForm(type, threshold, activity, skill, selectedSet, dropValueThreshold),
        // A free space is always complete for everyone the instant it
        // exists -- there's no "first" to reward and no achievement to
        // weight, so it can never contribute points regardless of what's
        // left over in the points/bonus inputs from a previous condition.
        points: type === 'freeSpace' ? 0 : points || 1,
        first_completer_bonus: type === 'freeSpace' ? 0 : Math.max(0, firstCompleterBonus || 0),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-xl border border-stone-800 bg-stone-950 p-6"
      >
        <h2 className="text-lg font-semibold">{existing ? 'Edit tile' : 'Add tile'}</h2>
        {fieldsLocked && (
          <p className="rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-xs text-stone-400">
            This challenge has started, so this tile's condition can't be changed anymore -- it might invalidate
            progress players already made toward it. Points and the first-completer bonus can still be adjusted.
          </p>
        )}
        <div>
          <label className="block text-sm text-stone-400">Condition</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TileCondition['type'])}
            disabled={fieldsLocked}
            className={inputClass}
          >
            {CONDITION_GROUPS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.options.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-stone-400">Label</label>
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-stone-800 bg-stone-900 p-2">
            {icon && <img src={icon} alt="" className="h-8 w-8 shrink-0 object-contain" />}
            <p className="text-sm">{label}</p>
          </div>
          <p className="mt-1 text-xs text-stone-500">Label and icon are set automatically for this condition.</p>
        </div>
        {type === 'kcGained' && (
          <div>
            <label className="block text-sm text-stone-400">Boss / minigame / raid</label>
            <select value={activity} onChange={(e) => setActivity(e.target.value)} disabled={fieldsLocked} className={inputClass}>
              {BOSS_ACTIVITIES.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {(type === 'skillLevelGained' || type === 'skillXpGained') && (
          <div>
            <label className="block text-sm text-stone-400">Skill</label>
            <select value={skill} onChange={(e) => setSkill(e.target.value)} disabled={fieldsLocked} className={inputClass}>
              {SKILL_ORDER.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}
        {type === 'bigDropsCount' && (
          <div>
            <label className="block text-sm text-stone-400">Drop value (minimum 100,000)</label>
            <input
              type="number"
              min={MIN_DROP_VALUE_THRESHOLD}
              value={dropValueThreshold}
              onChange={(e) => setDropValueThreshold(Number(e.target.value))}
              disabled={fieldsLocked}
              className={inputClass}
            />
          </div>
        )}
        {(type === 'itemCount' || type === 'itemSetCollected') && (
          <div>
            <label className="block text-sm text-stone-400">Item catalog</label>
            <select
              value={selectedItemSet}
              onChange={(e) => selectItemSet(e.target.value)}
              disabled={fieldsLocked}
              className={inputClass}
            >
              {PRESET_ITEM_SETS.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} ({p.items.length})
                </option>
              ))}
            </select>
            <div className="mt-2 max-h-24 overflow-y-auto rounded-lg border border-stone-800 bg-stone-900 p-2 text-xs text-stone-400">
              {selectedSet.items.join(', ')}
            </div>
          </div>
        )}
        {type !== 'tbd' && type !== 'freeSpace' && (
          <div>
            <label className="block text-sm text-stone-400">
              {type === 'maxDeaths' ? 'Max deaths allowed' : type === 'bigDropsCount' ? 'How many such drops' : 'Goal'}
            </label>
            <input
              type="number"
              min={0}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              disabled={fieldsLocked}
              className={inputClass}
            />
            {type !== 'maxDeaths' && type !== 'bigDropsCount' && (
              <p className="mt-1 text-xs text-stone-500">The amount a player needs to reach to complete this tile.</p>
            )}
          </div>
        )}
        {type === 'freeSpace' ? (
          <p className="text-xs text-stone-500">
            A free space is always complete for every participant and never awards points.
          </p>
        ) : (
          <>
            <div>
              <label className="block text-sm text-stone-400">Points (leaderboard value)</label>
              <input
                type="number"
                min={1}
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm text-stone-400">First-completer bonus</label>
              <input
                type="number"
                min={0}
                value={firstCompleterBonus}
                onChange={(e) => setFirstCompleterBonus(Number(e.target.value))}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-stone-500">
                Extra points for whoever completes this tile first. Leave at 0 for no bonus.
              </p>
            </div>
          </>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-amber-500 hover:bg-amber-400 transition-colors px-4 py-2 text-sm font-semibold text-stone-950 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300"
            >
              Cancel
            </button>
          </div>
          {existing && onDelete && !locked && (
            <button
              type="button"
              onClick={async () => {
                setSaving(true);
                await onDelete();
              }}
              className="rounded-lg border border-red-900 px-4 py-2 text-sm text-red-400"
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
