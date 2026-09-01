import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';
import type { Challenge } from '../db/types';

type ChallengeRow = Pick<Challenge, 'id' | 'name' | 'slug' | 'status' | 'start_date' | 'end_date' | 'created_at'> & {
  isHost: boolean;
};

export default function DashboardPage() {
  const { session, loading } = useAuth();
  const [challenges, setChallenges] = useState<ChallengeRow[] | null>(null);

  useEffect(() => {
    if (!session) return;
    const supabase = getSupabase();
    const fields = 'id, name, slug, status, start_date, end_date, created_at';
    Promise.all([
      supabase.from('challenges').select(fields).eq('host_id', session.user.id),
      supabase.from('challenge_participants').select(`challenges(${fields})`).eq('profile_id', session.user.id),
    ]).then(([hosted, joined]) => {
      const byId = new Map<string, ChallengeRow>();
      for (const c of (hosted.data as Omit<ChallengeRow, 'isHost'>[]) ?? []) {
        byId.set(c.id, { ...c, isHost: true });
      }
      // Each row's `challenges` comes back as an array from the embedded
      // join even though challenge_id -> challenges is many-to-one --
      // that's just how PostgREST shapes embedded resources.
      const joinedRows = (joined.data as { challenges: Omit<ChallengeRow, 'isHost'>[] }[] | null) ?? [];
      for (const row of joinedRows) {
        for (const c of row.challenges) {
          if (!byId.has(c.id)) byId.set(c.id, { ...c, isHost: false });
        }
      }
      const merged = [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
      setChallenges(merged);
    });
  }, [session]);

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;

  return (
    <div className="mx-auto max-w-3xl py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My challenges</h1>
        <Link to="/new" className="rounded-lg bg-amber-500 hover:bg-amber-400 transition-colors px-4 py-2 text-sm font-semibold text-stone-950">
          New challenge
        </Link>
      </div>
      <div className="mt-6 space-y-3">
        {challenges === null && <p className="text-stone-500">Loading…</p>}
        {challenges?.length === 0 && <p className="text-stone-500">No challenges yet.</p>}
        {challenges?.map((c) => (
          <div key={c.id} className="rounded-lg border border-stone-800 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">{c.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase text-stone-500">{c.isHost ? 'Host' : 'Participant'}</span>
                <span className="text-xs uppercase text-stone-500">{c.status}</span>
              </div>
            </div>
            <p className="text-sm text-stone-500">
              {c.start_date} – {c.end_date}
            </p>
            <div className="mt-2 flex gap-4 text-sm">
              {c.isHost && (
                <Link to={`/c/${c.slug}/edit`} className="underline hover:text-stone-300">
                  Edit
                </Link>
              )}
              <Link to={`/c/${c.slug}`} className="underline hover:text-stone-300">
                View public page
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
