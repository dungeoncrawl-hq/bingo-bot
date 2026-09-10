import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { TileCondition } from '../lib/tileConditions';
import type { Tile } from '../db/types';
import { SKILL_ORDER, defaultIconFor, defaultLabelFor } from '../lib/tileIcons';
import { PRESET_ITEM_SETS } from '../lib/itemSets';
import { BOSS_ACTIVITIES } from '../lib/bossActivities';
import { decomposeMoneyXp, recomposeMoneyXp, type MoneyXpUnit } from '../lib/format';

// BACKLOG.md #3 -- these 5 condition types share the generic `threshold`
// field below, but it's a GP/XP amount for exactly these, not a plain
// count/level -- they get the K/M control instead of a bare number input.
// bigDropsCount's own dropValueThreshold field (rendered separately) gets
// the same control; its `threshold` (how many such drops) does not, since
// that one's a small count, not an amount.
const MONEY_XP_THRESHOLD_TYPES: ReadonlySet<TileCondition['type']> = new Set([
  'xpGained',
  'skillXpGained',
  'xpGainedLowestSkill',
  'lootValueGained',
  'singleDropValue',
]);

// A value + K/M unit pair that recomposes to the actual stored number --
// used for both the generic threshold field (for the 5 types above) and
// bigDropsCount's separate dropValueThreshold field. Derives its displayed
// value/unit fresh from `value` on every render rather than keeping its
// own state, so it never needs to be kept in sync across a condition-type
// switch -- there's only ever one source of truth (the number itself).
function MoneyXpThresholdInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled: boolean;
}) {
  const decomposed = decomposeMoneyXp(value);
  return (
    <div className="mt-1 flex gap-2">
      <input
        type="number"
        min={1}
        value={decomposed.value}
        onChange={(e) => onChange(recomposeMoneyXp(Number(e.target.value), decomposed.unit))}
        disabled={disabled}
        className="w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      <select
        value={decomposed.unit}
        onChange={(e) => onChange(recomposeMoneyXp(decomposed.value, e.target.value as MoneyXpUnit))}
        disabled={disabled}
        className="w-20 shrink-0 rounded-lg border border-stone-700 bg-stone-900 px-2 py-2 text-sm focus:border-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="K">K</option>
        <option value="M">M</option>
      </select>
    </div>
  );
}

// A host can't set a "big drop" threshold below this -- otherwise most
// drops would clear it and defeat loot_drops bucketing (see
// src/server/dinkWebhook.ts's handleLoot/minBigDropsThreshold).
const MIN_DROP_VALUE_THRESHOLD = 100_000;
const DEFAULT_DROP_VALUE_THRESHOLD = 1_000_000;

// xpGainedLowestSkill/levelsGainedLowestSkill are filtered out of the
// rendered groups below (not removed from this list) whenever
// gameMode !== 'solo' -- "the pool's lowest skill" isn't a coherent
// pooled concept the way "the pool's total XP" is (BACKLOG.md #10).
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
      { value: 'itemCount', label: 'Obtain specific uniques' },
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
    group: 'Minigames',
    options: [{ value: 'gotrCompleted', label: 'Guardians of the Rift completions' }],
  },
  {
    group: 'Pets',
    options: [{ value: 'petsObtained', label: 'Pets obtained' }],
  },
  {
    group: 'Other',
    options: [{ value: 'freeSpace', label: 'Free space (always complete, no points)' }],
  },
];

// itemCount's stored `setName` has no display use anymore (a selection
// can span several catalogs at once -- see the TileCondition type's own
// comment), but randomizeBoard.ts's single-set auto-fill still relies on
// it meaning something, so this keeps it populated: the one catalog's
// name if every currently-selected item happens to come from it, else a
// generic label. O(items x catalogs), trivially fast at this scale (a
// handful of selected items against ~30 small catalogs).
function setNameForSelection(itemNames: string[]): string {
  if (itemNames.length === 0) return PRESET_ITEM_SETS[0].name;
  const sourceSetNames = new Set<string>();
  for (const name of itemNames) {
    const owner = PRESET_ITEM_SETS.find((s) => s.items.includes(name));
    if (owner) sourceSetNames.add(owner.name);
  }
  return sourceSetNames.size === 1 ? [...sourceSetNames][0] : 'Custom selection';
}

