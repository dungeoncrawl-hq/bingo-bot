import { Fragment, useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';
import type { Challenge, GridLayout, Team, Tile, TileLayout } from '../db/types';
import TileEditorForm from '../components/TileEditorForm';
import AdventureConnector from '../components/AdventureConnector';
import { formatTileGoal, type TileCondition } from '../lib/tileConditions';
import { displayStatus } from '../lib/dungeonStatus';
import { formatBytes } from '../lib/format';
import { ADVENTURE_SMALL_COLUMNS, ADVENTURE_SMALL_FINAL_BOSS_COLUMN, isBossColumn, laneCountForColumn } from '../lib/adventureProgress';
import { randomizeBoard } from '../lib/randomizeBoard';
import { DEFAULT_RANDOMIZE_SETTINGS, type Difficulty, type RandomizeSettings } from '../lib/randomizeSettings';

const GRID_SIZE = 5;

interface ParticipantRow {
  id: string;
  rsn: string;
  profiles: { display_name: string } | null;
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
  const [newTeamName, setNewTeamName] = useState('');
  const [addingTeam, setAddingTeam] = useState(false);
  const [editingCell, setEditingCell] = useState<TileLayout | null>(null);
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [webhookSaved, setWebhookSaved] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [randomizing, setRandomizing] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    const supabase = getSupabase();
    const { data: challengeData } = await supabase.from('challenges').select('*').eq('slug', slug).maybeSingle();
    if (!challengeData) {
      setChallenge('not-found');
      return;
    }
    setChallenge(challengeData as Challenge);
    const [{ data: tilesData }, { data: participantsData }, { data: teamsData }] = await Promise.all([
      supabase.from('tiles').select('*').eq('challenge_id', challengeData.id),
      supabase
        .from('challenge_participants')
        .select('id, rsn, profiles(display_name), screenshot_count, screenshot_bytes, team_id')
        .eq('challenge_id', challengeData.id),
      supabase.from('teams').select('*').eq('challenge_id', challengeData.id),
    ]);
    setTiles((tilesData as Tile[]) ?? []);
    setParticipants((participantsData as unknown as ParticipantRow[]) ?? []);
    setTeams((teamsData as Team[]) ?? []);
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (challenge && challenge !== 'not-found') {
      setDiscordWebhookUrl(challenge.discord_webhook_url ?? '');
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

  async function togglePublish() {
    if (!challenge || challenge === 'not-found') return;
    const nextStatus = challenge.status === 'draft' ? 'active' : 'draft';
    if (
      nextStatus === 'active' &&
      !window.confirm(
        "Publish this challenge? It'll become visible and joinable. Once its start date arrives, tile " +
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
        `Delete "${challenge.name}"? This can't be undone -- the challenge, its tiles, and any join history will be permanently gone.`,
      )
    ) {
      return;
    }
    await getSupabase().from('challenges').delete().eq('id', challenge.id);
    navigate('/dashboard');
  }

  async function handleRemoveParticipant(participant: ParticipantRow) {
    const name = participant.profiles?.display_name ?? participant.rsn;
    if (!window.confirm(`Remove ${name} (${participant.rsn})? Their progress history on this board will be deleted.`)) {
      return;
    }
    await getSupabase().from('challenge_participants').delete().eq('id', participant.id);
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
    return <p className="mx-auto max-w-lg py-24 text-center text-stone-400">Challenge not found.</p>;
  }
  if (challenge.host_id !== session.user.id) {
    return <p className="mx-auto max-w-lg py-24 text-center text-stone-400">This isn't your challenge to edit.</p>;
  }

  const editingTile = editingCell ? tileAt(editingCell) : null;
  const inviteMessage = `Come join my Dungeon Crawl challenge, "${challenge.name}"! Jump in here: ${window.location.origin}/c/${challenge.slug}`;
  // "Started" = published and its start_date has arrived -- matches
  // displayStatus's 'active'/'past', not just "not a draft," so a
  // published-but-not-yet-started challenge stays fully editable (nothing
  // can have counted toward any tile yet, so there's no progress to
  // protect).
  const today = new Date().toISOString().slice(0, 10);
  const status = displayStatus(challenge, today);
  const tilesLocked = status === 'active' || status === 'past';

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
          {challenge.status === 'draft' && (
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
          {participants.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                {p.rsn}
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
                <button type="button" onClick={() => handleRemoveParticipant(p)} className="text-xs text-red-400 underline">
                  Remove
                </button>
              </span>
            </li>
          ))}
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
