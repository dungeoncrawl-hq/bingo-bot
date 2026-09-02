import { useEffect, useState } from 'react';
import { getSupabase } from '../db/supabaseClient';
import type { Challenge, Tile } from '../db/types';
import {
  checkTile,
  describeTileCondition,
  formatTileGoal,
  formatTileProgress,
  progressPercent,
  type TileStatus,
} from '../lib/tileConditions';
import { computeParticipantStats, type RawParticipantData } from '../lib/participantStats';
import { computeHiscoresRecap, type SnapshotRow } from '../lib/hiscoresRecap';
import { progressColor } from '../lib/progressColor';

interface ParticipantLite {
  id: string;
  rsn: string;
  chosen_lowest_skill: string | null;
  adventure_path: Record<string, 'top' | 'bottom'>;
}

interface Props {
  forkIndex: number;
  topTile: Tile | null;
  bottomTile: Tile | null;
  participants: ParticipantLite[];
  challenge: Challenge;
  firstCompleters: Record<string, string>;
  onClose: () => void;
}

function groupByParticipant<T extends { participant_id: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.participant_id) ?? [];
    list.push(row);
    map.set(row.participant_id, list);
  }
  return map;
}

function rankValue(status: TileStatus, percent: number | null): number {
  return percent ?? (status.done ? 100 : 0);
}

