// Adventure board_type (BACKLOG.md #7): a branching path instead of a flat
// grid. Bundles the canonical "small" layout plus the frontier resolver
// together, mirroring how tileConditions.ts already bundles gridLines +
// checkTile + resolveLowestSkill for the Standard board_type.
import type { AdventureLayout, Tile } from '../db/types.js';
import { conditionNeedsBaseline, type TileCondition } from './tileConditions.js';
import { computeHiscoresRecap, computeHiscoresRecapFromBaseline, type HiscoresRecap, type SnapshotRow } from './hiscoresRecap.js';
import type { DateWindow } from './participantStats.js';

// 9 columns, shape 2,2,1,2,2,1,2,2,1 -- two 2-tile lanes converging on a
// boss, three times, ending at a final boss. Columns 2/5/8 are bosses (2
// mid-bosses + 1 final); every other column has a top and bottom slot.
export const ADVENTURE_SMALL_COLUMNS = 9;
export const ADVENTURE_SMALL_BOSS_COLUMNS = [2, 5, 8];
export const ADVENTURE_SMALL_FINAL_BOSS_COLUMN = 8;

// Every slot in the canonical small-adventure board, in column order --
// the single source of truth both the board renderer and host-authoring
// grid iterate over to lay out click targets. 15 slots total (3 boss +
// 6 fork columns x 2 lanes), though only 9 are ever "in play" for one
// participant (3 bosses + 2 tiles from whichever lane they picked at
// each of 3 forks).
export const ADVENTURE_SMALL_LAYOUT: AdventureLayout[] = (() => {
  const slots: AdventureLayout[] = [];
  for (let column = 0; column < ADVENTURE_SMALL_COLUMNS; column++) {
    if (ADVENTURE_SMALL_BOSS_COLUMNS.includes(column)) {
      slots.push({ column, lane: 'center' });
    } else {
      slots.push({ column, lane: 'top' }, { column, lane: 'bottom' });
    }
  }
  return slots;
})();

export function isBossColumn(column: number): boolean {
  return ADVENTURE_SMALL_BOSS_COLUMNS.includes(column);
}

// 1 (boss, a single centered slot) or 2 (fork column, top+bottom) -- how
// many lane slots a column actually has, used by the connector graphic
// between columns to know whether to draw a straight, converging, or
// diverging hallway.
export function laneCountForColumn(column: number): 1 | 2 {
  return isBossColumn(column) ? 1 : 2;
}

// "Room 1" through "Room 6" for the small layout's 6 non-boss columns, in
// left-to-right order -- distinct from forkIndexForColumn below, which
// groups a fork's two lane-columns (e.g. 0 and 1) under the same fork
// number since they share one lane choice. Each individual column still
// gets its own room number: column 0 is Room 1, column 1 is Room 2, etc.
export function roomNumberForColumn(column: number): number {
  let n = 0;
  for (let c = 0; c <= column; c++) {
    if (!isBossColumn(c)) n++;
  }
  return n;
}

// "First Boss"/"Second Boss"/"Final Boss" for the small layout's 3 boss
// columns specifically -- ordinal-by-position rather than a lookup by
// column number, though this is still tied to the small layout's exact 3
// bosses (not a generalized "Nth boss" namer for an arbitrary count).
export function bossLabelForColumn(column: number): string {
  const idx = ADVENTURE_SMALL_BOSS_COLUMNS.indexOf(column);
  if (idx === ADVENTURE_SMALL_BOSS_COLUMNS.length - 1) return 'Final Boss';
  return idx === 0 ? 'First Boss' : 'Second Boss';
}

// Fork index (0/1/2 for small) a given fork-lane column belongs to --
// which lane-choice this column's progress is gated behind. Columns 0-1
// -> fork 0, 3-4 -> fork 1, 6-7 -> fork 2; boss columns (2/5/8) aren't
// behind a fork of their own, they're what a fork resolves *into*.
export function forkIndexForColumn(column: number): number {
  return Math.floor(column / 3);
}

function slotKey(l: AdventureLayout): string {
  return `${l.column}:${l.lane}`;
}

export type AdventurePath = Record<string, 'top' | 'bottom'>;

export type FrontierResult =
  | { kind: 'tile'; tile: Tile }
  // The participant has reached a fork (or the very start) and hasn't
  // picked a lane yet -- nothing can be checked until they do.
  | { kind: 'needsLaneChoice'; forkIndex: number }
  // A slot in the participant's actual path (given their lane choices so
  // far) has no tile authored yet -- blocks further progress AND board
  // completion at that point, but doesn't invalidate progress on tiles
  // earlier in the path that already exist. Without this, a naive
  // resolver would skip a missing slot the same way it skips the
  // unchosen lane, letting 'clear' fire even though the host never
  // filled in every slot -- same non-requirement Standard boards already
  // have (a host can publish with empty slots; a 5x5 board only
  // "completes" once all 25 exist and are done).
  | { kind: 'incomplete' }
  // Every slot in the participant's path is authored and done -- the
  // dungeon is cleared.
  | { kind: 'clear' };

