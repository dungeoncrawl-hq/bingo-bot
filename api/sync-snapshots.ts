import type { VercelRequest, VercelResponse } from '@vercel/node';
import { syncAllParticipants } from '../src/server/participantSync.js';
import { closeEndedChallenges } from '../src/server/challengeLifecycle.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    // Close out ended challenges first -- syncAllParticipants already
    // skips status='ended' rows, so this shrinks that day's sync work too
    // for anything that just closed.
    const closedResult = await closeEndedChallenges();
    const syncResult = await syncAllParticipants();
    res.status(200).json({ ...syncResult, ...closedResult });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Sync failed' });
  }
}
