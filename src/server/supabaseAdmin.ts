// Service-role Supabase REST access for trusted server code only (the Dink
// webhook route) -- never imported by any browser-facing file. Raw fetch
// against PostgREST rather than @supabase/supabase-js, matching rs's
// server-side pattern (its Realtime module throws on Node <22, and this
// machine runs Node 18). Simpler than rs's version, which signs in as a
// shared PinGate account to get an authenticated-role token: here the
// service role key IS the bearer token directly, no sign-in step needed --
// and unlike rs's write policy (any authenticated user), the raw tables
// this writes to have NO client write policy at all, so this is the only
// path that can ever write to them.

function supabaseUrl(): string {
  const url = process.env.VITE_SUPABASE_URL;
  if (!url) throw new Error('Missing VITE_SUPABASE_URL');
  return url;
}

function serviceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return key;
}

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  const key = serviceRoleKey();
  return fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
  });
}

export async function selectRows<T>(table: string, query: string): Promise<T[]> {
  const res = await rest(`${table}?${query}`);
  if (!res.ok) throw new Error(`Select ${table} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T[];
}

export async function insertRow(table: string, row: Record<string, unknown>): Promise<void> {
  const res = await rest(table, { method: 'POST', body: JSON.stringify(row) });
  if (!res.ok) throw new Error(`Insert ${table} failed: ${res.status} ${await res.text()}`);
}

export async function callRpc(name: string, args: Record<string, unknown>): Promise<void> {
  const res = await rest(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });
  if (!res.ok) throw new Error(`RPC ${name} failed: ${res.status} ${await res.text()}`);
}

// Same as callRpc, but for a SQL function that returns a scalar/row instead
// of void (e.g. increment_screenshot_stats returning the new running
// count) -- PostgREST hands the function's return value back as the
// response body directly.
export async function callRpcReturning<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await rest(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });
  if (!res.ok) throw new Error(`RPC ${name} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

// resolution=ignore-duplicates silently no-ops the write on a conflict
// (append-only event logs with a natural idempotency key); merge-duplicates
// updates the conflicting row instead (pet_obtains, so a re-fired PET event
// still bumps updated_at).
export async function upsertRow(
  table: string,
  row: Record<string, unknown>,
  onConflict: string,
  resolution: 'ignore-duplicates' | 'merge-duplicates' = 'ignore-duplicates',
): Promise<void> {
  const res = await rest(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: 'POST',
    headers: { Prefer: `resolution=${resolution}` },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Upsert ${table} failed: ${res.status} ${await res.text()}`);
}

// Returns the inserted row(s) -- empty array means a conflict already
// existed and nothing was inserted. Used by challengeProgress.ts to close
// the race on "did I win the race to record this completion": Postgres
// serializes concurrent inserts on the same unique key, so whichever
// request's response comes back non-empty is the one that actually landed.
export async function insertRowReturning<T>(table: string, row: Record<string, unknown>, onConflict: string): Promise<T[]> {
  const res = await rest(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Insert ${table} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T[];
}

// Dink can fire the same notifier twice for one in-game event (confirmed in
// rs: two byte-identical Death rows landed 1.7s apart). loot_drops and
// deaths have no natural idempotency key to upsert against, and a unique
// constraint on the full row isn't practical since items/lost_items are
// jsonb arrays. Instead, skip the insert if a row matching the given
// columns was already written in the last few seconds.
const DUPLICATE_WINDOW_SECONDS = 3;

function eqFilter(column: string, value: unknown): string {
  return value === null || value === undefined ? `${column}=is.null` : `${column}=eq.${encodeURIComponent(String(value))}`;
}

export async function insertRowUnlessRecentDuplicate(
  table: string,
  row: Record<string, unknown>,
  matchColumns: string[],
): Promise<void> {
  const cutoff = new Date(Date.now() - DUPLICATE_WINDOW_SECONDS * 1000).toISOString();
  const filters = matchColumns.map((c) => eqFilter(c, row[c])).join('&');
  const existing = await selectRows<{ id: string }>(table, `${filters}&created_at=gte.${encodeURIComponent(cutoff)}&select=id&limit=1`);
  if (existing.length > 0) return;
  await insertRow(table, row);
}
