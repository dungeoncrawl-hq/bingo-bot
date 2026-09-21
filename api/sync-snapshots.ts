import type { VercelRequest, VercelResponse } from '@vercel/node';
import { syncAllParticipants } from '../src/server/participantSync.js';
import { closeEndedChallenges } from '../src/server/challengeLifecycle.js';
import { sendDailySummaries } from '../src/server/discordDailySummary.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    // Close out ended challenges first -- syncAllParticipants already
    // skips status='ended' rows, so this shrinks that day's sync work too
    // for anything that just closed. Daily summaries run last, after
    // syncAllParticipants, so a hiscores-backed tile completion detected
    // by *this* run's sync (e.g. xpGained/skillLevelGained/clues --
    // tileConditions.ts's conditionNeedsBaseline) posts its own embed
    // before that day's "📅 Daily update" rather than right after it,
    // which used to read as the completion only ever posting "with" the
    // daily update. A dungeon that just closed today still only gets its
    // ended-embed, not also a same-day summary (sendDailySummaries only
    // selects status='active', regardless of this ordering).
    const closedResult = await closeEndedChallenges();
    const syncResult = await syncAllParticipants();
    const summaryResult = await sendDailySummaries();
    res.status(200).json({ ...syncResult, ...closedResult, ...summaryResult });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Sync failed' });
  }
}
