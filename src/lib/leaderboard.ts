// Ranks a challenge's participants by total tile points earned. Kept
// framework-agnostic and pure (like tileConditions.ts/format.ts) so it's
// unit-testable without a DB or React around it.

export interface LeaderboardTile {
  id: string;
  points: number;
}

export interface LeaderboardCompletion {
  participant_id: string;
  kind: string;
  ref: string;
}

export interface LeaderboardEntry {
  participantId: string;
  points: number;
  tilesCompleted: number;
}

export function computeLeaderboard(
  tiles: LeaderboardTile[],
  completions: LeaderboardCompletion[],
  participantIds: string[],
): LeaderboardEntry[] {
  const pointsByTileId = new Map(tiles.map((t) => [t.id, t.points]));

  const entries: LeaderboardEntry[] = participantIds.map((participantId) => {
    const tileCompletions = completions.filter((c) => c.kind === 'tile' && c.participant_id === participantId);
    const points = tileCompletions.reduce((sum, c) => sum + (pointsByTileId.get(c.ref) ?? 0), 0);
    return { participantId, points, tilesCompleted: tileCompletions.length };
  });

  return entries.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.tilesCompleted !== a.tilesCompleted) return b.tilesCompleted - a.tilesCompleted;
    return a.participantId.localeCompare(b.participantId);
  });
}
