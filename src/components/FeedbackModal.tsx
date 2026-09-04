import { useState } from 'react';
import type { FormEvent } from 'react';
import { getSupabase } from '../db/supabaseClient';

interface Props {
  profileId: string;
  onClose: () => void;
}

export default function FeedbackModal({ profileId, onClose }: Props) {
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSaving(true);
    setError('');
    try {
      const { error } = await getSupabase()
        .from('feedback')
        .insert({ profile_id: profileId, page_path: window.location.pathname, message: message.trim() });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-xl border border-stone-800 bg-stone-950 p-6"
      >
        {sent ? (
          <>
            <h2 className="text-lg font-semibold">Thanks!</h2>
            <p className="text-sm text-stone-400">Your feedback's been sent.</p>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Send feedback</h2>
              <p className="mt-1 text-sm text-stone-400">Found a bug, or have an idea? Let us know.</p>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              autoFocus
              placeholder="What's on your mind?"
              className="w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !message.trim()}
                className="rounded-lg bg-amber-500 hover:bg-amber-400 transition-colors px-4 py-2 text-sm font-semibold text-stone-950 disabled:opacity-40"
              >
                {saving ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
