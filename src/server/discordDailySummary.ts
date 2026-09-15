// A daily pulse per active dungeon -- last-24h tile-completion count,
// top-3 standings, and days remaining -- run once a day from
// api/sync-snapshots.ts's existing cron, right after closeEndedChallenges
// (so a dungeon that just closed today gets its ended-embed instead of
// also getting a same-day summary -- see that function's own comment).
import { selectRows } from './supabaseAdmin.js';
import { relayToDiscord } from './discordRelay.js';
import { buildDailySummaryEmbed, resolveLeaderboardParticipants, type ParticipantLite } from './discordEmbeds.js';
import { computeLeaderboard } from '../lib/leaderboard.js';
import { daysBetween } from '../lib/dungeonStatus.js';
import type { Team, Tile } from '../db/types.js';

interface SummaryChallenge {
  id: string;
  name: string;
  slug: string;
  board_type: string;
  game_mode: 'solo' | 'coop' | 'team';
  end_date: string;
  discord_webhook_url: string;
}

interface CompletionRow {
  participant_id: string;
  ref: string;
  completed_at: string;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// Best-effort per challenge, same reasoning as
// challengeLifecycle.ts's announceDungeonEnded -- a fetch/relay failure
// for one dungeon's summary is caught and logged here, never thrown, so
// it can't stop the rest of the day's batch.
async function sendOneDailySummary(challenge: SummaryChallenge, today: string): Promise<boolean> {
  try {
    const [allParticipants, tiles, completions, allTeams] = await Promise.all([
      selectRows<ParticipantLite & { team_id: string | null }>(
        'challenge_participants',
        `challenge_id=eq.${encodeURIComponent(challenge.id)}&select=id,rsn,team_id`,
      ),
      selectRows<Tile>('tiles', `challenge_id=eq.${encodeURIComponent(challenge.id)}&select=*`),
      selectRows<CompletionRow>(
        'tile_completions',
        `challenge_id=eq.${encodeURIComponent(challenge.id)}&kind=eq.tile&select=participant_id,ref,completed_at`,
      ),
      challenge.game_mode === 'team'
        ? selectRows<Team>('teams', `challenge_id=eq.${encodeURIComponent(challenge.id)}&select=*`)
        : Promise.resolve([] as Team[]),
    ]);
    const teamNameById = new Map(allTeams.map((t) => [t.id, t.name]));
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const tilesCompletedToday = completions.filter((c) => c.completed_at >= cutoff).length;
    // computeLeaderboard needs a `kind` field per completion -- every row
    // here is already kind='tile' (filtered in the query above), so it's
    // safe to stamp it back on rather than select a column we'd discard.
    const completionsForLeaderboard = completions.map((c) => ({ ...c, kind: 'tile' }));
    const { leaderboardParticipantIds, embedParticipants } = resolveLeaderboardParticipants(
      challenge.game_mode,
      allParticipants,
      teamNameById,
    );
    // No first-completer bonuses in a daily standings snapshot -- nobody's
    // "first" here, just where points currently stand.
    const leaderboard = computeLeaderboard(tiles, completionsForLeaderboard, leaderboardParticipantIds, {});
    const embed = buildDailySummaryEmbed({
      challenge: { name: challenge.name, slug: challenge.slug, board_type: challenge.board_type },
      tilesCompletedToday,
      leaderboard,
      participants: embedParticipants,
      daysRemaining: Math.max(0, daysBetween(today, challenge.end_date)),
    });
    await relayToDiscord(challenge.discord_webhook_url, embed);
    return true;
  } catch (err) {
    console.error(`Daily summary failed for challenge ${challenge.id}:`, err);
    return false;
  }
}

export async function sendDailySummaries(): Promise<{ sent: number }> {
  const today = todayUtc();
  let challenges: SummaryChallenge[];
  try {
    // status='active' alone doesn't distinguish "actually running" from
    // "published but its start_date hasn't arrived yet" (the DB has no
    // separate 'upcoming' status -- see dungeonStatus.ts's own comment on
    // that) -- the explicit start_date<=today guard excludes the latter.
    challenges = await selectRows<SummaryChallenge>(
      'challenges',
      `status=eq.active&start_date=lte.${today}&discord_daily_summary_enabled=eq.true&discord_webhook_url=not.is.null` +
        '&select=id,name,slug,board_type,game_mode,end_date,discord_webhook_url',
    );
  } catch (err) {
    // Specifically covers the gap between this shipping and the
    // schema.sql migration adding discord_daily_summary_enabled actually
    // being run (no direct DDL access -- the user runs it by hand) --
    // that column missing would otherwise 400 this whole select and take
    // down api/sync-snapshots.ts's entire cron run (hiscores sync,
    // closeEndedChallenges) along with it, not just this one feature.
    console.error('sendDailySummaries: challenge query failed (has the schema.sql migration been run?):', err);
    return { sent: 0 };
  }
  const results = await Promise.all(challenges.map((c) => sendOneDailySummary(c, today)));
  return { sent: results.filter(Boolean).length };
}
