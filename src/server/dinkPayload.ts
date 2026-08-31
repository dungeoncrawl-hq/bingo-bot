// Request body parsing for RuneLite's Dink plugin webhooks -- shared by
// api/dink/[secret].ts (Vercel) and vite.config.ts's dev middleware, both
// of which hand this a raw, unparsed body so the two entry points behave
// identically. Ported near-verbatim from rs/src/server/dinkWebhook.ts --
// generic multipart/JSON parsing, no OSRS-specific logic.

// Buffers a Node request stream in full. Needed for multipart bodies (never
// auto-parsed by Vercel, unlike JSON) and used unconditionally by the Vite
// dev middleware, which never auto-parses anything.
export function readRawBody(req: { on: (event: string, cb: (chunk: unknown) => void) => void }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk as Buffer));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export interface DinkImage {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

export interface ParsedDinkPayload {
  data: unknown;
  image: DinkImage | null;
}

// Dink's "Send screenshot" option switches a notifier from a plain JSON POST
// to multipart/form-data -- a "payload_json" text part (the same JSON as
// always) plus a "file" part (the screenshot image). The image is extracted
// generically here regardless of which notifier sent it, so it's already
// available if a future handler wants it, even though nothing in this
// milestone relays images. Uses the platform's Request/FormData multipart
// parser (stable in Node 18+) instead of adding a parsing dependency.
export async function parseDinkPayload(contentType: string, rawBody: Buffer): Promise<ParsedDinkPayload> {
  if (!contentType.includes('multipart/form-data')) {
    const data = rawBody.length > 0 ? JSON.parse(rawBody.toString('utf8')) : {};
    return { data, image: null };
  }
  const request = new Request('http://dink.local/', { method: 'POST', headers: { 'content-type': contentType }, body: rawBody });
  const formData = await request.formData();
  const raw = formData.get('payload_json');
  if (typeof raw !== 'string') throw new Error('Multipart webhook body is missing its payload_json field');
  const data = JSON.parse(raw);

  const filePart = formData.get('file');
  const image: DinkImage | null =
    filePart instanceof Blob
      ? {
          buffer: Buffer.from(await filePart.arrayBuffer()),
          filename: typeof (filePart as { name?: unknown }).name === 'string' ? (filePart as { name: string }).name : 'screenshot.png',
          contentType: filePart.type || 'image/png',
        }
      : null;

  return { data, image };
}
