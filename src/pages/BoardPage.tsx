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
  const [viewedTileStatuses, setViewedTileStatuses] = useState<Record<string, TileStatus>>({});
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

  // Live progress bars (not just done/not-done) for whichever participant's
  // board is currently being viewed -- computed client-side by re-running
  // the same pure functions the server uses (challengeProgress.ts), since
  // the intermediate progress numbers are never persisted, only the final
  // done/not-done result.
  useEffect(() => {
    if (!viewedParticipantId || challenge === null || challenge === 'not-found') {
      setViewedTileStatuses({});
      return;
    }
    const supabase = getSupabase();
    const pid = viewedParticipantId;
    const window = { start: challenge.start_date, end: challenge.end_date };
    (async () => {
      const [bossKills, slayerTasks, lootDrops, deaths, collectionLogEntries, petObtains, snapshots] = await Promise.all([
        supabase.from('boss_kills').select('boss, kc, created_at').eq('participant_id', pid),
        supabase.from('slayer_tasks').select('created_at').eq('participant_id', pid),
        supabase
          .from('loot_drops')
          .select('items, total_value, created_at, is_misc, max_single_value')
          .eq('participant_id', pid),
        supabase.from('deaths').select('created_at').eq('participant_id', pid),
        supabase.from('collection_log_entries').select('created_at').eq('participant_id', pid),
        supabase.from('pet_obtains').select('updated_at').eq('participant_id', pid),
        supabase.from('participant_snapshots').select('recorded_on, total_xp, skills, activities').eq('participant_id', pid),
      ]);
      const raw: RawParticipantData = {
        bossKills: (bossKills.data as RawParticipantData['bossKills']) ?? [],
        slayerTasks: (slayerTasks.data as RawParticipantData['slayerTasks']) ?? [],
        lootDrops: (lootDrops.data as RawParticipantData['lootDrops']) ?? [],
        deaths: (deaths.data as RawParticipantData['deaths']) ?? [],
        collectionLogEntries: (collectionLogEntries.data as RawParticipantData['collectionLogEntries']) ?? [],
        petObtains: (petObtains.data as RawParticipantData['petObtains']) ?? [],
      };
      const hiscoresRecap = computeHiscoresRecap((snapshots.data as SnapshotRow[]) ?? [], window);
      const stats = computeParticipantStats(raw, window, hiscoresRecap);
      const statuses: Record<string, TileStatus> = {};
      for (const tile of tiles) {
        statuses[tile.id] = checkTile(tile.condition, stats);
      }
      setViewedTileStatuses(statuses);
    })();
  }, [viewedParticipantId, challenge, tiles]);

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
  const viewedCompletedTileIds = new Set(
    completions.filter((c) => c.kind === 'tile' && c.participant_id === viewedParticipantId).map((c) => c.ref),
  );

  function hasCompletedBoard(participantId: string): boolean {
    return completions.some((c) => c.kind === 'board' && c.participant_id === participantId);
  }

  const leaderboard = computeLeaderboard(
    tiles,
    completions,
    participants.map((p) => p.id),
  );
  const firstCompleters = computeFirstCompleters(completions);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
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
              const isFirst = tile != null && done && firstCompleters[tile.id] === viewedParticipantId;
              const noOneCompleted = tile != null && !completions.some((c) => c.kind === 'tile' && c.ref === tile.id);
              return (
                <div
                  key={i}
                  title={tile ? describeTileCondition(tile.condition) : undefined}
                  onClick={tile ? () => setSelectedTile(tile) : undefined}
                  className={`relative flex aspect-square min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden rounded-lg border p-2 text-center shadow-inner before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/stone-texture.jpg')] before:bg-cover before:bg-center before:opacity-30 before:content-[''] ${tile ? 'cursor-pointer' : ''} ${
                    done
                      ? 'border-green-500 bg-green-950/40'
                      : tile
                        ? 'border-stone-700 bg-stone-900'
                        : 'border-stone-800/60 bg-stone-950/50'
                  }`}
                >
                  {percent !== null && (
                    <div
                      className="absolute inset-y-0 left-0 w-1"
                      style={{ background: 'linear-gradient(to top, #ef4444, #eab308, #22c55e)' }}
                    >
                      <div className="absolute inset-x-0 top-0 bg-stone-900" style={{ height: `${100 - percent}%` }} />
                    </div>
                  )}
                  {tile ? (
                    <>
                      {tile.icon && <img src={tile.icon} alt="" className="h-6 w-6 shrink-0" />}
                      <span className="mt-1 line-clamp-2 w-full break-words text-[11px]">{tile.label}</span>
                      {caption && <span className="w-full break-words text-[9px] text-stone-500">{caption}</span>}
                      {isFirst ? (
                        <span className="mt-1 text-[10px] text-amber-400">⭐</span>
                      ) : done ? (
                        <span className="mt-1 text-[10px] text-green-400">✓</span>
                      ) : (
                        noOneCompleted && <span className="mt-1 text-[10px] text-stone-600">○</span>
                      )}
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
