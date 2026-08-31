import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getSupabase } from '../db/supabaseClient';
import type { Challenge } from '../db/types';

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-950">
        {n}
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="text-sm text-neutral-400">{children}</div>
      </div>
    </div>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-neutral-100">{children}</span>;
}

export default function SetupGuidePage() {
  const { slug } = useParams<{ slug: string }>();
  const [challenge, setChallenge] = useState<Challenge | null | 'not-found'>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!slug) return;
    getSupabase()
      .from('challenges')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data }) => setChallenge((data as Challenge | null) ?? 'not-found'));
  }, [slug]);

  if (challenge === null) return null;
  if (challenge === 'not-found') {
    return <p className="mx-auto max-w-lg py-24 text-center text-neutral-400">Challenge not found.</p>;
  }

  const webhookUrl = `${window.location.origin}/api/dink/${challenge.dink_secret}`;

  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">Set up tracking for {challenge.name}</h1>
        <Link to={`/c/${challenge.slug}`} className="shrink-0 text-sm text-neutral-500 underline hover:text-neutral-300">
          &larr; back to board
        </Link>
      </div>
      <p className="mt-2 text-sm text-neutral-400">
        Everything on your board fills in automatically from RuneLite's <Box>Dink</Box> plugin -- no manual updates.
        It's all copy-pasting a link and checking boxes in Dink's settings, no technical know-how needed.
      </p>

      <div className="mt-6">
        <label className="block text-sm text-neutral-400">Your webhook URL</label>
        <div className="mt-1 flex gap-2">
          <input
            readOnly
            value={webhookUrl}
            onClick={(e) => e.currentTarget.select()}
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-xs text-neutral-300"
          />
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(webhookUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="shrink-0 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="mt-8 space-y-5 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
        <Step n={1} title="Install RuneLite and the Dink plugin">
          If you don't already use RuneLite, install it from <Box>runelite.net</Box>. Once it's running, click the
          wrench icon in the sidebar to open the Plugin Hub, search for <Box>Dink</Box>, and install it.
        </Step>

        <Step n={2} title="Paste your link into 6 webhook fields">
          Open Dink's settings. In each of these sections -- <Box>Slayer</Box>, <Box>Pets</Box>,{' '}
          <Box>Kill Count</Box>, <Box>Death</Box>, <Box>Collection Log</Box>, and <Box>Loot</Box> -- paste your
          webhook URL (above) into the box labeled <Box>Webhook URL</Box>. Don't check any boxes yet, just paste the
          link into all 6.
        </Step>

        <Step n={3} title="Turn on 5 of those sections">
          Now go back through and check the enable box in <Box>Slayer</Box>, <Box>Pets</Box>, <Box>Kill Count</Box>,{' '}
          <Box>Death</Box>, and <Box>Collection Log</Box>. Leave <Box>Loot</Box> for the next step -- it needs one
          more setting first.
        </Step>

        <Step n={4} title="Finish setting up Loot">
          Find the <Box>Loot</Box> section again. Check the box labeled <Box>Enable loot</Box>, then change{' '}
          <Box>Min Loot value</Box> to <Box>0</Box> -- tiles that count up your total loot need every drop, not
          just the big ones.
        </Step>

        <Step n={5} title="Optional: instant sync when you log out">
          Find the <Box>Advanced</Box> section (near the bottom). Paste the same link into the box labeled{' '}
          <Box>Custom Metadata Handler</Box>. There's no checkbox to enable -- pasting the link there is enough. This
          makes your XP/skill/clue stats refresh the instant you log out, instead of waiting for the once-daily
          automatic sync everyone gets regardless.
        </Step>
      </div>
    </div>
  );
}
