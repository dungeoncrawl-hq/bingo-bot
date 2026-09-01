import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';
import type { Challenge, Tile } from '../db/types';
import {
  checkTile,
  describeTileCondition,
  formatTileGoal,
  formatTileProgress,
  progressPercent,
  type TileStatus,
} from '../lib/tileConditions';
import { computeParticipantStats, type RawParticipantData } from '../lib/participantStats';
import { computeHiscoresRecap, type SnapshotRow } from '../lib/hiscoresRecap';
import { computeLeaderboard } from '../lib/leaderboard';
import { computeFirstCompleters } from '../lib/firstCompletions';
import { progressColor } from '../lib/progressColor';
import TileDetailModal from '../components/TileDetailModal';

const GRID_SIZE = 5;

interface ParticipantRow {
  id: string;
  profile_id: string;
  rsn: string;
}

interface CompletionRow {
  participant_id: string;
  kind: 'tile' | 'line' | 'board';
  ref: string;
  completed_at: string;
}

export default function BoardPage() {
  const { slug } = useParams<{ slug: string }>();
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [challenge, setChallenge] = useState<Challenge | null | 'not-found'>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [rsn, setRsn] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [editingRsn, setEditingRsn] = useState(false);
  const [rsnDraft, setRsnDraft] = useState('');
  const [savingRsn, setSavingRsn] = useState(false);
  const [rsnError, setRsnError] = useState('');
  const [tileStatusesByParticipant, setTileStatusesByParticipant] = useState<Record<string, Record<string, TileStatus>>>({});
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);

  const myParticipant = session ? participants.find((p) => p.profile_id === session.user.id) : undefined;
  // Which participant's board is currently displayed -- explicit via ?p=,
  // defaulting to the signed-in viewer's own board if they've joined.
  // Anyone (signed in or not) can view anyone's board this way, since the
  // underlying raw event tables are all public-read RLS.
  const viewedParticipantId = searchParams.get('p') ?? myParticipant?.id ?? null;

  const load = useCallback(async () => {
    if (!slug) return;
    const supabase = getSupabase();
    const { data: challengeData } = await supabase.from('challenges').select('*').eq('slug', slug).maybeSingle();
    if (!challengeData) {
      setChallenge('not-found');
      return;
    }
    setChallenge(challengeData as Challenge);
    const [{ data: tilesData }, { data: participantsData }, { data: completionsData }] = await Promise.all([
      supabase.from('tiles').select('*').eq('challenge_id', challengeData.id),
      supabase.from('challenge_participants').select('id, profile_id, rsn').eq('challenge_id', challengeData.id),
      supabase
        .from('tile_completions')
        .select('participant_id, kind, ref, completed_at')
        .eq('challenge_id', challengeData.id),
    ]);
    setTiles((tilesData as Tile[]) ?? []);
    setParticipants((participantsData as ParticipantRow[]) ?? []);
    setCompletions((completionsData as CompletionRow[]) ?? []);
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  // Live progress (not just done/not-done) for every participant, not only
  // the one currently being viewed -- computed client-side by re-running the
  // same pure functions the server uses (challengeProgress.ts), since the
  // intermediate progress numbers are never persisted, only the final
  // done/not-done result. Fetched in bulk (one `.in(participant_id, ...)`
  // query per raw table, not one round trip per participant) so the "who's
  // closest" badge coloring below has every participant's numbers, not just
  // the viewer's own.
  useEffect(() => {
    if (participants.length === 0 || tiles.length === 0 || challenge === null || challenge === 'not-found') {
      setTileStatusesByParticipant({});
      return;
    }
    const supabase = getSupabase();
    const participantIds = participants.map((p) => p.id);
    const window = { start: challenge.start_date, end: challenge.end_date };
    (async () => {
      const [bossKills, slayerTasks, lootDrops, deaths, collectionLogEntries, petObtains, snapshots] = await Promise.all([
        supabase.from('boss_kills').select('participant_id, boss, kc, created_at').in('participant_id', participantIds),
        supabase.from('slayer_tasks').select('participant_id, created_at').in('participant_id', participantIds),
        supabase
          .from('loot_drops')
          .select('participant_id, items, total_value, created_at, is_misc, max_single_value')
          .in('participant_id', participantIds),
        supabase.from('deaths').select('participant_id, created_at').in('participant_id', participantIds),
        supabase.from('collection_log_entries').select('participant_id, created_at').in('participant_id', participantIds),
        supabase.from('pet_obtains').select('participant_id, updated_at').in('participant_id', participantIds),
        supabase
          .from('participant_snapshots')
          .select('participant_id, recorded_on, total_xp, skills, activities')
          .in('participant_id', participantIds),
      ]);

      const rawByParticipant: Record<string, RawParticipantData> = {};
      for (const pid of participantIds) {
        rawByParticipant[pid] = {
          bossKills: [],
          slayerTasks: [],
          lootDrops: [],
          deaths: [],
          collectionLogEntries: [],
          petObtains: [],
        };
      }
      type WithParticipant<T> = T & { participant_id: string };
      for (const row of ((bossKills.data ?? []) as WithParticipant<RawParticipantData['bossKills'][number]>[])) {
        rawByParticipant[row.participant_id]?.bossKills.push(row);
      }
      for (const row of ((slayerTasks.data ?? []) as WithParticipant<RawParticipantData['slayerTasks'][number]>[])) {
        rawByParticipant[row.participant_id]?.slayerTasks.push(row);
      }
      for (const row of ((lootDrops.data ?? []) as WithParticipant<RawParticipantData['lootDrops'][number]>[])) {
        rawByParticipant[row.participant_id]?.lootDrops.push(row);
      }
      for (const row of ((deaths.data ?? []) as WithParticipant<RawParticipantData['deaths'][number]>[])) {
        rawByParticipant[row.participant_id]?.deaths.push(row);
      }
      for (const row of ((collectionLogEntries.data ?? []) as WithParticipant<RawParticipantData['collectionLogEntries'][number]>[])) {
        rawByParticipant[row.participant_id]?.collectionLogEntries.push(row);
      }
      for (const row of ((petObtains.data ?? []) as WithParticipant<RawParticipantData['petObtains'][number]>[])) {
        rawByParticipant[row.participant_id]?.petObtains.push(row);
      }
      const snapshotsByParticipant: Record<string, SnapshotRow[]> = {};
      for (const row of ((snapshots.data ?? []) as WithParticipant<SnapshotRow>[])) {
        (snapshotsByParticipant[row.participant_id] ??= []).push(row);
      }

      const statuses: Record<string, Record<string, TileStatus>> = {};
      for (const pid of participantIds) {
        const hiscoresRecap = computeHiscoresRecap(snapshotsByParticipant[pid] ?? [], window);
        const stats = computeParticipantStats(rawByParticipant[pid], window, hiscoresRecap);
        const tileStatuses: Record<string, TileStatus> = {};
        for (const tile of tiles) {
          tileStatuses[tile.id] = checkTile(tile.condition, stats);
        }
        statuses[pid] = tileStatuses;
      }
      setTileStatusesByParticipant(statuses);
    })();
  }, [participants, tiles, challenge]);

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!session || !rsn.trim() || !challenge || challenge === 'not-found') return;
    setJoining(true);
    setJoinError('');
    const { data, error } = await getSupabase()
      .from('challenge_participants')
      .insert({ challenge_id: challenge.id, profile_id: session.user.id, rsn: rsn.trim() })
      .select('id')
      .single();
    setJoining(false);
    if (error) {
      setJoinError(error.message);
      return;
    }
    setRsn('');
    await load();

    // Best-effort baseline hiscores snapshot the moment they join, so
    // XP/skill-level/clue tiles have an accurate starting point instead of
    // only catching up on their first Dink LOGOUT event or the next daily
    // cron sweep -- without this, any progress made in that gap is
    // permanently uncounted, not just delayed.
    fetch('/api/sync-participant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId: data.id }),
    }).catch(() => {});
  }

  async function handleRenameRsn(e: FormEvent) {
    e.preventDefault();
    if (!myParticipant || !rsnDraft.trim()) return;
    setSavingRsn(true);
    setRsnError('');
    const { error } = await getSupabase()
      .from('challenge_participants')
      .update({ rsn: rsnDraft.trim() })
      .eq('id', myParticipant.id);
    setSavingRsn(false);
    if (error) {
      setRsnError(error.message);
      return;
    }
    setEditingRsn(false);
    await load();
  }

  async function handleLeave() {
    if (!myParticipant) return;
    if (!window.confirm('Leave this challenge? Your progress history on this board will be deleted.')) return;
    await getSupabase().from('challenge_participants').delete().eq('id', myParticipant.id);
    await load();
  }

  if (challenge === null) return null;
  if (challenge === 'not-found') {
    return <p className="mx-auto max-w-lg py-24 text-center text-stone-400">Challenge not found.</p>;
  }

  const tileAt = (row: number, col: number) => tiles.find((t) => t.layout.row === row && t.layout.col === col) ?? null;
  const isHost = session?.user.id === challenge.host_id;
  const viewedParticipant = participants.find((p) => p.id === viewedParticipantId);
  const viewedTileStatuses = (viewedParticipantId && tileStatusesByParticipant[viewedParticipantId]) || {};
  const viewedCompletedTileIds = new Set(
    completions.filter((c) => c.kind === 'tile' && c.participant_id === viewedParticipantId).map((c) => c.ref),
  );

  function hasCompletedBoard(participantId: string): boolean {
    return completions.some((c) => c.kind === 'board' && c.participant_id === participantId);
  }

  const firstCompleters = computeFirstCompleters(completions);
  const leaderboard = computeLeaderboard(
    tiles,
    completions,
    participants.map((p) => p.id),
    firstCompleters,
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-semibold">{challenge.name}</h1>
      <p className="text-sm text-stone-500">
        {challenge.start_date} – {challenge.end_date}
      </p>
      {viewedParticipant && <p className="mt-2 text-sm font-medium text-stone-400">{viewedParticipant.rsn}'s board</p>}

      <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
        {/* Board -- above the leaderboard on mobile, left column (~80%) on desktop. */}
        <div className="order-2 min-w-0 lg:order-1 lg:flex-1">
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
              const row = Math.floor(i / GRID_SIZE);
              const col = i % GRID_SIZE;
              const tile = tileAt(row, col);
              const done = tile != null && viewedCompletedTileIds.has(tile.id);
              const status = tile ? viewedTileStatuses[tile.id] : undefined;
              const percent = tile && status && !done ? progressPercent(tile.condition, status) : null;
              // formatTileProgress (current/goal, e.g. "620K / 1.5M XP") only
              // covers the condition types where a running total is large
              // enough for shorthand to actually help -- everything else
              // falls back to the plain goal-only caption.
              const caption = tile ? (status && formatTileProgress(tile.condition, status)) ?? formatTileGoal(tile.condition) : null;
              // A free space has no "first" worth bragging about -- everyone
              // gets it the instant it exists, so it's excluded here even
              // though computeFirstCompleters technically records one
              // (whoever's sync happened to land first).
              const isFirst =
                tile != null &&
                done &&
                tile.condition.type !== 'freeSpace' &&
                firstCompleters[tile.id] === viewedParticipantId;
              const noOneCompleted = tile != null && !completions.some((c) => c.kind === 'tile' && c.ref === tile.id);
              const someoneElseCompleted =
                tile != null && !done && completions.some((c) => c.kind === 'tile' && c.ref === tile.id);
              // How close the closest participant is to finishing this
              // still-unclaimed tile, across everyone (not just the viewer)
              // -- colors the circle badge below from red (no one's close)
              // to green (someone's nearly there).
              const closestPercent =
                tile && noOneCompleted
                  ? Math.max(
                      0,
                      ...participants.map((p) => {
                        const s = tileStatusesByParticipant[p.id]?.[tile.id];
                        return s ? (progressPercent(tile.condition, s) ?? 0) : 0;
                      }),
                    )
                  : 0;
              const badge: { glyph: string; className?: string; color?: string } | null = !tile
                ? null
                : isFirst
                  ? { glyph: '⭐', className: 'text-amber-400' }
                  : done
                    ? { glyph: '✓', className: 'text-green-400' }
                    : someoneElseCompleted
                      ? { glyph: '✕', className: 'text-red-400' }
                      : noOneCompleted
                        ? { glyph: '○', color: progressColor(closestPercent) }
                        : null;
              return (
                <div
                  key={i}
                  title={tile ? describeTileCondition(tile.condition) : undefined}
                  onClick={tile ? () => setSelectedTile(tile) : undefined}
                  className={`relative flex aspect-square min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden rounded-lg border p-2 text-center shadow-inner before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/stone-texture.svg')] before:bg-cover before:bg-center before:opacity-30 before:content-[''] ${tile ? 'cursor-pointer' : ''} ${
                    done
                      ? 'border-green-500 bg-green-950/40'
                      : tile
                        ? 'border-stone-700 bg-stone-900'
                        : 'border-stone-800/60 bg-stone-950/50'
                  }`}
                >
                  {percent !== null && (
                    <div className="absolute inset-y-0 left-0 w-1 bg-stone-900">
                      <div
                        className="absolute inset-x-0 bottom-0"
                        style={{ height: `${percent}%`, backgroundColor: progressColor(percent) }}
                      />
                    </div>
                  )}
                  {badge && (
                    <span
                      className={`absolute right-1 top-1 text-xs ${badge.className ?? ''}`}
                      style={badge.color ? { color: badge.color } : undefined}
                    >
                      {badge.glyph}
                    </span>
                  )}
                  {tile ? (
                    <>
                      {tile.icon && <img src={tile.icon} alt="" className="h-6 w-6 shrink-0" />}
                      <span className="mt-1 line-clamp-2 w-full break-words text-[11px]">{tile.label}</span>
                      {caption && <span className="w-full break-words text-[9px] text-stone-500">{caption}</span>}
                    </>
                  ) : (
                    <span className="text-xs text-stone-700">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Leaderboard + actions -- above the board on mobile, right column
            (~20%, fixed-width so entries never wrap) on desktop. */}
        <div className="order-1 lg:order-2 lg:w-72 lg:shrink-0">
          <h2 className="text-lg font-semibold">Leaderboard</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {leaderboard.map((entry, i) => {
              const p = participants.find((pp) => pp.id === entry.participantId);
              if (!p) return null;
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
              const isViewed = entry.participantId === viewedParticipantId;
              const isYou = entry.participantId === myParticipant?.id;
              return (
                <li key={p.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSearchParams({ p: p.id })}
                    className={`whitespace-nowrap text-left hover:underline ${isViewed ? 'font-semibold text-amber-400' : 'text-stone-300'}`}
                  >
                    {`#${i + 1}${medal ? ` ${medal}` : ''} ${p.rsn} — ${entry.points} pts (${entry.tilesCompleted}/${tiles.length} tiles)`}
                  </button>
                  {isYou && <span className="shrink-0 text-xs text-stone-500">(you)</span>}
                  {hasCompletedBoard(p.id) && <span className="shrink-0 text-yellow-400">🏆 Complete!</span>}
                </li>
              );
            })}
            {participants.length === 0 && <li className="text-stone-500">No one's joined yet.</li>}
          </ul>

          {/* Actions available to the current viewer for this challenge. */}
          <div className="mt-6 space-y-3">
            {!session && (
              <p className="text-sm text-stone-400">
                <Link to="/login" className="underline">
                  Sign in
                </Link>{' '}
                to join this challenge.{' '}
                <Link to={`/c/${challenge.slug}/setup`} className="underline">
                  See what's involved
                </Link>
                .
              </p>
            )}
            {session && !myParticipant && (
              <form onSubmit={handleJoin} className="flex flex-col gap-2">
                <input
                  required
                  value={rsn}
                  onChange={(e) => setRsn(e.target.value)}
                  placeholder="Your OSRS username"
                  className="rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={joining}
                  className="rounded-lg bg-amber-500 hover:bg-amber-400 transition-colors px-4 py-2 text-sm font-semibold text-stone-950 disabled:opacity-40"
                >
                  {joining ? 'Joining…' : 'Join'}
                </button>
              </form>
            )}
            {joinError && <p className="text-sm text-red-400">{joinError}</p>}

            {session && myParticipant && !editingRsn && (
              <p className="text-sm text-stone-400">
                You're in as {myParticipant.rsn}.{' '}
                <button
                  type="button"
                  onClick={() => {
                    setRsnDraft(myParticipant.rsn);
                    setEditingRsn(true);
                    setRsnError('');
                  }}
                  className="underline"
                >
                  Edit
                </button>{' '}
                ·{' '}
                <Link to={`/c/${challenge.slug}/setup`} className="underline">
                  Set up Dink &rarr;
                </Link>
              </p>
            )}
            {session && myParticipant && editingRsn && (
              <form onSubmit={handleRenameRsn} className="flex flex-col gap-2">
                <input
                  required
                  autoFocus
                  value={rsnDraft}
                  onChange={(e) => setRsnDraft(e.target.value)}
                  className="rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={savingRsn}
                    className="rounded-lg bg-amber-500 hover:bg-amber-400 transition-colors px-4 py-2 text-sm font-semibold text-stone-950 disabled:opacity-40"
                  >
                    {savingRsn ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingRsn(false)}
                    className="rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
            {rsnError && <p className="text-sm text-red-400">{rsnError}</p>}

            {myParticipant && (
              <button
                type="button"
                onClick={handleLeave}
                className="w-full rounded-lg border border-red-900 px-4 py-2 text-sm text-red-400 hover:bg-red-950/40"
              >
                Leave Challenge
              </button>
            )}
            {isHost && (
              <Link
                to={`/c/${challenge.slug}/edit`}
                className="block w-full rounded-lg border border-stone-700 px-4 py-2 text-center text-sm text-stone-300 hover:border-amber-500"
              >
                Edit Challenge
              </Link>
            )}
          </div>
        </div>
      </div>

      {selectedTile && (
        <TileDetailModal
          tile={selectedTile}
          participants={participants}
          challenge={challenge}
          firstCompleters={firstCompleters}
          onClose={() => setSelectedTile(null)}
        />
      )}
    </div>
  );
}
