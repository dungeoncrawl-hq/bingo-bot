import { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { getSupabase } from '../db/supabaseClient';
import { buildCumulativeSeries } from '../lib/growthChart';

interface DayRow {
  date: string;
  signups: number;
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

// Hand-rolled inline SVG rather than a charting library -- matches this
// codebase's existing zero-dependency approach to graphics (boardImage.ts
// hand-rolls PNG pixel math the same way) for what's only ever ~2 lines
// and a handful of points.
const CHART_WIDTH = 640;
const CHART_HEIGHT = 220;
const PAD_LEFT = 32;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;

export default function AdminGrowthPage() {
  const [rows, setRows] = useState<DayRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    Promise.all([
      supabase.from('profiles').select('created_at'),
      supabase.from('challenges').select('created_at'),
      supabase.from('challenge_participants').select('joined_at'),
    ])
      .then(([profiles, challenges, participants]) => {
        const signupDays = bucketByDay(((profiles.data as { created_at: string }[]) ?? []).map((p) => p.created_at));
        const challengeDays = bucketByDay(((challenges.data as { created_at: string }[]) ?? []).map((c) => c.created_at));
        const participantDays = bucketByDay(((participants.data as { joined_at: string }[]) ?? []).map((p) => p.joined_at));
        const allDays = new Set([...signupDays.keys(), ...challengeDays.keys(), ...participantDays.keys()]);
        const merged = [...allDays]
          .map((date) => ({
            date,
            signups: signupDays.get(date) ?? 0,
            challengesCreated: challengeDays.get(date) ?? 0,
            participantsJoined: participantDays.get(date) ?? 0,
          }))
          .sort((a, b) => b.date.localeCompare(a.date));
        setRows(merged);
      })
      .catch((err) => {
        console.error('Failed to load growth stats', err);
        setLoadError(true);
      });
  }, []);

  const totals = rows?.reduce(
    (acc, r) => ({
      signups: acc.signups + r.signups,
      dungeons: acc.dungeons + r.challengesCreated,
      joins: acc.joins + r.participantsJoined,
    }),
    { signups: 0, dungeons: 0, joins: 0 },
  );

  const series = rows ? buildCumulativeSeries(rows.map((r) => ({ date: r.date, signups: r.signups, dungeonsCreated: r.challengesCreated }))) : [];
  const maxY = Math.max(1, ...series.map((p) => p.cumSignups), ...series.map((p) => p.cumDungeons));
  const innerW = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
  const innerH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const x = (i: number) => PAD_LEFT + (series.length === 1 ? 0 : (i / (series.length - 1)) * innerW);
  const y = (v: number) => PAD_TOP + innerH - (v / maxY) * innerH;
  const path = (values: number[]) => values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  return (
    <AdminLayout>
      <h1 className="text-2xl font-semibold">Growth</h1>
      <p className="mt-1 text-sm text-stone-500">Signups, dungeons created, and joins over time. Days with no activity are skipped.</p>
      {loadError && <p className="mt-4 text-sm text-red-400">Couldn't load growth stats. Try refreshing the page.</p>}
      {!loadError && !rows && <p className="mt-4 text-stone-500">Loading…</p>}
      {rows && rows.length === 0 && <p className="mt-4 text-stone-500">No activity yet.</p>}
      {rows && rows.length > 0 && totals && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-stone-800 bg-stone-900 px-4 py-3">
              <p className="text-xs uppercase text-stone-500">Total signups</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{totals.signups.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-stone-800 bg-stone-900 px-4 py-3">
              <p className="text-xs uppercase text-stone-500">Dungeons created</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{totals.dungeons.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-stone-800 bg-stone-900 px-4 py-3">
              <p className="text-xs uppercase text-stone-500">Joins recorded</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{totals.joins.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-stone-800 bg-stone-900 px-4 py-3">
              <p className="text-xs uppercase text-stone-500">Active days</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{rows.length.toLocaleString()}</p>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-stone-800 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-stone-200">Cumulative signups &amp; dungeons</h2>
              <div className="flex items-center gap-3 text-[11px] text-stone-500">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Signups
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                  Dungeons
                </span>
              </div>
            </div>
            <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="mt-2 h-56 w-full">
              {[0, 1, 2, 3, 4].map((g) => {
                const gy = PAD_TOP + innerH * (g / 4);
                return (
                  <g key={g}>
                    <line x1={PAD_LEFT} y1={gy} x2={CHART_WIDTH - PAD_RIGHT} y2={gy} stroke="#292524" strokeWidth={1} />
                    <text x={PAD_LEFT - 6} y={gy + 3} fontSize={9} fill="#78716c" textAnchor="end">
                      {Math.round(maxY * (1 - g / 4))}
                    </text>
                  </g>
                );
              })}
              <path d={path(series.map((p) => p.cumDungeons))} fill="none" stroke="#38bdf8" strokeWidth={2} />
              <path d={path(series.map((p) => p.cumSignups))} fill="none" stroke="#f59e0b" strokeWidth={2} />
              {series.map((p, i) => (
                <g key={p.date}>
                  <circle cx={x(i)} cy={y(p.cumSignups)} r={2.5} fill="#f59e0b" />
                  <circle cx={x(i)} cy={y(p.cumDungeons)} r={2.5} fill="#38bdf8" />
                </g>
              ))}
              {series.map((p, i) =>
                i === 0 || i === series.length - 1 || i % 2 === 0 ? (
                  <text key={p.date} x={x(i)} y={CHART_HEIGHT - 6} fontSize={9} fill="#78716c" textAnchor="middle">
                    {new Date(`${p.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                  </text>
                ) : null,
              )}
            </svg>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-800 text-xs uppercase text-stone-500">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Signups</th>
                  <th className="py-2 pr-4">Dungeons created</th>
                  <th className="py-2 pr-4">Participants joined</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.date} className="border-b border-stone-900">
                    <td className="py-2 pr-4">{r.date}</td>
                    <td className="py-2 pr-4">{r.signups}</td>
                    <td className="py-2 pr-4">{r.challengesCreated}</td>
                    <td className="py-2 pr-4">{r.participantsJoined}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
