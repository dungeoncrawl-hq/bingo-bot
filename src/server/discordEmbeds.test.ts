import { describe, expect, it } from 'vitest';
import {
  formatLeaderboardField,
  buildTileCompletionEmbed,
  buildLineCompletionEmbed,
  buildBoardCompletionEmbed,
  buildDungeonEndedEmbed,
  buildDailySummaryEmbed,
  resolveLeaderboardParticipants,
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
    first_completer_bonus: 0,
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
  it('spells out the exact condition in the title, so same-label tiles stay unambiguous', () => {
    const embed = buildTileCompletionEmbed({
      participant: PARTICIPANTS[0],
      tile: tile({ condition: { type: 'singleDropValue', threshold: 1_000_000 } }),
      isFirst: false,
      firstCompleterRsn: 'otototo',
      leaderboard: [],
      participants: PARTICIPANTS,
      challenge: CHALLENGE,
    });
    expect(embed.title).toBe('26 Limont completed the single drop worth 1M+ GP task.');
    // Flavor text is randomized (BACKLOG.md #8) -- assert the
    // information it must bake in, not one fixed sentence.
    expect(embed.description).toContain('otototo');
  });

  it('uses the "first to complete" title/description when isFirst', () => {
    const embed = buildTileCompletionEmbed({
      participant: PARTICIPANTS[0],
      tile: tile({ points: 3, condition: { type: 'xpGained', threshold: 500_000 } }),
      isFirst: true,
      firstCompleterRsn: '26 Limont',
      leaderboard: [],
      participants: PARTICIPANTS,
      challenge: CHALLENGE,
    });
    expect(embed.title).toBe('26 Limont was first to complete the 500,000 total XP task!');
    // The embed's own "Points" field already carries the total -- flavor
    // text doesn't repeat it (BACKLOG.md, discordBanter.ts default pools).
    expect(embed.description).not.toContain('pts');
  });

  it('adds the first-completer bonus to the Points field when isFirst', () => {
    const embed = buildTileCompletionEmbed({
      participant: PARTICIPANTS[0],
      tile: tile({ points: 3, first_completer_bonus: 5, condition: { type: 'xpGained', threshold: 500_000 } }),
      isFirst: true,
      firstCompleterRsn: '26 Limont',
      leaderboard: [],
      participants: PARTICIPANTS,
      challenge: CHALLENGE,
    });
    expect(embed.fields?.find((f) => f.name === 'Points')?.value).toBe('+8');
  });

  it('does not apply the first-completer bonus to a non-first completion', () => {
    const embed = buildTileCompletionEmbed({
      participant: PARTICIPANTS[0],
      tile: tile({ points: 3, first_completer_bonus: 5, condition: { type: 'xpGained', threshold: 500_000 } }),
      isFirst: false,
      firstCompleterRsn: 'otototo',
      leaderboard: [],
      participants: PARTICIPANTS,
      challenge: CHALLENGE,
    });
    expect(embed.fields?.find((f) => f.name === 'Points')?.value).toBe('+3');
  });

  it('ends with a field linking the board name back to the site', () => {
    const embed = buildTileCompletionEmbed({
      participant: PARTICIPANTS[0],
      tile: tile(),
      isFirst: false,
      firstCompleterRsn: 'otototo',
      leaderboard: [],
      participants: PARTICIPANTS,
      challenge: CHALLENGE,
    });
    const lastField = embed.fields?.at(-1);
    expect(lastField?.value).toBe('[Bingo Time!](https://dungeoncrawl.lol/c/bingo-time)');
  });
});

