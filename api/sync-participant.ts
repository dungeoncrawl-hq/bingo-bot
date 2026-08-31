import type { VercelRequest, VercelResponse } from '@vercel/node';
import { selectRows } from '../src/server/supabaseAdmin';
import { syncOneParticipant } from '../src/server/participantSync';
import { checkChallengeProgress } from '../src/server/challengeProgress';

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
  try {
    await syncOneParticipant(participant.challenge_id, participant.id, participant.rsn);
    await checkChallengeProgress(participant.id).catch(() => {});
    res.status(200).json({ ok: true });
  } catch {
    res.status(200).json({ ok: false, note: 'hiscores fetch failed' });
  }
}
