import { LANE_ROW_HEIGHT, LANE_ROW_GAP, CONNECTOR_SPAN_HEIGHT, CONNECTOR_COLUMN_WIDTH, gapColumnLine, type Lane } from '../lib/adventureGrid';

// The path line between two adjacent on-path Adventure rooms, for the
// VIEWED PARTICIPANT specifically. Positioned on a real CSS Grid shared
// with the tiles themselves (BoardPage.tsx's Adventure section,
// DungeonPathPreview.tsx's homepage hero) rather than assumed/estimated
// coordinates -- every tile and every connector sits on the exact same
// grid rows/columns (../lib/adventureGrid.ts), so a connector's
// endpoints are geometrically guaranteed to land on a tile's real
// center. (The previous version scaled an SVG viewBox against a flex
// row's *stretched* height using assumed 25/50/75% lane positions --
// looked right when every tile was the same size, broke the moment
// tile/label heights actually varied, since nothing tied those
// percentages to any tile's real position.)
//
// The grid contract every consumer follows:
// - 2 fixed-height row TRACKS (LANE_ROW_HEIGHT each), separated by
//   LANE_ROW_GAP. A top-lane tile occupies grid-row "1 / 2", a
//   bottom-lane tile "2 / 3", a boss/single-lane tile (or a connector)
//   "1 / 3" (spanning both). Centering a spanning item across two
//   EQUAL-height rows always lands its own center exactly on the
//   boundary between them, regardless of anything sitting in the gap --
//   that equal-height property is what makes this exact rather than
//   another estimate.
// - Each tile "column" (0-8 for the real 9-column small layout) sits on
//   its own grid-column track via tileColumnLine(i); the gap between
//   column i and i+1 sits on the track at gapColumnLine(i).
// - A tile's own label/caption is NOT part of this grid at all -- it's
//   absolutely positioned below the tile's icon box (top: 100%), so its
//   height can vary freely (one line vs. two, a plain label vs. a
//   boss-tag-plus-name) with zero effect on row height or connector
//   alignment. LANE_ROW_GAP just needs to stay tall enough to give that
//   floating label room before the next lane's icon begins.
const LANE_Y: Record<Lane, number> = {
  top: LANE_ROW_HEIGHT / 2,
  center: CONNECTOR_SPAN_HEIGHT / 2,
  bottom: LANE_ROW_HEIGHT + LANE_ROW_GAP + LANE_ROW_HEIGHT / 2,
};

// 'done' -- both ends already cleared. 'toFrontier' -- the source is
// cleared and the target is the current room. 'neutral' -- everything
// else still ahead.
export type ConnectorVariant = 'done' | 'toFrontier' | 'neutral';

const VARIANT_STYLE: Record<ConnectorVariant, { stroke: string; dash?: string; width: number }> = {
  done: { stroke: '#22c55e', width: 3 },
  toFrontier: { stroke: '#f59e0b', dash: '6 4', width: 3 },
  neutral: { stroke: '#44403c', dash: '4 4', width: 2 },
};

interface Props {
  // The tile-column index immediately before this gap -- e.g. column=0
  // draws the connector between tile columns 0 and 1.
  column: number;
  fromLane: Lane;
  toLane: Lane;
  variant: ConnectorVariant;
}

export default function AdventureConnector({ column, fromLane, toLane, variant }: Props) {
  const fromY = LANE_Y[fromLane];
  const toY = LANE_Y[toLane];
  const style = VARIANT_STYLE[variant];
  return (
    <svg
      width={CONNECTOR_COLUMN_WIDTH}
      height={CONNECTOR_SPAN_HEIGHT}
      viewBox={`0 0 ${CONNECTOR_COLUMN_WIDTH} ${CONNECTOR_SPAN_HEIGHT}`}
      style={{ gridColumn: gapColumnLine(column), gridRow: '1 / 3' }}
      aria-hidden="true"
    >
      <path
        d={`M 0 ${fromY} H ${CONNECTOR_COLUMN_WIDTH / 2} V ${toY} H ${CONNECTOR_COLUMN_WIDTH}`}
        fill="none"
        stroke={style.stroke}
        strokeWidth={style.width}
        strokeDasharray={style.dash}
        strokeLinecap="round"
      />
    </svg>
  );
}

// EditChallengePage.tsx's host-authoring grid has no participant/progress
// to color or route a specific lane for -- it's just showing the
// dungeon's static shape (which columns are 1 vs 2 lanes) while a host
// places tiles. Kept on its own older flex-based layout (not the grid
// above), since a plain neutral dash per lane needs none of this
// module's precision: a `min(from, to)`-lane neutral-dashed connector,
// centered via flex stretch rather than fixed geometry.
export function AdventureShapeConnector({ from, to }: { from: 1 | 2; to: 1 | 2 }) {
  const lanes = Math.min(from, to);
  return (
    <div className={`grid shrink-0 self-stretch ${lanes === 2 ? 'grid-rows-2' : 'grid-rows-1'}`} style={{ width: 20 }} aria-hidden="true">
      {Array.from({ length: lanes }, (_, i) => (
        <div key={i} className="flex items-center">
          <div className="h-0 w-full border-t-2 border-dashed border-stone-700" />
        </div>
      ))}
    </div>
  );
}