describe('buildTileCompletionEmbed -- game-mode subject swap (BACKLOG.md #10)', () => {
  it('defaults the subject to participant.rsn when omitted, unchanged from before subject existed', () => {
    const embed = buildTileCompletionEmbed({
      participant: PARTICIPANTS[0],
      tile: tile({ condition: { type: 'xpGained', threshold: 500_000 } }),
      isFirst: false,
      firstCompleterRsn: 'otototo',
      leaderboard: [],
      participants: PARTICIPANTS,
      challenge: CHALLENGE,
    });
    expect(embed.title).toBe('26 Limont completed the 500,000 total XP task.');
  });

  it('uses "The group" for Coop instead of a participant name', () => {
    const embed = buildTileCompletionEmbed({
      participant: PARTICIPANTS[0],
      subject: 'The group',
      tile: tile({ condition: { type: 'xpGained', threshold: 500_000 } }),
      isFirst: false,
      firstCompleterRsn: 'otototo',
      leaderboard: [],
      participants: PARTICIPANTS,
      challenge: CHALLENGE,
    });
    expect(embed.title).toBe('The group completed the 500,000 total XP task.');
  });

  it('drops the first/not-first flavor line entirely for Coop (noFirstConcept) instead of a nonsensical "not as fast as" line', () => {
    const embed = buildTileCompletionEmbed({
      participant: PARTICIPANTS[0],
      subject: 'The group',
      tile: tile({ condition: { type: 'xpGained', threshold: 500_000 } }),
      isFirst: false,
      firstCompleterRsn: 'irrelevant',
      noFirstConcept: true,
      leaderboard: [],
      participants: PARTICIPANTS,
      challenge: CHALLENGE,
    });
    expect(embed.title).toBe('The group completed the 500,000 total XP task.');
    expect(embed.description).toBeUndefined();
  });

  it('uses the team name for Team mode, including in the "first" title', () => {
    const embed = buildTileCompletionEmbed({
      participant: PARTICIPANTS[0],
      subject: 'Team Red',
      tile: tile({ condition: { type: 'xpGained', threshold: 500_000 } }),
      isFirst: true,
      firstCompleterRsn: 'Team Red',
      leaderboard: [],
      participants: PARTICIPANTS,
      challenge: CHALLENGE,
    });
    expect(embed.title).toBe('Team Red was first to complete the 500,000 total XP task!');
  });
});

