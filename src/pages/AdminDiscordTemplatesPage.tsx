import { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { getSupabase } from '../db/supabaseClient';
import { DEFAULT_BANTER_POOLS, type BanterPools } from '../server/discordBanter';

type Pools = Record<keyof BanterPools, string[]>;

const POOL_INFO: Record<keyof BanterPools, { title: string; description: string; placeholder: string | null; sample: string }> = {
  firstTile: {
    title: 'First to complete a tile',
    description: 'Posted when a player is the first to finish a tile.',
    placeholder: '{points}',
    sample: '+8 pts. Absolutely no chill.',
  },
  notFirstTile: {
    title: 'Completed a tile, not first',
    description: "Posted when someone else already beat them to that tile.",
    placeholder: '{rsn}',
    sample: 'Unfortunately not as fast as ExampleRSN, though.',
  },
  firstBoss: {
    title: 'First to defeat an Adventure boss',
    description: 'Same as "first to complete a tile" but for a boss room.',
    placeholder: '{points}',
    sample: '+12 pts. Absolutely demolished.',
  },
  notFirstBoss: {
    title: 'Defeated a boss, not first',
    description: 'Same as "completed a tile, not first" but for a boss room.',
    placeholder: '{rsn}',
    sample: 'ExampleRSN already claimed this kill. Better luck on the next one.',
  },
  boardCompletion: {
    title: 'Whole board completed',
    description: 'Posted once when a player clears every tile.',
    placeholder: null,
    sample: 'Every tile conquered.',
  },
};

const POOL_ORDER = Object.keys(POOL_INFO) as (keyof BanterPools)[];

function fill(template: string, vars: { points: string; rsn: string }): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => (key in vars ? vars[key as keyof typeof vars] : ''));
}

function deepClone(pools: Pools): Pools {
  return JSON.parse(JSON.stringify(pools)) as Pools;
}

const inputClass =
  'w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none';

export default function AdminDiscordTemplatesPage() {
  const [pools, setPools] = useState<Pools | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await getSupabase().from('discord_banter_lines').select('pool,template').order('sort_order', { ascending: true });
        const rows = (data as { pool: keyof BanterPools; template: string }[] | null) ?? [];
        if (rows.length === 0) {
          setPools(deepClone(DEFAULT_BANTER_POOLS));
        } else {
          const grouped: Pools = { firstTile: [], notFirstTile: [], firstBoss: [], notFirstBoss: [], boardCompletion: [] };
          for (const row of rows) grouped[row.pool].push(row.template);
          setPools(grouped);
        }
      } catch (err) {
        console.error('Failed to load Discord banter pools', err);
        setPools(deepClone(DEFAULT_BANTER_POOLS));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function updateLine(pool: keyof BanterPools, index: number, value: string) {
    setPools((p) => {
      if (!p) return p;
      const next = { ...p, [pool]: [...p[pool]] };
      next[pool][index] = value;
      return next;
    });
  }

  function addLine(pool: keyof BanterPools) {
    setPools((p) => (p ? { ...p, [pool]: [...p[pool], ''] } : p));
  }

  function removeLine(pool: keyof BanterPools, index: number) {
    setPools((p) => (p ? { ...p, [pool]: p[pool].filter((_, i) => i !== index) } : p));
  }

  async function handleSave() {
    if (!pools) return;
    setSaving(true);
    setError('');
    try {
      const supabase = getSupabase();
      const { error: deleteError } = await supabase.from('discord_banter_lines').delete().neq('pool', '');
      if (deleteError) throw deleteError;

      const rows = POOL_ORDER.flatMap((pool) =>
        pools[pool]
          .map((template) => template.trim())
          .filter((template) => template.length > 0)
          .map((template, index) => ({ pool, template, sort_order: index })),
      );
      if (rows.length > 0) {
        const { error: insertError } = await supabase.from('discord_banter_lines').insert(rows);
        if (insertError) throw insertError;
      }
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
          <h1 className="text-2xl font-semibold">Discord templates</h1>
          <p className="mt-1 text-sm text-stone-500">
            BACKLOG.md #9 -- randomized flavor lines for completion embeds. One is picked at random each time. Fixed
            title text isn't editable here yet.
          </p>
        </div>
        {pools && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPools(deepClone(DEFAULT_BANTER_POOLS))}
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

      {pools && (
        <div className="mt-8 space-y-8">
          {POOL_ORDER.map((pool) => {
            const info = POOL_INFO[pool];
            return (
              <section key={pool}>
                <h2 className="text-lg font-semibold">{info.title}</h2>
                <p className="mt-1 text-xs text-stone-500">
                  {info.description}
                  {info.placeholder && (
                    <>
                      {' '}
                      Use <code className="rounded bg-stone-900 px-1 py-0.5">{info.placeholder}</code> where it should
                      go.
                    </>
                  )}
                </p>
                <div className="mt-3 space-y-2">
                  {pools[pool].map((line, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="flex-1">
                        <input
                          value={line}
                          onChange={(e) => updateLine(pool, i, e.target.value)}
                          placeholder={info.sample}
                          className={inputClass}
                        />
                        {line.trim() && (
                          <p className="mt-1 text-xs text-stone-500">
                            Preview: {fill(line, { points: '8', rsn: 'ExampleRSN' })}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(pool, i)}
                        className="mt-1 shrink-0 text-xs text-red-400 underline"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {pools[pool].length === 0 && <p className="text-xs text-stone-600">No lines -- falls back to the hardcoded defaults.</p>}
                </div>
                <button
                  type="button"
                  onClick={() => addLine(pool)}
                  className="mt-2 rounded-lg border border-stone-700 px-3 py-1.5 text-xs text-stone-300"
                >
                  + Add line
                </button>
              </section>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
