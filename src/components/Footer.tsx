import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import FeedbackModal from './FeedbackModal';

export default function Footer() {
  const { session } = useAuth();
  const [showFeedback, setShowFeedback] = useState(false);

  return (
    <footer className="border-t border-stone-800 px-6 py-4 text-center text-xs text-stone-600">
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
