import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import { getSupabase } from '../db/supabaseClient';
import { formatBytes, formatRelativeTime } from '../lib/format';

interface Kpis {
  challengesByStatus: Record<'draft' | 'active' | 'ended', number>;
  // Distinct accounts (profiles rows) -- different from totalParticipants
  // below, which counts challenge_participants rows (one per person per
  // challenge they've joined, so the same account can count several times).
  totalUsers: number;
  totalParticipants: number;
  tilesCompleted: number;
  unreviewedFeedback: number;
  announcementsPublished: number;
  announcementsEmailed: number;
}

interface FlagRow {
  id: string;
  rsn: string;
  screenshot_count: number;
  screenshot_bytes: number;
  webhook_call_count: number;
  last_webhook_at: string | null;
  challenges: { name: string; slug: string } | null;
}

interface ActivityRow {
  id: string;
  name: string;
  slug: string;
  status: 'draft' | 'active' | 'ended';
  created_at: string;
  hostName: string;
}

const ACTIVITY_STATUS_DOT: Record<ActivityRow['status'], string> = {
  draft: 'bg-stone-500',
  active: 'bg-green-500',
  ended: 'bg-stone-600',
};

function KpiCard({ label, value, to }: { label: string; value: string; to?: string }) {
  const className = `rounded-lg border border-stone-800 bg-stone-900 px-4 py-3 ${to ? 'transition-colors hover:border-stone-700' : ''}`;
  const content = (
    <>
      <p className="text-xs uppercase text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </>
  );
  return to ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function FlagList({ title, rows, valueLabel }: { title: string; rows: FlagRow[]; valueLabel: (r: FlagRow) => string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase text-stone-500">{title}</h2>
      <div className="mt-2 space-y-2">
        {rows.length === 0 && <p className="text-sm text-stone-600">Nothing to flag.</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-stone-800 px-3 py-2 text-sm">
            <span>
              {r.rsn}
              {r.challenges && (
                <>
                  {' '}
                  <span className="text-stone-500">in</span>{' '}
                  <Link to={`/c/${r.challenges.slug}/edit`} className="text-stone-400 underline hover:text-stone-200">
                    {r.challenges.name}
                  </Link>
                </>
              )}
            </span>
            <span className="shrink-0 text-amber-400">{valueLabel(r)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [screenshotFlags, setScreenshotFlags] = useState<FlagRow[]>([]);
  const [webhookFlags, setWebhookFlags] = useState<FlagRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    Promise.all([
      supabase.from('challenges').select('status'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('challenge_participants').select('id', { count: 'exact', head: true }),
      supabase.from('tile_completions').select('id', { count: 'exact', head: true }).eq('kind', 'tile'),
      supabase.from('feedback').select('id', { count: 'exact', head: true }).eq('reviewed', false),
      supabase.from('announcements').select('published_at, emailed_at'),
      supabase
        .from('challenge_participants')
        .select('id, rsn, screenshot_count, screenshot_bytes, webhook_call_count, last_webhook_at, challenges(name, slug)')
        .gt('screenshot_count', 0)
        .order('screenshot_count', { ascending: false })
        .limit(5),
      supabase
        .from('challenge_participants')
        .select('id, rsn, screenshot_count, screenshot_bytes, webhook_call_count, last_webhook_at, challenges(name, slug)')
        .gt('webhook_call_count', 0)
        .order('webhook_call_count', { ascending: false })
        .limit(5),
      supabase.from('challenges').select('id, name, slug, status, host_id, created_at').order('created_at', { ascending: false }).limit(5),
      supabase.from('profiles').select('id, display_name'),
    ])
      .then(
        ([
          challenges,
          userCount,
          participantCount,
          tileCompletionCount,
          unreviewedFeedbackCount,
          announcementRows,
          screenshotRows,
          webhookRows,
          recentChallenges,
          profileRows,
        ]) => {
          const byStatus = { draft: 0, active: 0, ended: 0 };
          for (const c of (challenges.data as { status: 'draft' | 'active' | 'ended' }[]) ?? []) {
            byStatus[c.status]++;
          }
          const announcements = (announcementRows.data as { published_at: string | null; emailed_at: string | null }[]) ?? [];
          setKpis({
            challengesByStatus: byStatus,
            totalUsers: userCount.count ?? 0,
            totalParticipants: participantCount.count ?? 0,
            tilesCompleted: tileCompletionCount.count ?? 0,
            unreviewedFeedback: unreviewedFeedbackCount.count ?? 0,
            announcementsPublished: announcements.filter((a) => a.published_at).length,
            announcementsEmailed: announcements.filter((a) => a.published_at && a.emailed_at).length,
          });
          setScreenshotFlags((screenshotRows.data as unknown as FlagRow[]) ?? []);
          setWebhookFlags((webhookRows.data as unknown as FlagRow[]) ?? []);

          const hostNameById = new Map<string, string>();
          for (const p of (profileRows.data as { id: string; display_name: string }[]) ?? []) hostNameById.set(p.id, p.display_name);
          const recent = (recentChallenges.data as { id: string; name: string; slug: string; status: ActivityRow['status']; host_id: string; created_at: string }[]) ?? [];
          setActivity(recent.map((c) => ({ ...c, hostName: hostNameById.get(c.host_id) ?? 'Unknown' })));
        },
      )
      .catch((err) => {
        console.error('Failed to load admin dashboard', err);
        setLoadError(true);
      });
  }, []);

  return (
    <AdminLayout>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-sm text-stone-500">Site-wide activity at a glance.</p>
      {loadError && <p className="mt-4 text-sm text-red-400">Couldn't load site stats. Try refreshing the page.</p>}
      {!loadError && !kpis && <p className="mt-4 text-stone-500">Loading…</p>}
      {kpis && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <KpiCard label="Accounts" value={kpis.totalUsers.toLocaleString()} to="/dungeon-master-admin/accounts" />
            <KpiCard label="Draft" value={kpis.challengesByStatus.draft.toLocaleString()} to="/dungeon-master-admin/dungeons?status=draft" />
            <KpiCard label="Active" value={kpis.challengesByStatus.active.toLocaleString()} to="/dungeon-master-admin/dungeons?status=active" />
            <KpiCard label="Ended" value={kpis.challengesByStatus.ended.toLocaleString()} to="/dungeon-master-admin/dungeons?status=ended" />
            <KpiCard label="Participants" value={kpis.totalParticipants.toLocaleString()} to="/dungeon-master-admin/participants" />
          </div>
          <p className="mt-2 text-sm text-stone-500">{kpis.tilesCompleted.toLocaleString()} tiles completed site-wide.</p>

          <div className="mt-8 rounded-lg border border-stone-800 p-4">
            <h2 className="text-sm font-semibold uppercase text-stone-500">Needs attention</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <Link to="/dungeon-master-admin/feedback" className="text-stone-300 hover:text-stone-100">
                  Unreviewed feedback
                </Link>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${
                    kpis.unreviewedFeedback > 0 ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-400'
                  }`}
                >
                  {kpis.unreviewedFeedback}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <Link to="/dungeon-master-admin/announcements" className="text-stone-300 hover:text-stone-100">
                  Emailed announcements
                </Link>
                <span className={`text-xs tabular-nums ${kpis.announcementsEmailed < kpis.announcementsPublished ? 'text-amber-400' : 'text-stone-400'}`}>
                  {kpis.announcementsEmailed} / {kpis.announcementsPublished}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            <FlagList title="Screenshot flood" rows={screenshotFlags} valueLabel={(r) => `${r.screenshot_count} (${formatBytes(r.screenshot_bytes)})`} />
            <FlagList title="Webhook volume" rows={webhookFlags} valueLabel={(r) => `${r.webhook_call_count.toLocaleString()} calls`} />
          </div>

          <div className="mt-8">
            <h2 className="text-sm font-semibold uppercase text-stone-500">Recent activity</h2>
            <div className="mt-2 space-y-2">
              {activity.length === 0 && <p className="text-sm text-stone-600">Nothing yet.</p>}
              {activity.map((a) => (
                <Link
                  key={a.id}
                  to={`/c/${a.slug}/edit`}
                  className="flex items-center gap-3 rounded-lg border border-stone-800 px-3 py-2 text-sm hover:border-stone-700"
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ACTIVITY_STATUS_DOT[a.status]}`} />
                  <span className="min-w-0 flex-1 truncate text-stone-300">
                    {a.name} <span className="text-stone-600">created by {a.hostName}</span>
                  </span>
                  <span className="shrink-0 text-xs text-stone-600">{formatRelativeTime(a.created_at, Date.now())}</span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
