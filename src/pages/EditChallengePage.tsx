import { Fragment, useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';
import type { Challenge, GridLayout, Team, Tile, TileLayout } from '../db/types';
import TileEditorForm from '../components/TileEditorForm';
import { AdventureShapeConnector } from '../components/AdventureConnector';
import PlayerChip from '../components/PlayerChip';
import HostBadge from '../components/HostBadge';
import ProfileIconPicker from '../components/ProfileIconPicker';
import { CopyIcon, PublishIcon, BoardTypeIcon } from '../components/DungeonIcons';
import { formatTileGoal, gridSizeFromBoardSize, type TileCondition } from '../lib/tileConditions';
import { daysBetween, displayStatus, formatLocalRange, MAX_DUNGEON_LENGTH_DAYS, STATUS_STYLE, GAME_MODE_LABEL } from '../lib/dungeonStatus';
import { formatBytes } from '../lib/format';
import { PLAYER_COLORS } from '../lib/playerColors';
import {
  ADVENTURE_SMALL_COLUMNS,
  ADVENTURE_SMALL_FINAL_BOSS_COLUMN,
  ADVENTURE_SMALL_LAYOUT,
  isBossColumn,
  laneCountForColumn,
} from '../lib/adventureProgress';
import { randomizeBoard } from '../lib/randomizeBoard';
import { DEFAULT_RANDOMIZE_SETTINGS, type Difficulty, type RandomizeSettings } from '../lib/randomizeSettings';

// Same reasoning as NewChallengePage.tsx's own copy -- dates are a fixed
// UTC calendar date (BACKLOG.md #14), shown converted to the viewer's own
// zone so a host editing an evening date isn't surprised later.
const VIEWER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

interface ParticipantRow {
  id: string;
  profile_id: string;
  rsn: string;
  profiles: { display_name: string; icon_url: string | null; color: string | null } | null;
  screenshot_count: number;
  screenshot_bytes: number;
  team_id: string | null;
}

// Small icon buttons shared by every per-row action below (Make co-host,
// Remove) -- extracted once here rather than repeating the same className
// string four times.
function RowActionButton({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
        danger
          ? 'border-stone-700 text-red-400 hover:border-red-800 hover:bg-red-950/30'
          : 'border-stone-700 text-stone-400 hover:border-amber-500 hover:text-amber-400'
      }`}
    >
      {children}
    </button>
  );
}

// One board-position button (a Standard grid cell or an Adventure lane
// slot) -- both shapes render an identical tile face, just at different
// sizes/border treatments, so this is shared rather than duplicated
// across the two board-type branches below.
function TileButton({
  tile,
  onClick,
  boss,
  finalBoss,
  emptyLabel,
}: {
  tile: Tile | null;
  onClick: () => void;
  boss?: boolean;
  finalBoss?: boolean;
  emptyLabel: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex aspect-square min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden rounded-lg border p-2 text-center shadow-inner transition-colors hover:border-amber-500 before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/stone-texture.svg')] before:bg-cover before:bg-center before:opacity-30 before:content-[''] ${
        boss
          ? tile
            ? finalBoss
              ? 'border-2 border-red-600 bg-gradient-to-b from-red-950/70 to-stone-950 shadow-[0_0_22px_rgba(239,68,68,0.55)]'
              : 'border-2 border-red-700 bg-gradient-to-b from-red-950/50 to-stone-950 shadow-[0_0_16px_rgba(220,38,38,0.4)]'
            : 'border-2 border-red-900/40 bg-stone-950/50'
          : tile
            ? 'border-stone-700 bg-stone-900'
            : 'border-stone-800/60 bg-stone-950/50'
      }`}
    >
      {boss && tile && (
        <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] font-bold uppercase tracking-wide text-red-300">
          {finalBoss ? 'Final Boss' : 'Boss'}
        </span>
      )}
      {tile ? (
        <>
          {tile.icon && <img src={tile.icon} alt="" className="h-6 w-6 shrink-0" />}
          <span className="mt-1 line-clamp-2 w-full break-words text-[11px]">{tile.label}</span>
          {formatTileGoal(tile.condition) && <span className="w-full break-words text-[9px] text-stone-500">{formatTileGoal(tile.condition)}</span>}
        </>
      ) : (
        <span className="text-xs text-stone-600">{emptyLabel}</span>
      )}
    </button>
  );
}

