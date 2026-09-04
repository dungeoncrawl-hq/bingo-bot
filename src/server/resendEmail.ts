// Sends the "new announcement" email blast via Resend's REST API -- raw
// fetch rather than the resend npm package, matching supabaseAdmin.ts's
// own raw-fetch-over-SDK convention (Resend's API is a thin REST surface;
// no SDK-only functionality is needed here).
import { makeUnsubscribeToken } from './unsubscribeToken.js';

// TODO: update once a sending domain is verified in Resend -- see
// BACKLOG.md #20's migration note.
const FROM_ADDRESS = 'Dungeon Crawl <announcements@dungeoncrawl.lol>';
// Resend's batch endpoint caps at 100 emails per call.
const BATCH_SIZE = 100;

function apiKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('Missing RESEND_API_KEY');
  return key;
}

function unsubscribeSecret(): string {
  const key = process.env.UNSUBSCRIBE_SECRET;
  if (!key) throw new Error('Missing UNSUBSCRIBE_SECRET');
  return key;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Table-based layout + inline styles, matching supabase/email-templates'
// own convention (most email clients strip <style> blocks and don't
// reliably load web fonts).
function renderHtml(title: string, body: string, unsubscribeUrl: string): string {
  const paragraphs = body
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => `<p style="margin:0 0 12px; color:#d6d3d1; font-size:14px; line-height:1.6;">${escapeHtml(line)}</p>`)
    .join('');
  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0; padding:0; background-color:#0c0a09;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0c0a09;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%;">
            <tr>
              <td align="center" style="padding-bottom:28px;">
                <span style="font-family:Georgia,'Times New Roman',serif; font-size:24px; font-weight:700; color:#f59e0b; letter-spacing:0.03em;">
                  Dungeon Crawl
                </span>
              </td>
            </tr>
            <tr>
              <td style="background-color:#1c1917; border:1px solid #44403c; border-radius:12px; padding:32px;">
                <h1 style="margin:0 0 16px; color:#f5f5f4; font-size:18px;">${escapeHtml(title)}</h1>
                ${paragraphs}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top:20px;">
                <a href="${unsubscribeUrl}" style="color:#78716c; font-size:11px; text-decoration:underline;">Unsubscribe from update emails</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export interface AnnouncementRecipient {
  id: string;
  email: string;
}

export async function sendAnnouncementEmail(
  title: string,
  body: string,
  recipients: AnnouncementRecipient[],
  siteUrl: string,
): Promise<void> {
  const secret = unsubscribeSecret();
  const key = apiKey();
  const emails = recipients.map((r) => {
    const token = makeUnsubscribeToken(r.id, secret);
    const unsubscribeUrl = `${siteUrl}/api/unsubscribe?profile=${r.id}&token=${token}`;
    return {
      from: FROM_ADDRESS,
      to: r.email,
      subject: `Dungeon Crawl: ${title}`,
      html: renderHtml(title, body, unsubscribeUrl),
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    };
  });

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const chunk = emails.slice(i, i + BATCH_SIZE);
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) throw new Error(`Resend batch send failed: ${res.status} ${await res.text()}`);
  }
}
