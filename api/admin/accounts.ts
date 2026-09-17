import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireSiteAdmin } from '../../src/server/adminAuth.js';

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

interface AuthUser {
  id: string;
  email?: string;
  last_sign_in_at?: string;
}

// BACKLOG.md #58 -- profiles has no email column and the browser client
// can't reach auth.users, so AdminAccountsPage.tsx's email/last-login
// columns come from here instead. last_sign_in_at is already tracked by
// Supabase auth natively -- no new tracking needed.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const adminId = await requireSiteAdmin(req.headers.authorization);
  if (!adminId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const usersRes = await fetch(`${supabaseUrl()}/auth/v1/admin/users?per_page=200`, {
    headers: { apikey: serviceRoleKey(), Authorization: `Bearer ${serviceRoleKey()}` },
  });
  if (!usersRes.ok) {
    res.status(502).json({ error: 'Failed to list accounts' });
    return;
  }
  const { users } = (await usersRes.json()) as { users: AuthUser[] };
  res.status(200).json({
    accounts: users.map((u) => ({ id: u.id, email: u.email ?? null, last_sign_in_at: u.last_sign_in_at ?? null })),
  });
}
