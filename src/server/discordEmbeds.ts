// Builds the rich embeds challengeProgress.ts posts to Discord on a tile/
// line/board completion -- kept separate from that file so it stays
// focused on completion *detection*, not presentation.
import type { LeaderboardEntry } from '../lib/leaderboard.js';
import type { Tile } from '../db/types.js';
import type { DiscordEmbed } from './discordRelay.js';

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

// The cache-busting query param exists so Discord doesn't reuse a stale
// cached fetch of the same participant's image URL across multiple,
// different-state notifications.
export function boardImageUrl(participantId: string): string {
  return `${SITE_ORIGIN}/api/board-image/${participantId}?t=${Date.now()}`;
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
  tile: Tile;
  isFirst: boolean;
  leaderboard: LeaderboardEntry[];
  participants: ParticipantLite[];
}): DiscordEmbed {
  const { participant, tile, isFirst, leaderboard, participants } = params;
  return {
    title: isFirst
      ? `⭐ ${participant.rsn} was first to complete ${tile.label}!`
      : `🎉 ${participant.rsn} completed ${tile.label}!`,
    color: isFirst ? FIRST_COLOR : TILE_COLOR,
    thumbnail: tile.icon ? { url: tile.icon } : undefined,
    image: { url: boardImageUrl(participant.id) },
    fields: [
      { name: 'Points', value: `+${tile.points}`, inline: true },
      { name: 'Leaderboard', value: formatLeaderboardField(leaderboard, participants) || 'No one has scored yet.' },
    ],
  };
}

export function buildLineCompletionEmbed(params: { participant: ParticipantLite }): DiscordEmbed {
  const { participant } = params;
  return {
    title: `🎉 ${participant.rsn} completed a line!`,
    color: LINE_COLOR,
    image: { url: boardImageUrl(participant.id) },
  };
}

export function buildBoardCompletionEmbed(params: { participant: ParticipantLite }): DiscordEmbed {
  const { participant } = params;
  return {
    title: `🏆 ${participant.rsn} completed the whole board!`,
    description: 'Every tile conquered.',
    color: BOARD_COLOR,
    image: { url: boardImageUrl(participant.id) },
  };
}
