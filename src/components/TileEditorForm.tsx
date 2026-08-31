import { useState } from 'react';
import type { FormEvent } from 'react';
import type { TileCondition } from '../lib/tileConditions';
import type { Tile } from '../db/types';

const CONDITION_TYPES: { value: TileCondition['type']; label: string }[] = [
  { value: 'xpGained', label: 'Total XP gained' },
  { value: 'bossKcGained', label: 'Total boss KC gained' },
  { value: 'kcGained', label: 'KC gained on a specific boss' },
  { value: 'slayerTasksCompleted', label: 'Slayer tasks completed' },
  { value: 'lootValueGained', label: 'Total GP looted' },
  { value: 'singleDropValue', label: 'A single drop worth at least...' },
  { value: 'cluesCompleted', label: 'Clue scrolls completed' },
  { value: 'hardCluesCompleted', label: 'Hard clue scrolls completed' },
  { value: 'collectionLogGained', label: 'New collection log items' },
  { value: 'skillLevelGained', label: 'Levels gained in a skill' },
  { value: 'skillXpGained', label: 'XP gained in a skill' },
  { value: 'itemCount', label: 'Obtain a set of items' },
  { value: 'maxDeaths', label: 'Stay under a death limit' },
  { value: 'petsObtained', label: 'Pets obtained' },
  { value: 'tbd', label: 'TBD (placeholder)' },
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

function formFromCondition(cond: TileCondition) {
  return {
    threshold: 'threshold' in cond ? cond.threshold : 1,
    activity: cond.type === 'kcGained' ? cond.activity : '',
    skill: cond.type === 'skillLevelGained' || cond.type === 'skillXpGained' ? cond.skill : '',
    itemNames: cond.type === 'itemCount' ? cond.itemNames.join(', ') : '',
    setName: cond.type === 'itemCount' ? cond.setName : '',
  };
}

interface Props {
  existing: Tile | null;
  onSave: (fields: { label: string; icon: string | null; condition: TileCondition }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

const inputClass =
  'mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none';

export default function TileEditorForm({ existing, onSave, onDelete, onClose }: Props) {
  const [label, setLabel] = useState(existing?.label ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? '');
  const [type, setType] = useState<TileCondition['type']>(existing?.condition.type ?? 'xpGained');
  const initial = existing
    ? formFromCondition(existing.condition)
    : { threshold: 1, activity: '', skill: '', itemNames: '', setName: '' };
  const [threshold, setThreshold] = useState(initial.threshold);
  const [activity, setActivity] = useState(initial.activity);
  const [skill, setSkill] = useState(initial.skill);
  const [itemNames, setItemNames] = useState(initial.itemNames);
  const [setName, setSetName] = useState(initial.setName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
        className="w-full max-w-md space-y-4 rounded-xl border border-neutral-800 bg-neutral-950 p-6"
      >
        <h2 className="text-lg font-semibold">{existing ? 'Edit tile' : 'Add tile'}</h2>
        <div>
          <label className="block text-sm text-neutral-400">Label</label>
          <input required value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm text-neutral-400">Icon URL (optional)</label>
          <input value={icon} onChange={(e) => setIcon(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm text-neutral-400">Condition</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TileCondition['type'])}
            className={inputClass}
          >
            {CONDITION_TYPES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        {type === 'kcGained' && (
          <div>
            <label className="block text-sm text-neutral-400">Boss / activity name</label>
            <input value={activity} onChange={(e) => setActivity(e.target.value)} className={inputClass} />
          </div>
        )}
        {(type === 'skillLevelGained' || type === 'skillXpGained') && (
          <div>
            <label className="block text-sm text-neutral-400">Skill</label>
            <input value={skill} onChange={(e) => setSkill(e.target.value)} className={inputClass} />
          </div>
        )}
        {type === 'itemCount' && (
          <>
            <div>
              <label className="block text-sm text-neutral-400">Set name (e.g. "Barrows pieces")</label>
              <input value={setName} onChange={(e) => setSetName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-neutral-400">Item names, comma-separated</label>
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
            <label className="block text-sm text-neutral-400">
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
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300"
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
