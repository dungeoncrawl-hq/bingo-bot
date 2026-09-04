import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyUnsubscribeToken } from '../src/server/unsubscribeToken.js';
import { updateRows } from '../src/server/supabaseAdmin.js';

// The link in every announcement email points here directly -- no login,
// no client-side JS required, so it works as a real one-click unsubscribe
// even opened straight from an email client's in-app browser.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const profileId = req.query.profile;
  const token = req.query.token;
  if (typeof profileId !== 'string' || typeof token !== 'string') {
    res.status(400).send('Missing profile or token.');
    return;
  }

  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret || !verifyUnsubscribeToken(profileId, token, secret)) {
    res.status(403).send('Invalid or expired unsubscribe link.');
    return;
  }

  await updateRows('profiles', `id=eq.${encodeURIComponent(profileId)}`, { email_notifications: false });
  res.writeHead(302, { Location: '/unsubscribed' });
  res.end();
}
