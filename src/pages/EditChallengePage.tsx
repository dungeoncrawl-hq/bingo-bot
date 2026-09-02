import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';
import type { Challenge, Tile, TileLayout } from '../db/types';
import TileEditorForm from '../components/TileEditorForm';
import { formatTileGoal, type TileCondition } from '../lib/tileConditions';
import { displayStatus } from '../lib/dungeonStatus';

const GRID_SIZE = 5;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ParticipantRow {
  id: string;
  rsn: string;
  profiles: { display_name: string } | null;
  screenshot_count: number;
  screenshot_bytes: number;
}

export default function EditChallengePage() {
  const { slug } = useParams<{ slug: string }>();
  const { session, loading: authLoading } = useAuth();
  const [challenge, setChallenge] = useState<Challenge | null | 'not-found'>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
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
    const [{ data: tilesData }, { data: participantsData }] = await Promise.all([
      supabase.from('tiles').select('*').eq('challenge_id', challengeData.id),
      supabase
        .from('challenge_participants')
        .select('id, rsn, profiles(display_name), screenshot_count, screenshot_bytes')
        .eq('challenge_id', challengeData.id),
    ]);
    setTiles((tilesData as Tile[]) ?? []);
    setParticipants((participantsData as unknown as ParticipantRow[]) ?? []);
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (challenge && challenge !== 'not-found') {
      setDiscordWebhookUrl(challenge.discord_webhook_url ?? '');
    }
  }, [challenge]);

  const tileAt = (row: number, col: number) => tiles.find((t) => t.layout.row === row && t.layout.col === col) ?? null;

  async function handleSave(fields: {
    label: string;
    icon: string | null;
    condition: TileCondition;
    points: number;
    first_completer_bonus: number;
  }) {
    if (!editingCell || !challenge || challenge === 'not-found') return;
    const supabase = getSupabase();
    const existing = tileAt(editingCell.row, editingCell.col);
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
    const existing = tileAt(editingCell.row, editingCell.col);
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

  const editingTile = editingCell ? tileAt(editingCell.row, editingCell.col) : null;
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

      <div className="mt-8 grid grid-cols-5 gap-2">
        {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
          const row = Math.floor(i / GRID_SIZE);
          const col = i % GRID_SIZE;
          const tile = tileAt(row, col);
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
              <button
                type="button"
                onClick={() => handleRemoveParticipant(p)}
                className="shrink-0 text-xs text-red-400 underline"
              >
                Remove
              </button>
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
          onSave={handleSave}
          onDelete={editingTile ? handleDelete : undefined}
          onClose={() => setEditingCell(null)}
        />
      )}
    </div>
  );
}
