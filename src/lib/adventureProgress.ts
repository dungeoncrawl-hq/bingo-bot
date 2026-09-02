// Adventure board_type (BACKLOG.md #7): a branching path instead of a flat
// grid. Bundles the canonical "small" layout plus the frontier resolver
// together, mirroring how tileConditions.ts already bundles gridLines +
// checkTile + resolveLowestSkill for the Standard board_type.
import type { AdventureLayout, Tile } from '../db/types.js';

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
