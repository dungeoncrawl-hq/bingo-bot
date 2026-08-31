import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';
import type { Challenge, Tile, TileLayout } from '../db/types';
import TileEditorForm from '../components/TileEditorForm';
import { formatTileGoal, type TileCondition } from '../lib/tileConditions';

const GRID_SIZE = 5;

interface ParticipantRow {
  id: string;
  rsn: string;
  profiles: { display_name: string } | null;
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
        .select('id, rsn, profiles(display_name)')
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

  async function handleSave(fields: { label: string; icon: string | null; condition: TileCondition }) {
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
    return <p className="mx-auto max-w-lg py-24 text-center text-neutral-400">Challenge not found.</p>;
  }
  if (challenge.host_id !== session.user.id) {
    return <p className="mx-auto max-w-lg py-24 text-center text-neutral-400">This isn't your challenge to edit.</p>;
  }

  const editingTile = editingCell ? tileAt(editingCell.row, editingCell.col) : null;

  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{challenge.name}</h1>
          <Link to={`/c/${challenge.slug}`} className="text-sm text-neutral-500 underline hover:text-neutral-300">
            /c/{challenge.slug}
          </Link>
        </div>
        <button onClick={togglePublish} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300">
          {challenge.status === 'draft' ? 'Publish' : 'Unpublish'}
        </button>
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
              className="flex aspect-square flex-col items-center justify-center rounded-lg border border-neutral-800 p-2 text-center hover:border-neutral-600"
            >
              {tile ? (
                <>
                  {tile.icon && <img src={tile.icon} alt="" className="h-6 w-6" />}
                  <span className="mt-1 line-clamp-2 text-[11px]">{tile.label}</span>
                  {formatTileGoal(tile.condition) && (
                    <span className="text-[9px] text-neutral-500">{formatTileGoal(tile.condition)}</span>
                  )}
                </>
              ) : (
                <span className="text-xs text-neutral-600">+ Add tile</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-10 max-w-md">
        <h2 className="text-lg font-semibold">Players</h2>
        <ul className="mt-3 space-y-2 text-sm text-neutral-300">
          {participants.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span>
                {p.profiles?.display_name ?? 'Unknown'} — {p.rsn}
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
          {participants.length === 0 && <li className="text-neutral-500">No one's joined yet.</li>}
        </ul>
      </div>

      <div className="mt-10 max-w-md">
        <h2 className="text-lg font-semibold">Discord notifications</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Paste a Discord webhook URL to post here whenever a player completes a tile, line, or the whole board.
          (Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.)
        </p>
        <form onSubmit={saveDiscordWebhook} className="mt-3 flex gap-2">
          <input
            type="url"
            placeholder="https://discord.com/api/webhooks/..."
            value={discordWebhookUrl}
            onChange={(e) => setDiscordWebhookUrl(e.target.value)}
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={savingWebhook}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 disabled:opacity-40"
          >
            {savingWebhook ? 'Saving…' : webhookSaved ? 'Saved ✓' : 'Save'}
          </button>
        </form>
      </div>

      {editingCell && (
        <TileEditorForm
          existing={editingTile}
          onSave={handleSave}
          onDelete={editingTile ? handleDelete : undefined}
          onClose={() => setEditingCell(null)}
        />
      )}
    </div>
  );
}
