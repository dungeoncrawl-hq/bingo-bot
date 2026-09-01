// Ranks a challenge's participants by total tile points earned. Kept
// framework-agnostic and pure (like tileConditions.ts/format.ts) so it's
// unit-testable without a DB or React around it.

export interface LeaderboardTile {
  id: string;
  points: number;
  // Extra points for whoever completes this tile first -- see
  // firstCompleters below. 0 (or missing, for a tile saved before this
  // field existed) means no bonus, same as today's flat scoring.
  first_completer_bonus?: number;
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
  // tile id -> id of the participant who completed it first (see
  // firstCompletions.ts's computeFirstCompleters) -- only that participant
  // gets the tile's first_completer_bonus.
  firstCompleters: Record<string, string>,
): LeaderboardEntry[] {
  const tilesById = new Map(tiles.map((t) => [t.id, t]));

  const entries: LeaderboardEntry[] = participantIds.map((participantId) => {
    const tileCompletions = completions.filter((c) => c.kind === 'tile' && c.participant_id === participantId);
    const points = tileCompletions.reduce((sum, c) => {
      const tile = tilesById.get(c.ref);
      if (!tile) return sum;
      const bonus = firstCompleters[c.ref] === participantId ? (tile.first_completer_bonus ?? 0) : 0;
      return sum + tile.points + bonus;
    }, 0);
    return { participantId, points, tilesCompleted: tileCompletions.length };
  });

  return entries.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.tilesCompleted !== a.tilesCompleted) return b.tilesCompleted - a.tilesCompleted;
    return a.participantId.localeCompare(b.participantId);
  });
}
