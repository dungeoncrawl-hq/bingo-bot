import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import { getSupabase } from '../db/supabaseClient';
import { formatDateRange, GAME_MODE_LABEL } from '../lib/dungeonStatus';
import { gridSizeFromBoardSize } from '../lib/tileConditions';
import { ADVENTURE_SMALL_TILES_IN_PLAY } from '../lib/adventureProgress';
import type { Challenge } from '../db/types';

type RawStatus = Challenge['status'];
type StatusFilter = RawStatus | 'all';

interface DungeonRow {
  id: string;
  name: string;
  slug: string;
  status: RawStatus;
  board_type: string;
  board_size: string | null;
  game_mode: Challenge['game_mode'];
  host_id: string;
  hostName: string;
  start_date: string;
  end_date: string;
  created_at: string;
  tilesPlaced: number;
  tilesTotal: number;
  participants: number;
}

// The raw DB status ('draft'/'active'/'ended') a site admin cares
// about here -- distinct from dungeonStatus.ts's STATUS_STYLE, which
// covers the different DisplayStatus concept ('draft'/'upcoming'/
// 'active'/'past') the player-facing dashboard derives from dates.
// These aren't the same thing and shouldn't be merged.
const ADMIN_STATUS_STYLE: Record<RawStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'border-stone-700 text-stone-400' },
  active: { label: 'Active', className: 'border-green-800 text-green-400' },
  ended: { label: 'Ended', className: 'border-stone-800 text-stone-500' },
};

function tilesTotalFor(row: { board_type: string; board_size: string | null }): number {
  if (row.board_type === 'adventure') return ADVENTURE_SMALL_TILES_IN_PLAY;
  const size = gridSizeFromBoardSize(row.board_size);
  return size * size;
}

function formatLabel(row: { board_type: string; board_size: string | null; game_mode: Challenge['game_mode'] }): string {
  const shape = row.board_type === 'adventure' ? 'Adventure' : `Standard ${gridSizeFromBoardSize(row.board_size)}x${gridSizeFromBoardSize(row.board_size)}`;
  return `${shape} · ${GAME_MODE_LABEL[row.game_mode]}`;
}

type SortKey = 'name' | 'status' | 'host' | 'tiles' | 'participants';

function sortValue(r: DungeonRow, key: SortKey): string | number {
  switch (key) {
    case 'name':
      return r.name.toLowerCase();
    case 'status':
      return r.status;
    case 'host':
      return r.hostName.toLowerCase();
    case 'tiles':
      return r.tilesTotal > 0 ? r.tilesPlaced / r.tilesTotal : 0;
    case 'participants':
      return r.participants;
  }
}

