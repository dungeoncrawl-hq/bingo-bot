import { useEffect, useState } from 'react';
import { getSupabase } from '../db/supabaseClient';
import type { Challenge, Tile } from '../db/types';
import {
  checkTile,
  formatContributionValue,
  formatTileGoal,
  formatTileProgress,
  itemCountModalDescription,
  progressPercent,
  supportsContributionBreakdown,
  type ParticipantStats,
  type TileStatus,
} from '../lib/tileConditions';
import {
  collectionLogEntriesInWindow,
  computeParticipantStats,
  mergeCounts,
  poolStats,
  qualifyingBigDrops,
  type DateWindow,
  type RawParticipantData,
} from '../lib/participantStats';
import { computeHiscoresRecap, type SnapshotRow } from '../lib/hiscoresRecap';
import { progressColor } from '../lib/progressColor';
import { resolveAdventureTileWindow, resolveFrontier } from '../lib/adventureProgress';
import { itemIcon } from '../lib/itemSets';
import PlayerChip from './PlayerChip';

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
  // Which lane this participant picked at each fork -- needed alongside
  // `tiles` below to walk their path with resolveFrontier and tell
  // whether they've actually reached a given boss tile yet (BACKLOG.md
  // #32 fix -- this modal was showing live progress toward a boss room
  // for participants who hadn't reached it at all, using whatever
  // Dink-driven stats they'd racked up since their last completion
  // elsewhere on the path). Only meaningful when challenge.board_type
  // === 'adventure'.
  adventure_path?: Record<string, 'top' | 'bottom'>;
  // BACKLOG.md #22 -- shown next to this row's label, solo mode only (a
  // team/pooled row has no single profile to represent).
  icon_url: string | null;
  // BACKLOG.md #23 -- background shown behind icon_url above, or behind
  // the letter-initial fallback chip when there's no icon (PlayerChip
  // handles both, same as BoardPage.tsx). Not used for text color here --
  // that's leaderboard-only, per how #23 was scoped.
  color: string | null;
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
  // The full board's tiles, not just this one -- BACKLOG.md #32,
  // needed alongside each participant's adventure_path to walk their
  // whole path with resolveFrontier and tell whether they've actually
  // reached this specific boss tile yet. Only consulted when
  // challenge.board_type === 'adventure'; a Standard-board tile is
  // simultaneously relevant to everyone, so this is never needed there.
  tiles?: Tile[];
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

// Stable across every render, unlike an inline `[]` default parameter
// value -- see this file's own `tiles = EMPTY_TILES` comment below.
const EMPTY_TILES: Tile[] = [];

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

// BACKLOG.md #29 -- one pool member's own share of a Coop/Team tile's
// progress (checkTile's own progress number against just their stats),
// shown ranked most-to-least under the pooled/team total above it.
interface ContribEntry {
  key: string;
  rsn: string;
  iconUrl: string | null;
  iconColor: string | null;
  value: number;
}

// bossKcGained only -- which bosses actually made up a "Total Boss KC"
// tile's progress, ranked most kills to least.
interface BossLedgerEntry {
  boss: string;
  kc: number;
}

// singleDropValue only -- every individual drop that itself cleared the
// tile's threshold, ranked biggest to smallest.
interface DropLedgerEntry {
  rsn: string;
  source: string;
  items: string;
  value: number;
}

// collectionLogGained only -- every item that actually landed toward the
// tile, newest first (there's no "value" to rank by the way drops/KC
// have -- recency is the only meaningful order for a log).
interface CollectionLogLedgerEntry {
  rsn: string;
  itemName: string;
  createdAt: string;
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
  // BACKLOG.md #22 -- null for a team/pooled row, same reasoning as
  // ParticipantLite's own icon_url.
  iconUrl: string | null;
  // BACKLOG.md #23/2026-09-08 -- background behind iconUrl (or behind
  // the letter-initial fallback chip when iconUrl is null and
  // participantId isn't -- see PlayerChip).
  iconColor: string | null;
  // Solo-mode participant id, for the fallback chip's colorForParticipant
  // hash and its letter initial. null for a team/pooled row -- there's no
  // single profile to represent, so no chip (fallback or otherwise) shows.
  participantId: string | null;
  // Adventure only (BACKLOG.md #4): this participant has completed at
  // least one earlier tile but hasn't logged out since, so no baseline
  // exists yet to measure progress from -- `status` above is meaningless
  // (computed against a zeroed-out/empty stats object) and must not be
  // shown as if it were real.
  awaitingBaselineReset: boolean;
  // BACKLOG.md #32 -- Adventure only: this participant's path hasn't
  // reached this boss tile at all yet (not even blocked-awaiting-a-
  // logout -- genuinely not there). `status`/the ledgers are all zeroed
  // out/empty rather than reflecting real (but not-yet-relevant) stats.
  // Always false for a Standard-board tile or a Coop/Team row.
  notReached: boolean;
  // BACKLOG.md #29 -- always empty for a solo row (nothing to rank
  // against a pool of one); populated for Coop's single pooled row and
  // each Team row.
  contributions: ContribEntry[];
  // BACKLOG.md #29/#31 -- populated for every row shape (solo/pooled/team)
  // whenever this tile's condition is the relevant type, empty otherwise.
  bossLedger: BossLedgerEntry[];
  dropLedger: DropLedgerEntry[];
  collectionLogLedger: CollectionLogLedgerEntry[];
}

