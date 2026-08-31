// Best-effort by design -- a Discord outage or missing webhook URL must
// never fail the webhook response for an event that already wrote to
// Supabase. Unlike rs's per-notifier relay (which posts a message for
// every raw event -- loot, deaths, level-ups, collection log), this only
// ever gets called for tile/line/board *completions* -- see
// challengeProgress.ts. No screenshot/multipart support, since completion
// announcements don't carry a Dink-attached image.
export async function relayToDiscord(webhookUrl: string | null, content: string): Promise<void> {
  if (!webhookUrl) return;
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  } catch (err) {
    console.error('Discord relay failed:', err);
  }
}
