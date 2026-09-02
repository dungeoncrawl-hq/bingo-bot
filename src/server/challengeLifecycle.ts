// Closes out challenges whose end_date has passed. Without this, nothing
// ever transitions a challenge's status to 'ended' -- EditChallengePage.tsx's
// togglePublish only ever flips draft/active -- so api/dink/[secret].ts's
// existing `if (challenge.status === 'ended') return early` guard is dead
// code, and Dink keeps sending (and this app keeps fully processing)
// events for a challenge nobody's tracking anymore. Run daily from
// api/sync-snapshots.ts's existing cron -- a challenge closing up to ~24h
// late is fine for this, no need for a dedicated cron slot.
import { updateRows } from './supabaseAdmin.js';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function closeEndedChallenges(): Promise<{ closed: number }> {
  const closed = await updateRows('challenges', `status=eq.active&end_date=lt.${todayUtc()}`, { status: 'ended' });
  return { closed };
}