export default function AdminDungeonsPage() {
  const [params] = useSearchParams();
  const [rows, setRows] = useState<DungeonRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  // Seeded once from the URL (the Dashboard's Draft/Active/Ended tiles
  // land here with ?status=draft etc.) -- read on mount only, not kept
  // reactively in sync, since every real entry point is a fresh
  // navigation from another route.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const s = params.get('status');
    return s === 'draft' || s === 'active' || s === 'ended' ? s : 'all';
  });
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDesc, setSortDesc] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const supabase = getSupabase();
        const [challenges, profiles, tiles, participants] = await Promise.all([
          supabase.from('challenges').select('id,name,slug,status,board_type,board_size,game_mode,host_id,start_date,end_date,created_at'),
          supabase.from('profiles').select('id, display_name'),
          supabase.from('tiles').select('id, challenge_id'),
          supabase.from('challenge_participants').select('id, challenge_id'),
        ]);
        if (challenges.error) throw challenges.error;
        if (profiles.error) throw profiles.error;
        if (tiles.error) throw tiles.error;
        if (participants.error) throw participants.error;

        const hostNameById = new Map<string, string>();
        for (const p of (profiles.data as { id: string; display_name: string }[]) ?? []) hostNameById.set(p.id, p.display_name);
        const tileCounts = new Map<string, number>();
        for (const t of (tiles.data as { challenge_id: string }[]) ?? []) tileCounts.set(t.challenge_id, (tileCounts.get(t.challenge_id) ?? 0) + 1);
        const participantCounts = new Map<string, number>();
        for (const p of (participants.data as { challenge_id: string }[]) ?? [])
          participantCounts.set(p.challenge_id, (participantCounts.get(p.challenge_id) ?? 0) + 1);

        const merged: DungeonRow[] = ((challenges.data as Omit<DungeonRow, 'hostName' | 'tilesPlaced' | 'tilesTotal' | 'participants'>[]) ?? []).map(
          (c) => ({
            ...c,
            hostName: hostNameById.get(c.host_id) ?? 'Unknown',
            tilesPlaced: tileCounts.get(c.id) ?? 0,
            tilesTotal: tilesTotalFor(c),
            participants: participantCounts.get(c.id) ?? 0,
          }),
        );
        setRows(merged);
      } catch (err) {
        console.error('Failed to load dungeons', err);
        setLoadError(true);
      }
    }
    load();
  }, []);

  const counts = useMemo(() => {
    const c = { all: 0, draft: 0, active: 0, ended: 0 };
    for (const r of rows ?? []) {
      c.all++;
      c[r.status]++;
    }
    return c;
  }, [rows]);

  const sorted = useMemo(() => {
    if (!rows) return [];
    const q = query.toLowerCase();
    const filtered = rows.filter(
      (r) =>
        (statusFilter === 'all' || r.status === statusFilter) &&
        (r.name.toLowerCase().includes(q) || r.hostName.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q)),
    );
    const dir = sortDesc ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [rows, query, statusFilter, sortKey, sortDesc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(false);
    }
  }

  const STATUS_PILLS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Draft' },
    { key: 'active', label: 'Active' },
    { key: 'ended', label: 'Ended' },
  ];

  return (
    <AdminLayout>
      <h1 className="text-2xl font-semibold">Dungeons</h1>
      <p className="mt-1 text-sm text-stone-500">Every dungeon hosted on the site.</p>

      {loadError && <p className="mt-4 text-sm text-red-400">Couldn't load dungeons. Try refreshing the page.</p>}
      {!loadError && !rows && <p className="mt-4 text-stone-500">Loading…</p>}

      {rows && (
        <>
          <div className="mt-6 flex flex-wrap gap-1.5">
            {STATUS_PILLS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setStatusFilter(p.key)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                  statusFilter === p.key ? 'border-amber-500 bg-stone-900 text-amber-400' : 'border-stone-700 bg-stone-900/50 text-stone-400'
                }`}
              >
                {p.label} <span className="tabular-nums">{counts[p.key]}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or host..."
              className="max-w-xs flex-1 rounded-lg border border-stone-700 bg-stone-900 px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
            />
            <span className="text-xs text-stone-600">
              {sorted.length} of {rows.length}
            </span>
          </div>

          {sorted.length === 0 && <p className="mt-6 text-stone-500">No dungeons match.</p>}

          {sorted.length > 0 && (
            <>
              <div className="mt-4 hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-stone-800 text-xs uppercase text-stone-500">
                      <th className="cursor-pointer select-none py-2 pr-4 hover:text-stone-300" onClick={() => toggleSort('name')}>
                        Dungeon{sortKey === 'name' && <span className="ml-1">{sortDesc ? '↓' : '↑'}</span>}
                      </th>
                      <th className="py-2 pr-4">Format</th>
                      <th className="cursor-pointer select-none py-2 pr-4 hover:text-stone-300" onClick={() => toggleSort('status')}>
                        Status{sortKey === 'status' && <span className="ml-1">{sortDesc ? '↓' : '↑'}</span>}
                      </th>
                      <th className="cursor-pointer select-none py-2 pr-4 hover:text-stone-300" onClick={() => toggleSort('host')}>
                        Host{sortKey === 'host' && <span className="ml-1">{sortDesc ? '↓' : '↑'}</span>}
                      </th>
                      <th className="cursor-pointer select-none py-2 pr-4 hover:text-stone-300" onClick={() => toggleSort('tiles')}>
                        Tiles{sortKey === 'tiles' && <span className="ml-1">{sortDesc ? '↓' : '↑'}</span>}
                      </th>
                      <th className="cursor-pointer select-none py-2 pr-4 hover:text-stone-300" onClick={() => toggleSort('participants')}>
                        Participants{sortKey === 'participants' && <span className="ml-1">{sortDesc ? '↓' : '↑'}</span>}
                      </th>
                      <th className="py-2 pr-4">Dates</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r) => (
                      <tr key={r.id} className="border-b border-stone-900">
                        <td className="py-2 pr-4">
                          <Link to={`/c/${r.slug}/edit`} className="font-medium text-stone-200 hover:text-amber-400">
                            {r.name}
                          </Link>
                          <div className="text-xs text-stone-600">/c/{r.slug}</div>
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap text-xs text-stone-400">{formatLabel(r)}</td>
                        <td className="py-2 pr-4">
                          <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${ADMIN_STATUS_STYLE[r.status].className}`}>
                            {ADMIN_STATUS_STYLE[r.status].label}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-stone-400">{r.hostName}</td>
                        <td className="py-2 pr-4 tabular-nums text-stone-300">
                          {r.tilesPlaced}/{r.tilesTotal}
                        </td>
                        <td className="py-2 pr-4 tabular-nums text-stone-300">{r.participants}</td>
                        <td className="py-2 pr-4 whitespace-nowrap text-xs text-stone-500">{formatDateRange(r.start_date, r.end_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 space-y-2 sm:hidden">
                {sorted.map((r) => (
                  <div key={r.id} className="rounded-lg border border-stone-800 bg-stone-900/40 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link to={`/c/${r.slug}/edit`} className="block truncate font-medium text-stone-100 hover:text-amber-400">
                          {r.name}
                        </Link>
                        <div className="text-xs text-stone-600">
                          {formatLabel(r)} · {r.hostName}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${ADMIN_STATUS_STYLE[r.status].className}`}>
                        {ADMIN_STATUS_STYLE[r.status].label}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-stone-400">
                      <span>
                        <span className="tabular-nums font-medium text-stone-200">
                          {r.tilesPlaced}/{r.tilesTotal}
                        </span>{' '}
                        tiles ·{' '}
                        <span className="tabular-nums font-medium text-stone-200">{r.participants}</span> participants
                      </span>
                      <span className="text-stone-600">{formatDateRange(r.start_date, r.end_date)}</span>
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
