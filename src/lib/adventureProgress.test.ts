import { describe, expect, it } from 'vitest';
import { resolveFrontier, ADVENTURE_SMALL_LAYOUT, forkIndexForColumn, isBossColumn } from './adventureProgress';
import type { AdventurePath } from './adventureProgress';
import type { AdventureLayout, Tile } from '../db/types';

function tile(layout: AdventureLayout, id = `${layout.column}:${layout.lane}`): Tile {
  return {
    id,
    challenge_id: 'c1',
    label: 'Tile',
    icon: null,
    layout,
    condition: { type: 'freeSpace' },
    points: 1,
    first_completer_bonus: 0,
    created_at: '2026-09-01T00:00:00Z',
  };
}

// One tile per slot of the full canonical layout -- a fully-authored board.
const FULL_TILES: Tile[] = ADVENTURE_SMALL_LAYOUT.map((slot) => tile(slot));

describe('forkIndexForColumn / isBossColumn', () => {
  it('maps fork-lane columns to their fork index', () => {
    expect(forkIndexForColumn(0)).toBe(0);
    expect(forkIndexForColumn(1)).toBe(0);
    expect(forkIndexForColumn(3)).toBe(1);
    expect(forkIndexForColumn(4)).toBe(1);
    expect(forkIndexForColumn(6)).toBe(2);
    expect(forkIndexForColumn(7)).toBe(2);
  });

  it('identifies the three boss columns', () => {
    expect(isBossColumn(2)).toBe(true);
    expect(isBossColumn(5)).toBe(true);
    expect(isBossColumn(8)).toBe(true);
    expect(isBossColumn(0)).toBe(false);
  });
});

describe('resolveFrontier', () => {
  it('needs a lane choice at the very start, before any tile is checkable', () => {
    const result = resolveFrontier(FULL_TILES, {}, new Set());
    expect(result).toEqual({ kind: 'needsLaneChoice', forkIndex: 0 });
  });

  it('resolves the first tile of the chosen lane once picked', () => {
    const path: AdventurePath = { '0': 'top' };
    const result = resolveFrontier(FULL_TILES, path, new Set());
    expect(result.kind).toBe('tile');
    if (result.kind === 'tile') expect(result.tile.layout).toEqual({ column: 0, lane: 'top' });
  });

  it('never surfaces the unchosen lane as the frontier', () => {
    const path: AdventurePath = { '0': 'bottom' };
    const result = resolveFrontier(FULL_TILES, path, new Set());
    expect(result.kind).toBe('tile');
    if (result.kind === 'tile') expect(result.tile.layout).toEqual({ column: 0, lane: 'bottom' });
  });

  it('advances to the second tile of the lane once the first is done', () => {
    const path: AdventurePath = { '0': 'top' };
    const done = new Set(['0:top']);
    const result = resolveFrontier(FULL_TILES, path, done);
    expect(result.kind).toBe('tile');
    if (result.kind === 'tile') expect(result.tile.layout).toEqual({ column: 1, lane: 'top' });
  });

  it('reaches the boss column with no choice needed once both lane tiles are done', () => {
    const path: AdventurePath = { '0': 'top' };
    const done = new Set(['0:top', '1:top']);
    const result = resolveFrontier(FULL_TILES, path, done);
    expect(result.kind).toBe('tile');
    if (result.kind === 'tile') expect(result.tile.layout).toEqual({ column: 2, lane: 'center' });
  });

  it('needs the next lane choice once a boss is cleared', () => {
    const path: AdventurePath = { '0': 'top' };
    const done = new Set(['0:top', '1:top', '2:center']);
    const result = resolveFrontier(FULL_TILES, path, done);
    expect(result).toEqual({ kind: 'needsLaneChoice', forkIndex: 1 });
  });

  it('cascades through multiple already-satisfied tiles/bosses in one call', () => {
    // A participant whose stats already clear several thresholds at once
    // (e.g. a big cumulative-XP tile) should resolve straight past
    // whatever's already done, not stop at the first done tile.
    const path: AdventurePath = { '0': 'top', '1': 'bottom' };
    const done = new Set(['0:top', '1:top', '2:center', '3:bottom']);
    const result = resolveFrontier(FULL_TILES, path, done);
    expect(result.kind).toBe('tile');
    if (result.kind === 'tile') expect(result.tile.layout).toEqual({ column: 4, lane: 'bottom' });
  });

  it('reports incomplete when a slot in the path has no authored tile', () => {
    const missingFirstTile = FULL_TILES.filter((t) => t.id !== '0:top');
    const path: AdventurePath = { '0': 'top' };
    const result = resolveFrontier(missingFirstTile, path, new Set());
    expect(result).toEqual({ kind: 'incomplete' });
  });

  it('does not let a missing slot be silently skipped into a false "clear"', () => {
    // Every slot done except one -- if the resolver ever treats a missing
    // authored tile as "skip past it," this would wrongly report 'clear'.
    const tiles = FULL_TILES.filter((t) => t.id !== '8:center'); // final boss never authored
    const path: AdventurePath = { '0': 'top', '1': 'top', '2': 'top' };
    const done = new Set(FULL_TILES.map((t) => t.id).filter((id) => id !== '8:center'));
    const result = resolveFrontier(tiles, path, done);
    expect(result).toEqual({ kind: 'incomplete' });
  });

  it('reports clear once every tile in the chosen path is done', () => {
    const path: AdventurePath = { '0': 'top', '1': 'top', '2': 'top' };
    const done = new Set(['0:top', '1:top', '2:center', '3:top', '4:top', '5:center', '6:top', '7:top', '8:center']);
    const result = resolveFrontier(FULL_TILES, path, done);
    expect(result).toEqual({ kind: 'clear' });
  });

  it('a lane choice, once made, is never revisited even if progress resets', () => {
    // No "change your pick" concept -- the resolver only ever asks whether
    // path[fork] is set, never re-evaluates it once it is.
    const path: AdventurePath = { '0': 'bottom' };
    const result = resolveFrontier(FULL_TILES, path, new Set());
    expect(result.kind).toBe('tile');
    if (result.kind === 'tile') expect((result.tile.layout as AdventureLayout).lane).toBe('bottom');
  });
});