// A fork column shows every participant grouped by whichever lane THEY
// picked (not one shared condition applied to everyone, unlike a regular
// tile) -- self-contained raw-data fetch/compute, same established
// pattern as TileDetailModal, rather than reusing BoardPage's state.
export default function AdventureColumnModal({ forkIndex, topTile, bottomTile, participants, challenge, firstCompleters, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState<Record<string, TileStatus>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const supabase = getSupabase();
    const ids = participants.map((p) => p.id);
    const window = { start: challenge.start_date, end: challenge.end_date };

    (async () => {
      if (ids.length === 0) {
        if (!cancelled) {
          setStatuses({});
          setLoading(false);
        }
        return;
      }
      const [bossKills, slayerTasks, lootDrops, deaths, collectionLogEntries, petObtains, snapshots] = await Promise.all([
        supabase.from('boss_kills').select('participant_id, boss, kc, created_at').in('participant_id', ids),
        supabase.from('slayer_tasks').select('participant_id, created_at').in('participant_id', ids),
        supabase
          .from('loot_drops')
          .select('participant_id, items, total_value, created_at, is_misc, max_single_value')
          .in('participant_id', ids),
        supabase.from('deaths').select('participant_id, created_at').in('participant_id', ids),
        supabase.from('collection_log_entries').select('participant_id, created_at').in('participant_id', ids),
        supabase.from('pet_obtains').select('participant_id, updated_at').in('participant_id', ids),
        supabase
          .from('participant_snapshots')
          .select('participant_id, recorded_on, total_xp, skills, activities')
          .in('participant_id', ids),
      ]);

      const bossKillsByP = groupByParticipant((bossKills.data as ({ participant_id: string } & RawParticipantData['bossKills'][number])[]) ?? []);
      const slayerByP = groupByParticipant((slayerTasks.data as ({ participant_id: string } & RawParticipantData['slayerTasks'][number])[]) ?? []);
      const lootByP = groupByParticipant((lootDrops.data as ({ participant_id: string } & RawParticipantData['lootDrops'][number])[]) ?? []);
      const deathsByP = groupByParticipant((deaths.data as ({ participant_id: string } & RawParticipantData['deaths'][number])[]) ?? []);
      const clogByP = groupByParticipant((collectionLogEntries.data as ({ participant_id: string } & RawParticipantData['collectionLogEntries'][number])[]) ?? []);
      const petsByP = groupByParticipant((petObtains.data as ({ participant_id: string } & RawParticipantData['petObtains'][number])[]) ?? []);
      const snapshotsByP = groupByParticipant((snapshots.data as ({ participant_id: string } & SnapshotRow)[]) ?? []);

      const result: Record<string, TileStatus> = {};
      for (const p of participants) {
        const chosenLane = p.adventure_path[String(forkIndex)];
        const tile = chosenLane === 'top' ? topTile : chosenLane === 'bottom' ? bottomTile : null;
        if (!tile) continue; // hasn't reached/chosen this fork yet, or the host hasn't authored that slot
        const raw: RawParticipantData = {
          bossKills: bossKillsByP.get(p.id) ?? [],
          slayerTasks: slayerByP.get(p.id) ?? [],
          lootDrops: lootByP.get(p.id) ?? [],
          deaths: deathsByP.get(p.id) ?? [],
          collectionLogEntries: clogByP.get(p.id) ?? [],
          petObtains: petsByP.get(p.id) ?? [],
        };
        const hiscoresRecap = computeHiscoresRecap(snapshotsByP.get(p.id) ?? [], window);
        const stats = computeParticipantStats(raw, window, hiscoresRecap, p.chosen_lowest_skill);
        result[p.id] = checkTile(tile.condition, stats);
      }
      if (!cancelled) {
        setStatuses(result);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [forkIndex, topTile, bottomTile, participants, challenge]);

  function tileFor(p: ParticipantLite): Tile | null {
    const chosenLane = p.adventure_path[String(forkIndex)];
    return chosenLane === 'top' ? topTile : chosenLane === 'bottom' ? bottomTile : null;
  }

  const reached = participants.filter((p) => tileFor(p) != null);
  const notReached = participants.filter((p) => tileFor(p) == null);
  const ranked = [...reached].sort((a, b) => {
    const tileA = tileFor(a);
    const tileB = tileFor(b);
    const statusA = statuses[a.id];
    const statusB = statuses[b.id];
    if (!statusA || !statusB || !tileA || !tileB) return 0;
    return (
      rankValue(statusB, progressPercent(tileB.condition, statusB)) - rankValue(statusA, progressPercent(tileA.condition, statusA))
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-xl border border-stone-800 bg-stone-950 p-6"
      >
        <div>
          <h2 className="text-lg font-semibold">Fork {forkIndex + 1}</h2>
          <p className="text-sm text-stone-400">Everyone's progress toward whichever path they picked.</p>
        </div>

        {loading ? (
          <p className="text-sm text-stone-500">Loading progress…</p>
        ) : (
          <ul className="space-y-3">
            {ranked.map((p) => {
              const tile = tileFor(p);
              const status = statuses[p.id];
              if (!tile || !status) return null;
              const chosenLane = p.adventure_path[String(forkIndex)];
              const percent = progressPercent(tile.condition, status);
              const isFirst = status.done && tile.condition.type !== 'freeSpace' && firstCompleters[tile.id] === p.id;
              const baseCaption = formatTileProgress(tile.condition, status) ?? formatTileGoal(tile.condition);
              const caption = status.resolvedSkill
                ? `${baseCaption} (${status.resolvedSkill})`
                : status.needsSkillChoice
                  ? 'tied -- pick a skill'
                  : baseCaption;
              return (
                <li key={p.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 font-medium">
                      {p.rsn}
                      <span className="rounded-full border border-stone-700 px-1.5 py-0.5 text-[10px] uppercase text-stone-500">
                        {chosenLane}
                      </span>
                    </span>
                    <span className="flex items-center gap-1 text-stone-400">
                      {caption}
                      {isFirst ? (
                        <span className="text-amber-400">⭐</span>
                      ) : status.done ? (
                        <span className="text-green-400">✓</span>
                      ) : null}
                    </span>
                  </div>
                  <p className="text-xs text-stone-500">{describeTileCondition(tile.condition)}</p>
                  {percent !== null && (
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-stone-900">
                      <div className="h-full" style={{ width: `${percent}%`, backgroundColor: progressColor(percent) }} />
                    </div>
                  )}
                </li>
              );
            })}
            {notReached.map((p) => (
              <li key={p.id} className="flex items-center justify-between text-sm text-stone-600">
                <span>{p.rsn}</span>
                <span>Not reached yet</span>
              </li>
            ))}
            {participants.length === 0 && <li className="text-sm text-stone-500">No one's joined yet.</li>}
          </ul>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
