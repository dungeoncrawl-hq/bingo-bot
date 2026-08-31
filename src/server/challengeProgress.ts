// Completion detection -- multi-tenant equivalent of rs's bingoDiscord.ts.
// Called after every successful Dink event (best-effort, see dinkWebhook.ts)
// for the one participant that event was attributed to. Fetches that
// participant's raw event rows, computes stats + per-tile done/not-done via
// tileConditions.ts, diffs against existing tile_completions, and inserts
// any newly-completed tile/line/board rows (race-safe -- see
// insertRowReturning's comment in supabaseAdmin.ts).
import { selectRows, insertRowReturning } from './supabaseAdmin';
import { relayToDiscord } from './discordRelay';
import { checkTile, gridLines } from '../lib/tileConditions';
import { computeParticipantStats } from '../lib/participantStats';
import type { RawParticipantData } from '../lib/participantStats';
import type { Challenge, Tile } from '../db/types';

interface ParticipantRow {
  id: string;
  challenge_id: string;
  rsn: string;
}

interface CompletionRow {
  kind: 'tile' | 'line' | 'board';
  ref: string;
}

const GRID_SIZE = 5;

export async function checkChallengeProgress(participantId: string): Promise<void> {
  const [participant] = await selectRows<ParticipantRow>(
    'challenge_participants',
    `id=eq.${encodeURIComponent(participantId)}&select=id,challenge_id,rsn`,
  );
  if (!participant) return;

  const [challenge] = await selectRows<Challenge>(
    'challenges',
    `id=eq.${encodeURIComponent(participant.challenge_id)}&select=*`,
  );
  if (!challenge) return;

  const tiles = await selectRows<Tile>('tiles', `challenge_id=eq.${encodeURIComponent(challenge.id)}&select=*`);
  if (tiles.length === 0) return;

  const pid = encodeURIComponent(participantId);
  const [bossKills, slayerTasks, lootDrops, deaths, collectionLogEntries, petObtains, existingCompletions] = await Promise.all([
    selectRows<{ boss: string; kc: number; created_at: string }>('boss_kills', `participant_id=eq.${pid}&select=boss,kc,created_at`),
    selectRows<{ created_at: string }>('slayer_tasks', `participant_id=eq.${pid}&select=created_at`),
    selectRows<{ items: { name: string; quantity: number }[]; total_value: number; created_at: string }>(
      'loot_drops',
      `participant_id=eq.${pid}&select=items,total_value,created_at`,
    ),
    selectRows<{ created_at: string }>('deaths', `participant_id=eq.${pid}&select=created_at`),
    selectRows<{ created_at: string }>('collection_log_entries', `participant_id=eq.${pid}&select=created_at`),
    selectRows<{ updated_at: string }>('pet_obtains', `participant_id=eq.${pid}&select=updated_at`),
    selectRows<CompletionRow>('tile_completions', `participant_id=eq.${pid}&select=kind,ref`),
  ]);

  const raw: RawParticipantData = { bossKills, slayerTasks, lootDrops, deaths, collectionLogEntries, petObtains };
  const stats = computeParticipantStats(raw, { start: challenge.start_date, end: challenge.end_date });

  const doneTileIds = new Set(tiles.filter((t) => checkTile(t.condition, stats).done).map((t) => t.id));
  const alreadyTileIds = new Set(existingCompletions.filter((c) => c.kind === 'tile').map((c) => c.ref));
  const newlyDoneTileIds = [...doneTileIds].filter((id) => !alreadyTileIds.has(id));

  for (const tileId of newlyDoneTileIds) {
    const inserted = await insertCompletion(challenge.id, participant.id, 'tile', tileId);
    if (inserted) {
      const tile = tiles.find((t) => t.id === tileId);
      await relayToDiscord(challenge.discord_webhook_url, `🎉 **${participant.rsn}** completed **${tile?.label ?? 'a tile'}**!`);
    }
  }

  if (challenge.board_type === 'grid5x5') {
    const tileByIndex = new Map(tiles.map((t) => [t.layout.row * GRID_SIZE + t.layout.col, t]));
    const alreadyLineIndices = new Set(existingCompletions.filter((c) => c.kind === 'line').map((c) => c.ref));
    const lines = gridLines(GRID_SIZE);

    for (let i = 0; i < lines.length; i++) {
      const allDone = lines[i].every((idx) => {
        const tile = tileByIndex.get(idx);
        return tile != null && doneTileIds.has(tile.id);
      });
      if (allDone && !alreadyLineIndices.has(String(i))) {
        const inserted = await insertCompletion(challenge.id, participant.id, 'line', String(i));
        if (inserted) await relayToDiscord(challenge.discord_webhook_url, `🎉 **${participant.rsn}** completed a line!`);
      }
    }

    const boardDone = tiles.length === GRID_SIZE * GRID_SIZE && tiles.every((t) => doneTileIds.has(t.id));
    const alreadyBoard = existingCompletions.some((c) => c.kind === 'board');
    if (boardDone && !alreadyBoard) {
      const inserted = await insertCompletion(challenge.id, participant.id, 'board', 'board');
      if (inserted) await relayToDiscord(challenge.discord_webhook_url, `🏆 **${participant.rsn}** completed the whole board!`);
    }
  }
}

async function insertCompletion(challengeId: string, participantId: string, kind: string, ref: string): Promise<boolean> {
  const rows = await insertRowReturning<{ id: string }>(
    'tile_completions',
    { challenge_id: challengeId, participant_id: participantId, kind, ref },
    'participant_id,challenge_id,kind,ref',
  );
  return rows.length > 0;
}
