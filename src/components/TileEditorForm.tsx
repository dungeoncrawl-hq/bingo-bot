import { useState } from 'react';
import type { FormEvent } from 'react';
import type { TileCondition } from '../lib/tileConditions';
import type { Tile } from '../db/types';
import { SKILL_ORDER, PRESET_ICONS, defaultIconFor } from '../lib/tileIcons';
import { PRESET_ITEM_SETS } from '../lib/itemSets';

// Keeps a label from overflowing the tile grid cell it renders in
// (BoardPage.tsx/EditChallengePage.tsx both cap the label at 2 lines with
// line-clamp-2 -- much beyond this and it just gets clipped anyway).
const LABEL_MAX_LENGTH = 40;

const CONDITION_GROUPS: { group: string; options: { value: TileCondition['type']; label: string }[] }[] = [
  {
    group: 'Experience & Levels',
    options: [
      { value: 'xpGained', label: 'Total XP gained' },
      { value: 'skillXpGained', label: 'XP gained in a skill' },
      { value: 'skillLevelGained', label: 'Levels gained in a skill' },
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
    options: [{ value: 'tbd', label: 'TBD (placeholder)' }],
  },
];

function conditionFromForm(
  type: TileCondition['type'],
  threshold: number,
  activity: string,
  skill: string,
  itemNames: string,
  setName: string,
): TileCondition {
  switch (type) {
    case 'kcGained':
      return { type, activity, threshold };
    case 'skillLevelGained':
    case 'skillXpGained':
      return { type, skill, threshold };
    case 'itemCount':
    case 'itemSetCollected':
      return {
        type,
        itemNames: itemNames
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        setName,
        threshold,
      };
    case 'tbd':
      return { type: 'tbd' };
    default:
      return { type, threshold };
  }
}

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
      return activity.trim() ? `${activity.trim()} KC` : 'Boss KC';
    case 'slayerTasksCompleted':
      return 'Slayer Tasks';
    case 'maxDeaths':
      return 'Max Deaths';
    case 'lootValueGained':
      return 'Loot Value';
    case 'singleDropValue':
      return 'Big Drop';
    case 'itemCount':
    case 'itemSetCollected':
      return setName.trim() || 'Item Set';
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
    case 'tbd':
      return 'TBD';
  }
}

function formFromCondition(cond: TileCondition) {
  return {
    threshold: 'threshold' in cond ? cond.threshold : 1,
    activity: cond.type === 'kcGained' ? cond.activity : '',
    skill: cond.type === 'skillLevelGained' || cond.type === 'skillXpGained' ? cond.skill : '',
    itemNames: cond.type === 'itemCount' || cond.type === 'itemSetCollected' ? cond.itemNames.join(', ') : '',
    setName: cond.type === 'itemCount' || cond.type === 'itemSetCollected' ? cond.setName : '',
  };
}

