import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';
import { formatCompactNumber, formatRelativeTime } from '../lib/format';
import { PLAYER_COLORS } from '../lib/playerColors';
import ProfileIconPicker from '../components/ProfileIconPicker';

// One row from any of the 6 raw Dink-event tables, normalized to a
// common shape for display -- each table has its own columns (and, for
// pet_obtains, its own timestamp column name: updated_at, not
// created_at), so this is built by mapping each table's rows rather
// than a single SQL query. `challengeName` is "any other relevant
// detail" the host asked for -- a profile can be in several dungeons at
// once, so which one an event came from isn't otherwise obvious.
interface RecentEvent {
  id: string;
  at: string;
  typeLabel: string;
  detail: string;
  challengeName: string;
}

export default function ProfilePage() {
  const { session, profile, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [defaultRsn, setDefaultRsn] = useState('');
  const [rsnSaving, setRsnSaving] = useState(false);
  const [rsnSaved, setRsnSaved] = useState(false);
  const [rsnError, setRsnError] = useState('');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [notifSaving, setNotifSaving] = useState(false);
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [color, setColor] = useState<string | null>(null);
  const [dinkSecret, setDinkSecret] = useState<string | null>(null);
  const [webhookCopied, setWebhookCopied] = useState(false);
  // 'loading' distinct from null (no events yet) so the line doesn't
  // flash "no events" before the fetch has actually finished.
  const [lastDinkEventAt, setLastDinkEventAt] = useState<string | null | 'loading'>('loading');
  const [recentEvents, setRecentEvents] = useState<RecentEvent[] | 'loading'>('loading');

  useEffect(() => {
    if (session?.user.email) setEmail(session.user.email);
  }, [session]);

  useEffect(() => {
    if (profile) setDefaultRsn(profile.default_rsn ?? '');
  }, [profile]);

  useEffect(() => {
    if (profile) setEmailNotifications(profile.email_notifications);
  }, [profile]);

  useEffect(() => {
    if (profile) setIconUrl(profile.icon_url);
  }, [profile]);

  useEffect(() => {
    if (profile) setColor(profile.color);
  }, [profile]);

  // BACKLOG.md #13 -- one stable per-account webhook, separate from
  // profiles (which is public-read) since this secret lets whoever holds
  // it inject events into every challenge this account participates in.
  // "self read only" RLS (profile_secrets) is what makes this fetch work
  // for the signed-in user and no one else.
  useEffect(() => {
    if (!session) return;
    getSupabase()
      .from('profile_secrets')
      .select('dink_secret')
      .eq('profile_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setDinkSecret((data as { dink_secret: string } | null)?.dink_secret ?? null));
  }, [session]);

  // challenge_participants.last_webhook_at is bumped on every successful
  // Dink call regardless of event type (dinkWebhook.ts's
  // recordWebhookCall) -- already public-read, no new column/migration
  // needed. Account-wide here: the most recent across every challenge
  // this profile participates in, not any one challenge's own value
  // (that's BoardPage.tsx's job).
  useEffect(() => {
    if (!session) return;
    getSupabase()
      .from('challenge_participants')
      .select('last_webhook_at')
      .eq('profile_id', session.user.id)
      .then(({ data }) => {
        const rows = (data as { last_webhook_at: string | null }[] | null) ?? [];
        const latest = rows.reduce<string | null>(
          (max, r) => (r.last_webhook_at && (!max || r.last_webhook_at > max) ? r.last_webhook_at : max),
          null,
        );
        setLastDinkEventAt(latest);
      });
  }, [session]);

  // The 5 most recent raw Dink events across every dungeon this profile
  // is in, newest first. Each of the 6 raw-event tables is keyed by
  // participant_id (challenge_participants.id), not profile_id directly
  // -- a profile can hold a different participant row per dungeon -- so
  // this first resolves every participant row this profile owns, then
  // fetches the newest few rows from each event table for those
  // participant ids and merges them client-side. Fetching only the true
  // top 5 from each table (rather than everything) keeps this cheap
  // while still guaranteeing the real top 5 overall survive the merge,
  // since no single table needs to contribute more than 5 of the final
  // 5.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      const supabase = getSupabase();
      const { data: participantRows } = await supabase
        .from('challenge_participants')
        .select('id, challenges(name)')
        .eq('profile_id', session.user.id);
      const participants = (participantRows as { id: string; challenges: { name: string } | null }[] | null) ?? [];
      if (participants.length === 0) {
        if (!cancelled) setRecentEvents([]);
        return;
      }
      const challengeNameByParticipantId = new Map(participants.map((p) => [p.id, p.challenges?.name ?? 'a dungeon']));
      const participantIds = participants.map((p) => p.id);

      const [bossKills, slayerTasks, lootDrops, deaths, collectionLog, petObtains] = await Promise.all([
        supabase
          .from('boss_kills')
          .select('id, participant_id, boss, kc, is_personal_best, created_at')
          .in('participant_id', participantIds)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('slayer_tasks')
          .select('id, participant_id, monster, tasks_completed, created_at')
          .in('participant_id', participantIds)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('loot_drops')
          .select('id, participant_id, source, items, total_value, is_misc, created_at')
          .in('participant_id', participantIds)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('deaths')
          .select('id, participant_id, value_lost, is_pvp, killer_name, created_at')
          .in('participant_id', participantIds)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('collection_log_entries')
          .select('id, participant_id, item_name, created_at')
          .in('participant_id', participantIds)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('pet_obtains')
          .select('id, participant_id, boss_name, updated_at')
          .in('participant_id', participantIds)
          .order('updated_at', { ascending: false })
          .limit(5),
      ]);

      const events: RecentEvent[] = [];
      for (const r of (bossKills.data as { id: string; participant_id: string; boss: string; kc: number; is_personal_best: boolean; created_at: string }[]) ?? []) {
        events.push({
          id: r.id,
          at: r.created_at,
          typeLabel: 'Boss KC',
          detail: `${r.boss} -- ${r.kc.toLocaleString()} KC${r.is_personal_best ? ' (personal best!)' : ''}`,
          challengeName: challengeNameByParticipantId.get(r.participant_id) ?? 'a dungeon',
        });
      }
      for (const r of (slayerTasks.data as { id: string; participant_id: string; monster: string; tasks_completed: number; created_at: string }[]) ?? []) {
        events.push({
          id: r.id,
          at: r.created_at,
          typeLabel: 'Slayer',
          detail: `Task ${r.tasks_completed.toLocaleString()} complete -- ${r.monster}`,
          challengeName: challengeNameByParticipantId.get(r.participant_id) ?? 'a dungeon',
        });
      }
      for (const r of (lootDrops.data as {
        id: string;
        participant_id: string;
        source: string;
        items: { name: string; quantity: number }[];
        total_value: number;
        is_misc: boolean;
        created_at: string;
      }[]) ?? []) {
        // is_misc rows bucket many small drops together (dinkWebhook.ts's
        // increment_misc_loot) with source hardcoded to the literal
        // string "Misc" -- "from Misc" would be pure noise on top of
        // "Miscellaneous loot", so that half of the sentence is dropped
        // entirely for this case rather than reusing the normal template.
        const itemSummary = r.is_misc
          ? null
          : r.items.length === 1
            ? `${r.items[0].quantity > 1 ? `${r.items[0].quantity}x ` : ''}${r.items[0].name}`
            : `${r.items.length} items`;
        events.push({
          id: r.id,
          at: r.created_at,
          typeLabel: 'Loot',
          detail: itemSummary
            ? `${itemSummary} from ${r.source} -- ${formatCompactNumber(r.total_value)} gp`
            : `Miscellaneous loot -- ${formatCompactNumber(r.total_value)} gp`,
          challengeName: challengeNameByParticipantId.get(r.participant_id) ?? 'a dungeon',
        });
      }
      for (const r of (deaths.data as { id: string; participant_id: string; value_lost: number; is_pvp: boolean; killer_name: string | null; created_at: string }[]) ?? []) {
        events.push({
          id: r.id,
          at: r.created_at,
          typeLabel: 'Death',
          detail: `Died${r.killer_name ? ` to ${r.killer_name}` : ''}${r.is_pvp ? ' (PvP)' : ''} -- ${formatCompactNumber(r.value_lost)} gp lost`,
          challengeName: challengeNameByParticipantId.get(r.participant_id) ?? 'a dungeon',
        });
      }
      for (const r of (collectionLog.data as { id: string; participant_id: string; item_name: string; created_at: string }[]) ?? []) {
        events.push({
          id: r.id,
          at: r.created_at,
          typeLabel: 'Collection Log',
          detail: r.item_name,
          challengeName: challengeNameByParticipantId.get(r.participant_id) ?? 'a dungeon',
        });
      }
      for (const r of (petObtains.data as { id: string; participant_id: string; boss_name: string; updated_at: string }[]) ?? []) {
        events.push({
          id: r.id,
          at: r.updated_at,
          typeLabel: 'Pet',
          detail: r.boss_name,
          challengeName: challengeNameByParticipantId.get(r.participant_id) ?? 'a dungeon',
        });
      }

      events.sort((a, b) => (a.at < b.at ? 1 : -1));
      if (!cancelled) setRecentEvents(events.slice(0, 5));
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;

  async function handleChangeEmail(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || email.trim() === session?.user.email) return;
    setEmailSaving(true);
    setEmailError('');
    // Changing email goes through Supabase's own auth.users, not a plain
    // profiles field update -- it sends a confirmation link to the new
    // address, and the change doesn't actually take effect until that's
    // clicked.
    const { error } = await getSupabase().auth.updateUser({ email: email.trim() });
    setEmailSaving(false);
    if (error) {
      setEmailError(error.message);
      return;
    }
    setEmailSent(true);
  }

  async function handleSaveDefaultRsn(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setRsnSaving(true);
    setRsnError('');
    const { error } = await getSupabase()
      .from('profiles')
      .update({ default_rsn: defaultRsn.trim() || null })
      .eq('id', session.user.id);
    setRsnSaving(false);
    if (error) {
      setRsnError(error.message);
      return;
    }
    setRsnSaved(true);
    setTimeout(() => setRsnSaved(false), 2000);
  }

  async function handleToggleEmailNotifications(next: boolean) {
    if (!session) return;
    const prev = emailNotifications;
    setEmailNotifications(next);
    setNotifSaving(true);
    const { error } = await getSupabase().from('profiles').update({ email_notifications: next }).eq('id', session.user.id);
    setNotifSaving(false);
    if (error) setEmailNotifications(prev);
  }

  async function handleSelectIcon(next: string | null) {
    if (!session) return;
    const prev = iconUrl;
    setIconUrl(next);
    setShowIconPicker(false);
    const { error } = await getSupabase().from('profiles').update({ icon_url: next }).eq('id', session.user.id);
    if (error) setIconUrl(prev);
  }

  async function handleSelectColor(next: string | null) {
    if (!session) return;
    const prev = color;
    setColor(next);
    const { error } = await getSupabase().from('profiles').update({ color: next }).eq('id', session.user.id);
    if (error) setColor(prev);
  }

  return (
    <div className="mx-auto max-w-lg py-12">
      <h1 className="text-2xl font-semibold">My Profile</h1>

      <div className="mt-8 max-w-md">
        <h2 className="text-sm font-semibold text-stone-300">Profile icon</h2>
        <div className="mt-2 flex items-center gap-3">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-stone-700 ${color ? '' : 'bg-stone-900'}`}
            style={color ? { backgroundColor: color } : undefined}
          >
            {iconUrl ? (
              <img src={iconUrl} alt="" className="h-9 w-9 object-contain" />
            ) : (
              <span className="text-xs text-stone-600">None</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowIconPicker(true)}
            className="rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300"
          >
            Choose icon
          </button>
        </div>
        {showIconPicker && <ProfileIconPicker currentIcon={iconUrl} onSelect={handleSelectIcon} onClose={() => setShowIconPicker(false)} />}
      </div>

      <div className="mt-8 max-w-md">
        <h2 className="text-sm font-semibold text-stone-300">Background Color</h2>
        <div className="mt-2 flex items-center gap-2">
          {PLAYER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => handleSelectColor(c)}
              className={`h-8 w-8 rounded-lg border-2 ${color === c ? 'border-stone-100' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
            />
          ))}
          {color && (
            <button type="button" onClick={() => handleSelectColor(null)} className="ml-2 text-xs text-stone-500 underline">
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="mt-8 max-w-md">
        <h2 className="text-sm font-semibold text-stone-300">Email</h2>
        {emailSent ? (
          <p className="mt-2 text-sm text-stone-400">
            Check {email} for a confirmation link -- your email won't change until you click it.
          </p>
        ) : (
          <form onSubmit={handleChangeEmail} className="mt-2 flex gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={emailSaving || !email.trim() || email.trim() === session.user.email}
              className="shrink-0 rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300 disabled:opacity-40"
            >
              {emailSaving ? 'Saving…' : 'Save'}
            </button>
          </form>
        )}
        {emailError && <p className="mt-1 text-sm text-red-400">{emailError}</p>}
      </div>

      <div className="mt-8 max-w-md">
        <h2 className="text-sm font-semibold text-stone-300">Default RSN</h2>
        <form onSubmit={handleSaveDefaultRsn} className="mt-2 flex gap-2">
          <input
            value={defaultRsn}
            onChange={(e) => setDefaultRsn(e.target.value)}
            placeholder="Your OSRS username"
            className="flex-1 rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={rsnSaving}
            className="shrink-0 rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300 disabled:opacity-40"
          >
            {rsnSaving ? 'Saving…' : rsnSaved ? 'Saved ✓' : 'Save'}
          </button>
        </form>
        {rsnError && <p className="mt-1 text-sm text-red-400">{rsnError}</p>}
      </div>

      <div className="mt-8 max-w-md">
        <h2 className="text-sm font-semibold text-stone-300">Email notifications</h2>
        <label className="mt-2 flex items-center gap-2 text-sm text-stone-300">
          <input
            type="checkbox"
            checked={emailNotifications}
            onChange={(e) => handleToggleEmailNotifications(e.target.checked)}
            disabled={notifSaving}
          />
          Email me about new features
        </label>
      </div>

      {dinkSecret && (
        <div className="mt-8 max-w-md">
          <h2 className="text-sm font-semibold text-stone-300">Your Dink webhook URL</h2>
          <p className="mt-1 text-xs text-stone-500">
            Paste this URL into the Dink Plugin Webhook Overrides (Slayer, Pets, Kill Count, Death, Collection Log,
            Loot -- plus Advanced &gt; Custom Metadata Handler for syncing stats when logging out). More details can
            be found on the{' '}
            <Link to="/setup" className="text-amber-400 underline hover:text-amber-300">
              setup page
            </Link>
            .
          </p>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={`${window.location.origin}/api/dink/${dinkSecret}`}
              onClick={(e) => e.currentTarget.select()}
              className="flex-1 rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 font-mono text-xs text-stone-300"
            />
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(`${window.location.origin}/api/dink/${dinkSecret}`);
                setWebhookCopied(true);
                setTimeout(() => setWebhookCopied(false), 2000);
              }}
              className="shrink-0 rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300"
            >
              {webhookCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          {lastDinkEventAt !== 'loading' && (
            <p className="mt-2 text-xs text-stone-600">
              Last Dink event:{' '}
              {lastDinkEventAt ? formatRelativeTime(lastDinkEventAt, Date.now()) : "none received yet -- check your Dink settings"}
            </p>
          )}
        </div>
      )}

      <div className="mt-8 max-w-md">
        <h2 className="text-sm font-semibold text-stone-300">Recent activity</h2>
        {recentEvents === 'loading' ? (
          <p className="mt-2 text-sm text-stone-500">Loading…</p>
        ) : recentEvents.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">No Dink events received yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {recentEvents.map((e) => (
              <li key={e.id} className="rounded-lg border border-stone-800 bg-stone-900/50 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded-full border border-amber-800 bg-amber-950/40 px-1.5 py-0.5 text-[10px] text-amber-400">
                    {e.typeLabel}
                  </span>
                  <span className="text-xs text-stone-600">{formatRelativeTime(e.at, Date.now())}</span>
                </div>
                <p className="mt-1 text-stone-300">{e.detail}</p>
                <p className="mt-0.5 text-xs text-stone-600">{e.challengeName}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
