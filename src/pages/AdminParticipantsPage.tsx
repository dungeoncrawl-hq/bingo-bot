import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import { getSupabase } from '../db/supabaseClient';
import { formatBytes } from '../lib/format';

interface ParticipantRow {
  id: string;
  rsn: string;
  joined_at: string;
  screenshot_count: number;
  screenshot_bytes: number;
  webhook_call_count: number;
  last_webhook_at: string | null;
  challenges: { name: string; slug: string } | null;
}

type SortKey = 'rsn' | 'challenge' | 'joined_at' | 'screenshot_count' | 'screenshot_bytes' | 'webhook_call_count' | 'last_webhook_at';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'rsn', label: 'RSN' },
  { key: 'challenge', label: 'Dungeon' },
  { key: 'joined_at', label: 'Joined' },
  { key: 'screenshot_count', label: 'Screenshots' },
  { key: 'screenshot_bytes', label: 'Storage' },
  { key: 'webhook_call_count', label: 'Webhook calls' },
  { key: 'last_webhook_at', label: 'Last active' },
];

function sortValue(r: ParticipantRow, key: SortKey): string | number {
  switch (key) {
    case 'rsn':
      return r.rsn.toLowerCase();
    case 'challenge':
      return r.challenges?.name.toLowerCase() ?? '';
    case 'joined_at':
      return r.joined_at;
    case 'screenshot_count':
      return r.screenshot_count;
    case 'screenshot_bytes':
      return r.screenshot_bytes;
    case 'webhook_call_count':
      return r.webhook_call_count;
    case 'last_webhook_at':
      return r.last_webhook_at ?? '';
  }
}

export default function AdminParticipantsPage() {
  const [rows, setRows] = useState<ParticipantRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  // Busiest-first by default -- this table exists to spot abuse/neglect,
  // not to browse alphabetically.
  const [sortKey, setSortKey] = useState<SortKey>('webhook_call_count');
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await getSupabase()
          .from('challenge_participants')
          .select('id, rsn, joined_at, screenshot_count, screenshot_bytes, webhook_call_count, last_webhook_at, challenges(name, slug)');
        if (error) throw error;
        setRows((data as unknown as ParticipantRow[]) ?? []);
      } catch (err) {
        console.error('Failed to load participants', err);
        setLoadError(true);
      }
    }
    load();
  }, []);

  const totals = useMemo(
    () =>
      (rows ?? []).reduce(
        (acc, r) => ({ bytes: acc.bytes + r.screenshot_bytes, calls: acc.calls + r.webhook_call_count }),
        { bytes: 0, calls: 0 },
      ),
    [rows],
  );

  const sorted = useMemo(() => {
    if (!rows) return [];
    const q = query.toLowerCase();
    const filtered = rows.filter((r) => r.rsn.toLowerCase().includes(q) || (r.challenges?.name.toLowerCase() ?? '').includes(q));
    const dir = sortDesc ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [rows, query, sortKey, sortDesc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  return (
    <AdminLayout>
      <h1 className="text-2xl font-semibold">Participants</h1>
      <p className="mt-1 text-sm text-stone-500">One row per dungeon a player has joined. Sort by webhook calls to spot abuse.</p>
      {loadError && <p className="mt-4 text-sm text-red-400">Couldn't load participants. Try refreshing the page.</p>}
      {!loadError && !rows && <p className="mt-4 text-stone-500">Loading…</p>}
      {rows && rows.length === 0 && <p className="mt-4 text-stone-500">No one's joined any dungeon yet.</p>}
      {rows && rows.length > 0 && (
        <>
          <div className="mt-6 grid max-w-lg grid-cols-3 gap-3">
            <div className="rounded-lg border border-stone-800 bg-stone-900/40 px-3 py-2">
              <div className="text-[10px] uppercase text-stone-500">Rows</div>
              <div className="text-lg font-semibold tabular-nums text-stone-200">{rows.length}</div>
            </div>
            <div className="rounded-lg border border-stone-800 bg-stone-900/40 px-3 py-2">
              <div className="text-[10px] uppercase text-stone-500">Storage</div>
              <div className="text-lg font-semibold tabular-nums text-stone-200">{formatBytes(totals.bytes)}</div>
            </div>
            <div className="rounded-lg border border-stone-800 bg-stone-900/40 px-3 py-2">
              <div className="text-[10px] uppercase text-stone-500">Webhook calls</div>
              <div className="text-lg font-semibold tabular-nums text-stone-200">{totals.calls.toLocaleString()}</div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search RSN or dungeon..."
              className="max-w-xs flex-1 rounded-lg border border-stone-700 bg-stone-900 px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
            />
            <span className="text-xs text-stone-600">
              {sorted.length} of {rows.length}
            </span>
          </div>

          {sorted.length === 0 && <p className="mt-6 text-stone-500">No participants match.</p>}

          {sorted.length > 0 && (
            <>
              <div className="mt-4 hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-stone-800 text-xs uppercase text-stone-500">
                      {COLUMNS.map((col) => (
                        <th key={col.key} className="cursor-pointer select-none py-2 pr-4 hover:text-stone-300" onClick={() => toggleSort(col.key)}>
                          {col.label}
                          {sortKey === col.key && <span className="ml-1">{sortDesc ? '↓' : '↑'}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r) => (
                      <tr key={r.id} className="border-b border-stone-900">
                        <td className="py-2 pr-4">{r.rsn}</td>
                        <td className="py-2 pr-4">
                          {r.challenges ? (
                            <Link to={`/c/${r.challenges.slug}/edit`} className="text-stone-400 underline hover:text-stone-200">
                              {r.challenges.name}
                            </Link>
                          ) : (
                            <span className="text-stone-600">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-stone-400">{new Date(r.joined_at).toLocaleDateString()}</td>
                        <td className={`py-2 pr-4 tabular-nums ${r.screenshot_count > 0 ? 'text-amber-400' : 'text-stone-600'}`}>{r.screenshot_count}</td>
                        <td className="py-2 pr-4 tabular-nums text-stone-400">{formatBytes(r.screenshot_bytes)}</td>
                        <td className="py-2 pr-4 tabular-nums">{r.webhook_call_count.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-stone-400">{r.last_webhook_at ? new Date(r.last_webhook_at).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 space-y-2 sm:hidden">
                {sorted.map((r) => (
                  <div key={r.id} className="rounded-lg border border-stone-800 bg-stone-900/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-stone-100">{r.rsn}</span>
                      <span className="shrink-0 text-xs text-stone-500">{r.last_webhook_at ? new Date(r.last_webhook_at).toLocaleString() : '—'}</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-stone-500">
                      {r.challenges ? (
                        <Link to={`/c/${r.challenges.slug}/edit`} className="underline hover:text-stone-300">
                          {r.challenges.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </div>
                    <div className="mt-2 flex gap-4 text-xs">
                      <span className={r.screenshot_count > 0 ? 'text-amber-400' : 'text-stone-500'}>
                        <span className="tabular-nums font-medium">{r.screenshot_count}</span> screenshots · {formatBytes(r.screenshot_bytes)}
                      </span>
                      <span className="text-stone-400">
                        <span className="tabular-nums font-medium">{r.webhook_call_count.toLocaleString()}</span> calls
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </AdminLayout>
  );
}
