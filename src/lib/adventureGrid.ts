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
const TILE_COLUMN_WIDTH = 84;

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
// (columnCount tile tracks + columnCount-1 gap tracks between them).
export function adventureGridColumns(columnCount: number): string {
  const parts: string[] = [];
  for (let i = 0; i < columnCount; i++) {
    if (i > 0) parts.push(`${CONNECTOR_COLUMN_WIDTH}px`);
    parts.push(`${TILE_COLUMN_WIDTH}px`);
  }
  return parts.join(' ');
}
