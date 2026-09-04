// Verifies an API request's Authorization header belongs to a signed-in
// site admin -- for routes only a site admin should be able to trigger
// (e.g. api/announcements/send.ts). Resolves the token via Supabase's own
// /auth/v1/user endpoint (validates signature/expiry server-side) rather
// than adding a JWT-verification dependency, matching supabaseAdmin.ts's
// raw-fetch-over-SDK convention.
import { selectRows } from './supabaseAdmin.js';

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

// Returns the caller's profile id if they're signed in AND is_site_admin,
// null otherwise (bad/missing token, or a real account that just isn't an
// admin) -- callers don't need to distinguish those cases, both mean 403.
export async function requireSiteAdmin(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const res = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: serviceRoleKey() },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string };
  if (!user.id) return null;
  const [profile] = await selectRows<{ is_site_admin: boolean }>(
    'profiles',
    `id=eq.${encodeURIComponent(user.id)}&select=is_site_admin`,
  );
  return profile?.is_site_admin ? user.id : null;
}