export default function TileDetailModal({
  tile,
  kicker,
  // Not defaulted to a `[]` literal here -- same trap this file's own
  // BoardPage.tsx call site already documents for `teams`: a fresh array
  // reference on every render would sit in the data-fetch effect's
  // dependency array and restart it forever. EMPTY_TILES (module scope,
  // stable) is the same value every render instead.
  tiles = EMPTY_TILES,
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
          .select('participant_id, source, items, total_value, created_at, is_misc, max_single_value')
          .in('participant_id', ids),
        supabase.from('deaths').select('participant_id, created_at').in('participant_id', ids),
        supabase.from('collection_log_entries').select('participant_id, item_name, created_at').in('participant_id', ids),
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
      // BACKLOG.md #29's Big Drop ledger needs each participant's own
      // actual stats window (not just the shared challenge-wide one) to
      // filter their raw loot rows correctly on an Adventure board, where
      // every participant's window can differ.
      const windowById: Record<string, DateWindow> = {};
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
            windowById[id] = resolved.window;
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
            windowById[id] = window;
          }
        } else {
          const hiscoresRecap = computeHiscoresRecap(participantSnapshots, window);
          statsById[id] = computeParticipantStats(raw, window, hiscoresRecap, chosenLowestSkill);
          windowById[id] = window;
        }
      }

      // BACKLOG.md #29 -- a Coop/Team pool's per-member breakdown (ranked
      // most-to-least contribution) plus, for the two condition types
      // where a flat number alone doesn't say what actually happened, a
      // ledger of the underlying events beneath it. Shared across all
      // three gameMode branches below -- memberIds is a single
      // participant's own id for a solo row, so contributionsFor always
      // returns empty there (nothing to rank against), while the ledgers
      // still populate per-participant, same as a pooled row's.
      function contributionsFor(memberIds: string[]): ContribEntry[] {
        if (!supportsContributionBreakdown(tile.condition) || memberIds.length <= 1) return [];
        return memberIds
          .map((id) => {
            const participant = participants.find((p) => p.id === id)!;
            return {
              key: id,
              rsn: participant.rsn,
              iconUrl: participant.icon_url,
              iconColor: participant.color,
              value: checkTile(tile.condition, statsById[id]).progress,
            };
          })
          .filter((c) => c.value > 0)
          .sort((a, b) => b.value - a.value);
      }

      function bossLedgerFor(memberIds: string[]): BossLedgerEntry[] {
        if (tile.condition.type !== 'bossKcGained') return [];
        const merged = mergeCounts(memberIds.map((id) => statsById[id].kcGainedByActivity));
        return Object.entries(merged)
          .map(([boss, kc]) => ({ boss, kc }))
          .sort((a, b) => b.kc - a.kc);
      }

      function dropLedgerFor(memberIds: string[]): DropLedgerEntry[] {
        if (tile.condition.type !== 'singleDropValue') return [];
        const threshold = tile.condition.threshold;
        const entries = memberIds.flatMap((id) => {
          const participant = participants.find((p) => p.id === id)!;
          const w = windowById[id] ?? window;
          return qualifyingBigDrops(lootByP.get(id) ?? [], w, threshold).map((d) => ({
            rsn: participant.rsn,
            source: d.source ?? 'Unknown',
            items: d.items.map((it) => it.name).join(', '),
            value: d.total_value,
          }));
        });
        return entries.sort((a, b) => b.value - a.value);
      }

      function collectionLogLedgerFor(memberIds: string[]): CollectionLogLedgerEntry[] {
        if (tile.condition.type !== 'collectionLogGained') return [];
        const entries = memberIds.flatMap((id) => {
          const participant = participants.find((p) => p.id === id)!;
          const w = windowById[id] ?? window;
          return collectionLogEntriesInWindow(clogByP.get(id) ?? [], w).map((e) => ({
            rsn: participant.rsn,
            itemName: e.item_name ?? 'Unknown item',
            createdAt: e.created_at,
          }));
        });
        return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }

      let result: Row[];
      if (gameMode === 'coop') {
        const status = checkTile(tile.condition, poolStats(Object.values(statsById)));
        const completedAt = completedAtFor(ids);
        result = [
          {
            key: 'pooled',
            label: 'Everyone',
            status,
            completedAt,
            isFirst: false,
            iconUrl: null,
            iconColor: null,
            participantId: null,
            awaitingBaselineReset: false,
            notReached: false,
            contributions: contributionsFor(ids),
            bossLedger: bossLedgerFor(ids),
            dropLedger: dropLedgerFor(ids),
            collectionLogLedger: collectionLogLedgerFor(ids),
          },
        ];
      } else if (gameMode === 'team') {
        result = teams
          .map((t): Row | null => {
            const memberIds = participants.filter((p) => p.team_id === t.id).map((p) => p.id);
            if (memberIds.length === 0) return null;
            const status = checkTile(tile.condition, poolStats(memberIds.map((id) => statsById[id])));
            const completedAt = completedAtFor(memberIds);
            const winnerId = firstCompleters[tile.id];
            const isFirst = completedAt != null && tile.condition.type !== 'freeSpace' && memberIds.includes(winnerId);
            return {
              key: t.id,
              label: t.name,
              status,
              completedAt,
              isFirst,
              iconUrl: null,
              iconColor: null,
              participantId: null,
              awaitingBaselineReset: false,
            notReached: false,
              contributions: contributionsFor(memberIds),
              bossLedger: bossLedgerFor(memberIds),
              dropLedger: dropLedgerFor(memberIds),
              collectionLogLedger: collectionLogLedgerFor(memberIds),
            };
          })
          .filter((r): r is Row => r != null);
      } else {
        // BACKLOG.md #32 -- this modal (unlike AdventureColumnModal.tsx,
        // which already gates its own fork columns via resolveFrontier)
        // was showing live progress toward a boss tile for a participant
        // who hadn't actually reached it yet: statsById[p.id]'s window for
        // a Dink-driven condition falls back to "since their last
        // completion, whatever tile that was" regardless of whether this
        // specific boss room is where their path currently is, so
        // whatever they'd farmed en route to an *earlier* tile counted
        // toward a boss they hadn't unlocked. Standard boards have no
        // frontier concept at all -- every tile is simultaneously live
        // for everyone -- so this only ever applies to an Adventure boss
        // tile (challenge.board_type === 'adventure', this modal's other
        // use case besides Standard boards, per the `kicker` prop).
        result = participants.map((p) => {
          const completedAt = completedAtFor([p.id]);
          let reached = true;
          if (challenge.board_type === 'adventure' && completedAt == null) {
            const doneIds = doneTileIdsFor(p.id);
            const frontier = resolveFrontier(tiles, p.adventure_path ?? {}, doneIds);
            reached = frontier.kind === 'tile' && frontier.tile.id === tile.id;
          }
          return {
            key: p.id,
            awaitingBaselineReset: reached ? (awaitingBaselineResetById[p.id] ?? false) : false,
            notReached: !reached,
            label: p.rsn,
            iconUrl: p.icon_url,
            iconColor: p.color,
            participantId: p.id,
            status: reached ? checkTile(tile.condition, statsById[p.id]) : { done: false, progress: 0, goal: 0 },
            completedAt,
            isFirst: false, // set below, once per row, for solo (needs completedAt first)
            contributions: [],
            bossLedger: reached ? bossLedgerFor([p.id]) : [],
            dropLedger: reached ? dropLedgerFor([p.id]) : [],
            collectionLogLedger: reached ? collectionLogLedgerFor([p.id]) : [],
          };
        });
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
  }, [tile, tiles, participants, challenge, gameMode, teams, firstCompleters, completions]);

  // Done rows (by completedAt, the authoritative tile_completions signal)
  // sort earliest-first -- first to finish at the top, same as the
  // leaderboard's own first-completer bonus rewards. Not-yet-done rows
  // follow, ranked by live progress. A live-recomputed status.done is
  // never trusted here -- see Row's completedAt comment. BACKLOG.md #32:
  // a not-reached-yet row has no real progress to rank by at all, so it
  // sorts after every reached row regardless of its (zeroed-out) status.
  const ranked = [...rows].sort((a, b) => {
    if (a.completedAt != null && b.completedAt != null) return a.completedAt.localeCompare(b.completedAt);
    if ((a.completedAt != null) !== (b.completedAt != null)) return a.completedAt != null ? -1 : 1;
    if (a.notReached !== b.notReached) return a.notReached ? 1 : -1;
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
            <p className="text-sm text-stone-400">{itemCountModalDescription(tile.condition)}</p>
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
              const percent = done ? 100 : row.notReached || row.awaitingBaselineReset ? null : progressPercent(tile.condition, status);
              // Once done, never trust the live-recomputed status for the
              // caption -- same reasoning as percent/done trusting
              // completedAt instead: an Adventure participant can move
              // their baseline forward again for a *later* tile after
              // completing this one, and re-checking this tile against
              // their current window would then show near-zero progress
              // (or a since-changed resolvedSkill) for something already
              // finished. Goal-only text is always safe, whatever the
              // current baseline state is.
              const baseCaption = done ? formatTileGoal(tile.condition) : formatTileProgress(tile.condition, status) ?? formatTileGoal(tile.condition);
              const caption = done
                ? baseCaption
                : row.notReached
                  ? 'Not reached yet'
                  : row.awaitingBaselineReset
                    ? 'Log out to start'
                    : status.resolvedSkill
                      ? `${baseCaption} (${status.resolvedSkill})`
                      : status.needsSkillChoice
                        ? 'tied -- pick a skill'
                        : baseCaption;
              return (
                <li key={row.key}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 font-medium">
                      {row.participantId && (
                        <PlayerChip iconUrl={row.iconUrl} color={row.iconColor} participantId={row.participantId} rsn={row.label} />
                      )}
                      {row.label}
                    </span>
                    <span
                      className={`flex items-center gap-1 ${row.notReached ? 'text-stone-600' : row.awaitingBaselineReset ? 'text-sky-400' : 'text-stone-400'}`}
                    >
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
                  {row.contributions.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-stone-900 pt-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-600">Contributions</p>
                      {row.contributions.map((c) => (
                        <div key={c.key} className="flex items-center justify-between text-xs text-stone-400">
                          <span className="flex items-center gap-1.5">
                            <PlayerChip iconUrl={c.iconUrl} color={c.iconColor} participantId={c.key} rsn={c.rsn} size={12} />
                            {c.rsn}
                          </span>
                          <span>{formatContributionValue(tile.condition, c.value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {row.bossLedger.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-stone-900 pt-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-600">Bosses killed</p>
                      <div className="max-h-28 space-y-1 overflow-y-auto">
                        {row.bossLedger.map((b) => (
                          <div key={b.boss} className="flex items-center justify-between text-xs text-stone-400">
                            <span>{b.boss}</span>
                            <span>{b.kc.toLocaleString()} KC</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {row.dropLedger.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-stone-900 pt-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-600">Qualifying drops</p>
                      <div className="max-h-28 space-y-1 overflow-y-auto">
                        {row.dropLedger.map((d, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 text-xs text-stone-400">
                            <span className="truncate">
                              {row.participantId === null ? `${d.rsn} -- ` : ''}
                              {d.source} -- {d.items}
                            </span>
                            <span className="shrink-0">{formatContributionValue(tile.condition, d.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {row.collectionLogLedger.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-stone-900 pt-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-600">Items added</p>
                      <div className="max-h-28 space-y-1 overflow-y-auto">
                        {row.collectionLogLedger.map((e, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-stone-400">
                            <img src={itemIcon(e.itemName)} alt="" className="h-4 w-4 shrink-0 object-contain" />
                            <span className="truncate">
                              {e.itemName}
                              {row.participantId === null && <span className="text-stone-600"> -- {e.rsn}</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
            {ranked.length === 0 && <li className="text-sm text-stone-500">No one's joined yet.</li>}
          </ul>
        )}

        {tile.condition.type === 'itemCount' && (
          <div className="border-t border-stone-800 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
              Targeted items ({tile.condition.itemNames.length})
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
