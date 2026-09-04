import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import AdminLayout from '../components/AdminLayout';
import { getSupabase } from '../db/supabaseClient';
import type { Announcement } from '../db/types';

const inputClass =
  'w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none';

const actionButtonClass =
  'shrink-0 rounded-lg border border-stone-700 px-3 py-1.5 text-xs text-stone-300 disabled:cursor-not-allowed disabled:opacity-40';

export default function AdminAnnouncementsPage() {
  const [rows, setRows] = useState<Announcement[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const { data, error } = await getSupabase().from('announcements').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setRows((data as Announcement[]) ?? []);
    } catch (err) {
      console.error('Failed to load announcements', err);
      setLoadError(true);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    setError('');
    try {
      const { error } = await getSupabase().from('announcements').insert({ title: title.trim(), body: body.trim() });
      if (error) throw error;
      setTitle('');
      setBody('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish(id: string) {
    await getSupabase().from('announcements').update({ published_at: new Date().toISOString() }).eq('id', id);
    await load();
  }

  async function handleUnpublish(id: string) {
    await getSupabase().from('announcements').update({ published_at: null }).eq('id', id);
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this announcement?')) return;
    await getSupabase().from('announcements').delete().eq('id', id);
    await load();
  }

  // Deliberately separate from Publish (and confirmed) -- publishing just
  // changes what's visible on the site, this one fires a real email to
  // every subscribed account and can't be undone.
  async function handleSendEmail(row: Announcement) {
    if (!confirm(`Email every subscribed account about "${row.title}"? This can't be undone.`)) return;
    setSendingId(row.id);
    try {
      const { data: sessionData } = await getSupabase().auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch('/api/announcements/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ announcementId: row.id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? 'Send failed');
      alert(`Emailed ${result.sent} subscriber${result.sent === 1 ? '' : 's'}.`);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSendingId(null);
    }
  }

  return (
    <AdminLayout>
      <h1 className="text-2xl font-semibold">Announcements</h1>
      <p className="mt-1 text-sm text-stone-500">
        Posted to the home page/changelog/RSS feed once published. Emailing subscribers is a separate step below.
      </p>

      <form onSubmit={handleCreate} className="mt-6 space-y-3 rounded-lg border border-stone-800 p-4">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={inputClass} />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="What's new..."
          className={inputClass}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={saving || !title.trim() || !body.trim()}
          className="rounded-lg bg-amber-500 hover:bg-amber-400 transition-colors px-4 py-2 text-sm font-semibold text-stone-950 disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save draft'}
        </button>
      </form>

      {loadError && <p className="mt-4 text-sm text-red-400">Couldn't load announcements. Try refreshing the page.</p>}
      {!loadError && !rows && <p className="mt-4 text-stone-500">Loading…</p>}
      {rows && rows.length === 0 && <p className="mt-4 text-stone-500">No announcements yet.</p>}
      {rows && rows.length > 0 && (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-stone-800 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{r.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-stone-400">{r.body}</p>
                  <p className="mt-2 text-xs text-stone-500">
                    {r.published_at ? `Published ${new Date(r.published_at).toLocaleString()}` : 'Draft'}
                    {r.emailed_at && ` · Emailed ${new Date(r.emailed_at).toLocaleString()}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  {r.published_at ? (
                    <button type="button" onClick={() => handleUnpublish(r.id)} className={actionButtonClass}>
                      Unpublish
                    </button>
                  ) : (
                    <button type="button" onClick={() => handlePublish(r.id)} className={actionButtonClass}>
                      Publish
                    </button>
                  )}
                  {r.published_at && !r.emailed_at && (
                    <button
                      type="button"
                      onClick={() => handleSendEmail(r)}
                      disabled={sendingId === r.id}
                      className={actionButtonClass}
                    >
                      {sendingId === r.id ? 'Sending…' : 'Email subscribers'}
                    </button>
                  )}
                  <button type="button" onClick={() => handleDelete(r.id)} className="shrink-0 text-xs text-red-400 underline">
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminLayout>
  );
}
