// Builds the rich embeds challengeProgress.ts posts to Discord on a tile/
// line/board completion -- kept separate from that file so it stays
// focused on completion *detection*, not presentation.
import { tileTaskPhrase, tileTaskDetail } from '../lib/tileConditions.js';
import { ADVENTURE_SMALL_FINAL_BOSS_COLUMN } from '../lib/adventureProgress.js';
import { tileCompletionFlavor, boardCompletionFlavor } from './discordBanter.js';
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
}): DiscordEmbed {
  const { participant, tile, isFirst, firstCompleterRsn, noFirstConcept, leaderboard, participants, challenge } = params;
  const subject = params.subject ?? participant.rsn;
  // Two tiles can share the same label (e.g. two "Big Drop" tiles with
  // different thresholds) -- spelling out the exact requirement in the
  // title itself keeps the post unambiguous on its own.
  const phrase = tileTaskPhrase(tile.condition);
  // Defensive `?? 0`: this field is required in the Tile type, but a
  // deployment can land before the DB migration adding the column runs --
  // fall back to no bonus rather than posting "NaN pts" in that gap.
  const totalPoints = tile.points + (isFirst ? (tile.first_completer_bonus ?? 0) : 0);
  // Extra context that didn't fit in the headline phrase (e.g. an
  // itemSetCollected tile's "N items, each counts once") gets its own
  // line ahead of the flavor text, rather than bloating the title.
  const detail = tileTaskDetail(tile.condition);

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
    : tileCompletionFlavor({ isFirst, isBoss, points: totalPoints, firstCompleterRsn });
  const bossLabel = isFinalBoss ? 'the FINAL BOSS' : 'a boss';
  const title = isBoss
    ? isFirst
      ? `${subject} was first to defeat ${bossLabel} -- the ${phrase} boss!`
      : `${subject} defeated ${bossLabel} -- the ${phrase} boss.`
    : isFirst
      ? `${subject} was first to complete the ${phrase} task!`
      : `${subject} completed the ${phrase} task.`;

  return {
    title,
    description: detail && flavor ? `${detail}\n${flavor}` : (detail ?? flavor),
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

export function buildLineCompletionEmbed(params: { participant: ParticipantLite; subject?: string; challenge: ChallengeLite }): DiscordEmbed {
  const { participant, challenge } = params;
  const subject = params.subject ?? participant.rsn;
  return {
    title: `${subject} completed a line!`,
    color: LINE_COLOR,
    image: { url: boardImageUrl(participant.id) },
    fields: [boardLinkField(challenge)],
  };
}

export function buildBoardCompletionEmbed(params: { participant: ParticipantLite; subject?: string; challenge: ChallengeLite }): DiscordEmbed {
  const { participant, challenge } = params;
  const subject = params.subject ?? participant.rsn;
  return {
    title: `${subject} completed the whole board!`,
    description: boardCompletionFlavor(),
    color: BOARD_COLOR,
    image: challenge.board_type === 'adventure' ? undefined : { url: boardImageUrl(participant.id) },
    fields: [boardLinkField(challenge)],
  };
}
