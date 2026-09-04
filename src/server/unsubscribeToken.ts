// A stateless, no-login-required unsubscribe link: the token is an HMAC of
// the profile id, so api/unsubscribe.ts can verify it without a DB lookup
// or session, and a one-click link in an email client (which never has an
// app session) still works. Server-only (node:crypto) -- never imported
// from src/lib, which must stay browser-safe.
import { createHmac, timingSafeEqual } from 'node:crypto';

export function makeUnsubscribeToken(profileId: string, secret: string): string {
  return createHmac('sha256', secret).update(profileId).digest('hex');
}

export function verifyUnsubscribeToken(profileId: string, token: string, secret: string): boolean {
  const expected = makeUnsubscribeToken(profileId, secret);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(token, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