describe('buildTileCompletionEmbed -- banter (BACKLOG.md #8)', () => {
  it('varies the description across repeated identical calls (proves randomization is actually wired through)', () => {
    const build = () =>
      buildTileCompletionEmbed({
        participant: PARTICIPANTS[0],
        tile: tile({ points: 3, condition: { type: 'xpGained', threshold: 500_000 } }),
        isFirst: true,
        firstCompleterRsn: '26 Limont',
        leaderboard: [],
        participants: PARTICIPANTS,
        challenge: CHALLENGE,
      }).description;
    const seen = new Set(Array.from({ length: 40 }, build));
    // Flaky-in-theory (a fair pool could repeat the same line 40/40
    // times) but the pool has 6 first-place tile lines, so the odds of
    // never seeing a second one are astronomically small.
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('buildBoardCompletionEmbed -- banter (BACKLOG.md #8)', () => {
  it('always has a non-empty celebratory description', () => {
    const board = buildBoardCompletionEmbed({ participant: PARTICIPANTS[0], challenge: CHALLENGE });
    expect(board.description).toBeTruthy();
  });
});

describe('buildLineCompletionEmbed / buildBoardCompletionEmbed', () => {
  it('both include the board link field', () => {
    const line = buildLineCompletionEmbed({ participant: PARTICIPANTS[0], challenge: CHALLENGE });
    const board = buildBoardCompletionEmbed({ participant: PARTICIPANTS[0], challenge: CHALLENGE });
    expect(line.fields?.[0].value).toBe('[Bingo Time!](https://dungeoncrawl.lol/c/bingo-time)');
    expect(board.fields?.[0].value).toBe('[Bingo Time!](https://dungeoncrawl.lol/c/bingo-time)');
  });

  it('attaches the board image for a grid5x5 (or unspecified) challenge', () => {
    const board = buildBoardCompletionEmbed({ participant: PARTICIPANTS[0], challenge: CHALLENGE });
    expect(board.image?.url).toContain('/api/board-image/');
  });

  it('omits the board image for an adventure challenge -- no renderer exists for that shape yet', () => {
    const adventureChallenge: ChallengeLite = { ...CHALLENGE, board_type: 'adventure' };
    const board = buildBoardCompletionEmbed({ participant: PARTICIPANTS[0], challenge: adventureChallenge });
    expect(board.image).toBeUndefined();
  });

  it('both default the subject to participant.rsn when omitted', () => {
    const line = buildLineCompletionEmbed({ participant: PARTICIPANTS[0], challenge: CHALLENGE });
    const board = buildBoardCompletionEmbed({ participant: PARTICIPANTS[0], challenge: CHALLENGE });
    expect(line.title).toBe('26 Limont completed a line!');
    expect(board.title).toBe('26 Limont completed the whole board!');
  });

  it('both use an overridden subject for Coop/Team instead of the participant name', () => {
    const line = buildLineCompletionEmbed({ participant: PARTICIPANTS[0], subject: 'The group', challenge: CHALLENGE });
    const board = buildBoardCompletionEmbed({ participant: PARTICIPANTS[0], subject: 'Team Red', challenge: CHALLENGE });
    expect(line.title).toBe('The group completed a line!');
    expect(board.title).toBe('Team Red completed the whole board!');
  });
});

describe('buildTileCompletionEmbed -- adventure boss tiles', () => {
  it('uses boss-flavored title text for a mid-boss tile (lane: center)', () => {
    const embed = buildTileCompletionEmbed({
      participant: PARTICIPANTS[0],
      tile: tile({ layout: { column: 2, lane: 'center' }, condition: { type: 'bossKcGained', threshold: 10 } }),
      isFirst: false,
      firstCompleterRsn: 'otototo',
      leaderboard: [],
      participants: PARTICIPANTS,
      challenge: { ...CHALLENGE, board_type: 'adventure' },
    });
    expect(embed.title).toBe('26 Limont defeated a boss -- the 10 total boss KC boss.');
  });

  it('gives the final boss column (8) extra flourish over a mid-boss', () => {
    const embed = buildTileCompletionEmbed({
      participant: PARTICIPANTS[0],
      tile: tile({ layout: { column: 8, lane: 'center' }, condition: { type: 'bossKcGained', threshold: 10 } }),
      isFirst: true,
      firstCompleterRsn: '26 Limont',
      leaderboard: [],
      participants: PARTICIPANTS,
      challenge: { ...CHALLENGE, board_type: 'adventure' },
    });
    expect(embed.title).toBe('26 Limont was first to defeat the FINAL BOSS -- the 10 total boss KC boss!');
  });

  it('leaves an ordinary (non-center-lane) adventure tile using the regular task title', () => {
    const embed = buildTileCompletionEmbed({
      participant: PARTICIPANTS[0],
      tile: tile({ layout: { column: 0, lane: 'top' }, condition: { type: 'xpGained', threshold: 500_000 } }),
      isFirst: false,
      firstCompleterRsn: 'otototo',
      leaderboard: [],
      participants: PARTICIPANTS,
      challenge: { ...CHALLENGE, board_type: 'adventure' },
    });
    expect(embed.title).toBe('26 Limont completed the 500,000 total XP task.');
  });

  it('omits the board image for an adventure tile completion', () => {
    const embed = buildTileCompletionEmbed({
      participant: PARTICIPANTS[0],
      tile: tile({ layout: { column: 0, lane: 'top' } }),
      isFirst: false,
      firstCompleterRsn: 'otototo',
      leaderboard: [],
      participants: PARTICIPANTS,
      challenge: { ...CHALLENGE, board_type: 'adventure' },
    });
    expect(embed.image).toBeUndefined();
  });
});

describe('resolveLeaderboardParticipants', () => {
  const withTeams = [
    { id: 'a', rsn: '26 Limont', team_id: 'team1' },
    { id: 'b', rsn: 'otototo', team_id: 'team1' },
    { id: 'c', rsn: 'Claude Test', team_id: 'team2' },
  ];
  const teamNameById = new Map([
    ['team1', 'Ironmen'],
    ['team2', 'Mainscapers'],
  ]);

  it('leaves solo participants untouched', () => {
    const result = resolveLeaderboardParticipants('solo', withTeams, teamNameById);
    expect(result.leaderboardParticipantIds).toEqual(['a', 'b', 'c']);
    expect(result.embedParticipants).toEqual(withTeams);
  });

  it('leaves coop participants untouched -- no team collapsing', () => {
    const result = resolveLeaderboardParticipants('coop', withTeams, teamNameById);
    expect(result.leaderboardParticipantIds).toEqual(['a', 'b', 'c']);
  });

  it('collapses team mode to one representative per team, lexicographically smallest id', () => {
    const result = resolveLeaderboardParticipants('team', withTeams, teamNameById);
    expect(result.leaderboardParticipantIds.slice().sort()).toEqual(['a', 'c']);
    expect(result.embedParticipants.find((p) => p.id === 'a')?.rsn).toBe('Team Ironmen');
    expect(result.embedParticipants.find((p) => p.id === 'c')?.rsn).toBe('Team Mainscapers');
  });

  it('excludes an unassigned participant (team_id null) from team mode entirely', () => {
    const withUnassigned = [...withTeams, { id: 'd', rsn: 'Loner', team_id: null }];
    const result = resolveLeaderboardParticipants('team', withUnassigned, teamNameById);
    expect(result.leaderboardParticipantIds).not.toContain('d');
  });

  it('falls back to "Unknown Team" for a team id missing from teamNameById', () => {
    const result = resolveLeaderboardParticipants('team', withTeams, new Map());
    expect(result.embedParticipants.find((p) => p.id === 'a')?.rsn).toBe('Team Unknown Team');
  });
});

describe('buildDungeonEndedEmbed', () => {
  it('titles it with the dungeon name and a wrap-up tone', () => {
    const embed = buildDungeonEndedEmbed({ challenge: CHALLENGE, leaderboard: [], participants: PARTICIPANTS });
    expect(embed.title).toBe('🏁 Bingo Time! has ended!');
  });

  it('includes the final leaderboard field', () => {
    const embed = buildDungeonEndedEmbed({
      challenge: CHALLENGE,
      leaderboard: [entry('a', 10), entry('b', 5)],
      participants: PARTICIPANTS,
    });
    expect(embed.fields?.find((f) => f.name === 'Final Leaderboard')?.value).toBe('🥇 26 Limont — 10 pts\n🥈 otototo — 5 pts');
  });

  it('falls back to a plain message when no one scored', () => {
    const embed = buildDungeonEndedEmbed({ challenge: CHALLENGE, leaderboard: [], participants: PARTICIPANTS });
    expect(embed.fields?.find((f) => f.name === 'Final Leaderboard')?.value).toBe('No one scored any points.');
  });

  it('ends with a field linking back to the board', () => {
    const embed = buildDungeonEndedEmbed({ challenge: CHALLENGE, leaderboard: [], participants: PARTICIPANTS });
    expect(embed.fields?.at(-1)?.value).toBe('[Bingo Time!](https://dungeoncrawl.lol/c/bingo-time)');
  });

  it('has no image/thumbnail -- not tied to any one participant\'s board state', () => {
    const embed = buildDungeonEndedEmbed({ challenge: CHALLENGE, leaderboard: [], participants: PARTICIPANTS });
    expect(embed.image).toBeUndefined();
    expect(embed.thumbnail).toBeUndefined();
  });
});

describe('buildDailySummaryEmbed', () => {
  it('states the 24h tile count and days remaining in the description', () => {
    const embed = buildDailySummaryEmbed({
      challenge: CHALLENGE,
      tilesCompletedToday: 3,
      leaderboard: [],
      participants: PARTICIPANTS,
      daysRemaining: 5,
    });
    expect(embed.description).toBe('3 tiles completed in the last 24 hours. 5 days remaining.');
  });

  it('singularizes "tile"/"day" at exactly 1', () => {
    const embed = buildDailySummaryEmbed({
      challenge: CHALLENGE,
      tilesCompletedToday: 1,
      leaderboard: [],
      participants: PARTICIPANTS,
      daysRemaining: 1,
    });
    expect(embed.description).toBe('1 tile completed in the last 24 hours. 1 day remaining.');
  });

  it('reads sensibly on a quiet day with zero activity, rather than being suppressed entirely', () => {
    const embed = buildDailySummaryEmbed({
      challenge: CHALLENGE,
      tilesCompletedToday: 0,
      leaderboard: [],
      participants: PARTICIPANTS,
      daysRemaining: 12,
    });
    expect(embed.description).toBe('0 tiles completed in the last 24 hours. 12 days remaining.');
  });

  it('limits the leaderboard field to the top 3', () => {
    const fourth: ParticipantLite = { id: 'd', rsn: 'Fourth' };
    const embed = buildDailySummaryEmbed({
      challenge: CHALLENGE,
      tilesCompletedToday: 4,
      leaderboard: [entry('a', 4), entry('b', 3), entry('c', 2), entry('d', 1)],
      participants: [...PARTICIPANTS, fourth],
      daysRemaining: 5,
    });
    expect(embed.fields?.find((f) => f.name === 'Leaderboard')?.value.split('\n')).toHaveLength(3);
  });

  it('falls back to a plain message when no one has scored yet', () => {
    const embed = buildDailySummaryEmbed({
      challenge: CHALLENGE,
      tilesCompletedToday: 0,
      leaderboard: [],
      participants: PARTICIPANTS,
      daysRemaining: 5,
    });
    expect(embed.fields?.find((f) => f.name === 'Leaderboard')?.value).toBe('No one has scored yet.');
  });

  it('ends with a field linking back to the board', () => {
    const embed = buildDailySummaryEmbed({
      challenge: CHALLENGE,
      tilesCompletedToday: 0,
      leaderboard: [],
      participants: PARTICIPANTS,
      daysRemaining: 5,
    });
    expect(embed.fields?.at(-1)?.value).toBe('[Bingo Time!](https://dungeoncrawl.lol/c/bingo-time)');
  });
});
