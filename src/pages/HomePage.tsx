import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';
import type { Announcement } from '../db/types';

// Teases the 3 most recent updates -- /changelog has the full history.
const HOME_ANNOUNCEMENT_LIMIT = 3;

export default function HomePage() {
  const { session } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    getSupabase()
      .from('announcements')
      .select('*')
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false })
      .limit(HOME_ANNOUNCEMENT_LIMIT)
      .then(({ data }) => setAnnouncements((data as Announcement[]) ?? []));
  }, []);

  return (
    <div className="mx-auto max-w-2xl py-24 text-center">
      <h1 className="text-4xl font-bold">Dungeon Crawl</h1>
      <p className="mt-4 text-stone-400">
        Host your own OSRS challenge board -- create it, invite your clan, track completions.
      </p>
      <div className="mt-8">
        <Link
          to={session ? '/new' : '/login'}
          className="rounded-lg bg-amber-500 hover:bg-amber-400 transition-colors px-5 py-2.5 text-sm font-semibold text-stone-950"
        >
          {session ? 'Create a challenge' : 'Get started'}
        </Link>
      </div>

      {announcements.length > 0 && (
        <div className="mt-16 text-left">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">What's new</h2>
          <ul className="mt-3 space-y-4">
            {announcements.map((a) => (
              <li key={a.id} className="rounded-lg border border-stone-800 bg-stone-900/50 p-4">
                <p className="font-semibold">{a.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-stone-400">{a.body}</p>
                <p className="mt-2 text-xs text-stone-600">{new Date(a.published_at!).toLocaleDateString()}</p>
              </li>
            ))}
          </ul>
          <Link to="/changelog" className="mt-3 inline-block text-sm text-amber-500 hover:underline">
            See all updates →
          </Link>
        </div>
      )}
    </div>
  );
}
