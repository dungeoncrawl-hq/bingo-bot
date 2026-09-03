import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';
import type { Challenge } from '../db/types';

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 hover:bg-amber-400 transition-colors text-xs font-bold text-stone-950">
        {n}
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="text-sm text-stone-400">{children}</div>
      </div>
    </div>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-stone-100">{children}</span>;
}

export default function SetupGuidePage() {
  const { slug } = useParams<{ slug: string }>();
  const { session } = useAuth();
  const [challenge, setChallenge] = useState<Challenge | null | 'not-found'>(null);
  const [accountSecret, setAccountSecret] = useState<string | null>(null);
  const [accountCopied, setAccountCopied] = useState(false);

  useEffect(() => {
    if (!slug) return;
    getSupabase()
      .from('challenges')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data }) => setChallenge((data as Challenge | null) ?? 'not-found'));
  }, [slug]);

  // BACKLOG.md #13 -- every player's Dink setup goes through one stable
  // account-wide webhook URL, surfaced right here since this is the page
  // people actually land on to configure Dink.
  useEffect(() => {
    if (!session) {
      setAccountSecret(null);
      return;
    }
    getSupabase()
      .from('profile_secrets')
      .select('dink_secret')
      .eq('profile_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setAccountSecret((data as { dink_secret: string } | null)?.dink_secret ?? null));
  }, [session]);

  if (challenge === null) return null;
  if (challenge === 'not-found') {
    return <p className="mx-auto max-w-lg py-24 text-center text-stone-400">Challenge not found.</p>;
  }

  const accountWebhookUrl = accountSecret ? `${window.location.origin}/api/dink/${accountSecret}` : null;

  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">Set up tracking for {challenge.name}</h1>
        <Link to={`/c/${challenge.slug}`} className="shrink-0 text-sm text-stone-500 underline hover:text-stone-300">
          &larr; back to board
        </Link>
      </div>
      <p className="mt-2 text-sm text-stone-400">
        Everything on your board fills in automatically from RuneLite's <Box>Dink</Box> plugin -- no manual updates.
        It's all copy-pasting a link and checking boxes in Dink's settings, no technical know-how needed.
      </p>

      <div className="mt-6 rounded-lg border border-amber-800/60 bg-amber-950/10 p-4">
        <h2 className="text-sm font-semibold text-amber-400">Your webhook URL</h2>
        {accountWebhookUrl ? (
          <>
            <p className="mt-1 text-xs text-stone-400">
              One URL, set up once -- it works for every challenge you join, current and future, so you never paste
              in a new one again.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                readOnly
                value={accountWebhookUrl}
                onClick={(e) => e.currentTarget.select()}
                className="flex-1 rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 font-mono text-xs text-stone-300"
              />
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(accountWebhookUrl);
                  setAccountCopied(true);
                  setTimeout(() => setAccountCopied(false), 2000);
                }}
                className="shrink-0 rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300"
              >
                {accountCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </>
        ) : (
          <p className="mt-1 text-xs text-stone-400">
            {session ? (
              <>
                Grab your personal webhook URL from{' '}
                <Link to="/account" className="text-amber-400 underline hover:text-amber-300">
                  your Account page
                </Link>{' '}
                and use it in the steps below.
              </>
            ) : (
              <>
                <Link to="/login" className="text-amber-400 underline hover:text-amber-300">
                  Sign in
                </Link>{' '}
                to grab your personal webhook URL -- it works for every challenge you join, current and future.
              </>
            )}
          </p>
        )}
      </div>

      <div className="mt-8 space-y-5 rounded-lg border border-stone-800 bg-stone-900/50 p-4">
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

        {challenge.board_type === 'adventure' ? (
          <Step n={5} title="Required: sync when you log out">
            Find the <Box>Advanced</Box> section (near the bottom). Paste the same link into the box labeled{' '}
            <Box>Custom Metadata Handler</Box>. There's no checkbox to enable -- pasting the link there is enough.
            <p className="mt-2 rounded-lg border border-amber-900/50 bg-amber-950/20 p-2 text-xs text-amber-500/90">
              This one isn't optional for an Adventure board. Each room only starts counting progress once you've
              logged out at least once after reaching it -- the once-daily automatic sync everyone else gets doesn't
              unlock the next room, only a real logout does. Skip this step and you'll be stuck on the first room no
              matter how much progress you make.
            </p>
          </Step>
        ) : (
          <Step n={5} title="Optional: instant sync when you log out">
            Find the <Box>Advanced</Box> section (near the bottom). Paste the same link into the box labeled{' '}
            <Box>Custom Metadata Handler</Box>. There's no checkbox to enable -- pasting the link there is enough. This
            makes your XP/skill/clue stats refresh the instant you log out, instead of waiting for the once-daily
            automatic sync everyone gets regardless.
          </Step>
        )}
      </div>
    </div>
  );
}
