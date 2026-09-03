import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveAndProcessDinkWebhook } from '../../src/server/dinkWebhook.js';
import { parseDinkPayload, readRawBody } from '../../src/server/dinkPayload.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const secret = req.query.secret;
  if (typeof secret !== 'string') {
    res.status(400).json({ error: 'Missing secret' });
    return;
  }

  try {
    const contentType = req.headers['content-type'] ?? '';
    // Vercel only auto-parses JSON into req.body -- multipart (any notifier
    // with Dink's "Send screenshot" option on) needs the raw stream read
    // and parsed ourselves.
    const parsed = contentType.includes('multipart/form-data')
      ? await parseDinkPayload(contentType, await readRawBody(req))
      : { data: req.body, image: null };
    // Resolves either a single challenge (today's per-challenge secret) or
    // an account (BACKLOG.md #13's profile_secrets) and fans the event out
    // accordingly -- see resolveAndProcessDinkWebhook's own comment.
    const { status, body } = await resolveAndProcessDinkWebhook(secret, parsed.data, parsed.image);
    res.status(status).json(body);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Webhook processing failed' });
  }
}
