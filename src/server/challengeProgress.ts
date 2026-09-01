// Completion detection -- multi-tenant equivalent of rs's bingoDiscord.ts.
// Called after every successful Dink event (best-effort, see dinkWebhook.ts)
// for the one participant that event was attributed to. Fetches that
// participant's raw event rows, computes stats + per-tile done/not-done via
// tileConditions.ts, diffs against existing tile_completions, and inserts
// any newly-completed tile/line/board rows (race-safe -- see
// insertRowReturning's comment in supabaseAdmin.ts).
import { selectRows, insertRowReturning } from './supabaseAdmin.js';
import { relayToDiscord } from './discordRelay.js';
import { buildTileCompletionEmbed, buildLineCompletionEmbed, buildBoardCompletionEmbed } from './discordEmbeds.js';
import type { ParticipantLite } from './discordEmbeds.js';
import { checkTile, gridLines } from '../lib/tileConditions.js';
import { computeParticipantStats } from '../lib/participantStats.js';
import type { RawParticipantData } from '../lib/participantStats.js';
import { computeHiscoresRecap } from '../lib/hiscoresRecap.js';
import type { SnapshotRow } from '../lib/hiscoresRecap.js';
import { computeLeaderboard } from '../lib/leaderboard.js';
import { computeFirstCompleters } from '../lib/firstCompletions.js';
import type { Challenge, Tile } from '../db/types.js';

interface ParticipantRow {
  id: string;
  challenge_id: string;
  rsn: string;
}

interface CompletionRow {
  kind: 'tile' | 'line' | 'board';
  ref: string;
}

interface ChallengeCompletionRow {
  participant_id: string;
  kind: string;
  ref: string;
  completed_at: string;
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
  const [bossKills, slayerTasks, lootDrops, deaths, collectionLogEntries, petObtains, snapshots, existingCompletions] =
    await Promise.all([
      selectRows<{ boss: string; kc: number; created_at: string }>('boss_kills', `participant_id=eq.${pid}&select=boss,kc,created_at`),
      selectRows<{ created_at: string }>('slayer_tasks', `participant_id=eq.${pid}&select=created_at`),
      selectRows<{
        items: { name: string; quantity: number }[];
        total_value: number;
        created_at: string;
        is_misc: boolean;
        max_single_value: number | null;
      }>('loot_drops', `participant_id=eq.${pid}&select=items,total_value,created_at,is_misc,max_single_value`),
      selectRows<{ created_at: string }>('deaths', `participant_id=eq.${pid}&select=created_at`),
      selectRows<{ created_at: string }>('collection_log_entries', `participant_id=eq.${pid}&select=created_at`),
      selectRows<{ updated_at: string }>('pet_obtains', `participant_id=eq.${pid}&select=updated_at`),
      selectRows<SnapshotRow>('participant_snapshots', `participant_id=eq.${pid}&select=recorded_on,total_xp,skills,activities`),
      selectRows<CompletionRow>('tile_completions', `participant_id=eq.${pid}&select=kind,ref`),
    ]);

  const raw: RawParticipantData = { bossKills, slayerTasks, lootDrops, deaths, collectionLogEntries, petObtains };
  const window = { start: challenge.start_date, end: challenge.end_date };
  const hiscoresRecap = computeHiscoresRecap(snapshots, window);
  const stats = computeParticipantStats(raw, window, hiscoresRecap);

  const doneTileIds = new Set(tiles.filter((t) => checkTile(t.condition, stats).done).map((t) => t.id));
  const alreadyTileIds = new Set(existingCompletions.filter((c) => c.kind === 'tile').map((c) => c.ref));
  const newlyDoneTileIds = [...doneTileIds].filter((id) => !alreadyTileIds.has(id));

  // Phase 1: do every insert first, collecting only what actually landed
  // (insertCompletion races on a unique constraint -- see its own
  // comment). Discord embeds are built and sent in phase 2, once, using
  // challenge-wide data that must reflect all of this event's inserts.
  const insertedTileIds: string[] = [];
  for (const tileId of newlyDoneTileIds) {
    if (await insertCompletion(challenge.id, participant.id, 'tile', tileId)) insertedTileIds.push(tileId);
  }

  const insertedLineIndices: string[] = [];
  let boardInserted = false;

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
        if (await insertCompletion(challenge.id, participant.id, 'line', String(i))) insertedLineIndices.push(String(i));
      }
    }

    const boardDone = tiles.length === GRID_SIZE * GRID_SIZE && tiles.every((t) => doneTileIds.has(t.id));
    const alreadyBoard = existingCompletions.some((c) => c.kind === 'board');
    if (boardDone && !alreadyBoard) {
      boardInserted = await insertCompletion(challenge.id, participant.id, 'board', 'board');
    }
  }

  // Phase 2: nothing to announce -- skip the extra challenge-wide queries
  // entirely.
  if (insertedTileIds.length === 0 && insertedLineIndices.length === 0 && !boardInserted) return;

  const [allParticipants, challengeCompletions] = await Promise.all([
    selectRows<ParticipantLite>('challenge_participants', `challenge_id=eq.${encodeURIComponent(challenge.id)}&select=id,rsn`),
    selectRows<ChallengeCompletionRow>(
      'tile_completions',
      `challenge_id=eq.${encodeURIComponent(challenge.id)}&select=participant_id,kind,ref,completed_at`,
    ),
  ]);
  const leaderboard = computeLeaderboard(tiles, challengeCompletions, allParticipants.map((p) => p.id));
  const firstCompleters = computeFirstCompleters(challengeCompletions);
  const participantLite: ParticipantLite = { id: participant.id, rsn: participant.rsn };
  const challengeLite = { name: challenge.name, slug: challenge.slug };

  for (const tileId of insertedTileIds) {
    const tile = tiles.find((t) => t.id === tileId);
    if (!tile) continue;
    const isFirst = firstCompleters[tileId] === participant.id;
    const firstCompleterRsn = isFirst
      ? participant.rsn
      : (allParticipants.find((p) => p.id === firstCompleters[tileId])?.rsn ?? participant.rsn);
    const embed = buildTileCompletionEmbed({
      participant: participantLite,
      tile,
      isFirst,
      firstCompleterRsn,
      leaderboard,
      participants: allParticipants,
      challenge: challengeLite,
    });
    await relayToDiscord(challenge.discord_webhook_url, embed);
  }
  for (let i = 0; i < insertedLineIndices.length; i++) {
    await relayToDiscord(
      challenge.discord_webhook_url,
      buildLineCompletionEmbed({ participant: participantLite, challenge: challengeLite }),
    );
  }
  if (boardInserted) {
    await relayToDiscord(
      challenge.discord_webhook_url,
      buildBoardCompletionEmbed({ participant: participantLite, challenge: challengeLite }),
    );
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
