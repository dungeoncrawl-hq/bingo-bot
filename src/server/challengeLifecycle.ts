// Closes out challenges whose end_date has passed. Without this, nothing
// ever transitions a challenge's status to 'ended' -- EditChallengePage.tsx's
// togglePublish only ever flips draft/active -- so api/dink/[secret].ts's
// existing `if (challenge.status === 'ended') return early` guard is dead
// code, and Dink keeps sending (and this app keeps fully processing)
// events for a challenge nobody's tracking anymore. Run daily from
// api/sync-snapshots.ts's existing cron -- a challenge closing up to ~24h
// late is fine for this, no need for a dedicated cron slot.
import { selectRows, updateRows } from './supabaseAdmin.js';
import { relayToDiscord } from './discordRelay.js';
import { buildDungeonEndedEmbed, resolveLeaderboardParticipants, type ParticipantLite } from './discordEmbeds.js';
import { computeLeaderboard } from '../lib/leaderboard.js';
import { computeAdventureFirstCompleters, computeFirstCompleters } from '../lib/firstCompletions.js';
import type { AdventureLayout, Team, Tile } from '../db/types.js';

interface ClosedChallenge {
  id: string;
  name: string;
  slug: string;
  board_type: string;
  game_mode: 'solo' | 'coop' | 'team';
  discord_webhook_url: string | null;
}

interface CompletionRow {
  participant_id: string;
  kind: string;
  ref: string;
  completed_at: string;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// Builds and posts the "dungeon has ended" embed for one just-closed
// challenge -- same data shape challengeProgress.ts's own Phase 2 fetch
// uses (participants/tiles/completions/teams), since it needs the exact
// same inputs to compute a final leaderboard. Best-effort like
// relayToDiscord itself -- a bad fetch or relay failure for one challenge
// is caught and logged here rather than thrown, so it can never stop
// closeEndedChallenges from finishing the rest of the batch.
async function announceDungeonEnded(challenge: ClosedChallenge): Promise<void> {
  try {
    const [allParticipants, tiles, completions, allTeams] = await Promise.all([
      selectRows<ParticipantLite & { team_id: string | null }>(
        'challenge_participants',
        `challenge_id=eq.${encodeURIComponent(challenge.id)}&select=id,rsn,team_id`,
      ),
      selectRows<Tile>('tiles', `challenge_id=eq.${encodeURIComponent(challenge.id)}&select=*`),
      selectRows<CompletionRow>(
        'tile_completions',
        `challenge_id=eq.${encodeURIComponent(challenge.id)}&kind=eq.tile&select=participant_id,kind,ref,completed_at`,
      ),
      challenge.game_mode === 'team'
        ? selectRows<Team>('teams', `challenge_id=eq.${encodeURIComponent(challenge.id)}&select=*`)
        : Promise.resolve([] as Team[]),
    ]);
    const teamNameById = new Map(allTeams.map((t) => [t.id, t.name]));
    const firstCompleters =
      challenge.board_type === 'adventure'
        ? computeAdventureFirstCompleters(completions, tiles.map((t) => ({ id: t.id, layout: t.layout as AdventureLayout })))
        : computeFirstCompleters(completions);
    const { leaderboardParticipantIds, embedParticipants } = resolveLeaderboardParticipants(
      challenge.game_mode,
      allParticipants,
      teamNameById,
    );
    const leaderboard = computeLeaderboard(tiles, completions, leaderboardParticipantIds, firstCompleters);
    const embed = buildDungeonEndedEmbed({
      challenge: { name: challenge.name, slug: challenge.slug, board_type: challenge.board_type },
      leaderboard,
      participants: embedParticipants,
    });
    await relayToDiscord(challenge.discord_webhook_url, embed);
  } catch (err) {
    console.error(`Dungeon-ended announcement failed for challenge ${challenge.id}:`, err);
  }
}

export async function closeEndedChallenges(): Promise<{ closed: number }> {
  const closedChallenges = await updateRows<ClosedChallenge>('challenges', `status=eq.active&end_date=lt.${todayUtc()}`, {
    status: 'ended',
  });
  await Promise.all(closedChallenges.filter((c) => c.discord_webhook_url).map((c) => announceDungeonEnded(c)));
  return { closed: closedChallenges.length };
}
