import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';
import type { Challenge, Tile } from '../db/types';
import { describeTileCondition, formatTileGoal } from '../lib/tileConditions';

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
    setTiles((tilesData as Tile[]) ?? []);
    setParticipants((participantsData as unknown as ParticipantRow[]) ?? []);
    setCompletions((completionsData as CompletionRow[]) ?? []);
  }, [slug]);

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

  if (challenge === null) return null;
  if (challenge === 'not-found') {
    return <p className="mx-auto max-w-lg py-24 text-center text-neutral-400">Challenge not found.</p>;
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
      <p className="text-sm text-neutral-500">
        {challenge.start_date} – {challenge.end_date}
      </p>
      {myParticipant && <p className="mt-2 text-xs text-neutral-500">Showing your own progress below.</p>}

      <div className="mt-8 grid grid-cols-5 gap-2">
        {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
          const row = Math.floor(i / GRID_SIZE);
          const col = i % GRID_SIZE;
          const tile = tileAt(row, col);
          const done = tile != null && myCompletedTileIds.has(tile.id);
          return (
            <div
              key={i}
              title={tile ? describeTileCondition(tile.condition) : undefined}
              className={`flex aspect-square flex-col items-center justify-center rounded-lg border p-2 text-center ${
                done ? 'border-green-500 bg-green-950/40' : 'border-neutral-800'
              }`}
            >
              {tile ? (
                <>
                  {tile.icon && <img src={tile.icon} alt="" className="h-6 w-6" />}
                  <span className="mt-1 line-clamp-2 text-[11px]">{tile.label}</span>
                  {formatTileGoal(tile.condition) && (
                    <span className="text-[9px] text-neutral-500">{formatTileGoal(tile.condition)}</span>
                  )}
                  {done && <span className="mt-1 text-[10px] text-green-400">✓ done</span>}
                </>
              ) : (
                <span className="text-xs text-neutral-700">—</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-semibold">Players</h2>
        <ul className="mt-3 space-y-1 text-sm text-neutral-300">
          {participants.map((p) => (
            <li key={p.id}>
              {p.profiles?.display_name ?? 'Unknown'} — {p.rsn} — {completedCount(p.id)}/{tiles.length} tiles
              {hasCompletedBoard(p.id) && <span className="ml-2 text-yellow-400">🏆 Complete!</span>}
            </li>
          ))}
          {participants.length === 0 && <li className="text-neutral-500">No one's joined yet.</li>}
        </ul>

        <div className="mt-6">
          {!session && (
            <p className="text-sm text-neutral-400">
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
          {session && myParticipant && (
            <p className="text-sm text-neutral-400">
              You're in as {myParticipant.rsn}.{' '}
              <Link to={`/c/${challenge.slug}/setup`} className="underline">
                Set up Dink &rarr;
              </Link>
            </p>
          )}
          {session && !myParticipant && (
            <form onSubmit={handleJoin} className="flex gap-2">
              <input
                required
                value={rsn}
                onChange={(e) => setRsn(e.target.value)}
                placeholder="Your OSRS username"
                className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={joining}
                className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-40"
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
