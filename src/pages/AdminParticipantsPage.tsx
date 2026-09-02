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

type SortKey = 'rsn' | 'challenge' | 'joined_at' | 'screenshot_count' | 'webhook_call_count' | 'last_webhook_at';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'rsn', label: 'RSN' },
  { key: 'challenge', label: 'Challenge' },
  { key: 'joined_at', label: 'Joined' },
  { key: 'screenshot_count', label: 'Screenshots' },
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
    case 'webhook_call_count':
      return r.webhook_call_count;
    case 'last_webhook_at':
      return r.last_webhook_at ?? '';
  }
}

export default function AdminParticipantsPage() {
  const [rows, setRows] = useState<ParticipantRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
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

  const sorted = useMemo(() => {
    if (!rows) return [];
    const dir = sortDesc ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [rows, sortKey, sortDesc]);

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
      {loadError && <p className="mt-4 text-sm text-red-400">Couldn't load participants. Try refreshing the page.</p>}
      {!loadError && !rows && <p className="mt-4 text-stone-500">Loading…</p>}
      {rows && rows.length === 0 && <p className="mt-4 text-stone-500">No one's joined any challenge yet.</p>}
      {rows && rows.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
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
                  <td className="py-2 pr-4">
                    {r.screenshot_count > 0 ? (
                      <span className="text-amber-400">
                        {r.screenshot_count} ({formatBytes(r.screenshot_bytes)})
                      </span>
                    ) : (
                      <span className="text-stone-600">0</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">{r.webhook_call_count}</td>
                  <td className="py-2 pr-4 text-stone-400">{r.last_webhook_at ? new Date(r.last_webhook_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
