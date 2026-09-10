// The path line between two adjacent on-path Adventure rooms, for the
// VIEWED PARTICIPANT specifically -- unlike a generic "this column has 1
// or 2 lanes" hallway, this only ever draws the one line that's actually
// part of their route (BoardPage.tsx never renders one at all when
// either side's lane hasn't been chosen yet, so an unchosen lane never
// gets a line pointing at it).
//
// Orthogonal, never diagonal: a horizontal run out of the source tile, a
// vertical jog at the midpoint if the two lanes differ (top/bottom/
// center), a horizontal run into the target tile -- collapses to a
// single straight line when both lanes match. Lane position is a
// percentage (top 25 / center 50 / bottom 75) of the connector's own
// height, and the SVG stretches non-uniformly (preserveAspectRatio
// "none") to fill whatever height the row actually is -- horizontal/
// vertical segments stay exactly horizontal/vertical under that kind of
// scale, so this still tracks real tile+label height with no pixel math.
type Lane = 'top' | 'bottom' | 'center';

const LANE_Y: Record<Lane, number> = { top: 25, center: 50, bottom: 75 };

// 'done' -- both ends already cleared. 'toFrontier' -- the source is
// cleared and the target is the current room. 'neutral' -- everything
// else still ahead (locked -> locked, or locked -> frontier isn't
// reachable since the frontier is always the first not-done tile after
// the last done one).
export type ConnectorVariant = 'done' | 'toFrontier' | 'neutral';

const VARIANT_STYLE: Record<ConnectorVariant, { stroke: string; dash?: string; width: number }> = {
  done: { stroke: '#22c55e', width: 3 },
  toFrontier: { stroke: '#f59e0b', dash: '6 4', width: 3 },
  neutral: { stroke: '#44403c', dash: '4 4', width: 2 },
};

interface Props {
  fromLane: Lane;
  toLane: Lane;
  variant: ConnectorVariant;
}

export default function AdventureConnector({ fromLane, toLane, variant }: Props) {
  const fromY = LANE_Y[fromLane];
  const toY = LANE_Y[toLane];
  const style = VARIANT_STYLE[variant];
  return (
    <svg
      width={24}
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="shrink-0 self-stretch"
      style={{ width: 24 }}
      aria-hidden="true"
    >
      <path
        d={`M 0 ${fromY} H 50 V ${toY} H 100`}
        fill="none"
        stroke={style.stroke}
        strokeWidth={style.width}
        strokeDasharray={style.dash}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// A same-width placeholder for a gap with no resolved connector (one or
// both sides haven't been reached/chosen yet) -- keeps column spacing
// identical to a real connector's, just draws nothing.
export function AdventureConnectorGap() {
  return <div className="shrink-0" style={{ width: 24 }} aria-hidden="true" />;
}

// EditChallengePage.tsx's host-authoring grid has no participant/progress
// to color or route a specific lane for -- it's just showing the
// dungeon's overall static shape (which columns are 1 vs 2 lanes) while a
// host places tiles. A plain neutral dash per lane, min(from, to) of them
// so a 2<->1 (fork<->boss) gap draws one centered dash rather than
// guessing which of the 2 lanes it belongs to.
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
