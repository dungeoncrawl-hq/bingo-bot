// Fetches BACKLOG.md #9's admin-editable Discord title templates -- server
// only (uses supabaseAdmin.ts's service-role REST access), called once per
// webhook event by challengeProgress.ts and threaded down into
// discordEmbeds.ts's embed builders as plain data. Mirrors
// discordBanterStore.ts exactly; kept as a separate module/table rather
// than folded into that one since a title slot is a single value, not a
// pool of randomized variants (see discordTitles.ts's own comment).
import { selectRows } from './supabaseAdmin.js';
import { DEFAULT_TITLE_TEMPLATES, type TitleTemplates } from './discordTitles.js';

// Same TTL-cache shape as discordBanterStore.ts -- one set of templates,
// site-wide, not per-challenge.
let cache: { value: TitleTemplates; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export async function fetchTitleTemplates(): Promise<TitleTemplates> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  const rows = await selectRows<{ slot: keyof TitleTemplates; template: string }>('discord_title_templates', 'select=slot,template');
  const titles: TitleTemplates = { ...DEFAULT_TITLE_TEMPLATES };
  for (const row of rows) {
    // A blank saved template (an admin cleared the field to empty) falls
    // back to the default rather than posting a blank Discord embed
    // title -- same reasoning as discordBanterStore.ts's per-pool
    // fallback, just per-slot here since there's exactly one value per
    // slot instead of a whole array to be empty.
    if (row.template.trim().length > 0) titles[row.slot] = row.template;
  }

  cache = { value: titles, expiresAt: Date.now() + CACHE_TTL_MS };
  return titles;
}
