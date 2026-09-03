// Which participant was first (earliest completed_at) to finish each tile
// in a challenge -- purely a recognition/bragging-rights label, not an
// exclusivity lock (every participant tracks their own board/completions
// independently, so more than one person can finish the same tile).

export interface CompletionForFirst {
  kind: string;
  ref: string;
  participant_id: string;
  completed_at: string;
}

// tile id -> id of the participant who completed it earliest.
export function computeFirstCompleters(completions: CompletionForFirst[]): Record<string, string> {
  const earliest: Record<string, { participantId: string; completedAt: string }> = {};
  for (const c of completions) {
    if (c.kind !== 'tile') continue;
    const current = earliest[c.ref];
    if (!current || c.completed_at < current.completedAt) {
      earliest[c.ref] = { participantId: c.participant_id, completedAt: c.completed_at };
    }
  }
  const result: Record<string, string> = {};
  for (const [tileId, v] of Object.entries(earliest)) result[tileId] = v.participantId;
  return result;
}

export interface TileForFirst {
  id: string;
  layout: { column: number };
}

// Adventure-specific: "first" is scoped to the whole room (every tile
// sharing a layout.column -- e.g. a fork's top/bottom lanes), not a
// single lane's own tile. Two participants who picked different lanes
// through the same room aren't both "first" just because each was the
// earliest (only) completer of their own tile -- only whoever reached
// that room earliest, via either lane, gets the room's "first" credit.
// Every tile in a column maps to that same overall winner, so a lane's
// own tile only shows a star when its own completer also happens to be
// the room's winner (real production report: WheresMyGear and 26
// Limont both showing "first" for Room 3 of adventure-test, having
// taken opposite lanes). A boss/single-lane column (one tile) behaves
// identically to computeFirstCompleters, since there's nothing else in
// its group.
export function computeAdventureFirstCompleters(
  completions: CompletionForFirst[],
  tiles: TileForFirst[],
): Record<string, string> {
  const columnOf = new Map(tiles.map((t) => [t.id, t.layout.column]));
  const earliestByColumn = new Map<number, { participantId: string; completedAt: string }>();
  for (const c of completions) {
    if (c.kind !== 'tile') continue;
    const column = columnOf.get(c.ref);
    if (column === undefined) continue;
    const current = earliestByColumn.get(column);
    if (!current || c.completed_at < current.completedAt) {
      earliestByColumn.set(column, { participantId: c.participant_id, completedAt: c.completed_at });
    }
  }
  const result: Record<string, string> = {};
  for (const tile of tiles) {
    const winner = earliestByColumn.get(tile.layout.column);
    if (winner) result[tile.id] = winner.participantId;
  }
  return result;
}
