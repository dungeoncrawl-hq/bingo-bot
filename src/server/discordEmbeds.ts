// Builds the rich embeds challengeProgress.ts posts to Discord on a tile/
// line/board completion -- kept separate from that file so it stays
// focused on completion *detection*, not presentation.
import { tileTaskPhrase } from '../lib/tileConditions.js';
import { ADVENTURE_SMALL_FINAL_BOSS_COLUMN } from '../lib/adventureProgress.js';
import { tileCompletionFlavor, boardCompletionFlavor, type BanterPools } from './discordBanter.js';
import { tileCompletionTitle, lineCompletionTitle, boardCompletionTitle, type TitleTemplates } from './discordTitles.js';
import type { LeaderboardEntry } from '../lib/leaderboard.js';
import type { AdventureLayout, Tile } from '../db/types.js';
import type { DiscordEmbed, DiscordEmbedField } from './discordRelay.js';

// Single production domain -- this app has no staging/preview Discord
// relay concerns (webhook URLs are configured per-challenge, all pointing
// at the live site).
const SITE_ORIGIN = 'https://dungeoncrawl.lol';

const TILE_COLOR = 0x22c55e; // green-500
const FIRST_COLOR = 0xfbbf24; // amber-400, matches the board's star badge
const LINE_COLOR = 0xf59e0b; // amber-500
const BOARD_COLOR = 0xffd700; // a richer gold for the biggest moment
const ENDED_COLOR = 0x8b5cf6; // violet-500 -- distinct from every completion color above
const SUMMARY_COLOR = 0x38bdf8; // sky-400 -- a calmer, informational tone vs. the celebratory colors

export interface ParticipantLite {
  id: string;
  rsn: string;
}

export interface ChallengeLite {
  name: string;
  slug: string;
  // Optional so pre-existing callers/fixtures keep compiling -- absent
  // behaves like 'grid5x5' (attach the board image), only an explicit
  // 'adventure' omits it. See buildTileCompletionEmbed's own comment.
  board_type?: string;
}

// The cache-busting query param exists so Discord doesn't reuse a stale
// cached fetch of the same participant's image URL across multiple,
// different-state notifications.
export function boardImageUrl(participantId: string): string {
  return `${SITE_ORIGIN}/api/board-image/${participantId}?t=${Date.now()}`;
}

// A trailing field on every completion embed linking back to the board --
// the empty-ish name (a zero-width space, since Discord requires a
// non-empty field name) keeps it reading as a plain link rather than a
// labeled field.
function boardLinkField(challenge: ChallengeLite): DiscordEmbedField {
  return { name: '​', value: `[${challenge.name}](${SITE_ORIGIN}/c/${challenge.slug})` };
}

// Same "#1 🥇 rsn — N pts" convention as BoardPage.tsx's own leaderboard
// render, for visual consistency between the site and Discord.
export function formatLeaderboardField(entries: LeaderboardEntry[], participants: ParticipantLite[]): string {
  return entries
    .map((entry, i) => {
      const rsn = participants.find((p) => p.id === entry.participantId)?.rsn ?? 'Unknown';
      const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
      return `${rank} ${rsn} — ${entry.points} pts`;
    })
    .join('\n');
}

