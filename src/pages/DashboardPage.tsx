import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';
import type { Challenge } from '../db/types';
import { displayStatus, formatDateRange, countdownText, daysBetween, type DisplayStatus } from '../lib/dungeonStatus';
import { ADVENTURE_SMALL_TILES_IN_PLAY } from '../lib/adventureProgress';
import HostBadge from '../components/HostBadge';

type ChallengeRow = Pick<
  Challenge,
  'id' | 'name' | 'slug' | 'status' | 'start_date' | 'end_date' | 'created_at' | 'board_type' | 'game_mode'
> & {
  // True for the primary host AND a co-host (BACKLOG.md #26) -- gates
  // Edit/past-dungeon visibility exactly as it always has, since a
  // co-host gets the same access there. `isPrimaryHost` is only for the
  // Host-vs-Co-host-vs-Participant badge below.
  isHost: boolean;
  isPrimaryHost: boolean;
};

// A card's own progress readout -- null when the viewer isn't a
// participant on this challenge at all (a host who never joined their
// own dungeon still sees participant/tile counts, just no progress row).
interface ChallengeStats {
  participantCount: number;
  totalTiles: number;
  myTilesDone: number | null;
  // Rank among this challenge's participants, by tiles completed --
  // solo only (BACKLOG.md's own game_mode split): coop's one shared
  // board has no ranking, and team's pooled-per-team count would tie
  // every teammate at the same rank, which reads as a bug, not a feature.
  rank: { place: number; of: number } | null;
}

const STATUS_STYLE: Record<DisplayStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'border-stone-700 bg-stone-900 text-stone-400' },
  upcoming: { label: 'Upcoming', className: 'border-blue-800 bg-blue-950/40 text-blue-400' },
  active: { label: 'Active', className: 'border-green-800 bg-green-950/40 text-green-400' },
  past: { label: 'Past', className: 'border-stone-800 bg-stone-950 text-stone-600' },
};

function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-[13px] w-[13px] shrink-0">
      <rect x="6" y="6" width="10" height="12" rx="1.5" />
      <path d="M9 6V5a1.5 1.5 0 0 1 1.5-1.5h0A1.5 1.5 0 0 1 12 5v1" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[13px] w-[13px] shrink-0"
    >
      <path d="M12.5 4.5 15.5 7.5 7 16H4v-3z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      <path d="M4 10.5 8 14l8-8" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-[13px] w-[13px] shrink-0 text-stone-500">
      <circle cx="10" cy="7" r="3" />
      <path d="M4 17c0-3 2.7-5 6-5s6 2 6 5" />
    </svg>
  );
}

function PublishIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[13px] w-[13px]"
    >
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
  );
}

