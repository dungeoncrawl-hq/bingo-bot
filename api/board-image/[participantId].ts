import type { VercelRequest, VercelResponse } from '@vercel/node';
import { selectRows } from '../../src/server/supabaseAdmin.js';
import { checkTile } from '../../src/lib/tileConditions.js';
import { computeParticipantStats } from '../../src/lib/participantStats.js';
import type { RawParticipantData } from '../../src/lib/participantStats.js';
import { computeHiscoresRecap } from '../../src/lib/hiscoresRecap.js';
import type { SnapshotRow } from '../../src/lib/hiscoresRecap.js';
import { computeFirstCompleters } from '../../src/lib/firstCompletions.js';
import { renderBoardImage, type CellStatus } from '../../src/lib/boardImage.js';
import type { Challenge, GridLayout, Tile } from '../../src/db/types.js';

interface ParticipantRow {
  id: string;
  challenge_id: string;
}

const GRID_SIZE = 5;

// Public, no auth -- same exposure level as the board page itself, which
// is already public-read. Discord fetches this URL directly when
// rendering a completion embed's image (see discordEmbeds.ts).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const participantId = req.query.participantId;
  if (typeof participantId !== 'string') {
    res.status(400).json({ error: 'Missing participantId' });
    return;
  }

  const [participant] = await selectRows<ParticipantRow>(
    'challenge_participants',
    `id=eq.${encodeURIComponent(participantId)}&select=id,challenge_id`,
  );
  if (!participant) {
    res.status(404).json({ error: 'Unknown participant' });
    return;
  }

  const [challenge] = await selectRows<Challenge>(
    'challenges',
    `id=eq.${encodeURIComponent(participant.challenge_id)}&select=*`,
  );
  if (!challenge) {
    res.status(404).json({ error: 'Unknown challenge' });
    return;
  }
  // This renderer is hardcoded to the 5x5 grid (row*GRID_SIZE+col below) --
  // discordEmbeds.ts already knows not to link here for an 'adventure'
  // challenge, but guard directly too in case this route is ever hit for
  // one some other way.
  if (challenge.board_type !== 'grid5x5') {
    res.status(404).json({ error: 'No board image available for this board type' });
    return;
  }

  const tiles = await selectRows<Tile>('tiles', `challenge_id=eq.${encodeURIComponent(challenge.id)}&select=*`);

  const pid = encodeURIComponent(participantId);
  const [bossKills, slayerTasks, lootDrops, deaths, collectionLogEntries, petObtains, snapshots, challengeCompletions] =
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
      selectRows<{ participant_id: string; kind: string; ref: string; completed_at: string }>(
        'tile_completions',
        `challenge_id=eq.${encodeURIComponent(challenge.id)}&select=participant_id,kind,ref,completed_at`,
      ),
    ]);

  const raw: RawParticipantData = { bossKills, slayerTasks, lootDrops, deaths, collectionLogEntries, petObtains };
  const window = { start: challenge.start_date, end: challenge.end_date };
  const hiscoresRecap = computeHiscoresRecap(snapshots, window);
  const stats = computeParticipantStats(raw, window, hiscoresRecap);
  const firstCompleters = computeFirstCompleters(challengeCompletions);

  const tileByIndex = new Map(tiles.map((t) => [(t.layout as GridLayout).row * GRID_SIZE + (t.layout as GridLayout).col, t]));
  const cells: CellStatus[] = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
    const tile = tileByIndex.get(i);
    if (!tile) return 'empty';
    const done = checkTile(tile.condition, stats).done;
    if (!done) return 'notDone';
    return firstCompleters[tile.id] === participantId ? 'first' : 'done';
  });

  const png = renderBoardImage(cells);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(png);
}
