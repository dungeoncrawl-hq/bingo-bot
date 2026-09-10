import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';
import Logo from './Logo';

export default function Header() {
  const { session, profile } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-stone-800 px-6 py-4">
      <Link to="/" className="flex items-center gap-2 font-display text-lg font-semibold tracking-wide text-amber-500">
        <Logo size={22} />
        Dungeon Crawl
      </Link>
      <nav className="flex flex-wrap items-center gap-4 text-sm">
        {session ? (
          <>
            <Link to="/dashboard" className="text-stone-300 hover:text-stone-100">
              My Dungeons
            </Link>
            {/* The only entry point into /dungeon-master-admin from
                normal site navigation -- previously bookmark/URL-only. */}
            {profile?.is_site_admin && (
              <Link to="/dungeon-master-admin" className="text-stone-300 hover:text-stone-100">
                Admin
              </Link>
            )}
            <Link to="/account" className="text-stone-500 hover:text-stone-300">
              {profile?.display_name ?? session.user.email}
            </Link>
            <button
              onClick={async () => {
                await getSupabase().auth.signOut();
                navigate('/');
              }}
              className="rounded-lg border border-stone-700 px-3 py-1.5 text-stone-300 hover:text-stone-100"
            >
              Sign out
            </button>
          </>
        ) : (
          <Link to="/login" className="rounded-lg border border-stone-700 px-3 py-1.5 hover:text-stone-100">
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
