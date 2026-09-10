// Shared CSS Grid geometry for an Adventure board's tile layout --
// BoardPage.tsx's real board and DungeonPathPreview.tsx's homepage hero
// both place their tiles (and AdventureConnector.tsx places its
// connector lines) using these exact constants, so a connector's
// endpoints are geometrically guaranteed to land on a tile's real
// center rather than an assumed/estimated position. See
// AdventureConnector.tsx's own header comment for the full contract
// (2 fixed-height lane row tracks, tile/gap columns alternating,
// labels floating below the grid rather than participating in it).
export const LANE_ROW_HEIGHT = 72;
export const LANE_ROW_GAP = 32;
export const CONNECTOR_SPAN_HEIGHT = LANE_ROW_HEIGHT * 2 + LANE_ROW_GAP;
export const CONNECTOR_COLUMN_WIDTH = 28;

// A tile's own rendered box is ALWAYS exactly this many px wide/tall --
// never a different size for done/frontier/locked, which is what
// previously broke connector alignment: a connector always draws right
// up to a column's own boundary, so any tile smaller than its column
// left a visible gap, and boss tiles rendered bigger than their column
// (border-2's extra width on top of a bigger box) overflowed past it,
// drawing over the connector's own line. Making box size == column
// width for both tile "sizes" below is what makes a connector's edge
// and a tile's real edge the same line by construction, with no
// per-tile measuring, inset math, or z-index layering anywhere -- the
// frontier tile keeps its own visual emphasis entirely through its
// border color and the pulse animation, not a size bump.
export const TILE_SIZE = 60;
export const BOSS_SIZE = 96;

export type Lane = 'top' | 'bottom' | 'center';

// Grid line numbers (1-indexed, per the CSS Grid spec) for tile column i
// and the gap immediately after it -- tile/gap tracks alternate, so
// track t (0-indexed) sits at line t+1.
export function tileColumnLine(i: number): number {
  return i * 2 + 1;
}
export function gapColumnLine(i: number): number {
  return i * 2 + 2;
}

// The full grid-template-columns value for `columnCount` tile columns
// (columnCount tile tracks + columnCount-1 gap tracks between them) --
// a boss column's track is sized to BOSS_SIZE, every other column's to
// TILE_SIZE, so whichever size a tile at that column renders itself at
// (see TILE_SIZE/BOSS_SIZE above) always exactly fills its own track.
export function adventureGridColumns(columnCount: number, isBossColumn: (column: number) => boolean): string {
  const parts: string[] = [];
  for (let i = 0; i < columnCount; i++) {
    if (i > 0) parts.push(`${CONNECTOR_COLUMN_WIDTH}px`);
    parts.push(`${isBossColumn(i) ? BOSS_SIZE : TILE_SIZE}px`);
  }
  return parts.join(' ');
}
