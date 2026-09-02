// Randomized flavor-text variants for Discord completion embeds
// (discordEmbeds.ts), leaning into the site's ".lol" branding instead of
// one fixed line forever (BACKLOG.md #8). Parameterized by the two
// dimensions that already reshape completion embeds elsewhere: whether
// this is a boss tile (Adventure) and whether the completer actually won
// the race to finish it first -- kept in its own module so the joke
// content doesn't clutter discordEmbeds.ts's embed-assembly logic.
//
// Each line is the full sentence (info + banter together), mirroring the
// single fixed sentence each case used to have, rather than splitting
// information into a separate line -- so points/who-was-first stay baked
// into the variety instead of getting duplicated across two lines.

const FIRST_TILE_LINES: ((points: number) => string)[] = [
  (p) => `+${p} pts. Aren't they just showing off at this point?`,
  (p) => `+${p} pts. Absolutely no chill.`,
  (p) => `+${p} pts. Somebody's speedrunning this challenge.`,
  (p) => `+${p} pts. The rest of the lobby should be nervous.`,
  (p) => `+${p} pts. Zero hesitation on that one.`,
  (p) => `+${p} pts. Didn't even let anyone else try.`,
];

const NOT_FIRST_TILE_LINES: ((firstCompleterRsn: string) => string)[] = [
  (rsn) => `Unfortunately not as fast as ${rsn}, though.`,
  (rsn) => `${rsn} beat them to it. Tough crowd out here.`,
  (rsn) => `${rsn} already claimed this one. There's always the next tile.`,
  (rsn) => `A solid finish -- just not as solid as ${rsn}'s.`,
  (rsn) => `Bested by ${rsn}. No shame in it.`,
];

const FIRST_BOSS_LINES: ((points: number) => string)[] = [
  (p) => `+${p} pts. Absolutely demolished.`,
  (p) => `+${p} pts. The boss never stood a chance.`,
  (p) => `+${p} pts. GG to whatever that boss was trying to do.`,
  (p) => `+${p} pts. That's a wrap on that fight.`,
  (p) => `+${p} pts. Flawless victory.`,
];

const NOT_FIRST_BOSS_LINES: ((firstCompleterRsn: string) => string)[] = [
  (rsn) => `${rsn} already claimed this kill. Better luck on the next one.`,
  (rsn) => `${rsn} got there first -- this boss just isn't safe from this lobby.`,
  (rsn) => `Still a kill, just not the first one. ${rsn} beat them to that.`,
  (rsn) => `${rsn} already dropped this boss. Next!`,
];

const BOARD_COMPLETION_LINES: string[] = [
  'Every tile conquered.',
  "That's the whole thing. No tiles left standing.",
  'A clean sweep.',
  'Board cleared. What now, champion?',
  'Not a single tile left to do.',
];

function pick<T>(pool: T[], rng: () => number): T {
  return pool[Math.floor(rng() * pool.length)];
}

// rng defaults to Math.random -- overridable so callers (tests) can pin
// down an exact selection instead of asserting against every possible
// variant.
export function tileCompletionFlavor(
  params: { isFirst: boolean; isBoss: boolean; points: number; firstCompleterRsn: string },
  rng: () => number = Math.random,
): string {
  const { isFirst, isBoss, points, firstCompleterRsn } = params;
  if (isBoss) {
    return isFirst ? pick(FIRST_BOSS_LINES, rng)(points) : pick(NOT_FIRST_BOSS_LINES, rng)(firstCompleterRsn);
  }
  return isFirst ? pick(FIRST_TILE_LINES, rng)(points) : pick(NOT_FIRST_TILE_LINES, rng)(firstCompleterRsn);
}

export function boardCompletionFlavor(rng: () => number = Math.random): string {
  return pick(BOARD_COMPLETION_LINES, rng);
}