// Adventure's board is a branching path (nodes + lanes); Standard is a
// flat grid -- the same visual distinction the board pages themselves
// draw, shrunk to a badge.
function BoardTypeIcon({ boardType }: { boardType: string }) {
  if (boardType === 'adventure') {
    return (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-[18px] w-[18px]">
        <circle cx="4" cy="6" r="1.6" />
        <circle cx="4" cy="14" r="1.6" />
        <circle cx="11" cy="10" r="1.6" />
        <circle cx="17" cy="10" r="1.6" />
        <path d="M5.4 6.9 9.7 9.3M5.4 13.1l4.3-2.4M12.6 10h2.8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-[18px] w-[18px]">
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="11" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="11" width="6" height="6" rx="1" />
      <rect x="11" y="11" width="6" height="6" rx="1" />
    </svg>
  );
}

const GAME_MODE_LABEL: Record<Challenge['game_mode'], string> = { solo: 'Solo', coop: 'Coop', team: 'Team' };

function roleLabel(c: ChallengeRow): string {
  return c.isPrimaryHost ? 'Host' : c.isHost ? 'Co-host' : 'Participant';
}

// The rich card used for everything except Past -- a draft not yet
// published, or a dungeon that's upcoming/active, all share this same
// shape; only the bottom "state row" (draft nudge vs. progress vs.
// complete) and the countdown wording differ by status.
function DungeonCard({ c, stats, today }: { c: ChallengeRow; stats: ChallengeStats | undefined; today: string }) {
  const navigate = useNavigate();
  const status = displayStatus(c, today);
  const style = STATUS_STYLE[status];
  const countdown = countdownText(c, status, today);
  const [inviteCopied, setInviteCopied] = useState(false);
  const inviteMessage = `Come join my dungeon on Dungeon Crawl, "${c.name}"! Jump in here: ${window.location.origin}/c/${c.slug}`;
  // Ending (or starting) within a day is the one state worth an amber
  // highlight -- everything else active/upcoming looks the same.
  const isUrgent = (status === 'active' && daysBetween(today, c.end_date) <= 1) || (status === 'upcoming' && daysBetween(today, c.start_date) <= 1);

  async function handleCopyInvite(e: React.MouseEvent) {
    e.stopPropagation();
    await navigator.clipboard.writeText(inviteMessage);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  }

  const myTilesDone = stats?.myTilesDone ?? null;
  const totalTiles = stats?.totalTiles ?? 0;
  const isComplete = myTilesDone != null && totalTiles > 0 && myTilesDone >= totalTiles;
  const progressPct = totalTiles > 0 && myTilesDone != null ? Math.min(100, Math.round((myTilesDone / totalTiles) * 100)) : 0;
  const progressLabel = c.game_mode === 'coop' ? 'Shared progress' : c.game_mode === 'team' ? "Your team's progress" : 'Your progress';
  const daysToStart = daysBetween(today, c.start_date);
  const draftMessage = daysToStart > 0 ? `${daysToStart} day${daysToStart === 1 ? '' : 's'} until its start date` : daysToStart === 0 ? 'Starts today' : 'Start date has passed';

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/c/${c.slug}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') navigate(`/c/${c.slug}`);
      }}
      className={`cursor-pointer rounded-2xl border bg-gradient-to-b from-stone-900 to-stone-950 p-4 transition-colors hover:border-stone-600 ${
        isUrgent ? 'border-amber-900 hover:border-amber-500' : status === 'draft' ? 'border-dashed border-stone-700' : 'border-stone-800'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-stone-800 bg-stone-950/60 text-amber-500">
            <BoardTypeIcon boardType={c.board_type} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-stone-100">{c.name}</h3>
            <div className="mt-0.5 flex gap-1.5">
              <span className="rounded border border-stone-700 px-1.5 py-px text-[10px] uppercase tracking-wide text-stone-500">
                {c.board_type === 'adventure' ? 'Adventure' : 'Standard'}
              </span>
              <span className="rounded border border-stone-700 px-1.5 py-px text-[10px] uppercase tracking-wide text-stone-500">
                {GAME_MODE_LABEL[c.game_mode]}
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            {c.isHost && <HostBadge role={c.isPrimaryHost ? 'Host' : 'Co-host'} size={14} />}
            {!c.isHost && <span className="text-[11px] text-stone-500">Participant</span>}
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${style.className}`}>{style.label}</span>
          </div>
          {countdown && status !== 'draft' && (
            <span className={`text-xs font-medium ${isUrgent ? 'text-amber-400' : 'text-stone-500'}`}>{countdown}</span>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-stone-500">
        <span>{formatDateRange(c.start_date, c.end_date)}</span>
        {stats && (
          <span className="ml-auto flex items-center gap-1.5">
            <PersonIcon />
            {stats.participantCount} joined
          </span>
        )}
      </div>

      {status === 'draft' ? (
        <div className="mt-3 rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-400">{draftMessage}</div>
      ) : isComplete ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-green-800 bg-green-950/30 px-3 py-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-green-400">
            <CheckIcon />
            {c.game_mode === 'coop' ? 'Shared board' : 'Your board'} — complete ({myTilesDone}/{totalTiles} rooms)
          </span>
          {stats?.rank && (
            <span className="text-xs text-green-300">
              Ranked #{stats.rank.place} of {stats.rank.of}
            </span>
          )}
        </div>
      ) : myTilesDone != null ? (
        <div className="mt-3 flex items-center gap-3">
          <span className="min-w-0 shrink-0 text-xs text-stone-500">{progressLabel}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full border border-stone-800 bg-stone-950">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-700 to-amber-500" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-stone-400">
            {myTilesDone} / {totalTiles}
          </span>
        </div>
      ) : null}

      {status === 'draft' ? (
        <div className="mt-3 flex justify-end">
          <Link
            to={`/c/${c.slug}/edit`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-stone-950 transition-colors hover:bg-amber-400"
          >
            Finish &amp; Publish
            <PublishIcon />
          </Link>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap justify-end gap-1.5">
          <button
            type="button"
            onClick={handleCopyInvite}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors ${
              inviteCopied ? 'border-green-800 text-green-400' : 'border-stone-700 text-stone-400 hover:border-amber-500 hover:text-amber-400'
            }`}
          >
            <CopyIcon />
            {inviteCopied ? 'Copied!' : 'Copy Invite'}
          </button>
          {c.isHost && (
            <Link
              to={`/c/${c.slug}/edit`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 rounded-lg border border-stone-700 px-2.5 py-1.5 text-[11px] text-stone-400 transition-colors hover:border-amber-500 hover:text-amber-400"
            >
              <EditIcon />
              Edit
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// The compact row Past dungeons keep -- lower priority than anything
// still live, so it doesn't need the full card treatment above.
function PastRow({ c }: { c: ChallengeRow }) {
  const navigate = useNavigate();
  const style = STATUS_STYLE.past;

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
        <span className="font-medium text-stone-300">{c.name}</span>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs uppercase text-stone-500">{roleLabel(c)}</span>
          <span className={`rounded-full border px-2 py-0.5 text-xs ${style.className}`}>{style.label}</span>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-xs text-stone-500">{formatDateRange(c.start_date, c.end_date)}</p>
        {c.isHost && (
          <Link
            to={`/c/${c.slug}/edit`}
            className="shrink-0 text-xs text-stone-400 underline decoration-dotted hover:text-stone-200"
            onClick={(e) => e.stopPropagation()}
          >
            Edit
          </Link>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { session, loading } = useAuth();
  const [challenges, setChallenges] = useState<ChallengeRow[] | null>(null);
  const [statsByChallenge, setStatsByChallenge] = useState<Record<string, ChallengeStats>>({});
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!session) return;
    const supabase = getSupabase();
    const fields = 'id, name, slug, status, start_date, end_date, created_at, board_type, game_mode';
    type BareRow = Omit<ChallengeRow, 'isHost' | 'isPrimaryHost'>;
    Promise.all([
      supabase.from('challenges').select(fields).eq('host_id', session.user.id),
      // BACKLOG.md #26 -- co-hosted dungeons get the same Edit access as
      // hosted ones, just a different badge below.
      supabase.from('challenge_hosts').select(`challenges(${fields})`).eq('profile_id', session.user.id),
      supabase.from('challenge_participants').select(`challenges(${fields})`).eq('profile_id', session.user.id),
    ])
      .then(async ([hosted, coHosted, joined]) => {
        const byId = new Map<string, ChallengeRow>();
        for (const c of (hosted.data as BareRow[]) ?? []) {
          byId.set(c.id, { ...c, isHost: true, isPrimaryHost: true });
        }
        // Each row's `challenges` comes back as a single object, not an
        // array -- challenge_hosts.challenge_id/challenge_participants.
        // challenge_id -> challenges is many-to-one from this side, so
        // PostgREST embeds the parent as one object.
        const coHostedRows = (coHosted.data as { challenges: BareRow | null }[] | null) ?? [];
        for (const row of coHostedRows) {
          const c = row.challenges;
          if (c && !byId.has(c.id)) byId.set(c.id, { ...c, isHost: true, isPrimaryHost: false });
        }
        const joinedRows = (joined.data as { challenges: BareRow | null }[] | null) ?? [];
        for (const row of joinedRows) {
          const c = row.challenges;
          if (c && !byId.has(c.id)) byId.set(c.id, { ...c, isHost: false, isPrimaryHost: false });
        }
        const merged = [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
        setChallenges(merged);

        // Second pass: participant counts, tile counts, and completion
        // counts for every challenge above -- kept separate from the
        // challenge list itself so a slow/failed stats fetch never blocks
        // the list from rendering (falls back to cards with no progress
        // row at all, same as a host who hasn't joined their own dungeon).
        const challengeIds = merged.map((c) => c.id);
        if (challengeIds.length === 0) return;
        const [participantsRes, tilesRes, completionsRes] = await Promise.all([
          supabase.from('challenge_participants').select('id, challenge_id, profile_id').in('challenge_id', challengeIds),
          supabase.from('tiles').select('id, challenge_id').in('challenge_id', challengeIds),
          supabase.from('tile_completions').select('participant_id, challenge_id').eq('kind', 'tile').in('challenge_id', challengeIds),
        ]);
        const participants = (participantsRes.data as { id: string; challenge_id: string; profile_id: string }[]) ?? [];
        const tiles = (tilesRes.data as { id: string; challenge_id: string }[]) ?? [];
        const completions = (completionsRes.data as { participant_id: string; challenge_id: string }[]) ?? [];

        const tilesCountByChallenge = new Map<string, number>();
        for (const t of tiles) tilesCountByChallenge.set(t.challenge_id, (tilesCountByChallenge.get(t.challenge_id) ?? 0) + 1);
        const completionCountByParticipant = new Map<string, number>();
        for (const comp of completions) completionCountByParticipant.set(comp.participant_id, (completionCountByParticipant.get(comp.participant_id) ?? 0) + 1);

        const nextStats: Record<string, ChallengeStats> = {};
        for (const c of merged) {
          const challengeParticipants = participants.filter((p) => p.challenge_id === c.id);
          const myParticipant = challengeParticipants.find((p) => p.profile_id === session.user.id);
          const totalTiles = c.board_type === 'adventure' ? ADVENTURE_SMALL_TILES_IN_PLAY : tilesCountByChallenge.get(c.id) ?? 0;
          const myTilesDone = myParticipant ? Math.min(completionCountByParticipant.get(myParticipant.id) ?? 0, totalTiles) : null;

          let rank: ChallengeStats['rank'] = null;
          if (c.game_mode === 'solo' && myParticipant && challengeParticipants.length > 1) {
            const counts = challengeParticipants
              .map((p) => completionCountByParticipant.get(p.id) ?? 0)
              .sort((a, b) => b - a);
            const myCount = completionCountByParticipant.get(myParticipant.id) ?? 0;
            rank = { place: counts.filter((n) => n > myCount).length + 1, of: challengeParticipants.length };
          }

          nextStats[c.id] = { participantCount: challengeParticipants.length, totalTiles, myTilesDone, rank };
        }
        setStatsByChallenge(nextStats);
      })
      .catch((err) => {
        console.error('Failed to load challenges', err);
        setLoadError(true);
      });
  }, [session]);

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;

  const today = new Date().toISOString().slice(0, 10);
  const active = (challenges ?? []).filter((c) => displayStatus(c, today) === 'active').sort((a, b) => a.end_date.localeCompare(b.end_date));
  const draft = (challenges ?? []).filter((c) => displayStatus(c, today) === 'draft').sort((a, b) => a.start_date.localeCompare(b.start_date));
  const upcoming = (challenges ?? []).filter((c) => displayStatus(c, today) === 'upcoming').sort((a, b) => a.start_date.localeCompare(b.start_date));
  const past = (challenges ?? []).filter((c) => displayStatus(c, today) === 'past');

  return (
    <div className="mx-auto max-w-3xl py-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">My Dungeons</h1>
          <p className="mt-2 text-xs text-stone-500">
            Tip: grab your one-time Dink webhook URL from{' '}
            <Link to="/profile" className="text-stone-400 underline hover:text-stone-200">
              your Profile page
            </Link>{' '}
            -- it works for every dungeon you join, current and future.
          </p>
        </div>
        <Link
          to="/new"
          className="rounded-lg bg-amber-500 hover:bg-amber-400 transition-colors px-4 py-2 text-sm font-semibold text-stone-950"
        >
          New Dungeon
        </Link>
      </div>

      {challenges && challenges.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2.5">
          <div className="rounded-lg border border-stone-800 bg-stone-900 px-3.5 py-2">
            <span className="text-lg font-semibold tabular-nums text-stone-100">{challenges.length}</span>{' '}
            <span className="text-[11px] uppercase tracking-wide text-stone-500">Dungeons</span>
          </div>
          <div className="rounded-lg border border-stone-800 bg-stone-900 px-3.5 py-2">
            <span className="text-lg font-semibold tabular-nums text-amber-400">{active.length}</span>{' '}
            <span className="text-[11px] uppercase tracking-wide text-stone-500">Active</span>
          </div>
          <div className="rounded-lg border border-stone-800 bg-stone-900 px-3.5 py-2">
            <span className="text-lg font-semibold tabular-nums text-stone-100">{draft.length}</span>{' '}
            <span className="text-[11px] uppercase tracking-wide text-stone-500">Draft</span>
          </div>
          <div className="rounded-lg border border-stone-800 bg-stone-900 px-3.5 py-2">
            <span className="text-lg font-semibold tabular-nums text-stone-100">{past.length}</span>{' '}
            <span className="text-[11px] uppercase tracking-wide text-stone-500">Past</span>
          </div>
        </div>
      )}

      {loadError && <p className="mt-6 text-sm text-red-400">Couldn't load your dungeons. Try refreshing the page.</p>}
      {!loadError && challenges === null && <p className="mt-6 text-stone-500">Loading…</p>}
      {!loadError && challenges?.length === 0 && <p className="mt-6 text-stone-500">No dungeons yet.</p>}

      {active.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Active</h2>
          <div className="mt-3 space-y-3">
            {active.map((c) => (
              <DungeonCard key={c.id} c={c} stats={statsByChallenge[c.id]} today={today} />
            ))}
          </div>
        </section>
      )}

      {draft.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Draft</h2>
          <div className="mt-3 space-y-3">
            {draft.map((c) => (
              <DungeonCard key={c.id} c={c} stats={statsByChallenge[c.id]} today={today} />
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Upcoming</h2>
          <div className="mt-3 space-y-3">
            {upcoming.map((c) => (
              <DungeonCard key={c.id} c={c} stats={statsByChallenge[c.id]} today={today} />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Past</h2>
          <div className="mt-3 space-y-2">
            {past.map((c) => (
              <PastRow key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