function conditionFromForm(
  type: TileCondition['type'],
  threshold: number,
  activity: string,
  skill: string,
  // itemCount's own host-narrowed, possibly cross-catalog selection.
  selectedItemNames: string[],
  itemMode: 'any' | 'all',
  dropValueThreshold: number,
): TileCondition {
  switch (type) {
    case 'kcGained':
      return { type, activity, threshold };
    case 'skillLevelGained':
    case 'skillXpGained':
      return { type, skill, threshold };
    case 'itemCount':
      return { type, itemNames: selectedItemNames, setName: setNameForSelection(selectedItemNames), mode: itemMode, threshold };
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

function formFromCondition(cond: TileCondition) {
  return {
    threshold: 'threshold' in cond ? cond.threshold : 1,
    activity: cond.type === 'kcGained' ? cond.activity : '',
    skill: cond.type === 'skillLevelGained' || cond.type === 'skillXpGained' ? cond.skill : '',
    itemSetName: cond.type === 'itemCount' ? cond.setName : '',
    itemNames: cond.type === 'itemCount' ? cond.itemNames : [],
    // Absent on any tile saved before this existed -- defaults to 'any',
    // its original (and only) behavior.
    itemMode: cond.type === 'itemCount' ? (cond.mode ?? 'any') : ('any' as 'any' | 'all'),
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
  // 'solo' (default, today's behavior) | 'coop' | 'team' -- BACKLOG.md
  // #10. Drives the lowest-skill exclusion, the pooled-threshold hint,
  // and (Coop only) forcing the first-completer bonus off.
  gameMode: 'solo' | 'coop' | 'team';
  // Current roster size, for the pooled-threshold hint text. Unused when
  // gameMode is 'solo'.
  poolSize: number;
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

export default function TileEditorForm({ existing, locked, gameMode, poolSize, onSave, onDelete, onClose }: Props) {
  const fieldsLocked = locked && existing != null;
  const pooled = gameMode !== 'solo';
  const conditionGroups = pooled
    ? CONDITION_GROUPS.map((g) => ({
        ...g,
        options: g.options.filter((o) => o.value !== 'xpGainedLowestSkill' && o.value !== 'levelsGainedLowestSkill'),
      })).filter((g) => g.options.length > 0)
    : CONDITION_GROUPS;
  const [type, setType] = useState<TileCondition['type']>(existing?.condition.type ?? 'xpGained');
  const initial = existing
    ? formFromCondition(existing.condition)
    : {
        threshold: 1,
        activity: '',
        skill: '',
        itemSetName: '',
        itemNames: [] as string[],
        itemMode: 'any' as 'any' | 'all',
        dropValueThreshold: DEFAULT_DROP_VALUE_THRESHOLD,
      };
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
  // A tile can target items across MORE THAN ONE catalog set now (e.g.
  // Ahrim's hood from Barrows uniques alongside Cow slippers from
  // Brutus uniques in the same tile) -- so there's no longer one true
  // "the" catalog a saved tile belongs to. `selectedItemSet` is now
  // purely which catalog is currently being BROWSED to add/remove items
  // from `selectedItemNames` (the real cross-catalog selection, below),
  // not the source of truth for what's targeted. Defaults to whichever
  // catalog contains any of the tile's already-saved items, so
  // reopening an existing tile starts the browser on a relevant set
  // instead of always the alphabetically-first one; falls back to the
  // legacy single `setName` a pre-this-feature tile was saved with, then
  // to the first catalog for a brand-new tile.
  const initialBrowseSet =
    PRESET_ITEM_SETS.find((p) => initial.itemNames.some((n) => p.items.includes(n))) ??
    PRESET_ITEM_SETS.find((p) => p.name === initial.itemSetName) ??
    PRESET_ITEM_SETS[0];
  const [selectedItemSet, setSelectedItemSet] = useState(initialBrowseSet.name);
  // The real cross-catalog selection this tile targets. A brand-new
  // tile (no saved itemNames yet) starts pre-filled with the initial
  // browse catalog's full item list, same "starts non-empty" default
  // the single-catalog picker always had; an existing tile keeps
  // exactly its saved selection regardless of which catalogs it spans.
  const [selectedItemNames, setSelectedItemNames] = useState<string[]>(
    initial.itemNames.length > 0 ? initial.itemNames : initialBrowseSet.items,
  );
  // 'any' ("Allow Duplicates" in the UI): total quantity across the
  // selection, duplicates of one item freely substitute for another
  // (today's original behavior). 'all' ("No Duplicates"): how many of
  // the selected items have been obtained at least once, duplicates of
  // an already-obtained item don't help.
  const [itemMode, setItemMode] = useState<'any' | 'all'>(initial.itemMode);
  const [dropValueThreshold, setDropValueThreshold] = useState(initial.dropValueThreshold);
  const [points, setPoints] = useState(existing?.points ?? 1);
  const [firstCompleterBonus, setFirstCompleterBonus] = useState(existing?.first_completer_bonus ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedSet = PRESET_ITEM_SETS.find((p) => p.name === selectedItemSet) ?? PRESET_ITEM_SETS[0];

  // Label and icon are pure functions of the fields above -- no state of
  // their own, no manual override. Any label/icon a tile was saved with
  // before this restriction existed is superseded the moment it's reopened.
  const label = defaultLabelFor(type, skill, activity, itemMode, dropValueThreshold, selectedItemNames);
  const icon = defaultIconFor(type, skill, activity, selectedItemNames);

  // Purely a "which catalog's checklist am I looking at" change now --
  // no longer touches the actual cross-catalog selection at all.
  function browseItemSet(name: string) {
    setSelectedItemSet(name);
  }

  function toggleItem(name: string) {
    setSelectedItemNames((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  }

  // Add/remove just the CURRENTLY BROWSED catalog's items, leaving
  // anything selected from other catalogs untouched -- the global
  // "Clear all" button below is the only thing that resets the whole
  // cross-catalog selection at once.
  function selectAllInBrowsedSet() {
    setSelectedItemNames((prev) => [...new Set([...prev, ...selectedSet.items])]);
  }
  function selectNoneInBrowsedSet() {
    const browsed = new Set(selectedSet.items);
    setSelectedItemNames((prev) => prev.filter((n) => !browsed.has(n)));
  }

  function selectMode(next: 'any' | 'all') {
    setItemMode(next);
    // Switching TO "No Duplicates" defaults the goal to "every selected
    // item" -- the common case, and a sensible starting point a host can
    // still lower. Switching to "Allow Duplicates" leaves whatever
    // number was already there (it's just a quantity, not bounded by
    // the selection size, so there's no equivalent "obviously right"
    // default to jump to).
    if (next === 'all') setThreshold(Math.max(1, selectedItemNames.length));
  }

  // "No Duplicates" can't ask for more than the selection actually has
  // -- if the host shrinks the selection below whatever goal they'd
  // set, clamp down rather than silently saving an impossible target.
  // Deliberately one-directional: re-adding an item doesn't grow the
  // goal back, so a host's own "any 3 of these 5" choice survives them
  // experimenting with the checklist.
  useEffect(() => {
    if (type === 'itemCount' && itemMode === 'all' && threshold > selectedItemNames.length) {
      setThreshold(Math.max(1, selectedItemNames.length));
    }
  }, [type, itemMode, selectedItemNames.length, threshold]);

  const effectiveThreshold = type === 'itemCount' && itemMode === 'all' ? Math.min(Math.max(1, threshold), Math.max(1, selectedItemNames.length)) : threshold;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (type === 'itemCount' && selectedItemNames.length === 0) {
      setError('Select at least one item to target.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        label,
        icon,
        condition: conditionFromForm(type, effectiveThreshold, activity, skill, selectedItemNames, itemMode, dropValueThreshold),
        // A free space is always complete for everyone the instant it
        // exists -- there's no "first" to reward and no achievement to
        // weight, so it can never contribute points regardless of what's
        // left over in the points/bonus inputs from a previous condition.
        points: type === 'freeSpace' ? 0 : points || 1,
        // Coop has no "first" either -- credit lands on everyone at once
        // from one pooled event, same "force at the source" treatment as
        // freeSpace forcing points to 0 above (BACKLOG.md #10). Team
        // keeps the bonus, scoped to "first team" instead.
        first_completer_bonus: type === 'freeSpace' || gameMode === 'coop' ? 0 : Math.max(0, firstCompleterBonus || 0),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      {/* Capped at the viewport (minus this wrapper's own p-4) and split
          into a fixed header/footer with a scrollable middle -- a tall
          form (e.g. itemCount's item checklist, up to 95 entries for the
          Slayer catalog) used to grow the whole modal unbounded, pushing
          Save/Cancel off-screen with no way to reach them (BACKLOG.md
          #12). Header and Save/Cancel/Delete now always stay visible;
          only the field list itself scrolls. */}
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col rounded-xl border border-stone-800 bg-stone-950"
      >
        <div className="shrink-0 p-6 pb-0">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold">{existing ? 'Edit Room Condition' : 'Add Room Condition'}</h2>
            {icon && <img src={icon} alt="" className="h-10 w-10 shrink-0 object-contain" />}
          </div>
          {fieldsLocked && (
            <p className="mt-4 rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-xs text-stone-400">
              This dungeon has started, so this tile's condition can't be changed anymore -- it might invalidate
              progress players already made toward it. Points and the first-completer bonus can still be adjusted.
            </p>
          )}
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
        <div>
          <label className="block text-sm text-stone-400">Condition</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TileCondition['type'])}
            disabled={fieldsLocked}
            className={inputClass}
          >
            {conditionGroups.map((g) => (
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
            <MoneyXpThresholdInput value={dropValueThreshold} onChange={setDropValueThreshold} disabled={fieldsLocked} />
          </div>
        )}
        {type === 'itemCount' && (
          <div className="space-y-3">
            {/* Goal type first -- it changes how "Which items" and the
                Goal field below both read, so a host should pick it
                before narrowing the selection down. */}
            <div>
              <label className="block text-sm text-stone-400">Goal type</label>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => selectMode('any')}
                  disabled={fieldsLocked}
                  className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs disabled:cursor-not-allowed disabled:opacity-50 ${
                    itemMode === 'any' ? 'border-amber-500 bg-amber-950/30 text-amber-400' : 'border-stone-700 text-stone-300'
                  }`}
                >
                  <span className="font-semibold">Allow Duplicates</span> -- quantity across the selection; duplicates of one item count
                </button>
                <button
                  type="button"
                  onClick={() => selectMode('all')}
                  disabled={fieldsLocked}
                  className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs disabled:cursor-not-allowed disabled:opacity-50 ${
                    itemMode === 'all' ? 'border-amber-500 bg-amber-950/30 text-amber-400' : 'border-stone-700 text-stone-300'
                  }`}
                >
                  <span className="font-semibold">No Duplicates</span> -- each selected item at least once; duplicates don't help
                </button>
              </div>
            </div>

            {/* Always-visible summary of the real (possibly cross-catalog)
                selection -- the catalog browser below is just a way to
                ADD to or REMOVE from this, not the selection itself, so
                a host needs one place that shows the whole picture
                regardless of which catalog they're currently looking at. */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-stone-400">Selected items ({selectedItemNames.length})</label>
                {selectedItemNames.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedItemNames([])}
                    disabled={fieldsLocked}
                    className="text-xs text-amber-500 hover:underline disabled:opacity-40"
                  >
                    Clear all
                  </button>
                )}
              </div>
              {selectedItemNames.length === 0 ? (
                <p className="mt-1 rounded-lg border border-dashed border-stone-800 p-2 text-xs text-stone-600">
                  Nothing selected yet -- browse a catalog below and check off items to target. Items from different
                  catalogs can be mixed in the same tile.
                </p>
              ) : (
                <div className="mt-1 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-stone-800 bg-stone-900 p-2">
                  {selectedItemNames.map((item) => (
                    <span
                      key={item}
                      className="flex items-center gap-1 rounded-full border border-amber-800 bg-amber-950/40 py-0.5 pl-2 pr-1 text-xs text-amber-400"
                    >
                      {item}
                      <button
                        type="button"
                        onClick={() => toggleItem(item)}
                        disabled={fieldsLocked}
                        title={`Remove ${item}`}
                        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-amber-400/70 hover:bg-amber-800/60 hover:text-amber-200 disabled:pointer-events-none"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* The catalog browser -- a view filter to add/remove items
                by, not the selection's source of truth. Switching it no
                longer clears anything selected from a different catalog. */}
            <div>
              <label className="block text-sm text-stone-400">Browse a catalog to add items from</label>
              <select
                value={selectedItemSet}
                onChange={(e) => browseItemSet(e.target.value)}
                disabled={fieldsLocked}
                className={inputClass}
              >
                {[...PRESET_ITEM_SETS]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({p.items.length})
                    </option>
                  ))}
              </select>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-stone-500">
                  {selectedSet.items.filter((i) => selectedItemNames.includes(i)).length}/{selectedSet.items.length} of
                  this catalog selected
                </p>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={selectAllInBrowsedSet}
                    disabled={fieldsLocked}
                    className="text-amber-500 hover:underline disabled:opacity-40"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={selectNoneInBrowsedSet}
                    disabled={fieldsLocked}
                    className="text-amber-500 hover:underline disabled:opacity-40"
                  >
                    Select none
                  </button>
                </div>
              </div>
              <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-stone-800 bg-stone-900 p-2">
                {selectedSet.items.map((item) => (
                  <label key={item} className="flex items-center gap-2 py-0.5 text-xs text-stone-300">
                    <input
                      type="checkbox"
                      checked={selectedItemNames.includes(item)}
                      onChange={() => toggleItem(item)}
                      disabled={fieldsLocked}
                      className="shrink-0"
                    />
                    {item}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
        {type !== 'tbd' && type !== 'freeSpace' && (
          <div>
            <label className="block text-sm text-stone-400">
              {type === 'maxDeaths' ? 'Max deaths allowed' : type === 'bigDropsCount' ? 'How many such drops' : 'Goal'}
            </label>
            {type === 'itemCount' && itemMode === 'all' ? (
              // Bounded to the current selection size -- "No Duplicates"
              // can't ask for more distinct items than are actually
              // targeted. effectiveThreshold (already clamped the same
              // way) is what's shown, so this never displays a
              // now-invalid number even for the one render before the
              // clamp effect above catches up.
              <input
                type="number"
                min={1}
                max={Math.max(1, selectedItemNames.length)}
                value={effectiveThreshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                disabled={fieldsLocked || selectedItemNames.length === 0}
                className={inputClass}
              />
            ) : MONEY_XP_THRESHOLD_TYPES.has(type) ? (
              <MoneyXpThresholdInput value={threshold} onChange={setThreshold} disabled={fieldsLocked} />
            ) : (
              <input
                type="number"
                min={0}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                disabled={fieldsLocked}
                className={inputClass}
              />
            )}
            {type === 'itemCount' && itemMode === 'all' && (
              <p className="mt-1 text-xs text-stone-500">
                How many of the {selectedItemNames.length} selected item{selectedItemNames.length === 1 ? '' : 's'} a
                player needs, each without duplicates. Set it to {Math.max(1, selectedItemNames.length)} to require
                every one of them.
              </p>
            )}
            {type !== 'maxDeaths' && type !== 'bigDropsCount' && !(type === 'itemCount' && itemMode === 'all') && (
              <p className="mt-1 text-xs text-stone-500">The amount a player needs to reach to complete this tile.</p>
            )}
            {pooled && (
              <p className="mt-1 text-xs text-amber-500">
                This will be pooled across {poolSize} participant{poolSize === 1 ? '' : 's'}.
              </p>
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
              <label className="block text-sm text-stone-400">Points</label>
              <input
                type="number"
                min={1}
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-stone-500">The value a player receives after completing the room's condition.</p>
            </div>
            {gameMode === 'coop' ? (
              <p className="text-xs text-stone-500">No bonus for being first to complete a tile in Co-op mode.</p>
            ) : (
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
                  {gameMode === 'team'
                    ? 'Extra points for whoever\'s team completes this tile first. Leave at 0 for no bonus.'
                    : 'Extra points for whoever completes this tile first. Leave at 0 for no bonus.'}
                </p>
              </div>
            )}
          </>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="shrink-0 border-t border-stone-800 p-6 pt-4">
          <div className="flex items-center justify-between gap-2">
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
        </div>
      </form>
    </div>
  );
}
