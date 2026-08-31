import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';
import type { Challenge, Tile } from '../db/types';
import { describeTileCondition } from '../lib/tileConditions';

const GRID_SIZE = 5;

interface ParticipantRow {
  id: string;
  profile_id: string;
  rsn: string;
  profiles: { display_name: string } | null;
}

export default function BoardPage() {
  const { slug } = useParams<{ slug: string }>();
  const { session } = useAuth();
  const [challenge, setChallenge] = useState<Challenge | null | 'not-found'>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
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
    const [{ data: tilesData }, { data: participantsData }] = await Promise.all([
      supabase.from('tiles').select('*').eq('challenge_id', challengeData.id),
      supabase
        .from('challenge_participants')
        .select('id, profile_id, rsn, profiles(display_name)')
        .eq('challenge_id', challengeData.id),
    ]);
    setTiles((tilesData as Tile[]) ?? []);
    setParticipants((participantsData as unknown as ParticipantRow[]) ?? []);
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!session || !rsn.trim() || !challenge || challenge === 'not-found') return;
    setJoining(true);
    setJoinError('');
    const { error } = await getSupabase()
      .from('challenge_participants')
      .insert({ challenge_id: challenge.id, profile_id: session.user.id, rsn: rsn.trim() });
    setJoining(false);
    if (error) {
      setJoinError(error.message);
      return;
    }
    setRsn('');
    await load();
  }

  if (challenge === null) return null;
  if (challenge === 'not-found') {
    return <p className="mx-auto max-w-lg py-24 text-center text-neutral-400">Challenge not found.</p>;
  }

  const tileAt = (row: number, col: number) => tiles.find((t) => t.layout.row === row && t.layout.col === col) ?? null;
  const myParticipant = session ? participants.find((p) => p.profile_id === session.user.id) : undefined;

  return (
    <div className="mx-auto max-w-2xl py-12">
      <h1 className="text-2xl font-semibold">{challenge.name}</h1>
      <p className="text-sm text-neutral-500">
        {challenge.start_date} – {challenge.end_date}
      </p>

      <div className="mt-8 grid grid-cols-5 gap-2">
        {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
          const row = Math.floor(i / GRID_SIZE);
          const col = i % GRID_SIZE;
          const tile = tileAt(row, col);
          return (
            <div
              key={i}
              title={tile ? describeTileCondition(tile.condition) : undefined}
              className="flex aspect-square flex-col items-center justify-center rounded-lg border border-neutral-800 p-2 text-center"
            >
              {tile ? (
                <>
                  {tile.icon && <img src={tile.icon} alt="" className="h-6 w-6" />}
                  <span className="mt-1 line-clamp-2 text-[11px]">{tile.label}</span>
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
              {p.profiles?.display_name ?? 'Unknown'} — {p.rsn}
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
              to join this challenge.
            </p>
          )}
          {session && myParticipant && <p className="text-sm text-neutral-400">You're in as {myParticipant.rsn}.</p>}
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
