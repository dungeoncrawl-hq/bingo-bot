import { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { getSupabase } from '../db/supabaseClient';
import { DEFAULT_BANTER_POOLS, type BanterPools } from '../server/discordBanter';
import { DEFAULT_TITLE_TEMPLATES, type TitleTemplates } from '../server/discordTitles';

type Pools = Record<keyof BanterPools, string[]>;
type Titles = TitleTemplates;

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

// BACKLOG.md #9's title slots -- unlike the banter pools above (many
// randomized variants, one picked per event), each of these is a single
// deterministic string: exactly one title for a given completion. Grouped
// the way a host actually thinks about them (what happens for an ordinary
// tile vs. a boss room vs. a line vs. the whole board) rather than as one
// flat list of 6.
const TITLE_EXAMPLE = { subject: 'ExampleRSN', phrase: '1,000,000 total XP', bossLabel: 'a boss' };

interface TitleSlotInfo {
  label: string;
  placeholders: (keyof typeof TITLE_EXAMPLE)[];
}

const TITLE_SLOT_INFO: Record<keyof TitleTemplates, TitleSlotInfo> = {
  tileFirst: { label: 'First to complete a tile', placeholders: ['subject', 'phrase'] },
  tileNotFirst: { label: 'Completed a tile, not first', placeholders: ['subject', 'phrase'] },
  bossFirst: { label: 'First to defeat an Adventure boss', placeholders: ['subject', 'bossLabel', 'phrase'] },
  bossNotFirst: { label: 'Defeated a boss, not first', placeholders: ['subject', 'bossLabel', 'phrase'] },
  lineCompletion: { label: 'Line completed', placeholders: ['subject'] },
  boardCompletion: { label: 'Whole board completed', placeholders: ['subject'] },
};

const TITLE_GROUPS: { heading: string; description?: string; slots: (keyof TitleTemplates)[] }[] = [
  { heading: 'Tile completions', slots: ['tileFirst', 'tileNotFirst'] },
  {
    heading: 'Boss completions',
    description: 'Adventure boards only, but shown here regardless of board type -- same as the flavor pools below.',
    slots: ['bossFirst', 'bossNotFirst'],
  },
  { heading: 'Line completed', slots: ['lineCompletion'] },
  { heading: 'Whole board completed', slots: ['boardCompletion'] },
];

// Generic {key} substitution, matching discordBanter.ts's fill() -- kept
// as its own tiny local copy (rather than importing the server module's
// function into a client bundle) since this page already had its own
// copy for the banter previews below.
function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

function deepClonePools(pools: Pools): Pools {
  return JSON.parse(JSON.stringify(pools)) as Pools;
}

const inputClass =
  'w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none';

export default function AdminDiscordTemplatesPage() {
  const [pools, setPools] = useState<Pools | null>(null);
  const [titles, setTitles] = useState<Titles | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const supabase = getSupabase();
        const [poolsRes, titlesRes] = await Promise.all([
          supabase.from('discord_banter_lines').select('pool,template').order('sort_order', { ascending: true }),
          supabase.from('discord_title_templates').select('slot,template'),
        ]);

        const poolRows = (poolsRes.data as { pool: keyof BanterPools; template: string }[] | null) ?? [];
        if (poolRows.length === 0) {
          setPools(deepClonePools(DEFAULT_BANTER_POOLS));
        } else {
          const grouped: Pools = { firstTile: [], notFirstTile: [], firstBoss: [], notFirstBoss: [], boardCompletion: [] };
          for (const row of poolRows) grouped[row.pool].push(row.template);
          setPools(grouped);
        }

        // Per-slot fallback to the default, mirroring discordTitleStore.ts
        // exactly -- what an admin previews here is what actually posts.
        const titleRows = (titlesRes.data as { slot: keyof TitleTemplates; template: string }[] | null) ?? [];
        const nextTitles: Titles = { ...DEFAULT_TITLE_TEMPLATES };
        for (const row of titleRows) {
          if (row.template.trim().length > 0) nextTitles[row.slot] = row.template;
        }
        setTitles(nextTitles);
      } catch (err) {
        console.error('Failed to load Discord templates', err);
        setPools(deepClonePools(DEFAULT_BANTER_POOLS));
        setTitles({ ...DEFAULT_TITLE_TEMPLATES });
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

  function updateTitle(slot: keyof TitleTemplates, value: string) {
    setTitles((t) => (t ? { ...t, [slot]: value } : t));
  }

  function resetTitleSlot(slot: keyof TitleTemplates) {
    setTitles((t) => (t ? { ...t, [slot]: DEFAULT_TITLE_TEMPLATES[slot] } : t));
  }

  function resetAllToDefaults() {
    setPools(deepClonePools(DEFAULT_BANTER_POOLS));
    setTitles({ ...DEFAULT_TITLE_TEMPLATES });
  }

  async function handleSave() {
    if (!pools || !titles) return;
    setSaving(true);
    setError('');
    try {
      const supabase = getSupabase();

      const { error: deleteError } = await supabase.from('discord_banter_lines').delete().neq('pool', '');
      if (deleteError) throw deleteError;
      const poolRows = POOL_ORDER.flatMap((pool) =>
        pools[pool]
          .map((template) => template.trim())
          .filter((template) => template.length > 0)
          .map((template, index) => ({ pool, template, sort_order: index })),
      );
      if (poolRows.length > 0) {
        const { error: insertError } = await supabase.from('discord_banter_lines').insert(poolRows);
        if (insertError) throw insertError;
      }

      // One row per slot, upserted -- unlike the banter pools above, a
      // title slot is a single value, not an ordered list to replace
      // wholesale, so there's no delete-everything-first step needed.
      const titleRows = (Object.keys(titles) as (keyof TitleTemplates)[]).map((slot) => ({
        slot,
        template: titles[slot].trim(),
        updated_at: new Date().toISOString(),
      }));
      const { error: titlesError } = await supabase.from('discord_title_templates').upsert(titleRows, { onConflict: 'slot' });
      if (titlesError) throw titlesError;

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Discord templates</h1>
          <p className="mt-1 text-sm text-stone-500">
            Titles are the fixed headline of a completion post; the flavor lines below are randomized -- one is
            picked at random each time.
          </p>
        </div>
        {pools && titles && (
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={resetAllToDefaults} className="rounded-lg border border-stone-700 px-3 py-2 text-xs text-stone-400">
              Reset all to defaults
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

      {titles && (
        <div className="mt-8 space-y-8">
          <h2 className="text-lg font-semibold">Titles</h2>
          {TITLE_GROUPS.map((group) => (
            <section key={group.heading}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-400">{group.heading}</h3>
              {group.description && <p className="mt-1 text-xs text-stone-500">{group.description}</p>}
              <div className="mt-3 space-y-4">
                {group.slots.map((slot) => {
                  const info = TITLE_SLOT_INFO[slot];
                  const value = titles[slot];
                  const previewVars = Object.fromEntries(info.placeholders.map((p) => [p, TITLE_EXAMPLE[p]]));
                  const missingSubject = info.placeholders.includes('subject') && !value.includes('{subject}');
                  return (
                    <div key={slot}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-stone-400">{info.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {info.placeholders.map((p) => (
                            <code key={p} className="rounded bg-stone-900 px-1.5 py-0.5 text-[11px] text-amber-400">{`{${p}}`}</code>
                          ))}
                        </div>
                      </div>
                      <div className="mt-1 flex items-start gap-2">
                        <input value={value} onChange={(e) => updateTitle(slot, e.target.value)} className={inputClass} />
                        <button
                          type="button"
                          onClick={() => resetTitleSlot(slot)}
                          className="mt-1 shrink-0 whitespace-nowrap text-xs text-stone-500 underline hover:text-stone-300"
                        >
                          Reset
                        </button>
                      </div>
                      {value.trim() && <p className="mt-1 text-xs text-stone-500">Preview: {fill(value, previewVars)}</p>}
                      {missingSubject && (
                        <p className="mt-1 text-xs text-amber-500">
                          ⚠ Doesn't use <code className="rounded bg-stone-900 px-1 py-0.5">{'{subject}'}</code> -- this
                          title won't say who did it. Still saves fine if that's what you want.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {pools && (
        <div className="mt-10 space-y-8 border-t border-stone-800 pt-8">
          <h2 className="text-lg font-semibold">Flavor lines</h2>
          {POOL_ORDER.map((pool) => {
            const info = POOL_INFO[pool];
            return (
              <section key={pool}>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-400">{info.title}</h3>
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
