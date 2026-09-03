import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { getSupabase } from '../db/supabaseClient';

interface AccountRow {
  id: string;
  display_name: string;
  created_at: string;
  is_site_admin: boolean;
  default_rsn: string | null;
  hosted: number;
  participating: number;
}

type SortKey = 'display_name' | 'created_at' | 'hosted' | 'participating' | 'default_rsn' | 'is_site_admin';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'display_name', label: 'Account' },
  { key: 'created_at', label: 'Created' },
  { key: 'hosted', label: 'Dungeons hosted' },
  { key: 'participating', label: 'Participating in' },
  { key: 'default_rsn', label: 'Default RSN' },
  { key: 'is_site_admin', label: 'Site admin' },
];

function sortValue(r: AccountRow, key: SortKey): string | number {
  switch (key) {
    case 'display_name':
      return r.display_name.toLowerCase();
    case 'created_at':
      return r.created_at;
    case 'hosted':
      return r.hosted;
    case 'participating':
      return r.participating;
    case 'default_rsn':
      return r.default_rsn?.toLowerCase() ?? '';
    case 'is_site_admin':
      return r.is_site_admin ? 1 : 0;
  }
}

export default function AdminAccountsPage() {
  const [rows, setRows] = useState<AccountRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  // Newest accounts first by default -- this page exists to see who's
  // signing up, not to browse alphabetically.
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const supabase = getSupabase();
        const [profiles, challenges, participants] = await Promise.all([
          supabase.from('profiles').select('id, display_name, created_at, is_site_admin, default_rsn'),
          supabase.from('challenges').select('host_id'),
          supabase.from('challenge_participants').select('profile_id'),
        ]);
        if (profiles.error) throw profiles.error;
        if (challenges.error) throw challenges.error;
        if (participants.error) throw participants.error;

        const hostedCounts = new Map<string, number>();
        for (const c of (challenges.data as { host_id: string }[]) ?? []) {
          hostedCounts.set(c.host_id, (hostedCounts.get(c.host_id) ?? 0) + 1);
        }
        const participatingCounts = new Map<string, number>();
        for (const p of (participants.data as { profile_id: string }[]) ?? []) {
          participatingCounts.set(p.profile_id, (participatingCounts.get(p.profile_id) ?? 0) + 1);
        }

        const merged: AccountRow[] = (
          (profiles.data as Omit<AccountRow, 'hosted' | 'participating'>[]) ?? []
        ).map((p) => ({
          ...p,
          hosted: hostedCounts.get(p.id) ?? 0,
          participating: participatingCounts.get(p.id) ?? 0,
        }));
        setRows(merged);
      } catch (err) {
        console.error('Failed to load accounts', err);
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
      <h1 className="text-2xl font-semibold">Accounts</h1>
      <p className="mt-1 text-sm text-stone-500">Every registered account, newest first by default.</p>
      {loadError && <p className="mt-4 text-sm text-red-400">Couldn't load accounts. Try refreshing the page.</p>}
      {!loadError && !rows && <p className="mt-4 text-stone-500">Loading…</p>}
      {rows && rows.length === 0 && <p className="mt-4 text-stone-500">No accounts yet.</p>}
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
                  <td className="py-2 pr-4">{r.display_name}</td>
                  <td className="py-2 pr-4 text-stone-400">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="py-2 pr-4">{r.hosted}</td>
                  <td className="py-2 pr-4">{r.participating}</td>
                  <td className="py-2 pr-4 text-stone-400">{r.default_rsn ?? <span className="text-stone-600">—</span>}</td>
                  <td className="py-2 pr-4">
                    {r.is_site_admin ? <span className="text-amber-400">Yes</span> : <span className="text-stone-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
