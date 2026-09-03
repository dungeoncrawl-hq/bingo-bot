import type { ReactNode } from 'react';
import { Navigate, NavLink } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-stone-800 text-stone-100' : 'text-stone-400 hover:text-stone-200'}`;

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  // Deliberately the same "not found" a bad slug gets elsewhere in the
  // app, not "access denied" -- no reason to confirm this route exists
  // at all to someone who isn't the admin.
  if (!profile?.is_site_admin) {
    return <p className="mx-auto max-w-lg py-24 text-center text-stone-400">Not found.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl py-12">
      <div className="flex items-center gap-2 border-b border-stone-800 pb-4">
        <NavLink to="/dungeon-master-admin" end className={tabClass}>
          Dashboard
        </NavLink>
        <NavLink to="/dungeon-master-admin/accounts" className={tabClass}>
          Accounts
        </NavLink>
        <NavLink to="/dungeon-master-admin/participants" className={tabClass}>
          Participants
        </NavLink>
        <NavLink to="/dungeon-master-admin/growth" className={tabClass}>
          Growth
        </NavLink>
        <NavLink to="/dungeon-master-admin/randomize-settings" className={tabClass}>
          Randomize settings
        </NavLink>
        <NavLink to="/dungeon-master-admin/discord-templates" className={tabClass}>
          Discord templates
        </NavLink>
      </div>
      <div className="mt-8">{children}</div>
    </div>
  );
}
