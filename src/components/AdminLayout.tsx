import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Navigate, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-stone-800 text-stone-100' : 'text-stone-400 hover:bg-stone-900 hover:text-stone-200'}`;

// Small inline icons, one per nav item -- kept local to this file
// rather than added to DungeonIcons.tsx, which is scoped to
// dungeon-management surfaces, not the admin shell itself.
function DashboardIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="11" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="11" width="6" height="6" rx="1" />
      <rect x="11" y="11" width="6" height="6" rx="1" />
    </svg>
  );
}
function DungeonsIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 17V8l6-4 6 4v9" />
      <path d="M8 17v-5h4v5" />
    </svg>
  );
}
function AccountsIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="6.5" r="3" />
      <path d="M4 17c0-3.2 2.7-5.5 6-5.5s6 2.3 6 5.5" />
    </svg>
  );
}
function ParticipantsIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="6.5" cy="7" r="2.3" />
      <circle cx="14" cy="7" r="2.3" />
      <path d="M2.5 16.5c0-2.6 1.9-4.3 4-4.3s4 1.7 4 4.3M10.5 16.5c0-2.6 1.9-4.3 4-4.3s4 1.7 4 4.3" />
    </svg>
  );
}
function GrowthIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 16l4.5-5 3 3L16 6" />
      <path d="M12 6h4v4" />
    </svg>
  );
}
function FeedbackIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 5h14v9H8l-3 3v-3H3z" />
    </svg>
  );
}
function AnnouncementsIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 8l12-4v12L3 12V8z" />
      <path d="M6 12v3a1.5 1.5 0 003 0v-2" />
    </svg>
  );
}
function RandomizeIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 3v2M10 15v2M3 10h2M15 10h2M5.2 5.2l1.4 1.4M13.4 13.4l1.4 1.4M5.2 14.8l1.4-1.4M13.4 6.6l1.4-1.4" />
    </svg>
  );
}
function DiscordIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="6" width="14" height="9" rx="2" />
      <path d="M7 3.5c1-.7 5-.7 6 0M7.5 10v1M12.5 10v1" />
    </svg>
  );
}

const NAV_GROUPS: { heading: string; items: { to: string; end?: boolean; label: string; icon: () => ReactNode; badge?: 'unreviewedFeedback' }[] }[] = [
  {
    heading: 'Overview',
    items: [
      { to: '/dungeon-master-admin', end: true, label: 'Dashboard', icon: DashboardIcon },
      { to: '/dungeon-master-admin/dungeons', label: 'Dungeons', icon: DungeonsIcon },
    ],
  },
  {
    heading: 'People',
    items: [
      { to: '/dungeon-master-admin/accounts', label: 'Accounts', icon: AccountsIcon },
      { to: '/dungeon-master-admin/participants', label: 'Participants', icon: ParticipantsIcon },
      { to: '/dungeon-master-admin/growth', label: 'Growth', icon: GrowthIcon },
    ],
  },
  {
    heading: 'Content',
    items: [
      { to: '/dungeon-master-admin/feedback', label: 'Feedback', icon: FeedbackIcon, badge: 'unreviewedFeedback' },
      { to: '/dungeon-master-admin/announcements', label: 'Announcements', icon: AnnouncementsIcon },
    ],
  },
  {
    heading: 'Configuration',
    items: [
      { to: '/dungeon-master-admin/randomize-settings', label: 'Randomize settings', icon: RandomizeIcon },
      { to: '/dungeon-master-admin/discord-templates', label: 'Discord templates', icon: DiscordIcon },
    ],
  },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unreviewedFeedback, setUnreviewedFeedback] = useState(0);

  // Closes the mobile drawer on every navigation -- covers both a nav
  // link click (which could also just call this directly) and browser
  // back/forward, which wouldn't otherwise fire it.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!profile?.is_site_admin) return;
    getSupabase()
      .from('feedback')
      .select('id', { count: 'exact', head: true })
      .eq('reviewed', false)
      .then(({ count }) => setUnreviewedFeedback(count ?? 0));
  }, [profile?.is_site_admin]);

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  // Deliberately the same "not found" a bad slug gets elsewhere in the
  // app, not "access denied" -- no reason to confirm this route exists
  // at all to someone who isn't the admin.
  if (!profile?.is_site_admin) {
    return <p className="mx-auto max-w-lg py-24 text-center text-stone-400">Not found.</p>;
  }

  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 text-sm">
      {NAV_GROUPS.map((group) => (
        <div key={group.heading}>
          <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-stone-600">{group.heading}</div>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass} onClick={() => setDrawerOpen(false)}>
                <item.icon />
                <span className="flex-1">{item.label}</span>
                {item.badge === 'unreviewedFeedback' && unreviewedFeedback > 0 && (
                  <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-stone-950">
                    {unreviewedFeedback}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* Mobile drawer overlay */}
      {drawerOpen && <div onClick={() => setDrawerOpen(false)} className="fixed inset-0 z-40 bg-black/60 md:hidden" />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-stone-800 bg-stone-950 transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-stone-800 px-4 py-3 md:hidden">
          <span className="text-xs font-semibold uppercase tracking-widest text-amber-500/80">Admin</span>
          <button onClick={() => setDrawerOpen(false)} aria-label="Close menu" className="text-stone-500 hover:text-stone-300">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
        {nav}
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3 border-b border-stone-800 px-4 py-3 md:hidden">
          <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" className="text-stone-400 hover:text-stone-200">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 5h14M3 10h14M3 15h14" />
            </svg>
          </button>
          <span className="text-xs font-semibold uppercase tracking-widest text-amber-500/80">Admin</span>
        </div>
        <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-8 sm:py-8">{children}</div>
      </div>
    </div>
  );
}
