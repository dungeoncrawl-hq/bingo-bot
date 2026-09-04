import { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { getSupabase } from '../db/supabaseClient';
import { DEFAULT_RANDOMIZE_SETTINGS, type Difficulty, type KcTier, type RandomizeSettings, type ThresholdConditionType } from '../lib/randomizeSettings';
import { BOSS_ACTIVITIES } from '../lib/bossActivities';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const KC_TIERS: KcTier[] = ['fast', 'slow', 'verySlow'];

// Friendly display names for BACKLOG.md #5's threshold table -- mirrors
// TileEditorForm.tsx's CONDITION_GROUPS option labels so an admin sees the
// same wording a host does, without importing that component's
// UI-label-shaped const (see randomizeBoard.ts's own comment on the same
// tradeoff).
const THRESHOLD_LABELS: Record<ThresholdConditionType, string> = {
  xpGained: 'Total XP gained',
  bossKcGained: 'Total boss KC gained',
  slayerTasksCompleted: 'Slayer tasks completed',
  lootValueGained: 'Total GP looted',
  singleDropValue: 'A single drop worth at least...',
  cluesCompleted: 'Clue scrolls (any tier)',
  beginnerCluesCompleted: 'Beginner clue scrolls',
  easyCluesCompleted: 'Easy clue scrolls',
  mediumCluesCompleted: 'Medium clue scrolls',
  hardCluesCompleted: 'Hard clue scrolls',
  eliteCluesCompleted: 'Elite clue scrolls',
  masterCluesCompleted: 'Master clue scrolls',
  collectionLogGained: 'New collection log items',
  skillLevelGained: 'Levels gained in a skill',
  skillXpGained: 'XP gained in a skill',
  xpGainedLowestSkill: "XP gained in the player's lowest skill",
  levelsGainedLowestSkill: "Levels gained in the player's lowest skill",
  itemCount: 'Obtain a set of items (total quantity)',
  bigDropsCount: 'Multiple drops worth at least... (count)',
  maxDeaths: 'Max deaths allowed (lower = harder)',
  petsObtained: 'Pets obtained',
};

const inputClass =
  'w-24 rounded-lg border border-stone-700 bg-stone-900 px-2 py-1 text-sm focus:border-amber-500 focus:outline-none';

function deepClone(settings: RandomizeSettings): RandomizeSettings {
  return JSON.parse(JSON.stringify(settings)) as RandomizeSettings;
}

export default function AdminRandomizeSettingsPage() {
  const [settings, setSettings] = useState<RandomizeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await getSupabase().from('randomize_settings').select('settings').eq('id', true).maybeSingle();
        setSettings((data?.settings as RandomizeSettings | undefined) ?? deepClone(DEFAULT_RANDOMIZE_SETTINGS));
      } catch (err) {
        console.error('Failed to load randomize settings', err);
        setSettings(deepClone(DEFAULT_RANDOMIZE_SETTINGS));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function updateThreshold(type: ThresholdConditionType, difficulty: Difficulty, value: number) {
    setSettings((s) => (s ? { ...s, thresholds: { ...s.thresholds, [type]: { ...s.thresholds[type], [difficulty]: value } } } : s));
  }

  function updateBigDropsThreshold(difficulty: Difficulty, value: number) {
    setSettings((s) =>
      s ? { ...s, bigDropsCountDropValueThreshold: { ...s.bigDropsCountDropValueThreshold, [difficulty]: value } } : s,
    );
  }

  function updatePoints(difficulty: Difficulty, value: number) {
    setSettings((s) => (s ? { ...s, pointsByDifficulty: { ...s.pointsByDifficulty, [difficulty]: value } } : s));
  }

  function updateKcTierThreshold(tier: KcTier, difficulty: Difficulty, value: number) {
    setSettings((s) =>
      s
        ? {
            ...s,
            kcTiers: {
              ...s.kcTiers,
              tierThresholds: { ...s.kcTiers.tierThresholds, [tier]: { ...s.kcTiers.tierThresholds[tier], [difficulty]: value } },
            },
          }
        : s,
    );
  }

  function updateBossTier(boss: string, tier: KcTier) {
    setSettings((s) =>
      s ? { ...s, kcTiers: { ...s.kcTiers, bossToTier: { ...s.kcTiers.bossToTier, [boss]: tier } } } : s,
    );
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setError('');
    try {
      const supabase = getSupabase();
      const { error: upsertError } = await supabase
        .from('randomize_settings')
        .upsert({ id: true, settings, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (upsertError) throw upsertError;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Randomize settings</h1>
          <p className="mt-1 text-sm text-stone-500">
            Powers BACKLOG.md #5's "Randomize" button on a host's board editor -- these are the goal numbers a
            generated tile picks from at each difficulty.
          </p>
        </div>
        {settings && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSettings(deepClone(DEFAULT_RANDOMIZE_SETTINGS))}
              className="rounded-lg border border-stone-700 px-3 py-2 text-xs text-stone-400"
            >
              Reset to defaults
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-amber-500 hover:bg-amber-400 transition-colors px-4 py-2 text-sm font-semibold text-stone-950 disabled:opacity-40"
            >
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {loading && <p className="mt-6 text-stone-500">Loading…</p>}

      {settings && (
        <>
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Points per difficulty</h2>
            <div className="mt-3 flex gap-6">
              {DIFFICULTIES.map((d) => (
                <label key={d} className="flex flex-col gap-1 text-xs capitalize text-stone-400">
                  {d}
                  <input
                    type="number"
                    min={0}
                    value={settings.pointsByDifficulty[d]}
                    onChange={(e) => updatePoints(d, Number(e.target.value))}
                    className={inputClass}
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-semibold">Thresholds</h2>
            <p className="mt-1 text-xs text-stone-500">
              The goal number a generated tile of this type gets, per difficulty. `kcGained` isn't here -- see boss
              farm-rate tiers below instead.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-800 text-xs uppercase text-stone-500">
                    <th className="py-2 pr-4">Condition</th>
                    {DIFFICULTIES.map((d) => (
                      <th key={d} className="py-2 pr-4 capitalize">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(settings.thresholds) as ThresholdConditionType[]).map((type) => (
                    <tr key={type} className="border-b border-stone-900">
                      <td className="py-2 pr-4 text-stone-300">{THRESHOLD_LABELS[type]}</td>
                      {DIFFICULTIES.map((d) => (
                        <td key={d} className="py-2 pr-4">
                          <input
                            type="number"
                            min={0}
                            value={settings.thresholds[type][d]}
                            onChange={(e) => updateThreshold(type, d, Number(e.target.value))}
                            className={inputClass}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td className="py-2 pr-4 text-stone-300">Big drops -- minimum value per drop (gp)</td>
                    {DIFFICULTIES.map((d) => (
                      <td key={d} className="py-2 pr-4">
                        <input
                          type="number"
                          min={100_000}
                          value={settings.bigDropsCountDropValueThreshold[d]}
                          onChange={(e) => updateBigDropsThreshold(d, Number(e.target.value))}
                          className={inputClass}
                        />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-semibold">Boss KC farm-rate tiers</h2>
            <p className="mt-1 text-xs text-stone-500">
              A `kcGained` tile's threshold comes from its boss's tier here, not a flat number -- 79 bosses span too
              wide a farm-rate range for one KC goal to make sense for all of them.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-4">
              {KC_TIERS.map((tier) => (
                <div key={tier} className="rounded-lg border border-stone-800 p-3">
                  <p className="text-sm font-medium capitalize text-stone-200">{tier}</p>
                  <div className="mt-2 flex flex-col gap-2">
                    {DIFFICULTIES.map((d) => (
                      <label key={d} className="flex items-center justify-between gap-2 text-xs capitalize text-stone-400">
                        {d}
                        <input
                          type="number"
                          min={0}
                          value={settings.kcTiers.tierThresholds[tier][d]}
                          onChange={(e) => updateKcTierThreshold(tier, d, Number(e.target.value))}
                          className={inputClass}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 max-h-96 overflow-y-auto rounded-lg border border-stone-800">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-stone-950">
                  <tr className="border-b border-stone-800 text-xs uppercase text-stone-500">
                    <th className="py-2 pl-3 pr-4">Boss / minigame / raid</th>
                    <th className="py-2 pr-3">Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {BOSS_ACTIVITIES.map((b) => (
                    <tr key={b.name} className="border-b border-stone-900">
                      <td className="py-1.5 pl-3 pr-4 text-stone-300">{b.name}</td>
                      <td className="py-1.5 pr-3">
                        <select
                          value={settings.kcTiers.bossToTier[b.name] ?? 'fast'}
                          onChange={(e) => updateBossTier(b.name, e.target.value as KcTier)}
                          className="rounded-lg border border-stone-700 bg-stone-900 px-2 py-1 text-xs capitalize"
                        >
                          {KC_TIERS.map((tier) => (
                            <option key={tier} value={tier}>
                              {tier}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </AdminLayout>
  );
}
