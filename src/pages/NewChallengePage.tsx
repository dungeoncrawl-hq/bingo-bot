import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function NewChallengePage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session || !name.trim() || !slug.trim() || !startDate || !endDate) return;
    setSubmitting(true);
    setError('');

    const supabase = getSupabase();
    const { data: existing } = await supabase.from('challenges').select('id').eq('slug', slug).maybeSingle();
    if (existing) {
      setError("That URL is already taken -- try a different one.");
      setSubmitting(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from('challenges')
      .insert({
        host_id: session.user.id,
        name: name.trim(),
        slug: slug.trim(),
        board_type: 'grid5x5',
        start_date: startDate,
        end_date: endDate,
      })
      .select('slug')
      .single();

    setSubmitting(false);
    if (insertError || !data) {
      setError(insertError?.message ?? 'Something went wrong.');
      return;
    }
    navigate(`/c/${data.slug}/edit`);
  }

  return (
    <div className="mx-auto max-w-lg py-12">
      <h1 className="text-2xl font-semibold">New challenge</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm text-stone-400">Name</label>
          <input
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugEdited) setSlug(slugify(e.target.value));
            }}
            className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-stone-400">URL (dungeoncrawl.lol/c/…)</label>
          <input
            required
            value={slug}
            onChange={(e) => {
              setSlug(slugify(e.target.value));
              setSlugEdited(true);
            }}
            className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          />
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm text-stone-400">Start date</label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-stone-400">End date</label>
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-amber-500 hover:bg-amber-400 transition-colors px-4 py-2 text-sm font-semibold text-stone-950 disabled:opacity-40"
        >
          {submitting ? 'Creating…' : 'Create challenge'}
        </button>
      </form>
    </div>
  );
}