export default function EditChallengePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [challenge, setChallenge] = useState<Challenge | null | 'not-found'>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  // BACKLOG.md #26 -- profile ids of this challenge's co-hosts (never
  // includes challenge.host_id itself, which is tracked separately).
  const [coHostProfileIds, setCoHostProfileIds] = useState<Set<string>>(new Set());
  // null means "the always-visible form is in its default add-a-new-team
  // state" -- clicking an existing team chip fills this with that team's
  // real id/name/color/icon (edit mode); Cancel resets it back to null.
  const [teamForm, setTeamForm] = useState<{ id: string | 'new'; name: string; color: string; icon: string | null } | null>(null);
  const [savingTeam, setSavingTeam] = useState(false);
  const [showTeamIconPicker, setShowTeamIconPicker] = useState(false);
  const [editingCell, setEditingCell] = useState<TileLayout | null>(null);
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [webhookSaved, setWebhookSaved] = useState(false);
  // The Discord section always shows a connected/not-connected summary;
  // this toggles the actual URL form open, rather than the form always
  // being visible with the raw secret sitting in a text input.
  const [editingWebhook, setEditingWebhook] = useState(false);
  const [dailySummaryEnabled, setDailySummaryEnabled] = useState(true);
  const [savingDailySummary, setSavingDailySummary] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [randomizing, setRandomizing] = useState(false);
  // Name/dates -- editable pre-publish only (see the "Dungeon details"
  // section below).
  const [editName, setEditName] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [tab, setTab] = useState<'board' | 'players' | 'settings'>('board');

  const load = useCallback(async () => {
    if (!slug) return;
    const supabase = getSupabase();
    const { data: challengeData } = await supabase.from('challenges').select('*').eq('slug', slug).maybeSingle();
    if (!challengeData) {
      setChallenge('not-found');
      return;
    }
    setChallenge(challengeData as Challenge);
    const [{ data: tilesData }, { data: participantsData }, { data: teamsData }, { data: hostsData }] = await Promise.all([
      supabase.from('tiles').select('*').eq('challenge_id', challengeData.id),
      supabase
        .from('challenge_participants')
        .select('id, profile_id, rsn, profiles(display_name, icon_url, color), screenshot_count, screenshot_bytes, team_id')
        .eq('challenge_id', challengeData.id),
      supabase.from('teams').select('*').eq('challenge_id', challengeData.id),
      supabase.from('challenge_hosts').select('profile_id').eq('challenge_id', challengeData.id),
    ]);
    setTiles((tilesData as Tile[]) ?? []);
    setParticipants((participantsData as unknown as ParticipantRow[]) ?? []);
    setTeams((teamsData as Team[]) ?? []);
    setCoHostProfileIds(new Set(((hostsData as { profile_id: string }[]) ?? []).map((h) => h.profile_id)));
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (challenge && challenge !== 'not-found') {
      setDiscordWebhookUrl(challenge.discord_webhook_url ?? '');
      // `?? true` covers a pre-migration row where the column doesn't
      // exist yet and PostgREST simply omits it (undefined, not a real
      // false) -- matches the column's own eventual DB default.
      setDailySummaryEnabled(challenge.discord_daily_summary_enabled ?? true);
      setEditName(challenge.name);
      setEditStartDate(challenge.start_date);
      setEditEndDate(challenge.end_date);
    }
  }, [challenge]);

  // Handles both board_types' layout shapes -- a challenge's board_type is
  // fixed at creation and never changes, so `layout` and every `t.layout`
  // in `tiles` are always the same shape for one challenge.
  function layoutEquals(a: TileLayout, b: TileLayout): boolean {
    if ('row' in a && 'row' in b) return a.row === b.row && a.col === b.col;
    if ('column' in a && 'column' in b) return a.column === b.column && a.lane === b.lane;
    return false;
  }
  const tileAt = (layout: TileLayout) => tiles.find((t) => layoutEquals(t.layout, layout)) ?? null;

  async function handleSave(fields: {
    label: string;
    icon: string | null;
    condition: TileCondition;
    points: number;
    first_completer_bonus: number;
  }) {
    if (!editingCell || !challenge || challenge === 'not-found') return;
    const supabase = getSupabase();
    const existing = tileAt(editingCell);
    if (existing) {
      await supabase.from('tiles').update(fields).eq('id', existing.id);
    } else {
      await supabase.from('tiles').insert({ ...fields, challenge_id: challenge.id, layout: editingCell });
    }
    setEditingCell(null);
    await load();
  }

  async function handleDelete() {
    if (!editingCell) return;
    const existing = tileAt(editingCell);
    if (!existing) return;
    await getSupabase().from('tiles').delete().eq('id', existing.id);
    setEditingCell(null);
    await load();
  }

  // BACKLOG.md #5 -- fills only empty grid slots with real, sensibly-sized
  // tiles; never touches one the host (or a prior randomize pass) already
  // placed. Scoped to Standard/solo boards only -- Adventure/Coop/Team need
  // different pooling logic no one's designed yet (see the Host tooling
  // section intro in BACKLOG.md).
  async function handleRandomize() {
    if (!challenge || challenge === 'not-found') return;
    const gridSize = gridSizeFromBoardSize(challenge.board_size);
    const emptySlots: GridLayout[] = [];
    for (let i = 0; i < gridSize * gridSize; i++) {
      const row = Math.floor(i / gridSize);
      const col = i % gridSize;
      if (!tileAt({ row, col })) emptySlots.push({ row, col });
    }
    if (emptySlots.length === 0) return;

    setRandomizing(true);
    try {
      const supabase = getSupabase();
      // Falls back to the same defaults the migration seeds this table
      // with, if the row is somehow missing (migration not run yet, or a
      // fetch error) -- degrades gracefully rather than hard-failing.
      const { data: settingsRow } = await supabase.from('randomize_settings').select('settings').eq('id', true).maybeSingle();
      const settings = (settingsRow?.settings as RandomizeSettings | undefined) ?? DEFAULT_RANDOMIZE_SETTINGS;

      const generated = randomizeBoard({
        emptySlots,
        existingConditions: tiles.map((t) => t.condition),
        difficulty,
        settings,
      });
      await supabase.from('tiles').insert(
        generated.map((g) => ({
          challenge_id: challenge.id,
          layout: g.layout,
          label: g.label,
          icon: g.icon,
          condition: g.condition,
          points: g.points,
          first_completer_bonus: g.first_completer_bonus,
        })),
      );
      await load();
    } finally {
      setRandomizing(false);
    }
  }

  // BACKLOG.md #26 -- name/dates are only offered while still a draft
  // (see the section's own `{challenge.status === 'draft' && ...}` guard
  // below) -- once published, nothing about "when"/"what" this dungeon is
  // should move out from under players who've already seen the invite.
  async function handleSaveDetails(e: FormEvent) {
    e.preventDefault();
    if (!challenge || challenge === 'not-found' || !editName.trim() || !editStartDate || !editEndDate) return;
    if (editEndDate < editStartDate) {
      setDetailsError('End date must be on or after the start date.');
      return;
    }
    // BACKLOG.md #11 -- no upper bound existed before this.
    if (daysBetween(editStartDate, editEndDate) > MAX_DUNGEON_LENGTH_DAYS) {
      setDetailsError(`A dungeon can run for at most ${MAX_DUNGEON_LENGTH_DAYS} days.`);
      return;
    }
    setSavingDetails(true);
    setDetailsError('');
    const { error } = await getSupabase()
      .from('challenges')
      .update({ name: editName.trim(), start_date: editStartDate, end_date: editEndDate })
      .eq('id', challenge.id);
    setSavingDetails(false);
    if (error) {
      setDetailsError(error.message);
      return;
    }
    setDetailsSaved(true);
    setTimeout(() => setDetailsSaved(false), 2000);
    await load();
  }

  async function togglePublish() {
    if (!challenge || challenge === 'not-found') return;
    const nextStatus = challenge.status === 'draft' ? 'active' : 'draft';
    if (
      nextStatus === 'active' &&
      !window.confirm(
        "Publish this dungeon? It'll become visible and joinable. Once its start date arrives, room " +
          "conditions can no longer be changed -- only points, the first-completer bonus, and adding new rooms " +
          'stay editable after that.',
      )
    ) {
      return;
    }
    await getSupabase().from('challenges').update({ status: nextStatus }).eq('id', challenge.id);
    await load();
  }

  // Draft-only: once published, a challenge can have real players/progress
  // riding on it, so deletion isn't offered at all past that point --
  // matches the same "nothing can have counted yet" reasoning tilesLocked
  // below already applies to draft/not-yet-started challenges.
  async function handleDeleteChallenge() {
    if (!challenge || challenge === 'not-found') return;
    if (
      !window.confirm(
        `Delete "${challenge.name}"? This can't be undone -- the dungeon, its rooms, and any join history will be permanently gone.`,
      )
    ) {
      return;
    }
    await getSupabase().from('challenges').delete().eq('id', challenge.id);
    navigate('/dashboard');
  }

  async function handleRemoveParticipant(participant: ParticipantRow) {
    if (!challenge || challenge === 'not-found') return;
    const name = participant.profiles?.display_name ?? participant.rsn;
    const isCoHostParticipant = coHostProfileIds.has(participant.profile_id);
    // A separate, extra confirmation ahead of the normal one (confirmed
    // 2026-09-07) -- removing someone as a participant silently costing
    // them board-edit access too is exactly the kind of thing a host
    // shouldn't discover after the fact.
    if (
      isCoHostParticipant &&
      !window.confirm(`${name} (${participant.rsn}) is a co-host. Removing them will also remove their co-host access. Continue?`)
    ) {
      return;
    }
    if (!window.confirm(`Remove ${name} (${participant.rsn})? Their progress history on this board will be deleted.`)) {
      return;
    }
    await getSupabase().from('challenge_participants').delete().eq('id', participant.id);
    // Application-level cascade -- challenge_hosts has no FK to
    // challenge_participants to cascade through on its own (it's keyed
    // to challenges/profiles directly, see schema.sql's own comment).
    if (isCoHostParticipant) {
      await getSupabase().from('challenge_hosts').delete().eq('challenge_id', challenge.id).eq('profile_id', participant.profile_id);
    }
    await load();
  }

  // Primary-host-only (enforced both by the button's own visibility below
  // and by challenge_hosts' RLS, which only lets challenges.host_id write
  // here) -- confirmed 2026-09-07: co-hosts can never promote/demote
  // other co-hosts, so there's no path for this to be called by anyone
  // but the primary host.
  async function handleToggleCoHost(participant: ParticipantRow) {
    if (!challenge || challenge === 'not-found') return;
    if (coHostProfileIds.has(participant.profile_id)) {
      await getSupabase().from('challenge_hosts').delete().eq('challenge_id', challenge.id).eq('profile_id', participant.profile_id);
    } else {
      await getSupabase().from('challenge_hosts').insert({ challenge_id: challenge.id, profile_id: participant.profile_id });
    }
    await load();
  }

  // `activeTeamForm` (the form's real displayed values, defaulting to a
  // fresh "new team" shape) is computed later, after the early-return
  // narrowing -- safe to reference here even though it's declared lower
  // in this same function body, since this handler only runs on submit,
  // well after that declaration has executed during render.
  async function saveTeamForm(e: FormEvent) {
    e.preventDefault();
    if (!challenge || challenge === 'not-found') return;
    const form = activeTeamForm;
    if (!form.name.trim()) return;
    setSavingTeam(true);
    if (form.id === 'new') {
      await getSupabase().from('teams').insert({ challenge_id: challenge.id, name: form.name.trim(), color: form.color, icon: form.icon });
    } else {
      await getSupabase().from('teams').update({ name: form.name.trim(), color: form.color, icon: form.icon }).eq('id', form.id);
    }
    setSavingTeam(false);
    setTeamForm(null);
    setShowTeamIconPicker(false);
    await load();
  }

  function openTeamForm(team: Team) {
    setTeamForm({ id: team.id, name: team.name, color: team.color ?? PLAYER_COLORS[0], icon: team.icon ?? null });
    setShowTeamIconPicker(false);
  }

  async function handleAssignTeam(participant: ParticipantRow, teamId: string | null) {
    await getSupabase().from('challenge_participants').update({ team_id: teamId }).eq('id', participant.id);
    await load();
  }

  async function saveDiscordWebhook(e: FormEvent) {
    e.preventDefault();
    if (!challenge || challenge === 'not-found') return;
    setSavingWebhook(true);
    await getSupabase()
      .from('challenges')
      .update({ discord_webhook_url: discordWebhookUrl.trim() || null })
      .eq('id', challenge.id);
    setSavingWebhook(false);
    setWebhookSaved(true);
    setEditingWebhook(false);
    setTimeout(() => setWebhookSaved(false), 2000);
    await load();
  }

  // Optimistic update + revert-on-error, same shape as
  // ProfilePage.tsx's handleToggleEmailNotifications -- fails silently
  // (matching saveDiscordWebhook above) until the schema.sql migration
  // adding this column has actually been run.
  async function handleToggleDailySummary(next: boolean) {
    if (!challenge || challenge === 'not-found') return;
    const prev = dailySummaryEnabled;
    setDailySummaryEnabled(next);
    setSavingDailySummary(true);
    const { error } = await getSupabase().from('challenges').update({ discord_daily_summary_enabled: next }).eq('id', challenge.id);
    setSavingDailySummary(false);
    if (error) setDailySummaryEnabled(prev);
  }

  if (authLoading || challenge === null) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (challenge === 'not-found') {
    return <p className="mx-auto max-w-lg py-24 text-center text-stone-400">Dungeon not found.</p>;
  }
  const isPrimaryHost = challenge.host_id === session.user.id;
  const isCoHost = coHostProfileIds.has(session.user.id);
  if (!isPrimaryHost && !isCoHost) {
    return <p className="mx-auto max-w-lg py-24 text-center text-stone-400">This isn't your dungeon to edit.</p>;
  }

  const editingTile = editingCell ? tileAt(editingCell) : null;
  // "...on Dungeon Crawl" rather than "my Dungeon Crawl dungeon" -- avoids
  // stacking the site's own name right next to the word "dungeon" twice
  // in a row.
  const inviteMessage = `Come join my dungeon on Dungeon Crawl, "${challenge.name}"! Jump in here: ${window.location.origin}/c/${challenge.slug}`;
  // "Started" = published and its start_date has arrived -- matches
  // displayStatus's 'active'/'past', not just "not a draft," so a
  // published-but-not-yet-started challenge stays fully editable (nothing
  // can have counted toward any tile yet, so there's no progress to
  // protect).
  const today = new Date().toISOString().slice(0, 10);
  const status = displayStatus(challenge, today);
  const statusStyle = STATUS_STYLE[status];
  const tilesLocked = status === 'active' || status === 'past';
  // BACKLOG.md #11 -- same reasoning as NewChallengePage.tsx's own copy:
  // steers the end-date picker away from an invalid range before submit
  // ever runs.
  const maxEditEndDate = editStartDate
    ? new Date(new Date(`${editStartDate}T00:00:00Z`).getTime() + MAX_DUNGEON_LENGTH_DAYS * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
    : undefined;

  // Single-date label for the locked-tiles banner -- same UTC-date
  // formatting formatDateRange (dungeonStatus.ts) uses internally, just
  // for one date instead of a range.
  const startDateLabel = new Date(`${challenge.start_date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const gridSize = gridSizeFromBoardSize(challenge.board_size);
  const totalSlots = challenge.board_type === 'adventure' ? ADVENTURE_SMALL_LAYOUT.length : gridSize * gridSize;
  const filledSlots = tiles.length;
  const emptySlotsCount = gridSize * gridSize - tiles.length;
  const canRandomize = challenge.board_type === 'grid5x5' && challenge.game_mode === 'solo';

  async function handleCopyInvite() {
    await navigator.clipboard.writeText(inviteMessage);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  }

  // Team mode's roster grouped by team, plus a trailing "Unassigned"
  // group for anyone with no team_id yet -- flat (ungrouped) list for
  // every other game mode, unchanged from before this redesign.
  const isTeamMode = challenge.game_mode === 'team';
  const teamGroups = isTeamMode
    ? [
        ...teams.map((t) => ({ team: t, members: participants.filter((p) => p.team_id === t.id) })),
        { team: null, members: participants.filter((p) => p.team_id === null) },
      ]
    : null;
  // The team form's real displayed values -- `teamForm` state stays null
  // for the default "add a new team" shape (a fresh color suggestion that
  // stays live as teams.length changes) until a chip's click fills it
  // with that team's real id/name/color/icon.
  const activeTeamForm = teamForm ?? { id: 'new' as const, name: '', color: PLAYER_COLORS[teams.length % PLAYER_COLORS.length], icon: null };

  // Captured into a plain local rather than reading `challenge.host_id`
  // directly inside `ParticipantRowView` below -- a nested function
  // declaration doesn't retain the early-return narrowing of `challenge`
  // above (same caveat BoardPage.tsx's own `primaryHostId` comment notes).
  const primaryHostId = challenge.host_id;

  function ParticipantRowView({ p }: { p: ParticipantRow }) {
    const isPrimaryHostRow = p.profile_id === primaryHostId;
    const isCoHostRow = coHostProfileIds.has(p.profile_id);
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 py-2.5 last:border-none">
        <span className="flex items-center gap-2">
          <PlayerChip iconUrl={p.profiles?.icon_url ?? null} color={p.profiles?.color ?? null} participantId={p.id} rsn={p.rsn} />
          {p.rsn}
          {(isPrimaryHostRow || isCoHostRow) && <HostBadge role={isPrimaryHostRow ? 'Host' : 'Co-host'} />}
          {p.screenshot_count > 0 && (
            <span
              title={`${p.screenshot_count} Dink screenshots sent (${formatBytes(p.screenshot_bytes)}) -- their "Send screenshot" setting is still on. Ask them to turn it off in Dink's settings.`}
              className="shrink-0 rounded-full border border-amber-800 bg-amber-950/40 px-1.5 py-0.5 text-[10px] text-amber-400"
            >
              ⚠ {p.screenshot_count} screenshots
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {isTeamMode && (
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: teams.find((t) => t.id === p.team_id)?.color ?? '#57534e' }}
              />
              <select
                value={p.team_id ?? ''}
                onChange={(e) => handleAssignTeam(p, e.target.value || null)}
                className="rounded-lg border border-stone-700 bg-stone-900 px-2 py-1.5 text-xs text-stone-300"
              >
                <option value="">Unassigned</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </span>
          )}
          {/* Co-host promotion/demotion stays primary-host-only
              (BACKLOG.md #26) -- a co-host viewing this same list
              doesn't get this control, matching challenge_hosts'
              own RLS (only challenges.host_id can write there). */}
          {isPrimaryHost && !isPrimaryHostRow && (
            <RowActionButton onClick={() => handleToggleCoHost(p)}>{isCoHostRow ? 'Remove co-host' : 'Make co-host'}</RowActionButton>
          )}
          <RowActionButton danger onClick={() => handleRemoveParticipant(p)}>
            Remove
          </RowActionButton>
        </span>
      </li>
    );
  }

  return (
    <div className="mx-auto max-w-3xl py-12">
      <Link to="/dashboard" className="text-xs text-stone-500 hover:text-stone-300">
        &larr; My Dungeons
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4 border-b border-stone-800 pb-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 rounded border border-stone-700 px-1.5 py-px text-[10px] uppercase tracking-wide text-stone-500">
              <BoardTypeIcon boardType={challenge.board_type} />
              {challenge.board_type === 'adventure' ? 'Adventure' : `Standard ${gridSize}x${gridSize}`}
            </span>
            <span className="rounded border border-stone-700 px-1.5 py-px text-[10px] uppercase tracking-wide text-stone-500">
              {GAME_MODE_LABEL[challenge.game_mode]}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusStyle.className}`}>
              {statusStyle.label}
            </span>
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold">{challenge.name}</h1>
          <Link to={`/c/${challenge.slug}`} className="text-sm text-stone-500 underline decoration-dotted hover:text-stone-300">
            /c/{challenge.slug}
          </Link>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={handleCopyInvite}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
              inviteCopied ? 'border-green-800 text-green-400' : 'border-stone-700 text-stone-300 hover:border-amber-500 hover:text-amber-400'
            }`}
          >
            <CopyIcon />
            {inviteCopied ? 'Copied!' : 'Copy Invite'}
          </button>
          <button
            onClick={togglePublish}
            className="flex items-center gap-1.5 rounded-lg border border-stone-700 px-3 py-2 text-sm text-stone-300 hover:border-amber-500"
          >
            <PublishIcon />
            {challenge.status === 'draft' ? 'Publish' : 'Unpublish'}
          </button>
        </div>
      </div>

      <div className="mt-4 flex gap-1 border-b border-stone-800">
        {(
          [
            ['board', `Board (${filledSlots}/${totalSlots})`],
            ['players', `Players (${participants.length})`],
            ['settings', 'Settings'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
              tab === key ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'board' && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-stone-800 bg-stone-900 px-3 py-2">
              <span className="text-sm font-semibold tabular-nums text-stone-100">
                {filledSlots} / {totalSlots}
              </span>
              <span className="text-[11px] uppercase tracking-wide text-stone-500">rooms set</span>
              <div className="h-1.5 w-16 overflow-hidden rounded-full border border-stone-800 bg-stone-950">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-700 to-amber-500"
                  style={{ width: `${totalSlots > 0 ? Math.min(100, Math.round((filledSlots / totalSlots) * 100)) : 0}%` }}
                />
              </div>
            </div>
            {canRandomize && (
              <div className="ml-auto flex items-center gap-2">
                <div className="flex gap-1 rounded-lg border border-stone-700 bg-stone-900 p-1">
                  {(['easy', 'medium', 'hard'] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDifficulty(d)}
                      className={`rounded-md px-3 py-1 text-xs capitalize transition-colors ${
                        difficulty === d ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleRandomize}
                  disabled={randomizing || emptySlotsCount === 0}
                  className="rounded-lg border border-stone-700 px-3 py-2 text-xs text-stone-300 disabled:opacity-40"
                >
                  {randomizing ? 'Randomizing…' : emptySlotsCount === 0 ? 'Board full' : `Randomize ${emptySlotsCount} empty room${emptySlotsCount === 1 ? '' : 's'}`}
                </button>
              </div>
            )}
          </div>

          {challenge.board_type === 'adventure' && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-stone-800 bg-stone-900 px-3 py-2.5 text-xs text-stone-400">
              <span className="mt-0.5 text-red-400">▲</span>
              A player picks a lane at each fork; the two rooms in a lane are theirs alone, but every path funnels through the
              same boss room before the next fork. Boss rooms can't be randomized -- build the whole path by hand.
            </p>
          )}

          {tilesLocked && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-sky-800 bg-sky-950/30 px-3 py-2.5 text-xs text-sky-200">
              <span className="mt-0.5">🔒</span>
              <span>
                <span className="font-semibold text-sky-100">Started {startDateLabel}</span> -- room conditions are locked. You can still
                adjust points, the first-completer bonus, or add brand-new rooms.
              </span>
            </p>
          )}

          {challenge.board_type === 'adventure' ? (
            <div className="mt-4 overflow-x-auto pb-2">
              <div className="flex gap-2" style={{ minWidth: `${ADVENTURE_SMALL_COLUMNS * 90}px` }}>
                {Array.from({ length: ADVENTURE_SMALL_COLUMNS }, (_, column) => {
                  const lanes = isBossColumn(column) ? (['center'] as const) : (['top', 'bottom'] as const);
                  const isFinalBoss = column === ADVENTURE_SMALL_FINAL_BOSS_COLUMN;
                  return (
                    <Fragment key={column}>
                      {column > 0 && <AdventureShapeConnector from={laneCountForColumn(column - 1)} to={laneCountForColumn(column)} />}
                      <div className="flex w-20 shrink-0 flex-col justify-center gap-2">
                        {lanes.map((lane) => (
                          <TileButton
                            key={lane}
                            tile={tileAt({ column, lane })}
                            onClick={() => setEditingCell({ column, lane })}
                            boss={lane === 'center'}
                            finalBoss={isFinalBoss}
                            emptyLabel={lane === 'center' ? '+ Boss' : '+ Add room'}
                          />
                        ))}
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}>
              {Array.from({ length: gridSize * gridSize }, (_, i) => {
                const row = Math.floor(i / gridSize);
                const col = i % gridSize;
                return <TileButton key={i} tile={tileAt({ row, col })} onClick={() => setEditingCell({ row, col })} emptyLabel="+ Add room" />;
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'players' && (
        <div className="mt-6 max-w-xl">
          {isTeamMode && (
            <div className="mb-6 border-b border-stone-800 pb-5">
              <h2 className="text-sm font-semibold text-stone-300">Teams</h2>
              <p className="mt-1 text-xs text-stone-500">
                Joining is blocked until at least one team exists. Click a team to rename it or change its color/icon.
              </p>
              <ul className="mt-3 flex flex-wrap gap-2 text-sm text-stone-300">
                {teams.map((t) => {
                  const memberCount = participants.filter((p) => p.team_id === t.id).length;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => openTeamForm(t)}
                        className="flex items-center gap-2 rounded-lg border border-stone-800 bg-stone-900 py-1 pl-1 pr-3 hover:border-stone-600"
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[11px] font-bold text-stone-950"
                          style={{ backgroundColor: t.color ?? PLAYER_COLORS[0] }}
                        >
                          {t.icon ? <img src={t.icon} alt="" className="h-4 w-4 object-contain" /> : t.name.slice(0, 1).toUpperCase()}
                        </span>
                        {t.name}
                        <span className="text-stone-500">
                          &middot; {memberCount} player{memberCount === 1 ? '' : 's'}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {teams.length === 0 && <li className="text-stone-500">No teams yet.</li>}
              </ul>

              <form onSubmit={saveTeamForm} className="mt-3 flex flex-wrap items-center gap-2">
                <p className="w-full text-xs uppercase tracking-wide text-stone-500">{activeTeamForm.id === 'new' ? 'New team' : 'Edit team'}</p>
                <input
                  required
                  value={activeTeamForm.name}
                  onChange={(e) => setTeamForm({ ...activeTeamForm, name: e.target.value })}
                  placeholder="Team name"
                  className="w-40 rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
                <div className="flex gap-1.5">
                  {PLAYER_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      title={c}
                      onClick={() => setTeamForm({ ...activeTeamForm, color: c })}
                      className={`h-7 w-7 rounded-full border-2 ${activeTeamForm.color === c ? 'border-amber-400' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowTeamIconPicker(true)}
                  title="Team icon"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-stone-700 bg-stone-900 hover:border-amber-500"
                >
                  {activeTeamForm.icon ? (
                    <img src={activeTeamForm.icon} alt="" className="h-5 w-5 object-contain" />
                  ) : (
                    <span className="text-xs text-stone-600">+</span>
                  )}
                </button>
                <button type="submit" disabled={savingTeam} className="rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300 disabled:opacity-40">
                  {savingTeam ? 'Saving…' : activeTeamForm.id === 'new' ? 'Add team' : 'Save changes'}
                </button>
                {teamForm && (
                  <button type="button" onClick={() => setTeamForm(null)} className="rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300">
                    Cancel
                  </button>
                )}
              </form>
              {showTeamIconPicker && (
                <ProfileIconPicker
                  currentIcon={activeTeamForm.icon}
                  onSelect={(icon) => {
                    setTeamForm({ ...activeTeamForm, icon });
                    setShowTeamIconPicker(false);
                  }}
                  onClose={() => setShowTeamIconPicker(false)}
                />
              )}
            </div>
          )}

          <h2 className="text-sm font-semibold text-stone-300">Players</h2>
          {teamGroups ? (
            <div className="mt-2">
              {teamGroups.map(({ team, members }) => (
                <div key={team?.id ?? 'unassigned'}>
                  <p className="mt-3 text-xs uppercase tracking-wide text-stone-500">
                    {team?.name ?? 'Unassigned'} &middot; {members.length} player{members.length === 1 ? '' : 's'}
                  </p>
                  <ul className="text-sm text-stone-300">
                    {members.map((p) => (
                      <ParticipantRowView key={p.id} p={p} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <ul className="mt-2 text-sm text-stone-300">
              {participants.map((p) => (
                <ParticipantRowView key={p.id} p={p} />
              ))}
            </ul>
          )}
          {participants.length === 0 && <p className="mt-2 text-sm text-stone-500">No one's joined yet.</p>}
        </div>
      )}

      {tab === 'settings' && (
        <div className="mt-6 max-w-md">
          {challenge.status === 'draft' && (
            <div className="border-b border-stone-800 pb-6">
              <h2 className="text-sm font-semibold text-stone-300">Dungeon details</h2>
              <p className="mt-1 text-xs text-stone-500">Only editable while still a draft -- publishing locks the name and dates.</p>
              <form onSubmit={handleSaveDetails} className="mt-2 space-y-3">
                <div>
                  <label className="block text-xs text-stone-400">Name</label>
                  <input
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-stone-400">Start date</label>
                    <input
                      type="date"
                      required
                      min={today}
                      value={editStartDate}
                      onChange={(e) => setEditStartDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-stone-400">End date</label>
                    <input
                      type="date"
                      required
                      min={editStartDate || today}
                      max={maxEditEndDate}
                      value={editEndDate}
                      onChange={(e) => setEditEndDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
                {editStartDate && editEndDate && (
                  <p className="text-xs text-stone-500">
                    Dates run on a fixed UTC clock -- in your timezone that's {formatLocalRange(editStartDate, editEndDate, VIEWER_TIMEZONE)}.
                  </p>
                )}
                {editStartDate && !editEndDate && <p className="text-xs text-stone-600">A dungeon can run for at most {MAX_DUNGEON_LENGTH_DAYS} days.</p>}
                {detailsError && <p className="text-xs text-red-400">{detailsError}</p>}
                <button
                  type="submit"
                  disabled={savingDetails}
                  className="rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300 disabled:opacity-40"
                >
                  {savingDetails ? 'Saving…' : detailsSaved ? 'Saved ✓' : 'Save'}
                </button>
              </form>
            </div>
          )}

          <div className="mt-6 border-b border-stone-800 pb-6">
            <h2 className="text-sm font-semibold text-stone-300">Discord notifications</h2>
            <p className="mt-1 text-xs text-stone-500">Posts to discord whenever a player completes a room, line, or the whole dungeon.</p>
            {!editingWebhook ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-800 bg-stone-900 px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm text-stone-300">
                  {discordWebhookUrl ? (
                    <>
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.8)]" />
                      Connected <code className="text-xs text-stone-500">discord.com/api/webhooks/••••••••</code>
                    </>
                  ) : (
                    <>
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-stone-700" />
                      <span className="text-stone-500">Not connected</span>
                    </>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingWebhook(true)}
                  className="rounded-lg border border-stone-700 px-3 py-1.5 text-xs text-stone-300 hover:border-amber-500"
                >
                  {discordWebhookUrl ? 'Change' : 'Add'}
                </button>
              </div>
            ) : (
              <form onSubmit={saveDiscordWebhook} className="mt-2 flex gap-2">
                <input
                  autoFocus
                  type="url"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={discordWebhookUrl}
                  onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                  className="flex-1 rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={savingWebhook}
                  className="rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300 disabled:opacity-40"
                >
                  {savingWebhook ? 'Saving…' : webhookSaved ? 'Saved ✓' : 'Save'}
                </button>
                <button type="button" onClick={() => setEditingWebhook(false)} className="rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300">
                  Cancel
                </button>
              </form>
            )}
            <p className="mt-2 text-xs text-stone-600">Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.</p>
            <label className="mt-3 flex items-center gap-2 text-xs text-stone-400">
              <input
                type="checkbox"
                checked={dailySummaryEnabled}
                onChange={(e) => handleToggleDailySummary(e.target.checked)}
                disabled={savingDailySummary || !discordWebhookUrl}
              />
              Send a daily summary
            </label>
          </div>

          <div className="mt-6">
            <h2 className="text-sm font-semibold text-stone-300">Danger zone</h2>
            {challenge.status === 'draft' && isPrimaryHost ? (
              <button type="button" onClick={handleDeleteChallenge} className="mt-2 rounded-lg border border-red-900 px-4 py-2 text-sm text-red-400">
                Delete dungeon
              </button>
            ) : (
              <p className="mt-1 text-xs text-stone-500">
                Dungeons can only be deleted while still a draft.
              </p>
            )}
          </div>
        </div>
      )}

      {editingCell && (
        <TileEditorForm
          existing={editingTile}
          locked={tilesLocked}
          gameMode={challenge.game_mode}
          poolSize={participants.length}
          onSave={handleSave}
          onDelete={editingTile ? handleDelete : undefined}
          onClose={() => setEditingCell(null)}
        />
      )}
    </div>
  );
}
