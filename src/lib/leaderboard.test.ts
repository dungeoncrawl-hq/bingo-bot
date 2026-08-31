import { describe, expect, it } from 'vitest';
import { computeLeaderboard, type LeaderboardCompletion, type LeaderboardTile } from './leaderboard';

const TILES: LeaderboardTile[] = [
  { id: 't1', points: 1 },
  { id: 't2', points: 5 },
  { id: 't3', points: 10 },
];

function completion(participantId: string, ref: string): LeaderboardCompletion {
  return { participant_id: participantId, kind: 'tile', ref };
}

describe('computeLeaderboard', () => {
  it('sums each participant\'s completed-tile points', () => {
    const completions = [completion('a', 't1'), completion('a', 't2'), completion('b', 't3')];
    const result = computeLeaderboard(TILES, completions, ['a', 'b']);
    expect(result).toEqual([
      { participantId: 'b', points: 10, tilesCompleted: 1 },
      { participantId: 'a', points: 6, tilesCompleted: 2 },
    ]);
  });

  it('ignores non-tile completions (line/board)', () => {
    const completions = [completion('a', 't1'), { participant_id: 'a', kind: 'board', ref: 'board' }];
    const result = computeLeaderboard(TILES, completions, ['a']);
    expect(result).toEqual([{ participantId: 'a', points: 1, tilesCompleted: 1 }]);
  });

  it('includes participants with zero completions at the bottom', () => {
    const completions = [completion('a', 't3')];
    const result = computeLeaderboard(TILES, completions, ['a', 'b']);
    expect(result).toEqual([
      { participantId: 'a', points: 10, tilesCompleted: 1 },
      { participantId: 'b', points: 0, tilesCompleted: 0 },
    ]);
  });

  it('breaks an exact points-and-tilecount tie by participantId, regardless of input order', () => {
    const tiles: LeaderboardTile[] = [
      { id: 't1', points: 5 },
      { id: 't2', points: 5 },
    ];
    const completions = [completion('b', 't2'), completion('a', 't1')];
    const result = computeLeaderboard(tiles, completions, ['b', 'a']);
    expect(result).toEqual([
      { participantId: 'a', points: 5, tilesCompleted: 1 },
      { participantId: 'b', points: 5, tilesCompleted: 1 },
    ]);
  });

  it('ranks a higher tile count above a lower one when points tie exactly', () => {
    const tiles: LeaderboardTile[] = [
      { id: 't1', points: 2 },
      { id: 't2', points: 1 },
      { id: 't3', points: 1 },
    ];
    // a: one 2pt tile. b: two 1pt tiles -- same total (2), but b completed more tiles.
    const completions = [completion('a', 't1'), completion('b', 't2'), completion('b', 't3')];
    const result = computeLeaderboard(tiles, completions, ['a', 'b']);
    expect(result).toEqual([
      { participantId: 'b', points: 2, tilesCompleted: 2 },
      { participantId: 'a', points: 2, tilesCompleted: 1 },
    ]);
  });
});
