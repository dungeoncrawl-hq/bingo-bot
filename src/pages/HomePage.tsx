import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';
import type { Announcement } from '../db/types';
import DungeonPathPreview from '../components/DungeonPathPreview';
import LeaderboardPreview from '../components/LeaderboardPreview';

// Teases the 3 most recent updates -- /changelog has the full history.
const HOME_ANNOUNCEMENT_LIMIT = 3;

function GridIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="2.5" stroke="#a8a29e" strokeWidth="1.6" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" stroke="#a8a29e" strokeWidth="1.4" />
      <rect x="9.5" y="9.5" width="5" height="5" fill="#f59e0b" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="8" r="3.2" stroke="#a8a29e" strokeWidth="1.6" />
      <circle cx="17" cy="9.5" r="2.4" stroke="#a8a29e" strokeWidth="1.6" />
      <path d="M3.5 20c.6-3.8 3-5.8 5.5-5.8s4.9 2 5.5 5.8" stroke="#a8a29e" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15.5 14.6c2.1.2 3.7 1.9 4.2 5" stroke="#a8a29e" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="#f59e0b" />
    </svg>
  );
}

function Step({ n, icon, title, children }: { n: number; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-stone-950">
          {n}
        </div>
        {icon}
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-stone-400">{children}</p>
    </div>
  );
}

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
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      {/* HERO */}
      <div className="flex flex-wrap items-center gap-12 lg:gap-16">
        <div className="min-w-0 flex-1 basis-[320px]">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-500">For OSRS clans</p>
          <h1 className="mt-3 text-4xl font-bold leading-[1.15] sm:text-5xl" style={{ textWrap: 'balance' }}>
            Your clan's next dungeon crawl starts here.
          </h1>
          <p className="mt-4 max-w-md text-stone-400">
            Build a board -- Standard, Adventure, or Coop -- invite your group, and watch it fill in on its own. Every
            kill, drop, and level, synced live from RuneLite.
          </p>
          <div className="mt-7 flex items-center gap-5">
            <Link
              to={session ? '/new' : '/login'}
              className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-stone-950 transition-colors hover:bg-amber-400"
            >
              {session ? 'Create a dungeon' : 'Get started'}
            </Link>
            <a href="#how-it-works" className="inline-flex items-center gap-1.5 text-sm text-stone-300 hover:text-stone-100">
              See how it works
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
        </div>

        <div className="min-w-0 flex-[1.3] basis-[420px]">
          <DungeonPathPreview />
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div id="how-it-works" className="mt-24 scroll-mt-8 sm:mt-28">
        <h2 className="text-2xl font-semibold">How it works</h2>
        <p className="mt-2 text-sm text-stone-500">No spreadsheets. No screenshots. Just play.</p>
        <div className="mt-9 grid grid-cols-1 gap-10 sm:grid-cols-3">
          <Step n={1} icon={<GridIcon />} title="Set up your board">
            Pick Standard, Adventure, or Coop, then add tiles from a huge catalog of bosses, skills, clues, and drops.
          </Step>
          <Step n={2} icon={<PeopleIcon />} title="Invite your clan">
            Share one link. Everyone signs in, pastes a webhook into RuneLite, and joins.
          </Step>
          <Step n={3} icon={<BoltIcon />} title="Watch it fill in">
            RuneLite's Dink plugin reports kills, drops, and levels live -- no one updates a spreadsheet.
          </Step>
        </div>
      </div>

      {/* LEADERBOARD TEASER */}
      <div className="mt-24 flex flex-wrap items-center gap-12 sm:mt-28">
        <div className="min-w-0 flex-1 basis-[300px]">
          <h2 className="text-2xl font-semibold">Compete with your clan</h2>
          <p className="mt-3 max-w-md text-sm text-stone-400">
            A live leaderboard, a color and icon every player picks for themselves, and a host badge that actually
            fits the theme.
          </p>
        </div>
        <div className="min-w-0 flex-1 basis-[340px]">
          <LeaderboardPreview />
        </div>
      </div>

      {announcements.length > 0 && (
        <div className="mt-24 sm:mt-28">
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
