import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';
import type { Challenge, Tile } from '../db/types';
import { checkTile, describeTileCondition, formatTileGoal, progressPercent, type TileStatus } from '../lib/tileConditions';
import { computeParticipantStats, type RawParticipantData } from '../lib/participantStats';
import { computeHiscoresRecap, type SnapshotRow } from '../lib/hiscoresRecap';

const GRID_SIZE = 5;

interface ParticipantRow {
  id: string;
  profile_id: string;
  rsn: string;
  profiles: { display_name: string } | null;
}

interface CompletionRow {
  participant_id: string;
  kind: 'tile' | 'line' | 'board';
  ref: string;
}

export default function BoardPage() {
  const { slug } = useParams<{ slug: string }>();
  const { session } = useAuth();
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
  const [myTileStatuses, setMyTileStatuses] = useState<Record<string, TileStatus>>({});

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
      supabase
        .from('challenge_participants')
        .select('id, profile_id, rsn, profiles(display_name)')
        .eq('challenge_id', challengeData.id),
      supabase.from('tile_completions').select('participant_id, kind, ref').eq('challenge_id', challengeData.id),
    ]);
    const tilesList = (tilesData as Tile[]) ?? [];
    const participantsList = (participantsData as unknown as ParticipantRow[]) ?? [];
    setTiles(tilesList);
    setParticipants(participantsList);
    setCompletions((completionsData as CompletionRow[]) ?? []);

    // Live progress bars (not just done/not-done) for the signed-in
    // viewer's own tiles -- computed client-side by re-running the same
    // pure functions the server uses (challengeProgress.ts), since the
    // intermediate progress numbers are never persisted, only the final
    // done/not-done result. Raw event tables are all public-read RLS
    // (Milestones 3/4), so this needs no elevated access.
    const me = session ? participantsList.find((p) => p.profile_id === session.user.id) : undefined;
    if (!me) {
      setMyTileStatuses({});
      return;
    }
    const pid = me.id;
    const [bossKills, slayerTasks, lootDrops, deaths, collectionLogEntries, petObtains, snapshots] = await Promise.all([
      supabase.from('boss_kills').select('boss, kc, created_at').eq('participant_id', pid),
      supabase.from('slayer_tasks').select('created_at').eq('participant_id', pid),
      supabase.from('loot_drops').select('items, total_value, created_at').eq('participant_id', pid),
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
    const window = { start: challengeData.start_date, end: challengeData.end_date };
    const hiscoresRecap = computeHiscoresRecap((snapshots.data as SnapshotRow[]) ?? [], window);
    const stats = computeParticipantStats(raw, window, hiscoresRecap);
    const statuses: Record<string, TileStatus> = {};
    for (const tile of tilesList) {
      statuses[tile.id] = checkTile(tile.condition, stats);
    }
    setMyTileStatuses(statuses);
  }, [slug, session]);

  useEffect(() => {
    load();
  }, [load]);

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
  const myParticipant = session ? participants.find((p) => p.profile_id === session.user.id) : undefined;
  const myCompletedTileIds = new Set(
    completions.filter((c) => c.kind === 'tile' && c.participant_id === myParticipant?.id).map((c) => c.ref),
  );

  function completedCount(participantId: string): number {
    return completions.filter((c) => c.kind === 'tile' && c.participant_id === participantId).length;
  }

  function hasCompletedBoard(participantId: string): boolean {
    return completions.some((c) => c.kind === 'board' && c.participant_id === participantId);
  }

  return (
    <div className="mx-auto max-w-2xl py-12">
      <h1 className="text-2xl font-semibold">{challenge.name}</h1>
      <p className="text-sm text-stone-500">
        {challenge.start_date} – {challenge.end_date}
      </p>
      {myParticipant && <p className="mt-2 text-xs text-stone-500">Showing your own progress below.</p>}

      <div className="mt-8 grid grid-cols-5 gap-2">
        {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
          const row = Math.floor(i / GRID_SIZE);
          const col = i % GRID_SIZE;
          const tile = tileAt(row, col);
          const done = tile != null && myCompletedTileIds.has(tile.id);
          const status = tile ? myTileStatuses[tile.id] : undefined;
          const percent = tile && status && !done ? progressPercent(tile.condition, status) : null;
          return (
            <div
              key={i}
              title={tile ? describeTileCondition(tile.condition) : undefined}
              className={`relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-lg border p-2 text-center shadow-inner ${
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
                  {tile.icon && <img src={tile.icon} alt="" className="h-6 w-6" />}
                  <span className="mt-1 line-clamp-2 text-[11px]">{tile.label}</span>
                  {formatTileGoal(tile.condition) && (
                    <span className="text-[9px] text-stone-500">{formatTileGoal(tile.condition)}</span>
                  )}
                  {done && <span className="mt-1 text-[10px] text-green-400">✓ done</span>}
                </>
              ) : (
                <span className="text-xs text-stone-700">—</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-semibold">Players</h2>
        <ul className="mt-3 space-y-1 text-sm text-stone-300">
          {participants.map((p) => (
            <li key={p.id}>
              {p.profiles?.display_name ?? 'Unknown'} — {p.rsn} — {completedCount(p.id)}/{tiles.length} tiles
              {hasCompletedBoard(p.id) && <span className="ml-2 text-yellow-400">🏆 Complete!</span>}
            </li>
          ))}
          {participants.length === 0 && <li className="text-stone-500">No one's joined yet.</li>}
        </ul>

        <div className="mt-6">
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
              <button type="button" onClick={handleLeave} className="underline text-red-400">
                Leave
              </button>{' '}
              ·{' '}
              <Link to={`/c/${challenge.slug}/setup`} className="underline">
                Set up Dink &rarr;
              </Link>
            </p>
          )}
          {session && myParticipant && editingRsn && (
            <form onSubmit={handleRenameRsn} className="flex gap-2">
              <input
                required
                autoFocus
                value={rsnDraft}
                onChange={(e) => setRsnDraft(e.target.value)}
                className="flex-1 rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
              />
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
            </form>
          )}
          {rsnError && <p className="mt-2 text-sm text-red-400">{rsnError}</p>}
          {session && !myParticipant && (
            <form onSubmit={handleJoin} className="flex gap-2">
              <input
                required
                value={rsn}
                onChange={(e) => setRsn(e.target.value)}
                placeholder="Your OSRS username"
                className="flex-1 rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
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
          {joinError && <p className="mt-2 text-sm text-red-400">{joinError}</p>}
        </div>
      </div>
    </div>
  );
}
