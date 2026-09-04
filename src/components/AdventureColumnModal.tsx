import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../db/supabaseClient';
import type { Challenge, Tile } from '../db/types';
import {
  checkTile,
  conditionNeedsBaseline,
  describeTileCondition,
  formatTileGoal,
  formatTileProgress,
  progressPercent,
  type TileStatus,
} from '../lib/tileConditions';
import { computeParticipantStats, type RawParticipantData } from '../lib/participantStats';
import type { SnapshotRow } from '../lib/hiscoresRecap';
import { progressColor } from '../lib/progressColor';
import { resolveAdventureTileWindow, resolveFrontier } from '../lib/adventureProgress';
import { itemIcon } from '../lib/itemSets';

interface ParticipantLite {
  id: string;
  rsn: string;
  chosen_lowest_skill: string | null;
  adventure_path: Record<string, 'top' | 'bottom'>;
  // Adventure logout-gated reset (BACKLOG.md #4) -- null means this
  // participant's next tile is locked, awaiting a qualifying Dink
  // LOGOUT event. Never consulted for a participant's very first tile
  // ever (doneTileIds.size === 0), same first-tile exemption
  // challengeProgress.ts's own server-side check uses.
  adventure_baseline_at: string | null;
  adventure_baseline_snapshot: SnapshotRow | null;
}

interface CompletionLite {
  participant_id: string;
  kind: 'tile' | 'line' | 'board';
  ref: string;
  completed_at: string;
}

