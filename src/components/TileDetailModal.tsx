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
}

interface Props {
  tile: Tile;
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

// A tile's progress, ranked "most to least complete" -- reuses
// progressPercent (already handles maxDeaths' inverted fill direction)
// and falls back to 100/0 for condition types with no meaningful percent
// (singleDropValue/tbd), so a done tile still sorts above a not-done one.
function rankValue(status: TileStatus, percent: number | null): number {
  return percent ?? (status.done ? 100 : 0);
}

export default function TileDetailModal({ tile, participants, challenge, firstCompleters, onClose }: Props) {
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
      for (const id of ids) {
        const raw: RawParticipantData = {
          bossKills: bossKillsByP.get(id) ?? [],
          slayerTasks: slayerByP.get(id) ?? [],
          lootDrops: lootByP.get(id) ?? [],
          deaths: deathsByP.get(id) ?? [],
          collectionLogEntries: clogByP.get(id) ?? [],
          petObtains: petsByP.get(id) ?? [],
        };
        const hiscoresRecap = computeHiscoresRecap(snapshotsByP.get(id) ?? [], window);
        const chosenLowestSkill = participants.find((p) => p.id === id)?.chosen_lowest_skill ?? null;
        const stats = computeParticipantStats(raw, window, hiscoresRecap, chosenLowestSkill);
        result[id] = checkTile(tile.condition, stats);
      }
      if (!cancelled) {
        setStatuses(result);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tile, participants, challenge]);

  const ranked = [...participants].sort((a, b) => {
    const statusA = statuses[a.id];
    const statusB = statuses[b.id];
    if (!statusA || !statusB) return 0;
    return rankValue(statusB, progressPercent(tile.condition, statusB)) - rankValue(statusA, progressPercent(tile.condition, statusA));
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-xl border border-stone-800 bg-stone-950 p-6"
      >
        <div className="flex items-start gap-3">
          {tile.icon && <img src={tile.icon} alt="" className="h-8 w-8 shrink-0" />}
          <div>
            <h2 className="text-lg font-semibold">{tile.label}</h2>
            <p className="text-sm text-stone-400">{describeTileCondition(tile.condition)}</p>
            <p className="text-xs text-stone-500">
              {tile.points} pts
              {tile.first_completer_bonus > 0 && <> · +{tile.first_completer_bonus} bonus for first to complete</>}
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-stone-500">Loading progress…</p>
        ) : (
          <ul className="space-y-3">
            {ranked.map((p) => {
              const status = statuses[p.id];
              if (!status) return null;
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
                    <span className="font-medium">{p.rsn}</span>
                    <span className="flex items-center gap-1 text-stone-400">
                      {caption}
                      {isFirst ? (
                        <span className="text-amber-400">⭐</span>
                      ) : status.done ? (
                        <span className="text-green-400">✓</span>
                      ) : null}
                    </span>
                  </div>
                  {percent !== null && (
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-stone-900">
                      <div className="h-full" style={{ width: `${percent}%`, backgroundColor: progressColor(percent) }} />
                    </div>
                  )}
                </li>
              );
            })}
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
