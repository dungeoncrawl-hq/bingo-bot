import { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { getSupabase } from '../db/supabaseClient';

interface DayRow {
  date: string;
  challengesCreated: number;
  participantsJoined: number;
}

function toDay(iso: string): string {
  return iso.slice(0, 10);
}

function bucketByDay(dates: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const iso of dates) {
    const day = toDay(iso);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return counts;
}

export default function AdminGrowthPage() {
  const [rows, setRows] = useState<DayRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    Promise.all([supabase.from('challenges').select('created_at'), supabase.from('challenge_participants').select('joined_at')])
      .then(([challenges, participants]) => {
        const challengeDays = bucketByDay(((challenges.data as { created_at: string }[]) ?? []).map((c) => c.created_at));
        const participantDays = bucketByDay(((participants.data as { joined_at: string }[]) ?? []).map((p) => p.joined_at));
        const allDays = new Set([...challengeDays.keys(), ...participantDays.keys()]);
        const merged = [...allDays]
          .map((date) => ({ date, challengesCreated: challengeDays.get(date) ?? 0, participantsJoined: participantDays.get(date) ?? 0 }))
          .sort((a, b) => b.date.localeCompare(a.date));
        setRows(merged);
      })
      .catch((err) => {
        console.error('Failed to load growth stats', err);
        setLoadError(true);
      });
  }, []);

  return (
    <AdminLayout>
      <h1 className="text-2xl font-semibold">Growth</h1>
      <p className="mt-1 text-sm text-stone-500">Days with no challenges created and no one joining are skipped.</p>
      {loadError && <p className="mt-4 text-sm text-red-400">Couldn't load growth stats. Try refreshing the page.</p>}
      {!loadError && !rows && <p className="mt-4 text-stone-500">Loading…</p>}
      {rows && rows.length === 0 && <p className="mt-4 text-stone-500">No activity yet.</p>}
      {rows && rows.length > 0 && (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-stone-800 text-xs uppercase text-stone-500">
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Challenges created</th>
              <th className="py-2 pr-4">Participants joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date} className="border-b border-stone-900">
                <td className="py-2 pr-4">{r.date}</td>
                <td className="py-2 pr-4">{r.challengesCreated}</td>
                <td className="py-2 pr-4">{r.participantsJoined}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminLayout>
  );
}
