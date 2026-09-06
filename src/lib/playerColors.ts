// A small, curated palette a player can pick from to represent themselves
// across one dungeon (their "who's here" chip's background, their
// leaderboard text) -- picked to stay legible against this site's dark
// stone background. Not a freeform color picker: a fixed, closed set
// (schema.sql's CHECK enforces the same list) keeps every possible color
// pre-verified to look good here, and small enough to render as plain
// swatches with no picker UI needed.
// fb923c (orange) was dropped 2026-09-06 -- too close to f59e0b (amber) to
// tell apart at a glance, defeating the whole point of this palette.
// Replaced with a cyan for real hue separation from every other entry,
// plus a white option.
export const PLAYER_COLORS = ['#f59e0b', '#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#22d3ee', '#ffffff'] as const;

export function isValidPlayerColor(color: string): color is (typeof PLAYER_COLORS)[number] {
  return (PLAYER_COLORS as readonly string[]).includes(color);
}

// The fallback for a participant who hasn't chosen a color: deterministic
// per challenge_participants.id, not per profile, so it's stable across
// reloads/viewers within one dungeon (same participant always gets the
// same color) but independently "random-looking" in a different dungeon
// the same account joins (a different id hashes to a different slot).
// Ported from BoardPage.tsx's own chipColorFor, now shared so the same
// fallback backs both the chip and the leaderboard text color.
export function colorForParticipant(participantId: string): string {
  let hash = 0;
  for (let i = 0; i < participantId.length; i++) hash = (hash * 31 + participantId.charCodeAt(i)) >>> 0;
  return PLAYER_COLORS[hash % PLAYER_COLORS.length];
}
