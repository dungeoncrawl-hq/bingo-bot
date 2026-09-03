import { useEffect, useState } from 'react';
import { getSupabase } from '../db/supabaseClient';
import type { Challenge, Tile } from '../db/types';
import {
  checkTile,
  describeTileCondition,
  formatTileGoal,
  formatTileProgress,
  progressPercent,
  type ParticipantStats,
  type TileStatus,
} from '../lib/tileConditions';
import { computeParticipantStats, poolStats, type RawParticipantData } from '../lib/participantStats';
import { computeHiscoresRecap, type SnapshotRow } from '../lib/hiscoresRecap';
import { progressColor } from '../lib/progressColor';

interface ParticipantLite {
  id: string;
  rsn: string;
  chosen_lowest_skill: string | null;
  // Only meaningful for gameMode='team' -- null/absent otherwise.
  team_id?: string | null;
}

interface TeamLite {
  id: string;
  name: string;
}

interface CompletionLite {
  participant_id: string;
  kind: 'tile' | 'line' | 'board';
  ref: string;
  completed_at: string;
}

interface Props {
  tile: Tile;
  // Adventure boss rooms only ("First Boss"/"Second Boss"/"Final Boss") --
  // a small label above the tile's own name, since that name is whatever
  // the host chose for the condition (e.g. "Wintertodt KC") and doesn't
  // otherwise say this is a boss room at all. Absent for a Standard-board
  // tile, which this modal is also used for.
  kicker?: string;
  participants: ParticipantLite[];
  challenge: Challenge;
  firstCompleters: Record<string, string>;
  // The challenge's real tile_completions -- the authoritative "is this
  // tile actually done" source (see `completedAtFor` below), rather than
  // trusting a fresh live recompute of raw events, which can go stale
  // once a later Adventure baseline reset moves the stats window past an
  // event that already counted.
  completions: CompletionLite[];
  // 'solo' (default) | 'coop' | 'team' -- BACKLOG.md #10. Coop pools
  // everyone into one aggregate row instead of ranking individuals; Team
  // pools per team_id and ranks one row per team. `teams` is only
  // consulted (for name lookup) when gameMode is 'team'.
  gameMode?: 'solo' | 'coop' | 'team';
  teams?: TeamLite[];
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

interface Row {
  key: string;
  label: string;
  status: TileStatus;
  // From tile_completions, not the live-recomputed status.done above --
  // see the Props.completions comment. null means not actually done yet,
  // regardless of what the live stats sweep says.
  completedAt: string | null;
  isFirst: boolean;
}

export default function TileDetailModal({
  tile,
  kicker,
  participants,
  challenge,
  firstCompleters,
  completions,
  gameMode = 'solo',
  teams = [],
  onClose,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const supabase = getSupabase();
    const ids = participants.map((p) => p.id);
    const window = { start: challenge.start_date, end: challenge.end_date };

    // The earliest completed_at among a set of participant ids for this
    // tile, or null if none of them have completed it -- a pooled
    // (Coop/Team) completion fans out to every pool member at once
    // (challengeProgress.ts's insertForPool), so any member's row is
    // proof the whole pool is done; the earliest one is the true moment.
    function completedAtFor(memberIds: string[]): string | null {
      const rows = completions.filter((c) => c.kind === 'tile' && c.ref === tile.id && memberIds.includes(c.participant_id));
      if (rows.length === 0) return null;
      return rows.reduce((min, r) => (r.completed_at < min ? r.completed_at : min), rows[0].completed_at);
    }

    (async () => {
      if (ids.length === 0) {
        if (!cancelled) {
          setRows([]);
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

      // Every participant's own raw ParticipantStats, computed exactly as
      // today -- pooling (Coop/Team) happens afterward, on these results,
      // never on the raw event rows themselves.
      const statsById: Record<string, ParticipantStats> = {};
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
        statsById[id] = computeParticipantStats(raw, window, hiscoresRecap, chosenLowestSkill);
      }

      let result: Row[];
      if (gameMode === 'coop') {
        const status = checkTile(tile.condition, poolStats(Object.values(statsById)));
        const completedAt = completedAtFor(ids);
        result = [{ key: 'pooled', label: 'Everyone', status, completedAt, isFirst: false }];
      } else if (gameMode === 'team') {
        result = teams
          .map((t) => {
            const memberIds = participants.filter((p) => p.team_id === t.id).map((p) => p.id);
            if (memberIds.length === 0) return null;
            const status = checkTile(tile.condition, poolStats(memberIds.map((id) => statsById[id])));
            const completedAt = completedAtFor(memberIds);
            const winnerId = firstCompleters[tile.id];
            const isFirst = completedAt != null && tile.condition.type !== 'freeSpace' && memberIds.includes(winnerId);
            return { key: t.id, label: t.name, status, completedAt, isFirst };
          })
          .filter((r): r is Row => r != null);
      } else {
        result = participants.map((p) => ({
          key: p.id,
          label: p.rsn,
          status: checkTile(tile.condition, statsById[p.id]),
          completedAt: completedAtFor([p.id]),
          isFirst: false, // set below, once per row, for solo (needs completedAt first)
        }));
        for (const row of result) {
          row.isFirst = row.completedAt != null && tile.condition.type !== 'freeSpace' && firstCompleters[tile.id] === row.key;
        }
      }

      if (!cancelled) {
        setRows(result);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tile, participants, challenge, gameMode, teams, firstCompleters, completions]);

  // Done rows (by completedAt, the authoritative tile_completions signal)
  // sort earliest-first -- first to finish at the top, same as the
  // leaderboard's own first-completer bonus rewards. Not-yet-done rows
  // follow, ranked by live progress. A live-recomputed status.done is
  // never trusted here -- see Row's completedAt comment.
  const ranked = [...rows].sort((a, b) => {
    if (a.completedAt != null && b.completedAt != null) return a.completedAt.localeCompare(b.completedAt);
    if ((a.completedAt != null) !== (b.completedAt != null)) return a.completedAt != null ? -1 : 1;
    return rankValue(b.status, progressPercent(tile.condition, b.status)) - rankValue(a.status, progressPercent(tile.condition, a.status));
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
            {kicker && <p className="text-xs font-semibold uppercase tracking-wide text-red-500">{kicker}</p>}
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
            {ranked.map((row) => {
              const status = row.status;
              const done = row.completedAt != null;
              const percent = done ? 100 : progressPercent(tile.condition, status);
              const baseCaption = formatTileProgress(tile.condition, status) ?? formatTileGoal(tile.condition);
              const caption = status.resolvedSkill
                ? `${baseCaption} (${status.resolvedSkill})`
                : status.needsSkillChoice
                  ? 'tied -- pick a skill'
                  : baseCaption;
              return (
                <li key={row.key}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{row.label}</span>
                    <span className="flex items-center gap-1 text-stone-400">
                      {caption}
                      {row.isFirst ? (
                        <span className="text-amber-400">⭐</span>
                      ) : done ? (
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
            {ranked.length === 0 && <li className="text-sm text-stone-500">No one's joined yet.</li>}
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
