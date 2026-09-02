// Fetches BACKLOG.md #9's admin-editable Discord banter pools -- server
// only (uses supabaseAdmin.ts's service-role REST access), called once per
// webhook event by challengeProgress.ts and threaded down into
// discordEmbeds.ts's embed builders as plain data.
import { selectRows } from './supabaseAdmin.js';
import { DEFAULT_BANTER_POOLS, type BanterPools } from './discordBanter.js';

// Same TTL-cache shape as dinkWebhook.ts's bigDropsThresholdCache -- this
// runs on every tile/board completion, so a warm serverless instance
// shouldn't pay for a fresh query on every single one. Unlike that cache,
// there's only ever one set of pools (site-wide, not per-challenge), so a
// single cached value is enough.
let cache: { value: BanterPools; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export async function fetchBanterPools(): Promise<BanterPools> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  const rows = await selectRows<{ pool: keyof BanterPools; template: string }>(
    'discord_banter_lines',
    'select=pool,template&order=sort_order.asc',
  );
  const pools: BanterPools = { firstTile: [], notFirstTile: [], firstBoss: [], notFirstBoss: [], boardCompletion: [] };
  for (const row of rows) pools[row.pool].push(row.template);
  // A pool an admin emptied out entirely (or the migration hasn't run yet)
  // falls back to the matching default pool, so pick() never has to choose
  // from nothing.
  for (const key of Object.keys(pools) as (keyof BanterPools)[]) {
    if (pools[key].length === 0) pools[key] = DEFAULT_BANTER_POOLS[key];
  }

  cache = { value: pools, expiresAt: Date.now() + CACHE_TTL_MS };
  return pools;
}
