// BACKLOG.md #58 -- the one place every player-facing name display combines
// the account-level display_name with the challenge-level rsn.
export function formatPlayerName(p: { display_name: string; rsn: string }): string {
  return `${p.display_name} (${p.rsn})`;
}
