import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireSiteAdmin } from '../../src/server/adminAuth.js';
import { selectRows, updateRows, callRpcReturning } from '../../src/server/supabaseAdmin.js';
import { sendAnnouncementEmail } from '../../src/server/resendEmail.js';

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  published_at: string | null;
  emailed_at: string | null;
}

interface SubscribedEmailRow {
  id: string;
  email: string;
}

// Deliberately a separate action from publishing (AdminAnnouncementsPage.tsx
// calls this only when the host clicks its own "Email subscribers" button,
// after confirming) -- a typo-fix republish must never silently re-blast
// every inbox. emailed_at (set at the end here) is what makes a second call
// for the same announcement a no-op.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const adminId = await requireSiteAdmin(req.headers.authorization);
  if (!adminId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const announcementId = req.body?.announcementId;
  if (typeof announcementId !== 'string') {
    res.status(400).json({ error: 'Missing announcementId' });
    return;
  }

  const [announcement] = await selectRows<AnnouncementRow>(
    'announcements',
    `id=eq.${encodeURIComponent(announcementId)}&select=id,title,body,published_at,emailed_at`,
  );
  if (!announcement) {
    res.status(404).json({ error: 'Announcement not found' });
    return;
  }
  if (!announcement.published_at) {
    res.status(400).json({ error: 'Publish this announcement before emailing it.' });
    return;
  }
  if (announcement.emailed_at) {
    res.status(400).json({ error: 'This announcement has already been emailed.' });
    return;
  }

  const recipients = await callRpcReturning<SubscribedEmailRow[]>('subscribed_emails', {});
  if (recipients.length > 0) {
    const siteUrl = `https://${req.headers.host}`;
    await sendAnnouncementEmail(announcement.title, announcement.body, recipients, siteUrl);
  }
  await updateRows('announcements', `id=eq.${encodeURIComponent(announcementId)}`, {
    emailed_at: new Date().toISOString(),
  });
  res.status(200).json({ sent: recipients.length });
}