export function buildTileCompletionEmbed(params: {
  participant: ParticipantLite;
  // Display text for "who completed this" in the title -- defaults to
  // participant.rsn (solo mode, today's behavior unchanged). Pass 'The
  // group' (Coop) or `Team ${name}` (Team) to override (BACKLOG.md #10).
  subject?: string;
  tile: Tile;
  isFirst: boolean;
  // Who/what actually was first, regardless of isFirst -- lets the "not
  // first" flavor text call them out by name ("not as fast as {rsn},
  // though"). Already just display text, so a team name works here too.
  // Ignored when noFirstConcept is set.
  firstCompleterRsn: string;
  // Coop only: there's no "first" when credit lands on everyone at once
  // from one pooled event (isFirst is always false for Coop, but the
  // ordinary "not as fast as X" flavor text for a non-first completion
  // doesn't make sense either when there's no one to have been faster
  // than) -- drops the first/not-first flavor line entirely instead.
  noFirstConcept?: boolean;
  leaderboard: LeaderboardEntry[];
  participants: ParticipantLite[];
  challenge: ChallengeLite;
  // BACKLOG.md #9 -- the admin-editable pools (discordBanterStore.ts's
  // fetchBanterPools()), defaulting to the hardcoded pools when omitted
  // (every existing caller, including this file's own test suite).
  pools?: BanterPools;
  // BACKLOG.md #9 -- same shape, for the admin-editable title text
  // (discordTitleStore.ts's fetchTitleTemplates()).
  titles?: TitleTemplates;
}): DiscordEmbed {
  const { participant, tile, isFirst, firstCompleterRsn, noFirstConcept, leaderboard, participants, challenge, pools, titles } = params;
  const subject = params.subject ?? participant.rsn;
  // Two tiles can share the same label (e.g. two "Big Drop" tiles with
  // different thresholds) -- spelling out the exact requirement in the
  // title itself keeps the post unambiguous on its own.
  const phrase = tileTaskPhrase(tile.condition);
  // Defensive `?? 0`: this field is required in the Tile type, but a
  // deployment can land before the DB migration adding the column runs --
  // fall back to no bonus rather than posting "NaN pts" in that gap.
  const totalPoints = tile.points + (isFirst ? (tile.first_completer_bonus ?? 0) : 0);

  // Adventure boss tiles (BACKLOG.md #7) are mechanically just a tile with
  // bigger stakes -- same embed, boss-flavored title text instead of a
  // new builder. The final boss gets a bit more flourish than a mid-boss;
  // the actual "dungeon cleared" banner is a separate
  // buildBoardCompletionEmbed sent right after, unchanged by this.
  const isBoss = 'lane' in tile.layout && tile.layout.lane === 'center';
  const isFinalBoss = isBoss && (tile.layout as AdventureLayout).column === ADVENTURE_SMALL_FINAL_BOSS_COLUMN;
  // Randomized per completion (BACKLOG.md #8) instead of one fixed line
  // forever -- parameterized by the same two dimensions that already
  // reshape this embed: is-boss and did-they-actually-win-the-race.
  const flavor = noFirstConcept
    ? undefined
    : tileCompletionFlavor({ isFirst, isBoss, points: totalPoints, firstCompleterRsn }, pools);
  const bossLabel = isFinalBoss ? 'the FINAL BOSS' : 'a boss';
  const title = tileCompletionTitle({ isFirst, isBoss, subject, phrase, bossLabel }, titles);

  return {
    title,
    description: flavor,
    color: isFirst ? FIRST_COLOR : TILE_COLOR,
    thumbnail: tile.icon ? { url: tile.icon } : undefined,
    // Adventure has no equivalent board-state PNG renderer yet (see
    // src/lib/boardImage.ts -- hardcoded to the 5x5 grid) -- omit rather
    // than attach a garbled/wrong image.
    image: challenge.board_type === 'adventure' ? undefined : { url: boardImageUrl(participant.id) },
    fields: [
      { name: 'Points', value: `+${totalPoints}`, inline: true },
      { name: 'Leaderboard', value: formatLeaderboardField(leaderboard, participants) || 'No one has scored yet.' },
      boardLinkField(challenge),
    ],
  };
}

export function buildLineCompletionEmbed(params: {
  participant: ParticipantLite;
  subject?: string;
  challenge: ChallengeLite;
  titles?: TitleTemplates;
}): DiscordEmbed {
  const { participant, challenge, titles } = params;
  const subject = params.subject ?? participant.rsn;
  return {
    title: lineCompletionTitle(subject, titles),
    color: LINE_COLOR,
    image: { url: boardImageUrl(participant.id) },
    fields: [boardLinkField(challenge)],
  };
}

export function buildBoardCompletionEmbed(params: {
  participant: ParticipantLite;
  subject?: string;
  challenge: ChallengeLite;
  pools?: BanterPools;
  titles?: TitleTemplates;
}): DiscordEmbed {
  const { participant, challenge, pools, titles } = params;
  const subject = params.subject ?? participant.rsn;
  return {
    title: boardCompletionTitle(subject, titles),
    description: boardCompletionFlavor(pools),
    color: BOARD_COLOR,
    image: challenge.board_type === 'adventure' ? undefined : { url: boardImageUrl(participant.id) },
    fields: [boardLinkField(challenge)],
  };
}

