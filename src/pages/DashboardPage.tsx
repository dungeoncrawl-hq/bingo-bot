import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';
import type { Challenge } from '../db/types';
import { displayStatus, formatDateRange, countdownText, type DisplayStatus } from '../lib/dungeonStatus';

type ChallengeRow = Pick<Challenge, 'id' | 'name' | 'slug' | 'status' | 'start_date' | 'end_date' | 'created_at' | 'dink_secret'> & {
  isHost: boolean;
};

const STATUS_STYLE: Record<DisplayStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'border-stone-700 bg-stone-900 text-stone-400' },
  upcoming: { label: 'Upcoming', className: 'border-blue-800 bg-blue-950/40 text-blue-400' },
  active: { label: 'Active', className: 'border-green-800 bg-green-950/40 text-green-400' },
  past: { label: 'Past', className: 'border-stone-800 bg-stone-950 text-stone-600' },
};

function DungeonRow({
  c,
  today,
  copied,
  onCopyWebhook,
}: {
  c: ChallengeRow;
  today: string;
  copied: boolean;
  onCopyWebhook: (c: ChallengeRow) => void;
}) {
  const navigate = useNavigate();
  const status = displayStatus(c, today);
  const style = STATUS_STYLE[status];
  const countdown = countdownText(c, status, today);
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/c/${c.slug}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') navigate(`/c/${c.slug}`);
      }}
      className="cursor-pointer rounded-lg border border-stone-800 px-4 py-2.5 transition-colors hover:border-stone-700"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{c.name}</span>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs uppercase text-stone-500">{c.isHost ? 'Host' : 'Participant'}</span>
          <span className={`rounded-full border px-2 py-0.5 text-xs ${style.className}`}>{style.label}</span>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-xs text-stone-500">
          {formatDateRange(c.start_date, c.end_date)}
          {countdown && <span className="text-stone-600"> · {countdown}</span>}
        </p>
        <div className="flex shrink-0 items-center gap-3 text-xs" onClick={(e) => e.stopPropagation()}>
          {c.isHost && (
            <Link
              to={`/c/${c.slug}/edit`}
              className="text-stone-400 underline decoration-dotted hover:text-stone-200"
              onClick={(e) => e.stopPropagation()}
            >
              Edit
            </Link>
          )}
          <button
            type="button"
            onClick={() => onCopyWebhook(c)}
            className="text-stone-400 underline decoration-dotted hover:text-stone-200"
          >
            {copied ? 'Copied!' : 'Copy webhook'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { session, loading } = useAuth();
  const [challenges, setChallenges] = useState<ChallengeRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    const supabase = getSupabase();
    const fields = 'id, name, slug, status, start_date, end_date, created_at, dink_secret';
    Promise.all([
      supabase.from('challenges').select(fields).eq('host_id', session.user.id),
      supabase.from('challenge_participants').select(`challenges(${fields})`).eq('profile_id', session.user.id),
    ])
      .then(([hosted, joined]) => {
        const byId = new Map<string, ChallengeRow>();
        for (const c of (hosted.data as Omit<ChallengeRow, 'isHost'>[]) ?? []) {
          byId.set(c.id, { ...c, isHost: true });
        }
        // Each row's `challenges` comes back as a single object, not an
        // array -- challenge_participants.challenge_id -> challenges is
        // many-to-one from this side, so PostgREST embeds the parent as
        // one object.
        const joinedRows = (joined.data as { challenges: Omit<ChallengeRow, 'isHost'> | null }[] | null) ?? [];
        for (const row of joinedRows) {
          const c = row.challenges;
          if (c && !byId.has(c.id)) byId.set(c.id, { ...c, isHost: false });
        }
        const merged = [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
        setChallenges(merged);
      })
      .catch((err) => {
        console.error('Failed to load challenges', err);
        setLoadError(true);
      });
  }, [session]);

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;

  const today = new Date().toISOString().slice(0, 10);
  const current = (challenges ?? []).filter((c) => displayStatus(c, today) !== 'past');
  const past = (challenges ?? []).filter((c) => displayStatus(c, today) === 'past');

  async function copyWebhook(c: ChallengeRow) {
    const url = `${window.location.origin}/api/dink/${c.dink_secret}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(c.id);
      setTimeout(() => setCopiedId((id) => (id === c.id ? null : id)), 2000);
    } catch (err) {
      // Clipboard access can be denied by the browser (permissions policy,
      // an unfocused document, etc.) -- fail visibly instead of the button
      // silently doing nothing.
      console.error('Failed to copy webhook URL', err);
      window.alert(`Couldn't copy automatically. Here's the URL:\n\n${url}`);
    }
  }

  return (
    <div className="mx-auto max-w-3xl py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Dungeons</h1>
        <Link to="/new" className="rounded-lg bg-amber-500 hover:bg-amber-400 transition-colors px-4 py-2 text-sm font-semibold text-stone-950">
          New challenge
        </Link>
      </div>
      <div className="mt-6 space-y-2">
        {loadError && <p className="text-sm text-red-400">Couldn't load your dungeons. Try refreshing the page.</p>}
        {!loadError && challenges === null && <p className="text-stone-500">Loading…</p>}
        {!loadError && challenges?.length === 0 && <p className="text-stone-500">No dungeons yet.</p>}
        {current.map((c) => (
          <DungeonRow key={c.id} c={c} today={today} copied={copiedId === c.id} onCopyWebhook={copyWebhook} />
        ))}
      </div>

      {past.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-semibold uppercase text-stone-500">Past</h2>
          <div className="mt-3 space-y-2">
            {past.map((c) => (
              <DungeonRow key={c.id} c={c} today={today} copied={copiedId === c.id} onCopyWebhook={copyWebhook} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
