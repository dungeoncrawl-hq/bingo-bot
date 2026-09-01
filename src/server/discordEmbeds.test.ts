import { describe, expect, it } from 'vitest';
import {
  formatLeaderboardField,
  buildTileCompletionEmbed,
  buildLineCompletionEmbed,
  buildBoardCompletionEmbed,
  type ParticipantLite,
  type ChallengeLite,
} from './discordEmbeds';
import type { LeaderboardEntry } from '../lib/leaderboard';
import type { Tile } from '../db/types';

const PARTICIPANTS: ParticipantLite[] = [
  { id: 'a', rsn: '26 Limont' },
  { id: 'b', rsn: 'otototo' },
  { id: 'c', rsn: 'Claude Test' },
];

const CHALLENGE: ChallengeLite = { name: 'Bingo Time!', slug: 'bingo-time' };

function entry(participantId: string, points: number): LeaderboardEntry {
  return { participantId, points, tilesCompleted: 0 };
}

function tile(overrides: Partial<Tile> = {}): Tile {
  return {
    id: 't1',
    challenge_id: 'c1',
    label: 'Big Drop',
    icon: 'https://oldschool.runescape.wiki/images/Coins_10000.png',
    layout: { row: 0, col: 0 },
    condition: { type: 'singleDropValue', threshold: 1_000_000 },
    points: 1,
    created_at: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

describe('formatLeaderboardField', () => {
  it('formats the top 3 with medals and the rest with rank numbers', () => {
    const entries = [entry('a', 42), entry('b', 12), entry('c', 8)];
    const result = formatLeaderboardField(entries, PARTICIPANTS);
    expect(result).toBe('🥇 26 Limont — 42 pts\n🥈 otototo — 12 pts\n🥉 Claude Test — 8 pts');
  });

  it('falls back to a rank number past third place', () => {
    const fourth: ParticipantLite = { id: 'd', rsn: 'Fourth' };
    const entries = [entry('a', 4), entry('b', 3), entry('c', 2), entry('d', 1)];
    const result = formatLeaderboardField(entries, [...PARTICIPANTS, fourth]);
    expect(result.split('\n')[3]).toBe('#4 Fourth — 1 pts');
  });

  it('labels an unknown participant id rather than throwing', () => {
    const result = formatLeaderboardField([entry('missing', 5)], PARTICIPANTS);
    expect(result).toBe('🥇 Unknown — 5 pts');
  });

  it('returns an empty string for no entries', () => {
    expect(formatLeaderboardField([], PARTICIPANTS)).toBe('');
  });
});

describe('buildTileCompletionEmbed', () => {
  it('spells out the exact condition in the description, so same-label tiles stay unambiguous', () => {
    const embed = buildTileCompletionEmbed({
      participant: PARTICIPANTS[0],
      tile: tile({ condition: { type: 'singleDropValue', threshold: 1_000_000 } }),
      isFirst: false,
      leaderboard: [],
      participants: PARTICIPANTS,
      challenge: CHALLENGE,
    });
    expect(embed.description).toBe('a single drop worth 1,000,000+ GP');
  });

  it('ends with a field linking the board name back to the site', () => {
    const embed = buildTileCompletionEmbed({
      participant: PARTICIPANTS[0],
      tile: tile(),
      isFirst: false,
      leaderboard: [],
      participants: PARTICIPANTS,
      challenge: CHALLENGE,
    });
    const lastField = embed.fields?.at(-1);
    expect(lastField?.value).toBe('[Bingo Time!](https://dungeoncrawl.lol/c/bingo-time)');
  });
});

describe('buildLineCompletionEmbed / buildBoardCompletionEmbed', () => {
  it('both include the board link field', () => {
    const line = buildLineCompletionEmbed({ participant: PARTICIPANTS[0], challenge: CHALLENGE });
    const board = buildBoardCompletionEmbed({ participant: PARTICIPANTS[0], challenge: CHALLENGE });
    expect(line.fields?.[0].value).toBe('[Bingo Time!](https://dungeoncrawl.lol/c/bingo-time)');
    expect(board.fields?.[0].value).toBe('[Bingo Time!](https://dungeoncrawl.lol/c/bingo-time)');
  });
});