// Who counts as a leaderboard entry, and what do we call them -- shared by
// every challenge-wide embed (a single participant's own tile/line/board
// completion has its own "who triggered this" concept and stays inline in
// challengeProgress.ts, which only calls this for its own team-mode case).
// Solo/Coop: every participant stands for themselves, untouched. Team:
// collapses to one representative per team (lexicographically smallest id,
// matching computeLeaderboard's own tie-break), relabeled to `Team ${name}`
// so formatLeaderboardField/computeLeaderboard need no changes at all.
export function resolveLeaderboardParticipants(
  gameMode: 'solo' | 'coop' | 'team',
  allParticipants: (ParticipantLite & { team_id: string | null })[],
  teamNameById: Map<string, string>,
): { leaderboardParticipantIds: string[]; embedParticipants: ParticipantLite[] } {
  if (gameMode !== 'team') {
    return { leaderboardParticipantIds: allParticipants.map((p) => p.id), embedParticipants: allParticipants };
  }
  const representativeByTeam = new Map<string, string>();
  for (const p of allParticipants) {
    if (!p.team_id) continue;
    const current = representativeByTeam.get(p.team_id);
    if (!current || p.id < current) representativeByTeam.set(p.team_id, p.id);
  }
  const leaderboardParticipantIds = [...representativeByTeam.values()];
  const embedParticipants = leaderboardParticipantIds.map((id) => {
    const rep = allParticipants.find((p) => p.id === id)!;
    return { id: rep.id, rsn: `Team ${teamNameById.get(rep.team_id!) ?? 'Unknown Team'}` };
  });
  return { leaderboardParticipantIds, embedParticipants };
}

// The dungeon's own lifecycle event -- posted once, the day its end_date
// passes (challengeLifecycle.ts's closeEndedChallenges), not tied to any
// one participant's board state, so no image/thumbnail like the
// completion embeds above.
export function buildDungeonEndedEmbed(params: {
  challenge: ChallengeLite;
  leaderboard: LeaderboardEntry[];
  participants: ParticipantLite[];
}): DiscordEmbed {
  const { challenge, leaderboard, participants } = params;
  return {
    title: `🏁 ${challenge.name} has ended!`,
    description: 'Final standings:',
    color: ENDED_COLOR,
    fields: [
      { name: 'Final Leaderboard', value: formatLeaderboardField(leaderboard, participants) || 'No one scored any points.' },
      boardLinkField(challenge),
    ],
  };
}

// A recurring pulse for a long-running dungeon, independent of any single
// completion -- sent once a day (src/server/discordDailySummary.ts) for
// every active, not-yet-ended dungeon that hasn't opted out
// (discord_daily_summary_enabled). Posts every day regardless of activity
// level by design (confirmed with the host) -- a quiet day still reads as
// "0 tiles, N days left" rather than being silently skipped.
export function buildDailySummaryEmbed(params: {
  challenge: ChallengeLite;
  tilesCompletedToday: number;
  leaderboard: LeaderboardEntry[];
  participants: ParticipantLite[];
  daysRemaining: number;
}): DiscordEmbed {
  const { challenge, tilesCompletedToday, leaderboard, participants, daysRemaining } = params;
  const tilePlural = tilesCompletedToday === 1 ? '' : 's';
  const dayPlural = daysRemaining === 1 ? '' : 's';
  return {
    title: `📅 Daily update — ${challenge.name}`,
    description: `${tilesCompletedToday} tile${tilePlural} completed in the last 24 hours. ${daysRemaining} day${dayPlural} remaining.`,
    color: SUMMARY_COLOR,
    fields: [
      { name: 'Leaderboard', value: formatLeaderboardField(leaderboard.slice(0, 3), participants) || 'No one has scored yet.' },
      boardLinkField(challenge),
    ],
  };
}
