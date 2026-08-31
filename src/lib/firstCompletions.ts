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