// Walks the small-adventure layout in column order, following the
// participant's chosen lane at each fork, and returns their current
// "frontier": the first tile in their path not yet in `doneTileIds`.
// Structurally mirrors resolveLowestSkill in tileConditions.ts --
// participant state in, a resolved value or a "needs a choice" signal
// out. Doesn't touch checkTile/condition evaluation at all; a tile can
// complete the instant it becomes the frontier if the participant's
// stats already clear its bar (same as a freeSpace tile, or any tile
// added mid-challenge, can already complete immediately today).
export function resolveFrontier(tiles: Tile[], path: AdventurePath, doneTileIds: Set<string>): FrontierResult {
  const tileBySlot = new Map(tiles.map((t) => [slotKey(t.layout as AdventureLayout), t]));

  for (const slot of ADVENTURE_SMALL_LAYOUT) {
    if (slot.lane !== 'center') {
      const fork = forkIndexForColumn(slot.column);
      const chosen = path[String(fork)];
      if (!chosen) return { kind: 'needsLaneChoice', forkIndex: fork };
      if (slot.lane !== chosen) continue; // the other lane -- not part of this participant's path
    }
    const tile = tileBySlot.get(slotKey(slot));
    if (!tile) return { kind: 'incomplete' };
    if (!doneTileIds.has(tile.id)) return { kind: 'tile', tile };
  }
  return { kind: 'clear' };
}

export type AdventureTileWindowResult =
  | { kind: 'ready'; window: DateWindow; recap: HiscoresRecap | null }
  // Only ever returned for a hiscores-backed condition (conditionNeedsBaseline
  // === true) whose participant hasn't logged out since reaching it --
  // there's no window to check stats against at all yet.
  | { kind: 'awaiting-baseline' };

// The single decision of "what window (if any) should a frontier tile's
// stats be checked against" -- consolidates what was, before this
// function existed, four near-identical copies (challengeProgress.ts
// server-side, plus live-preview copies in BoardPage.tsx,
// AdventureColumnModal.tsx, and TileDetailModal.tsx), all needing to
// agree with each other exactly or the client can show a state the
// server doesn't actually enforce (or vice versa).
//
// Three cases (BACKLOG.md #4, updated to distinguish Dink-driven
// conditions from hiscores-backed ones -- see conditionNeedsBaseline):
// 1. This is the participant's very first tile ever (doneCount === 0)
//    -- nothing to reset from, checked against the whole challenge
//    window exactly like every non-Adventure board.
// 2. The tile's condition doesn't need hiscores precision
//    (!conditionNeedsBaseline) -- backed by raw Dink-event rows with
//    their own real timestamps, so a window starting at the moment the
//    *previous* tile completed is already fully precise (arguably more
//    precise than a logout-based baseline, which starts at the logout
//    moment, not the actual unlock moment). No logout required. This
//    does NOT change how many tiles one webhook event can complete --
//    that pacing lives entirely in challengeProgress.ts's loop, which
//    still evaluates and stops after one tile per non-logout event
//    regardless of condition type; this function only ever decides
//    whether the *current* frontier tile is checkable right now.
// 3. The tile's condition needs hiscores precision -- unchanged from
//    the original design: blocked until a qualifying Dink LOGOUT event
//    establishes a fresh baseline (adventure_baseline_at/_snapshot).
export function resolveAdventureTileWindow(
  condition: TileCondition,
  doneCount: number,
  challengeWindow: DateWindow,
  baselineAt: string | null,
  baselineSnapshot: SnapshotRow | null,
  lastCompletionAt: string | null,
  snapshots: SnapshotRow[],
): AdventureTileWindowResult {
  if (doneCount === 0) {
    return { kind: 'ready', window: challengeWindow, recap: computeHiscoresRecap(snapshots, challengeWindow) };
  }
  if (!conditionNeedsBaseline(condition)) {
    const window: DateWindow = { start: lastCompletionAt ?? challengeWindow.start, end: challengeWindow.end };
    return { kind: 'ready', window, recap: null };
  }
  if (!baselineAt) return { kind: 'awaiting-baseline' };
  const recap = baselineSnapshot ? computeHiscoresRecapFromBaseline(baselineSnapshot, snapshots) : null;
  return { kind: 'ready', window: { start: baselineAt, end: challengeWindow.end }, recap };
}