interface Props {
  existing: Tile | null;
  onSave: (fields: { label: string; icon: string | null; condition: TileCondition; points: number }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

const inputClass =
  'mt-1 w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none';

export default function TileEditorForm({ existing, onSave, onDelete, onClose }: Props) {
  const [type, setType] = useState<TileCondition['type']>(existing?.condition.type ?? 'xpGained');
  const initial = existing
    ? formFromCondition(existing.condition)
    : { threshold: 1, activity: '', skill: '', itemNames: '', setName: '' };
  const [threshold, setThreshold] = useState(initial.threshold);
  const [activity, setActivity] = useState(initial.activity);
  const [skill, setSkill] = useState(initial.skill || SKILL_ORDER[0]);
  const [itemNames, setItemNames] = useState(initial.itemNames);
  const [setName, setSetName] = useState(initial.setName);
  const [label, setLabel] = useState(existing?.label ?? defaultLabelFor(type, skill, activity, setName));
  // Tracks whether `label`/`icon` still match what their defaultXFor
  // functions would produce, so switching condition type/skill/activity/
  // set name keeps auto-filling them -- but the moment a host edits one
  // directly, it flips off and their choice is left alone.
  const [labelIsDefault, setLabelIsDefault] = useState(
    !existing || existing.label === defaultLabelFor(type, skill, activity, setName),
  );
  // When defaultIconFor resolves to a real icon, that condition has exactly
  // one sensible choice -- the icon is forced to it (see #15 below) and any
  // previously-stored divergent icon (e.g. from before this restriction
  // existed) is snapped back in line rather than respected.
  const initialDefaultIcon = defaultIconFor(type, skill);
  const [icon, setIcon] = useState(initialDefaultIcon ?? existing?.icon ?? '');
  const [iconIsDefault, setIconIsDefault] = useState(
    initialDefaultIcon !== null || !existing || existing.icon === initialDefaultIcon,
  );
  const [points, setPoints] = useState(existing?.points ?? 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function applyType(newType: TileCondition['type']) {
    setType(newType);
    if (labelIsDefault) setLabel(defaultLabelFor(newType, skill, activity, setName));
    const forced = defaultIconFor(newType, skill);
    if (forced !== null) {
      setIcon(forced);
      setIconIsDefault(true);
    } else if (iconIsDefault) {
      setIcon('');
    }
  }

  function applySkill(newSkill: string) {
    setSkill(newSkill);
    if (labelIsDefault) setLabel(defaultLabelFor(type, newSkill, activity, setName));
    const forced = defaultIconFor(type, newSkill);
    if (forced !== null) {
      setIcon(forced);
      setIconIsDefault(true);
    } else if (iconIsDefault) {
      setIcon('');
    }
  }

  function applyActivity(newActivity: string) {
    setActivity(newActivity);
    if (labelIsDefault) setLabel(defaultLabelFor(type, skill, newActivity, setName));
  }

  function applySetName(newSetName: string) {
    setSetName(newSetName);
    if (labelIsDefault) setLabel(defaultLabelFor(type, skill, activity, newSetName));
  }

  function applyItemPreset(presetName: string) {
    const preset = PRESET_ITEM_SETS.find((p) => p.name === presetName);
    if (!preset) return;
    applySetName(preset.name);
    setItemNames(preset.items.join(', '));
    // "Collect a full item set" defaults to requiring every item in the
    // preset -- itemCount's threshold is a different scale entirely (a
    // total-quantity goal), so it's left for the host to set by hand.
    if (type === 'itemSetCollected') setThreshold(preset.items.length);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setSaving(true);
    setError('');
    try {
      await onSave({
        label: label.trim(),
        icon: icon.trim() || null,
        condition: conditionFromForm(type, threshold, activity, skill, itemNames, setName),
        points: points || 1,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSaving(false);
    }
  }

  const isIconForced = defaultIconFor(type, skill) !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-xl border border-stone-800 bg-stone-950 p-6"
      >
        <h2 className="text-lg font-semibold">{existing ? 'Edit tile' : 'Add tile'}</h2>
        <div>
          <label className="block text-sm text-stone-400">Condition</label>
          <select
            value={type}
            onChange={(e) => applyType(e.target.value as TileCondition['type'])}
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
          <input
            required
            maxLength={LABEL_MAX_LENGTH}
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setLabelIsDefault(false);
            }}
            className={inputClass}
          />
          <p className="mt-1 text-right text-xs text-stone-600">
            {label.length}/{LABEL_MAX_LENGTH}
          </p>
        </div>
        <div>
          <label className="block text-sm text-stone-400">Icon</label>
          {isIconForced ? (
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-stone-800 bg-stone-900 p-2">
              {icon && <img src={icon} alt="" className="h-8 w-8 object-contain" />}
              <p className="text-xs text-stone-500">Icon is set automatically for this condition</p>
            </div>
          ) : (
            <div className="mt-1 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-stone-800 bg-stone-900 p-2">
              <button
                type="button"
                title="No icon"
                onClick={() => {
                  setIcon('');
                  setIconIsDefault(false);
                }}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded border text-[9px] text-stone-500 ${
                  icon === '' ? 'border-stone-100' : 'border-stone-700 hover:border-stone-500'
                }`}
              >
                None
              </button>
              {PRESET_ICONS.map((opt) => (
                <button
                  key={opt.url}
                  type="button"
                  title={opt.label}
                  onClick={() => {
                    setIcon(opt.url);
                    setIconIsDefault(false);
                  }}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded border bg-stone-800 p-1 ${
                    icon === opt.url ? 'border-stone-100' : 'border-stone-700 hover:border-stone-500'
                  }`}
                >
                  <img src={opt.url} alt={opt.label} className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>
        {type === 'kcGained' && (
          <div>
            <label className="block text-sm text-stone-400">Boss / activity name</label>
            <input value={activity} onChange={(e) => applyActivity(e.target.value)} className={inputClass} />
          </div>
        )}
        {(type === 'skillLevelGained' || type === 'skillXpGained') && (
          <div>
            <label className="block text-sm text-stone-400">Skill</label>
            <select value={skill} onChange={(e) => applySkill(e.target.value)} className={inputClass}>
              {SKILL_ORDER.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}
        {(type === 'itemCount' || type === 'itemSetCollected') && (
          <>
            <div>
              <label className="block text-sm text-stone-400">Load a preset (optional)</label>
              <select
                value=""
                onChange={(e) => e.target.value && applyItemPreset(e.target.value)}
                className={inputClass}
              >
                <option value="">Load a preset…</option>
                {PRESET_ITEM_SETS.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.items.length})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-stone-400">Set name (e.g. "Barrows pieces")</label>
              <input value={setName} onChange={(e) => applySetName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-stone-400">Item names, comma-separated</label>
              <textarea
                value={itemNames}
                onChange={(e) => setItemNames(e.target.value)}
                className={inputClass}
                rows={2}
              />
            </div>
          </>
        )}
        {type !== 'tbd' && (
          <div>
            <label className="block text-sm text-stone-400">
              {type === 'maxDeaths' ? 'Max deaths allowed' : 'Threshold'}
            </label>
            <input
              type="number"
              min={0}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className={inputClass}
            />
          </div>
        )}
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
          {existing && onDelete && (
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
