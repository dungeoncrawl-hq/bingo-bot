import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import { getSupabase } from '../db/supabaseClient';
import { formatBytes } from '../lib/format';

interface Kpis {
  challengesByStatus: Record<'draft' | 'active' | 'ended', number>;
  // Distinct accounts (profiles rows) -- different from totalParticipants
  // below, which counts challenge_participants rows (one per person per
  // challenge they've joined, so the same account can count several times).
  totalUsers: number;
  totalParticipants: number;
  tilesCompleted: number;
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

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-stone-800 bg-stone-900 px-4 py-3">
      <p className="text-xs uppercase text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
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
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    Promise.all([
      supabase.from('challenges').select('status'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('challenge_participants').select('id', { count: 'exact', head: true }),
      supabase.from('tile_completions').select('id', { count: 'exact', head: true }).eq('kind', 'tile'),
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
    ])
      .then(([challenges, userCount, participantCount, tileCompletionCount, screenshotRows, webhookRows]) => {
        const byStatus = { draft: 0, active: 0, ended: 0 };
        for (const c of (challenges.data as { status: 'draft' | 'active' | 'ended' }[]) ?? []) {
          byStatus[c.status]++;
        }
        setKpis({
          challengesByStatus: byStatus,
          totalUsers: userCount.count ?? 0,
          totalParticipants: participantCount.count ?? 0,
          tilesCompleted: tileCompletionCount.count ?? 0,
        });
        setScreenshotFlags((screenshotRows.data as unknown as FlagRow[]) ?? []);
        setWebhookFlags((webhookRows.data as unknown as FlagRow[]) ?? []);
      })
      .catch((err) => {
        console.error('Failed to load admin dashboard', err);
        setLoadError(true);
      });
  }, []);

  return (
    <AdminLayout>
      <h1 className="text-2xl font-semibold">Site dashboard</h1>
      {loadError && <p className="mt-4 text-sm text-red-400">Couldn't load site stats. Try refreshing the page.</p>}
      {!loadError && !kpis && <p className="mt-4 text-stone-500">Loading…</p>}
      {kpis && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <KpiCard label="Accounts" value={String(kpis.totalUsers)} />
            <KpiCard label="Draft" value={String(kpis.challengesByStatus.draft)} />
            <KpiCard label="Active" value={String(kpis.challengesByStatus.active)} />
            <KpiCard label="Ended" value={String(kpis.challengesByStatus.ended)} />
            <KpiCard label="Participants" value={String(kpis.totalParticipants)} />
          </div>
          <p className="mt-2 text-sm text-stone-500">{kpis.tilesCompleted.toLocaleString()} tiles completed site-wide.</p>

          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            <FlagList title="Screenshot flood" rows={screenshotFlags} valueLabel={(r) => `${r.screenshot_count} (${formatBytes(r.screenshot_bytes)})`} />
            <FlagList title="Webhook volume" rows={webhookFlags} valueLabel={(r) => `${r.webhook_call_count} calls`} />
          </div>

          <Link to="/dungeon-master-admin/participants" className="mt-6 inline-block text-sm text-stone-400 underline hover:text-stone-200">
            See every participant →
          </Link>
        </>
      )}
    </AdminLayout>
  );
}
