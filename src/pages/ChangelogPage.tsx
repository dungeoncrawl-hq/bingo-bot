import { useEffect, useState } from 'react';
import { getSupabase } from '../db/supabaseClient';
import type { Announcement } from '../db/types';

export default function ChangelogPage() {
  const [rows, setRows] = useState<Announcement[] | null>(null);

  useEffect(() => {
    getSupabase()
      .from('announcements')
      .select('*')
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false })
      .then(({ data }) => setRows((data as Announcement[]) ?? []));
  }, []);

  // Clears Footer.tsx's "new update" badge -- the latest announcement's id
  // is the only thing that badge compares against.
  useEffect(() => {
    if (!rows || rows.length === 0) return;
    try {
      localStorage.setItem('lastSeenAnnouncementId', rows[0].id);
    } catch {
      // Private browsing / storage blocked -- the badge just won't clear.
    }
  }, [rows]);

  return (
    <div className="mx-auto max-w-2xl py-12">
      <h1 className="text-2xl font-semibold">Updates</h1>
      <p className="mt-1 text-sm text-stone-500">New features and changes to Dungeon Crawl.</p>
      {!rows && <p className="mt-6 text-stone-500">Loading…</p>}
      {rows && rows.length === 0 && <p className="mt-6 text-stone-500">Nothing posted yet.</p>}
      {rows && rows.length > 0 && (
        <ul className="mt-8 space-y-6">
          {rows.map((a) => (
            <li key={a.id} className="rounded-lg border border-stone-800 bg-stone-900/50 p-5">
              <p className="text-lg font-semibold">{a.title}</p>
              <p className="mt-1 text-xs text-stone-600">{new Date(a.published_at!).toLocaleDateString()}</p>
              <p className="mt-3 whitespace-pre-wrap text-sm text-stone-300">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
