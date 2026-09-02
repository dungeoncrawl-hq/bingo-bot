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
//
// BACKLOG.md #9 -- pools are plain data (template strings with
// {points}/{rsn} placeholders), not functions, so they can live in the
// admin-editable discord_banter_lines table (discordBanterStore.ts fetches
// them) instead of only ever these hardcoded defaults.

export interface BanterPools {
  firstTile: string[];
  notFirstTile: string[];
  firstBoss: string[];
  notFirstBoss: string[];
  boardCompletion: string[];
}

export const DEFAULT_BANTER_POOLS: BanterPools = {
  firstTile: [
    "+{points} pts. Aren't they just showing off at this point?",
    '+{points} pts. Absolutely no chill.',
    "+{points} pts. Somebody's speedrunning this challenge.",
    '+{points} pts. The rest of the lobby should be nervous.',
    '+{points} pts. Zero hesitation on that one.',
    "+{points} pts. Didn't even let anyone else try.",
  ],
  notFirstTile: [
    'Unfortunately not as fast as {rsn}, though.',
    '{rsn} beat them to it. Tough crowd out here.',
    "{rsn} already claimed this one. There's always the next tile.",
    "A solid finish -- just not as solid as {rsn}'s.",
    'Bested by {rsn}. No shame in it.',
  ],
  firstBoss: [
    '+{points} pts. Absolutely demolished.',
    '+{points} pts. The boss never stood a chance.',
    '+{points} pts. GG to whatever that boss was trying to do.',
    "+{points} pts. That's a wrap on that fight.",
    '+{points} pts. Flawless victory.',
  ],
  notFirstBoss: [
    '{rsn} already claimed this kill. Better luck on the next one.',
    "{rsn} got there first -- this boss just isn't safe from this lobby.",
    'Still a kill, just not the first one. {rsn} beat them to that.',
    '{rsn} already dropped this boss. Next!',
  ],
  boardCompletion: [
    'Every tile conquered.',
    "That's the whole thing. No tiles left standing.",
    'A clean sweep.',
    'Board cleared. What now, champion?',
    'Not a single tile left to do.',
  ],
};

function pick<T>(pool: T[], rng: () => number): T {
  return pool[Math.floor(rng() * pool.length)];
}

// Generic {key} substitution -- a template that doesn't reference a given
// key (e.g. boardCompletion's lines, which take no variables) just ignores
// it, so one substitution function covers every pool without each needing
// its own shape.
function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

// pools defaults to DEFAULT_BANTER_POOLS and rng to Math.random -- both
// overridable so callers (tests, or a caller with a DB-fetched BanterPools)
// can pin down an exact pool/selection instead of the hardcoded/random
// combination.
export function tileCompletionFlavor(
  params: { isFirst: boolean; isBoss: boolean; points: number; firstCompleterRsn: string },
  pools: BanterPools = DEFAULT_BANTER_POOLS,
  rng: () => number = Math.random,
): string {
  const { isFirst, isBoss, points, firstCompleterRsn } = params;
  const pool = isBoss ? (isFirst ? pools.firstBoss : pools.notFirstBoss) : isFirst ? pools.firstTile : pools.notFirstTile;
  return fill(pick(pool, rng), { points: String(points), rsn: firstCompleterRsn });
}

export function boardCompletionFlavor(pools: BanterPools = DEFAULT_BANTER_POOLS, rng: () => number = Math.random): string {
  return pick(pools.boardCompletion, rng);
}
