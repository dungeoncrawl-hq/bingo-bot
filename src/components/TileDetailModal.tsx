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
import { resolveAdventureTileWindow } from '../lib/adventureProgress';

interface ParticipantLite {
  id: string;
  rsn: string;
  chosen_lowest_skill: string | null;
  // Only meaningful for gameMode='team' -- null/absent otherwise.
  team_id?: string | null;
  // Adventure logout-gated reset (BACKLOG.md #4) -- only meaningful when
  // challenge.board_type === 'adventure' (this modal's boss-tile usage).
  // null means either this is the participant's very first tile ever
  // (challenge-wide stats still apply, no baseline needed yet) or their
  // next tile is locked, awaiting a qualifying Dink LOGOUT event --
  // doneTileIdsFor distinguishes the two, same as AdventureColumnModal.
  adventure_baseline_at: string | null;
  adventure_baseline_snapshot: SnapshotRow | null;
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
  // Adventure only (BACKLOG.md #4): this participant has completed at
  // least one earlier tile but hasn't logged out since, so no baseline
  // exists yet to measure progress from -- `status` above is meaningless
  // (computed against a zeroed-out/empty stats object) and must not be
  // shown as if it were real.
  awaitingBaselineReset: boolean;
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

    // Every tile this participant has completed so far, across the whole
    // challenge -- not just this one -- used only to tell "very first
    // tile ever" (challenge-wide stats, no baseline exists yet) apart
    // from "has completed something, needs a baseline" below.
    function doneTileIdsFor(participantId: string): Set<string> {
      return new Set(completions.filter((c) => c.kind === 'tile' && c.participant_id === participantId).map((c) => c.ref));
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
      //
      // Adventure boss tiles (BACKLOG.md #4): once a participant has
      // completed at least one earlier tile, their progress toward
      // whatever's next -- including a boss room -- counts only since
      // their last logout-established baseline, not since the challenge
      // started, same as BoardPage.tsx's own main-grid frontier override
      // and AdventureColumnModal's room tiles. Without this, a boss
      // tile's XP/KC/etc. kept including everything gained since day
      // one, even after the participant had already reset their
      // baseline for it -- exactly the display bug reported live.
      // Standard boards (challenge.board_type !== 'adventure') have no
      // baseline concept at all and always use the challenge-wide window
      // below, unchanged.
      const statsById: Record<string, ParticipantStats> = {};
      const awaitingBaselineResetById: Record<string, boolean> = {};
      for (const id of ids) {
        const raw: RawParticipantData = {
          bossKills: bossKillsByP.get(id) ?? [],
          slayerTasks: slayerByP.get(id) ?? [],
          lootDrops: lootByP.get(id) ?? [],
          deaths: deathsByP.get(id) ?? [],
          collectionLogEntries: clogByP.get(id) ?? [],
          petObtains: petsByP.get(id) ?? [],
        };
        const chosenLowestSkill = participants.find((p) => p.id === id)?.chosen_lowest_skill ?? null;
        const participant = participants.find((p) => p.id === id);
        const participantSnapshots = snapshotsByP.get(id) ?? [];

        if (challenge.board_type === 'adventure' && participant) {
          const doneIds = doneTileIdsFor(id);
          const lastCompletionAt =
            completions
              .filter((c) => c.kind === 'tile' && c.participant_id === id)
              .map((c) => c.completed_at)
              .sort()
              .at(-1) ?? null;
          const resolved = resolveAdventureTileWindow(
            tile.condition,
            doneIds.size,
            window,
            participant.adventure_baseline_at,
            participant.adventure_baseline_snapshot,
            lastCompletionAt,
            participantSnapshots,
          );
          if (resolved.kind === 'ready') {
            statsById[id] = computeParticipantStats(raw, resolved.window, resolved.recap, chosenLowestSkill);
          } else {
            // 'awaiting-baseline' -- a hiscores-backed tile with no
            // baseline yet, so there's no valid window to measure from
            // at all (not even the challenge-wide one, which would just
            // reproduce the same stale-progress bug this exists to fix).
            // Zeroed-out raw data guarantees no progress shows
            // regardless of window; the render below replaces the
            // caption with "Log out to start" and skips the bar entirely.
            awaitingBaselineResetById[id] = true;
            const empty: RawParticipantData = {
              bossKills: [],
              slayerTasks: [],
              lootDrops: [],
              deaths: [],
              collectionLogEntries: [],
              petObtains: [],
            };
            statsById[id] = computeParticipantStats(empty, window, null, chosenLowestSkill);
          }
        } else {
          const hiscoresRecap = computeHiscoresRecap(participantSnapshots, window);
          statsById[id] = computeParticipantStats(raw, window, hiscoresRecap, chosenLowestSkill);
        }
      }

      let result: Row[];
      if (gameMode === 'coop') {
        const status = checkTile(tile.condition, poolStats(Object.values(statsById)));
        const completedAt = completedAtFor(ids);
        result = [{ key: 'pooled', label: 'Everyone', status, completedAt, isFirst: false, awaitingBaselineReset: false }];
      } else if (gameMode === 'team') {
        result = teams
          .map((t) => {
            const memberIds = participants.filter((p) => p.team_id === t.id).map((p) => p.id);
            if (memberIds.length === 0) return null;
            const status = checkTile(tile.condition, poolStats(memberIds.map((id) => statsById[id])));
            const completedAt = completedAtFor(memberIds);
            const winnerId = firstCompleters[tile.id];
            const isFirst = completedAt != null && tile.condition.type !== 'freeSpace' && memberIds.includes(winnerId);
            return { key: t.id, label: t.name, status, completedAt, isFirst, awaitingBaselineReset: false };
          })
          .filter((r): r is Row => r != null);
      } else {
        result = participants.map((p) => ({
          key: p.id,
          awaitingBaselineReset: awaitingBaselineResetById[p.id] ?? false,
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
              const percent = done ? 100 : row.awaitingBaselineReset ? null : progressPercent(tile.condition, status);
              const baseCaption = formatTileProgress(tile.condition, status) ?? formatTileGoal(tile.condition);
              const caption = row.awaitingBaselineReset
                ? 'Log out to start'
                : status.resolvedSkill
                  ? `${baseCaption} (${status.resolvedSkill})`
                  : status.needsSkillChoice
                    ? 'tied -- pick a skill'
                    : baseCaption;
              return (
                <li key={row.key}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{row.label}</span>
                    <span className={`flex items-center gap-1 ${row.awaitingBaselineReset ? 'text-sky-400' : 'text-stone-400'}`}>
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
