import type { VercelRequest, VercelResponse } from '@vercel/node';
import { processDinkWebhook } from '../../src/server/dinkWebhook';
import { parseDinkPayload, readRawBody } from '../../src/server/dinkPayload';
import { selectRows } from '../../src/server/supabaseAdmin';
import type { Challenge } from '../../src/db/types';

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
    const [challenge] = await selectRows<Challenge>('challenges', `dink_secret=eq.${encodeURIComponent(secret)}&select=*`);
    if (!challenge) {
      res.status(404).json({ error: 'Unknown webhook' });
      return;
    }
    if (challenge.status === 'ended') {
      res.status(200).json({ ok: true, note: 'challenge has ended' });
      return;
    }

    const contentType = req.headers['content-type'] ?? '';
    // Vercel only auto-parses JSON into req.body -- multipart (any notifier
    // with Dink's "Send screenshot" option on) needs the raw stream read
    // and parsed ourselves.
    const parsed = contentType.includes('multipart/form-data')
      ? await parseDinkPayload(contentType, await readRawBody(req))
      : { data: req.body, image: null };
    const { status, body } = await processDinkWebhook(challenge, parsed.data);
    res.status(status).json(body);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Webhook processing failed' });
  }
}
