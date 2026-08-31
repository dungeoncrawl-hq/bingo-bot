import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';

export default function Header() {
  const { session, profile } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
      <Link to="/" className="text-lg font-semibold">
        Dungeon Crawl
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        {session ? (
          <>
            <Link to="/dashboard" className="text-neutral-300 hover:text-neutral-100">
              My challenges
            </Link>
            <span className="text-neutral-500">{profile?.display_name ?? session.user.email}</span>
            <button
              onClick={async () => {
                await getSupabase().auth.signOut();
                navigate('/');
              }}
              className="rounded-lg border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:text-neutral-100"
            >
              Sign out
            </button>
          </>
        ) : (
          <Link to="/login" className="rounded-lg border border-neutral-700 px-3 py-1.5 hover:text-neutral-100">
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
