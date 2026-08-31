import { useState } from 'react';
import type { FormEvent } from 'react';
import { getSupabase } from '../db/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError('');
    const { error: signInError } = await getSupabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-sm py-24 text-center">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="mt-2 text-neutral-400">We sent a sign-in link to {email}.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm py-24">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-neutral-400">Enter your email and we'll send you a link to sign in -- no password needed.</p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <input
          type="email"
          autoFocus
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !email.trim()}
          className="w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-40"
        >
          {submitting ? 'Sending…' : 'Send magic link'}
        </button>
      </form>
    </div>
  );
}
