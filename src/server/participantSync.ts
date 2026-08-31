// Hiscores sync triggers -- multi-tenant equivalent of rs's
// accountSync.ts. Two paths: syncOneParticipant is called in real time
// from dinkWebhook.ts's LOGOUT handler; syncAllParticipants is the daily
// cron safety net for participants who never trigger a LOGOUT event
// (client crash, RuneLite never relaunched, etc.).
import { fetchHiscores } from './hiscores.js';
import { selectRows, upsertRow } from './supabaseAdmin.js';
import { checkChallengeProgress } from './challengeProgress.js';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function syncOneParticipant(challengeId: string, participantId: string, rsn: string): Promise<void> {
  const data = await fetchHiscores(rsn);
  const totalXp = Object.values(data.skills).reduce((sum, s) => sum + s.xp, 0);
  const totalLevel = Object.values(data.skills).reduce((sum, s) => sum + s.level, 0);

  await upsertRow(
    'participant_snapshots',
    {
      challenge_id: challengeId,
      participant_id: participantId,
      recorded_on: todayUtc(),
      total_level: totalLevel,
      total_xp: totalXp,
      skills: data.skills,
      activities: data.activities,
    },
    'participant_id,recorded_on',
    'merge-duplicates',
  );
}

interface ParticipantForSync {
  id: string;
  challenge_id: string;
  rsn: string;
  challenges: { status: string } | null;
}

export async function syncAllParticipants(): Promise<{ synced: number; failed: number }> {
  const rows = await selectRows<ParticipantForSync>(
    'challenge_participants',
    'select=id,challenge_id,rsn,challenges(status)',
  );
  const active = rows.filter((r) => r.challenges?.status !== 'ended');

  let synced = 0;
  let failed = 0;
  for (const participant of active) {
    try {
      await syncOneParticipant(participant.challenge_id, participant.id, participant.rsn);
      synced++;
    } catch (err) {
      failed++;
      console.error(`Hiscores sync failed for participant ${participant.id} (${participant.rsn}):`, err);
      continue;
    }
    try {
      await checkChallengeProgress(participant.id);
    } catch (err) {
      console.error(`Progress check failed for participant ${participant.id}:`, err);
    }
  }

  return { synced, failed };
}
