import type { VercelRequest, VercelResponse } from '@vercel/node';
import { selectRows } from '../src/server/supabaseAdmin.js';
import { syncOneParticipant } from '../src/server/participantSync.js';
import { checkChallengeProgress } from '../src/server/challengeProgress.js';

interface ParticipantRow {
  id: string;
  challenge_id: string;
  rsn: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const participantId = req.body?.participantId;
  if (typeof participantId !== 'string') {
    res.status(400).json({ error: 'Missing participantId' });
    return;
  }

  const [participant] = await selectRows<ParticipantRow>(
    'challenge_participants',
    `id=eq.${encodeURIComponent(participantId)}&select=id,challenge_id,rsn`,
  );
  if (!participant) {
    res.status(404).json({ error: 'Unknown participant' });
    return;
  }

  // Best-effort: a brand-new/unranked account may not be on the hiscores
  // at all yet -- that's expected, not a failure worth surfacing to the
  // player. The join itself already succeeded before this ever runs.
  //
  // checkChallengeProgress runs in `finally`, independent of whether the
  // hiscores fetch above succeeded -- it only reads already-persisted
  // event/snapshot data (zero rows if the sync never landed anything, which
  // computeParticipantStats treats as zero progress, not an error), so it's
  // always safe to run. This matters for a condition like 'freeSpace' that
  // needs no stats at all to complete: without this, a participant whose
  // hiscores fetch fails (a test/unranked RSN, most commonly) would never
  // get their free space marked done until some later, unrelated event
  // happened to trigger a sync that succeeded.
  let syncFailed = false;
  try {
    await syncOneParticipant(participant.challenge_id, participant.id, participant.rsn);
  } catch {
    syncFailed = true;
  } finally {
    // A join-time baseline sync, not a real Dink LOGOUT -- must never
    // itself count as the qualifying logout for Adventure's baseline
    // reset (BACKLOG.md #4).
    await checkChallengeProgress(participant.id, false).catch(() => {});
  }
  res.status(200).json(syncFailed ? { ok: false, note: 'hiscores fetch failed' } : { ok: true });
}
