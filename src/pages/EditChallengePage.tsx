import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';
import type { Challenge, Team, Tile, TileLayout } from '../db/types';
import TileEditorForm from '../components/TileEditorForm';
import { formatTileGoal, type TileCondition } from '../lib/tileConditions';
import { displayStatus } from '../lib/dungeonStatus';
import { formatBytes } from '../lib/format';
import { ADVENTURE_SMALL_COLUMNS, isBossColumn } from '../lib/adventureProgress';

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
        <button onClick={togglePublish} className="rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300">
          {challenge.status === 'draft' ? 'Publish' : 'Unpublish'}
        </button>
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

      {challenge.board_type === 'adventure' ? (
        <div className="mt-8 overflow-x-auto pb-2">
          <div className="flex gap-2" style={{ minWidth: `${ADVENTURE_SMALL_COLUMNS * 90}px` }}>
            {Array.from({ length: ADVENTURE_SMALL_COLUMNS }, (_, column) => {
              const lanes = isBossColumn(column) ? (['center'] as const) : (['top', 'bottom'] as const);
              return (
                <div key={column} className="flex w-20 shrink-0 flex-col justify-center gap-2">
                  {lanes.map((lane) => {
                    const tile = tileAt({ column, lane });
                    return (
                      <button
                        key={lane}
                        onClick={() => setEditingCell({ column, lane })}
                        className={`relative flex aspect-square min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden rounded-lg border p-2 text-center shadow-inner transition-colors hover:border-amber-500 before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/stone-texture.svg')] before:bg-cover before:bg-center before:opacity-30 before:content-[''] ${
                          lane === 'center'
                            ? tile
                              ? 'border-amber-700 bg-amber-950/20'
                              : 'border-amber-900/50 bg-stone-950/50'
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