interface Props {
  forkIndex: number;
  // "Room 1" through "Room 6" -- distinct from forkIndex, which two
  // columns of the same fork share (both use it to look up the same lane
  // choice); the title shows each column's own room number instead.
  roomNumber: number;
  topTile: Tile | null;
  bottomTile: Tile | null;
  // The full board's tiles, not just this column's two -- resolveFrontier
  // needs to walk a participant's entire path from the start to know
  // whether they've actually reached this column yet, not just whether
  // they've picked a lane for its fork (a fork's lane choice covers BOTH
  // of its columns at once, so having one doesn't mean the second column
  // has been reached -- see resolveFrontier's own comment).
  tiles: Tile[];
  participants: ParticipantLite[];
  challenge: Challenge;
  firstCompleters: Record<string, string>;
  // The challenge's real tile_completions -- the authoritative "is this
  // tile actually done" source, rather than a fresh live recompute of
  // raw events, which can go stale once a later baseline reset moves the
  // stats window past an event that already counted.
  completions: CompletionLite[];
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
export default function AdventureColumnModal({
  forkIndex,
  roomNumber,
  topTile,
  bottomTile,
  tiles,
  participants,
  challenge,
  firstCompleters,
  completions,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState<Record<string, TileStatus>>({});

  // useCallback with real dependencies, not a plain function -- these are
  // called from the data-fetch effect below, so a fresh reference on
  // every render (the same trap a default `teams = []` prop fell into on
  // TileDetailModal's boss-tile call site) would restart that effect on
  // every render forever, since setLoading/setRows/setStatuses trigger a
  // re-render that would otherwise recreate them each time.
  const tileFor = useCallback(
    (p: ParticipantLite): Tile | null => {
      const chosenLane = p.adventure_path[String(forkIndex)];
      return chosenLane === 'top' ? topTile : chosenLane === 'bottom' ? bottomTile : null;
    },
    [forkIndex, topTile, bottomTile],
  );

  const doneTileIdsFor = useCallback(
    (participantId: string): Set<string> =>
      new Set(completions.filter((c) => c.kind === 'tile' && c.participant_id === participantId).map((c) => c.ref)),
    [completions],
  );

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
        const tile = tileFor(p);
        if (!tile) continue; // hasn't picked a lane for this fork yet, or the host hasn't authored that slot
        const doneIds = doneTileIdsFor(p.id);
        if (doneIds.has(tile.id)) continue; // done -- render uses tile_completions directly, no live stats needed
        const frontier = resolveFrontier(tiles, p.adventure_path, doneIds);
        if (frontier.kind !== 'tile' || frontier.tile.id !== tile.id) continue; // hasn't reached this column yet

        const raw: RawParticipantData = {
          bossKills: bossKillsByP.get(p.id) ?? [],
          slayerTasks: slayerByP.get(p.id) ?? [],
          lootDrops: lootByP.get(p.id) ?? [],
          deaths: deathsByP.get(p.id) ?? [],
          collectionLogEntries: clogByP.get(p.id) ?? [],
          petObtains: petsByP.get(p.id) ?? [],
        };
        const participantSnapshots = snapshotsByP.get(p.id) ?? [];
        const lastCompletionAt =
          completions
            .filter((c) => c.kind === 'tile' && c.participant_id === p.id)
            .map((c) => c.completed_at)
            .sort()
            .at(-1) ?? null;
        const resolved = resolveAdventureTileWindow(
          tile.condition,
          doneIds.size,
          window,
          p.adventure_baseline_at,
          p.adventure_baseline_snapshot,
          lastCompletionAt,
          participantSnapshots,
        );
        if (resolved.kind === 'ready') {
          const stats = computeParticipantStats(raw, resolved.window, resolved.recap, p.chosen_lowest_skill);
          result[p.id] = checkTile(tile.condition, stats);
        }
        // else: 'awaiting-baseline' -- this IS their frontier, but a
        // hiscores-backed tile with no baseline yet, awaiting a
        // qualifying logout. Left out of `statuses` entirely so the
        // render below shows the dedicated "log out to start" state.
      }
      if (!cancelled) {
        setStatuses(result);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [forkIndex, topTile, bottomTile, tiles, participants, challenge, completions, tileFor, doneTileIdsFor]);

  // Three groups, each internally ordered: done (earliest completion
  // first -- tile_completions is the source of truth, never a live
  // recompute, which can go stale once a later baseline reset moves the
  // stats window past an event that already counted), then this
  // column's frontier for whoever's currently working on it (highest
  // progress first), then "awaiting a logout" -- reached but blocked.
  // Never reached at all renders separately, below all three.
  // A participant "reaching" this column means their frontier has
  // actually walked as far as this specific tile (or past it, i.e.
  // done) -- NOT merely having picked a lane for this fork, which
  // happens once for both of a fork's columns at once and says nothing
  // about whether the first one is even finished yet (this is the exact
  // gap that made "Log out to start" show for someone who hadn't
  // actually reached this room).
  interface RankedRow {
    p: ParticipantLite;
    tile: Tile;
    completedAt: string | null;
    awaitingBaselineReset: boolean;
  }
  interface ReachRow {
    p: ParticipantLite;
    tile: Tile | null;
    reached: boolean;
    completedAt: string | null;
    awaitingBaselineReset: boolean;
  }
  const withReachStatus: ReachRow[] = participants.map((p) => {
    const tile = tileFor(p);
    if (!tile) return { p, tile: null, reached: false, completedAt: null, awaitingBaselineReset: false };
    const doneIds = doneTileIdsFor(p.id);
    if (doneIds.has(tile.id)) {
      const completedAt = completions.find((c) => c.kind === 'tile' && c.ref === tile.id && c.participant_id === p.id)?.completed_at ?? null;
      return { p, tile, reached: true, completedAt, awaitingBaselineReset: false };
    }
    const frontier = resolveFrontier(tiles, p.adventure_path, doneIds);
    const isFrontierHere = frontier.kind === 'tile' && frontier.tile.id === tile.id;
    if (!isFrontierHere) return { p, tile, reached: false, completedAt: null, awaitingBaselineReset: false };
    const awaitingBaselineReset = doneIds.size > 0 && conditionNeedsBaseline(tile.condition) && !p.adventure_baseline_at;
    return { p, tile, reached: true, completedAt: null, awaitingBaselineReset };
  });

  const notReached = withReachStatus.filter((r) => !r.reached).map((r) => r.p);
  const rankedRows: RankedRow[] = withReachStatus
    .filter((r) => r.reached && r.tile != null)
    .map((r) => ({ p: r.p, tile: r.tile!, completedAt: r.completedAt, awaitingBaselineReset: r.awaitingBaselineReset }))
    .sort((a, b) => {
      if (a.completedAt != null && b.completedAt != null) return a.completedAt.localeCompare(b.completedAt);
      if ((a.completedAt != null) !== (b.completedAt != null)) return a.completedAt != null ? -1 : 1;
      if (a.awaitingBaselineReset !== b.awaitingBaselineReset) return a.awaitingBaselineReset ? 1 : -1;
      const statusA = statuses[a.p.id];
      const statusB = statuses[b.p.id];
      if (!statusA || !statusB) return 0;
      return rankValue(statusB, progressPercent(b.tile.condition, statusB)) - rankValue(statusA, progressPercent(a.tile.condition, statusA));
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-xl border border-stone-800 bg-stone-950 p-6"
      >
        <div>
          <h2 className="text-lg font-semibold">Room {roomNumber}</h2>
          <p className="text-sm text-stone-400">Everyone's progress toward whichever path they picked.</p>
        </div>

        {loading ? (
          <p className="text-sm text-stone-500">Loading progress…</p>
        ) : (
          <ul className="space-y-3">
            {rankedRows.map(({ p, tile, completedAt, awaitingBaselineReset }) => {
              const status = statuses[p.id];
              const chosenLane = p.adventure_path[String(forkIndex)];
              const done = completedAt != null;
              const percent = done ? 100 : status ? progressPercent(tile.condition, status) : null;
              const isFirst = done && tile.condition.type !== 'freeSpace' && firstCompleters[tile.id] === p.id;
              const baseCaption = status ? formatTileProgress(tile.condition, status) ?? formatTileGoal(tile.condition) : formatTileGoal(tile.condition);
              const caption = awaitingBaselineReset
                ? 'Log out to start'
                : status?.resolvedSkill
                  ? `${baseCaption} (${status.resolvedSkill})`
                  : status?.needsSkillChoice
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
                    <span className={`flex items-center gap-1 ${awaitingBaselineReset ? 'text-sky-400' : 'text-stone-400'}`}>
                      {caption}
                      {isFirst ? (
                        <span className="text-amber-400">⭐</span>
                      ) : done ? (
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

        {(
          [
            { tile: topTile, lane: 'top' },
            { tile: bottomTile, lane: 'bottom' },
          ] as const
        ).map(({ tile, lane }) =>
          tile && tile.condition.type === 'itemCount' ? (
            <div key={lane} className="border-t border-stone-800 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                {lane} -- targeted items ({tile.condition.itemNames.length})
              </p>
              <ul className="max-h-32 space-y-1 overflow-y-auto">
                {tile.condition.itemNames.map((name) => (
                  <li key={name} className="flex items-center gap-2 text-xs text-stone-300">
                    <img src={itemIcon(name)} alt="" className="h-4 w-4 shrink-0 object-contain" />
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
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
