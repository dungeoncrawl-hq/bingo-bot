import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';
import type { Challenge } from '../db/types';

type ChallengeRow = Pick<Challenge, 'id' | 'name' | 'slug' | 'status' | 'start_date' | 'end_date'>;

export default function DashboardPage() {
  const { session, loading } = useAuth();
  const [challenges, setChallenges] = useState<ChallengeRow[] | null>(null);

  useEffect(() => {
    if (!session) return;
    getSupabase()
      .from('challenges')
      .select('id, name, slug, status, start_date, end_date')
      .eq('host_id', session.user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setChallenges((data as ChallengeRow[]) ?? []));
  }, [session]);

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;

  return (
    <div className="mx-auto max-w-3xl py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My challenges</h1>
        <Link to="/new" className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950">
          New challenge
        </Link>
      </div>
      <div className="mt-6 space-y-3">
        {challenges === null && <p className="text-neutral-500">Loading…</p>}
        {challenges?.length === 0 && <p className="text-neutral-500">No challenges yet.</p>}
        {challenges?.map((c) => (
          <Link
            key={c.id}
            to={`/c/${c.slug}/edit`}
            className="block rounded-lg border border-neutral-800 px-4 py-3 hover:border-neutral-600"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{c.name}</span>
              <span className="text-xs uppercase text-neutral-500">{c.status}</span>
            </div>
            <p className="text-sm text-neutral-500">
              {c.start_date} – {c.end_date}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
