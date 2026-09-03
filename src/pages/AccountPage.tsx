import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';

export default function AccountPage() {
  const { session, profile, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [defaultRsn, setDefaultRsn] = useState('');
  const [rsnSaving, setRsnSaving] = useState(false);
  const [rsnSaved, setRsnSaved] = useState(false);
  const [rsnError, setRsnError] = useState('');
  const [dinkSecret, setDinkSecret] = useState<string | null>(null);
  const [webhookCopied, setWebhookCopied] = useState(false);

  useEffect(() => {
    if (session?.user.email) setEmail(session.user.email);
  }, [session]);

  useEffect(() => {
    if (profile) setDefaultRsn(profile.default_rsn ?? '');
  }, [profile]);

  // BACKLOG.md #13 -- one stable per-account webhook, separate from
  // profiles (which is public-read) since this secret lets whoever holds
  // it inject events into every challenge this account participates in.
  // "self read only" RLS (profile_secrets) is what makes this fetch work
  // for the signed-in user and no one else.
  useEffect(() => {
    if (!session) return;
    getSupabase()
      .from('profile_secrets')
      .select('dink_secret')
      .eq('profile_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setDinkSecret((data as { dink_secret: string } | null)?.dink_secret ?? null));
  }, [session]);

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;

  async function handleChangeEmail(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || email.trim() === session?.user.email) return;
    setEmailSaving(true);
    setEmailError('');
    // Changing email goes through Supabase's own auth.users, not a plain
    // profiles field update -- it sends a confirmation link to the new
    // address, and the change doesn't actually take effect until that's
    // clicked.
    const { error } = await getSupabase().auth.updateUser({ email: email.trim() });
    setEmailSaving(false);
    if (error) {
      setEmailError(error.message);
      return;
    }
    setEmailSent(true);
  }

  async function handleSaveDefaultRsn(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setRsnSaving(true);
    setRsnError('');
    const { error } = await getSupabase()
      .from('profiles')
      .update({ default_rsn: defaultRsn.trim() || null })
      .eq('id', session.user.id);
    setRsnSaving(false);
    if (error) {
      setRsnError(error.message);
      return;
    }
    setRsnSaved(true);
    setTimeout(() => setRsnSaved(false), 2000);
  }

  return (
    <div className="mx-auto max-w-lg py-12">
      <h1 className="text-2xl font-semibold">Account</h1>

      <div className="mt-8 max-w-md">
        <h2 className="text-sm font-semibold text-stone-300">Email</h2>
        {emailSent ? (
          <p className="mt-2 text-sm text-stone-400">
            Check {email} for a confirmation link -- your email won't change until you click it.
          </p>
        ) : (
          <form onSubmit={handleChangeEmail} className="mt-2 flex gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={emailSaving || !email.trim() || email.trim() === session.user.email}
              className="shrink-0 rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300 disabled:opacity-40"
            >
              {emailSaving ? 'Saving…' : 'Save'}
            </button>
          </form>
        )}
        {emailError && <p className="mt-1 text-sm text-red-400">{emailError}</p>}
      </div>

      <div className="mt-8 max-w-md">
        <h2 className="text-sm font-semibold text-stone-300">Default RSN</h2>
        <p className="mt-1 text-xs text-stone-500">Pre-fills the join form so you don't have to retype it for every new challenge.</p>
        <form onSubmit={handleSaveDefaultRsn} className="mt-2 flex gap-2">
          <input
            value={defaultRsn}
            onChange={(e) => setDefaultRsn(e.target.value)}
            placeholder="Your OSRS username"
            className="flex-1 rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={rsnSaving}
            className="shrink-0 rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300 disabled:opacity-40"
          >
            {rsnSaving ? 'Saving…' : rsnSaved ? 'Saved ✓' : 'Save'}
          </button>
        </form>
        {rsnError && <p className="mt-1 text-sm text-red-400">{rsnError}</p>}
      </div>

      {dinkSecret && (
        <div className="mt-8 max-w-md">
          <h2 className="text-sm font-semibold text-stone-300">Your Dink webhook URL</h2>
          <p className="mt-1 text-xs text-stone-500">
            Paste this into the same Dink fields any challenge's setup guide lists (Slayer, Pets, Kill Count, Death,
            Collection Log, Loot -- plus Advanced &gt; Custom Metadata Handler for instant logout sync). It works for
            every challenge you join, now and in the future -- no need to add a new link each time.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={`${window.location.origin}/api/dink/${dinkSecret}`}
              onClick={(e) => e.currentTarget.select()}
              className="flex-1 rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 font-mono text-xs text-stone-300"
            />
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(`${window.location.origin}/api/dink/${dinkSecret}`);
                setWebhookCopied(true);
                setTimeout(() => setWebhookCopied(false), 2000);
              }}
              className="shrink-0 rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300"
            >
              {webhookCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
