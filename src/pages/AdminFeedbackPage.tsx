import { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { getSupabase } from '../db/supabaseClient';

interface FeedbackRow {
  id: string;
  message: string;
  page_path: string | null;
  created_at: string;
  reviewed: boolean;
  profiles: { display_name: string } | null;
}

export default function AdminFeedbackPage() {
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showReviewed, setShowReviewed] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const { data, error } = await getSupabase()
        .from('feedback')
        .select('id, message, page_path, created_at, reviewed, profiles(display_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRows((data as unknown as FeedbackRow[]) ?? []);
    } catch (err) {
      console.error('Failed to load feedback', err);
      setLoadError(true);
    }
  }

  // Optimistic toggle -- reverted if the write fails, same shape as
  // AdminDiscordTemplatesPage's save flow but per-row instead of a single
  // bulk save.
  async function toggleReviewed(row: FeedbackRow) {
    const next = !row.reviewed;
    setRows((prev) => prev?.map((r) => (r.id === row.id ? { ...r, reviewed: next } : r)) ?? prev);
    const { error } = await getSupabase().from('feedback').update({ reviewed: next }).eq('id', row.id);
    if (error) {
      console.error('Failed to update feedback', error);
      setRows((prev) => prev?.map((r) => (r.id === row.id ? { ...r, reviewed: !next } : r)) ?? prev);
    }
  }

  // Bulk version of the same toggle -- on failure this re-loads from the
  // server rather than trying to hand-revert every optimistically-flipped
  // row individually.
  async function markAllReviewed() {
    const unreviewedIds = rows?.filter((r) => !r.reviewed).map((r) => r.id) ?? [];
    if (unreviewedIds.length === 0) return;
    setRows((prev) => prev?.map((r) => ({ ...r, reviewed: true })) ?? prev);
    const { error } = await getSupabase().from('feedback').update({ reviewed: true }).eq('reviewed', false);
    if (error) {
      console.error('Failed to mark all feedback reviewed', error);
      await load();
    }
  }

  const visible = (rows ?? []).filter(
    (r) => (showReviewed || !r.reviewed) && r.message.toLowerCase().includes(query.toLowerCase()),
  );
  const unreviewedCount = rows?.filter((r) => !r.reviewed).length ?? 0;

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Feedback</h1>
          <p className="mt-1 text-sm text-stone-500">Submitted from the "Feedback" link in the site footer.</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-stone-400">
            <input type="checkbox" checked={showReviewed} onChange={(e) => setShowReviewed(e.target.checked)} />
            Show reviewed
          </label>
          <button
            type="button"
            onClick={markAllReviewed}
            disabled={unreviewedCount === 0}
            className="rounded-lg border border-stone-700 px-3 py-1.5 text-xs text-stone-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Mark all reviewed
          </button>
        </div>
      </div>

      {rows && rows.length > 0 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search messages..."
          className="mt-4 w-full max-w-xs rounded-lg border border-stone-700 bg-stone-900 px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
        />
      )}

      {loadError && <p className="mt-4 text-sm text-red-400">Couldn't load feedback. Try refreshing the page.</p>}
      {!loadError && !rows && <p className="mt-4 text-stone-500">Loading…</p>}
      {rows && visible.length === 0 && <p className="mt-4 text-stone-500">Nothing here.</p>}
      {visible.length > 0 && (
        <ul className="mt-6 space-y-3">
          {visible.map((r) => (
            <li key={r.id} className={`rounded-lg border px-4 py-3 ${r.reviewed ? 'border-stone-900 opacity-50' : 'border-stone-800'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="whitespace-pre-wrap text-sm">{r.message}</p>
                  <p className="mt-1 text-xs text-stone-500">
                    {r.profiles?.display_name ?? 'Unknown'} · {new Date(r.created_at).toLocaleString()}
                    {r.page_path && <> · {r.page_path}</>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleReviewed(r)}
                  className="shrink-0 rounded-lg border border-stone-700 px-3 py-1.5 text-xs text-stone-300"
                >
                  {r.reviewed ? 'Mark unreviewed' : 'Mark reviewed'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminLayout>
  );
}
