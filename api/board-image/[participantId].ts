import type { VercelRequest, VercelResponse } from '@vercel/node';
import { selectRows } from '../../src/server/supabaseAdmin.js';
import { checkTile } from '../../src/lib/tileConditions.js';
import { poolStats } from '../../src/lib/participantStats.js';
import { computeFirstCompleters } from '../../src/lib/firstCompletions.js';
import { renderBoardImage, type CellStatus } from '../../src/lib/boardImage.js';
import { gridSizeFromBoardSize } from '../../src/lib/tileConditions.js';
import { fetchPoolStats, PARTICIPANT_SELECT, type ParticipantRow } from '../../src/server/challengeProgress.js';
import type { Challenge, GridLayout, Tile } from '../../src/db/types.js';

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
    `id=eq.${encodeURIComponent(participantId)}&select=${PARTICIPANT_SELECT}`,
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
  // Renders any Standard size (BACKLOG.md #51 -- 3x3/4x4/5x5, via
  // gridSizeFromBoardSize below) but nothing else -- discordEmbeds.ts
  // already knows not to link here for an 'adventure' challenge, but
  // guard directly too in case this route is ever hit for one some other
  // way.
  if (challenge.board_type !== 'grid5x5') {
    res.status(404).json({ error: 'No board image available for this board type' });
    return;
  }
  const gridSize = gridSizeFromBoardSize(challenge.board_size);

  const tiles = await selectRows<Tile>('tiles', `challenge_id=eq.${encodeURIComponent(challenge.id)}&select=*`);

  // Same coop=everyone/team=teammates/solo=self pool resolution
  // challengeProgress.ts's checkChallengeProgress uses -- without this, a
  // Coop/Team board image was checking tile completion against only the
  // one participant whose event triggered the post, so a tile the pool
  // had already cleared together could still render as not-done here
  // even though tile_completions (and the live site) already show it
  // green.
  let poolMembers: ParticipantRow[];
  if (challenge.game_mode === 'coop') {
    poolMembers = await selectRows<ParticipantRow>(
      'challenge_participants',
      `challenge_id=eq.${encodeURIComponent(challenge.id)}&select=${PARTICIPANT_SELECT}`,
    );
  } else if (challenge.game_mode === 'team' && participant.team_id) {
    poolMembers = await selectRows<ParticipantRow>(
      'challenge_participants',
      `team_id=eq.${encodeURIComponent(participant.team_id)}&select=${PARTICIPANT_SELECT}`,
    );
  } else {
    poolMembers = [participant];
  }

  const window = { start: challenge.start_date, end: challenge.end_date };
  const [{ statsList }, challengeCompletions] = await Promise.all([
    fetchPoolStats(poolMembers, window),
    selectRows<{ participant_id: string; kind: string; ref: string; completed_at: string }>(
      'tile_completions',
      `challenge_id=eq.${encodeURIComponent(challenge.id)}&select=participant_id,kind,ref,completed_at`,
    ),
  ]);
  const stats = statsList.length === 1 ? statsList[0] : poolStats(statsList);
  const firstCompleters = computeFirstCompleters(challengeCompletions);

  const tileByIndex = new Map(tiles.map((t) => [(t.layout as GridLayout).row * gridSize + (t.layout as GridLayout).col, t]));
  const cells: CellStatus[] = Array.from({ length: gridSize * gridSize }, (_, i) => {
    const tile = tileByIndex.get(i);
    if (!tile) return 'empty';
    const done = checkTile(tile.condition, stats).done;
    if (!done) return 'notDone';
    // No "first" concept in Coop -- pooled credit lands on every member
    // at once, same reasoning as BoardPage.tsx's own isFirst gate.
    if (challenge.game_mode === 'coop') return 'done';
    return firstCompleters[tile.id] === participantId ? 'first' : 'done';
  });

  const png = renderBoardImage(cells, gridSize);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(png);
}
