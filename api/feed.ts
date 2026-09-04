import type { VercelRequest, VercelResponse } from '@vercel/node';
import { selectRows } from '../src/server/supabaseAdmin.js';

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  published_at: string;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Served at /feed.xml via vercel.json's rewrite (ahead of the SPA
// catch-all) -- an RSS reader can't execute the client bundle, so this has
// to be a plain server response, not a React route.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const siteUrl = `https://${req.headers.host}`;
  const rows = await selectRows<AnnouncementRow>(
    'announcements',
    'published_at=not.is.null&select=id,title,body,published_at&order=published_at.desc&limit=30',
  );
  const items = rows
    .map(
      (r) => `
    <item>
      <title>${escapeXml(r.title)}</title>
      <link>${siteUrl}/changelog</link>
      <guid isPermaLink="false">${r.id}</guid>
      <pubDate>${new Date(r.published_at).toUTCString()}</pubDate>
      <description>${escapeXml(r.body)}</description>
    </item>`,
    )
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Dungeon Crawl updates</title>
    <link>${siteUrl}/changelog</link>
    <description>New features and changes to Dungeon Crawl.</description>
    ${items}
  </channel>
</rss>`;
  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.status(200).send(xml);
}
