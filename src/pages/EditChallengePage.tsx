import { Fragment, useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';
import type { Challenge, GridLayout, Team, Tile, TileLayout } from '../db/types';
import TileEditorForm from '../components/TileEditorForm';
import AdventureConnector from '../components/AdventureConnector';
import PlayerChip from '../components/PlayerChip';
import HostBadge from '../components/HostBadge';
import { formatTileGoal, type TileCondition } from '../lib/tileConditions';
import { daysBetween, displayStatus, formatLocalRange, MAX_DUNGEON_LENGTH_DAYS } from '../lib/dungeonStatus';
import { formatBytes } from '../lib/format';
import { ADVENTURE_SMALL_COLUMNS, ADVENTURE_SMALL_FINAL_BOSS_COLUMN, isBossColumn, laneCountForColumn } from '../lib/adventureProgress';
import { randomizeBoard } from '../lib/randomizeBoard';
import { DEFAULT_RANDOMIZE_SETTINGS, type Difficulty, type RandomizeSettings } from '../lib/randomizeSettings';

const GRID_SIZE = 5;
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
  const [newTeamName, setNewTeamName] = useState('');
  const [addingTeam, setAddingTeam] = useState(false);
  const [editingCell, setEditingCell] = useState<TileLayout | null>(null);
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [webhookSaved, setWebhookSaved] = useState(false);
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
    const emptySlots: GridLayout[] = [];
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
      const row = Math.floor(i / GRID_SIZE);
      const col = i % GRID_SIZE;
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
        "Publish this dungeon? It'll become visible and joinable. Once its start date arrives, tile " +
          "conditions can no longer be changed -- only points, the first-completer bonus, and adding new tiles " +
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
        `Delete "${challenge.name}"? This can't be undone -- the dungeon, its tiles, and any join history will be permanently gone.`,
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

  async function handleAddTeam(e: FormEvent) {
    e.preventDefault();
    if (!challenge || challenge === 'not-found' || !newTeamName.trim()) return;
    setAddingTeam(true);
    await getSupabase().from('teams').insert({ challenge_id: challenge.id, name: newTeamName.trim() });
    setAddingTeam(false);
    setNewTeamName('');
    await load();
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
    setTimeout(() => setWebhookSaved(false), 2000);
    await load();
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
  const tilesLocked = status === 'active' || status === 'past';
  // BACKLOG.md #11 -- same reasoning as NewChallengePage.tsx's own copy:
  // steers the end-date picker away from an invalid range before submit
  // ever runs.
  const maxEditEndDate = editStartDate
    ? new Date(new Date(`${editStartDate}T00:00:00Z`).getTime() + MAX_DUNGEON_LENGTH_DAYS * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
    : undefined;

  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{challenge.name}</h1>
          <Link to={`/c/${challenge.slug}`} className="text-sm text-stone-500 underline hover:text-stone-300">
            /c/{challenge.slug}
          </Link>
        </div>
        <div className="flex shrink-0 gap-2">
          {/* Delete stays primary-host-only (BACKLOG.md #26) -- a co-host
              gets full board-management rights but never the ability to
              delete the dungeon out from under its actual owner. */}
          {challenge.status === 'draft' && isPrimaryHost && (
            <button
              type="button"
              onClick={handleDeleteChallenge}
              className="rounded-lg border border-red-900 px-4 py-2 text-sm text-red-400"
            >
              Delete
            </button>
          )}
          <button onClick={togglePublish} className="rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300">
            {challenge.status === 'draft' ? 'Publish' : 'Unpublish'}
          </button>
        </div>
      </div>

      {challenge.status === 'draft' && (
        <div className="mt-6 max-w-md">
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
            {editStartDate && !editEndDate && (
              <p className="text-xs text-stone-600">A dungeon can run for at most {MAX_DUNGEON_LENGTH_DAYS} days.</p>
            )}
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

      <div className="mt-6 max-w-md">
        <h2 className="text-sm font-semibold text-stone-300">Invite players</h2>
        <p className="mt-1 text-xs text-stone-500">
          Copy a ready-to-send message with a link where players can join and see how to get set up.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            readOnly
            value={inviteMessage}
            onClick={(e) => e.currentTarget.select()}
            className="flex-1 rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-xs text-stone-400"
          />
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(inviteMessage);
              setInviteCopied(true);
              setTimeout(() => setInviteCopied(false), 2000);
            }}
            className="shrink-0 rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300"
          >
            {inviteCopied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {challenge.board_type === 'grid5x5' && challenge.game_mode === 'solo' && (
        <div className="mt-8 max-w-md">
          <h2 className="text-sm font-semibold text-stone-300">Randomize</h2>
          <p className="mt-1 text-xs text-stone-500">
            Fill empty tiles with real, ready-to-tweak goals instead of adding all 25 by hand. Never touches a tile
            you've already placed.
          </p>
          <div className="mt-2 flex items-center gap-2">
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
              disabled={randomizing || GRID_SIZE * GRID_SIZE - tiles.length === 0}
              className="rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300 disabled:opacity-40"
            >
              {randomizing
                ? 'Randomizing…'
                : GRID_SIZE * GRID_SIZE - tiles.length === 0
                  ? 'Board full'
                  : `Randomize ${GRID_SIZE * GRID_SIZE - tiles.length} empty tile${GRID_SIZE * GRID_SIZE - tiles.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}

      {challenge.board_type === 'adventure' ? (
        <div className="mt-8 overflow-x-auto pb-2">
          <div className="flex gap-2" style={{ minWidth: `${ADVENTURE_SMALL_COLUMNS * 90}px` }}>
            {Array.from({ length: ADVENTURE_SMALL_COLUMNS }, (_, column) => {
              const lanes = isBossColumn(column) ? (['center'] as const) : (['top', 'bottom'] as const);
              const isFinalBoss = column === ADVENTURE_SMALL_FINAL_BOSS_COLUMN;
              return (
                <Fragment key={column}>
                  {column > 0 && <AdventureConnector from={laneCountForColumn(column - 1)} to={laneCountForColumn(column)} />}
                  <div className="flex w-20 shrink-0 flex-col justify-center gap-2">
                    {lanes.map((lane) => {
                      const tile = tileAt({ column, lane });
                      return (
                        <button
                          key={lane}
                          onClick={() => setEditingCell({ column, lane })}
                          className={`relative flex aspect-square min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden rounded-lg border p-2 text-center shadow-inner transition-colors hover:border-amber-500 before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/stone-texture.svg')] before:bg-cover before:bg-center before:opacity-30 before:content-[''] ${
                            lane === 'center'
                              ? tile
                                ? isFinalBoss
                                  ? 'border-2 border-red-600 bg-gradient-to-b from-red-950/70 to-stone-950 shadow-[0_0_22px_rgba(239,68,68,0.55)]'
                                  : 'border-2 border-red-700 bg-gradient-to-b from-red-950/50 to-stone-950 shadow-[0_0_16px_rgba(220,38,38,0.4)]'
                                : 'border-2 border-red-900/40 bg-stone-950/50'
                              : tile
                                ? 'border-stone-700 bg-stone-900'
                                : 'border-stone-800/60 bg-stone-950/50'
                          }`}
                        >
                          {tile ? (
                            <>
                              {tile.icon && <img src={tile.icon} alt="" className="h-6 w-6 shrink-0" />}
                              <span className="mt-1 line-clamp-2 w-full break-words text-[11px]">{tile.label}</span>
                              {formatTileGoal(tile.condition) && (
                                <span className="w-full break-words text-[9px] text-stone-500">{formatTileGoal(tile.condition)}</span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-stone-600">{lane === 'center' ? '+ Boss' : '+ Add tile'}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-5 gap-2">
          {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
            const row = Math.floor(i / GRID_SIZE);
            const col = i % GRID_SIZE;
            const tile = tileAt({ row, col });
            return (
              <button
                key={i}
                onClick={() => setEditingCell({ row, col })}
                className={`relative flex aspect-square min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden rounded-lg border p-2 text-center shadow-inner transition-colors hover:border-amber-500 before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/stone-texture.svg')] before:bg-cover before:bg-center before:opacity-30 before:content-[''] ${
                  tile ? 'border-stone-700 bg-stone-900' : 'border-stone-800/60 bg-stone-950/50'
                }`}
              >
                {tile ? (
                  <>
                    {tile.icon && <img src={tile.icon} alt="" className="h-6 w-6 shrink-0" />}
                    <span className="mt-1 line-clamp-2 w-full break-words text-[11px]">{tile.label}</span>
                    {formatTileGoal(tile.condition) && (
                      <span className="w-full break-words text-[9px] text-stone-500">{formatTileGoal(tile.condition)}</span>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-stone-600">+ Add tile</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {challenge.game_mode === 'team' && (
        <div className="mt-10 max-w-md">
          <h2 className="text-lg font-semibold">Teams</h2>
          <p className="mt-1 text-xs text-stone-500">
            Joining is blocked until at least one team exists. Assign participants below in the Players list.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-stone-300">
            {teams.map((t) => (
              <li key={t.id} className="rounded-lg border border-stone-800 px-3 py-2">
                {t.name}
              </li>
            ))}
            {teams.length === 0 && <li className="text-stone-500">No teams yet.</li>}
          </ul>
          <form onSubmit={handleAddTeam} className="mt-3 flex gap-2">
            <input
              required
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Team name"
              className="flex-1 rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={addingTeam}
              className="rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300 disabled:opacity-40"
            >
              {addingTeam ? 'Adding…' : 'Add team'}
            </button>
          </form>
        </div>
      )}

      <div className="mt-10 max-w-md">
        <h2 className="text-lg font-semibold">Players</h2>
        <ul className="mt-3 space-y-2 text-sm text-stone-300">
          {participants.map((p) => {
            const isPrimaryHostRow = p.profile_id === challenge.host_id;
            const isCoHostRow = coHostProfileIds.has(p.profile_id);
            return (
              <li key={p.id} className="flex items-center justify-between gap-2">
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
                <span className="flex shrink-0 items-center gap-2">
                  {challenge.game_mode === 'team' && (
                    <select
                      value={p.team_id ?? ''}
                      onChange={(e) => handleAssignTeam(p, e.target.value || null)}
                      className="rounded-lg border border-stone-700 bg-stone-900 px-2 py-1 text-xs text-stone-300"
                    >
                      <option value="">Unassigned</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {/* Co-host promotion/demotion stays primary-host-only
                      (BACKLOG.md #26) -- a co-host viewing this same list
                      doesn't get this control, matching challenge_hosts'
                      own RLS (only challenges.host_id can write there). */}
                  {isPrimaryHost && !isPrimaryHostRow && (
                    <button type="button" onClick={() => handleToggleCoHost(p)} className="text-xs text-stone-400 underline">
                      {isCoHostRow ? 'Remove co-host' : 'Make co-host'}
                    </button>
                  )}
                  <button type="button" onClick={() => handleRemoveParticipant(p)} className="text-xs text-red-400 underline">
                    Remove
                  </button>
                </span>
              </li>
            );
          })}
          {participants.length === 0 && <li className="text-stone-500">No one's joined yet.</li>}
        </ul>
      </div>

      <div className="mt-10 max-w-md">
        <h2 className="text-lg font-semibold">Discord notifications</h2>
        <p className="mt-1 text-sm text-stone-500">
          Paste a Discord webhook URL to post here whenever a player completes a tile, line, or the whole board.
          (Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.)
        </p>
        <form onSubmit={saveDiscordWebhook} className="mt-3 flex gap-2">
          <input
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
        </form>
      </div>

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
