import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';
import FeedbackModal from './FeedbackModal';

export default function Footer() {
  const { session } = useAuth();
  const [showFeedback, setShowFeedback] = useState(false);
  const [hasNewAnnouncement, setHasNewAnnouncement] = useState(false);

  // Compares the latest published announcement's id against what this
  // browser last saw (ChangelogPage.tsx writes that value) -- no account
  // needed, so it works for a logged-out visitor too.
  useEffect(() => {
    getSupabase()
      .from('announcements')
      .select('id')
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const latest = data as { id: string } | null;
        if (!latest) return;
        try {
          setHasNewAnnouncement(localStorage.getItem('lastSeenAnnouncementId') !== latest.id);
        } catch {
          // Private browsing / storage blocked -- just skip the badge.
        }
      });
  }, []);

  return (
    <footer className="border-t border-stone-800 px-6 py-4 text-center text-xs text-stone-600">
      <Link to="/changelog" className="relative hover:text-stone-400">
        Updates
        {hasNewAnnouncement && <span className="absolute -right-2 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" />}
      </Link>{' '}
      <span aria-hidden="true">·</span>{' '}
      <Link to="/about" className="hover:text-stone-400">
        About us
      </Link>
      {session && (
        <>
          {' '}
          <span aria-hidden="true">·</span>{' '}
          <button type="button" onClick={() => setShowFeedback(true)} className="hover:text-stone-400">
            Feedback
          </button>
        </>
      )}
      {showFeedback && session && <FeedbackModal profileId={session.user.id} onClose={() => setShowFeedback(false)} />}
    </footer>
  );
}
