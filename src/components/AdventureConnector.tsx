// A decorative "hallway" between two adjacent Adventure columns, so the
// board reads as connected rooms rather than a flat grid of tiles. Purely
// structural/decorative -- draws the dungeon's shape (which columns have
// 1 lane vs 2), not any one participant's specific chosen path.
//
// Geometry is analytic, not measured: every tile is a fixed 80px square
// (Tailwind's w-20) with an 8px gap between stacked lanes (gap-2), so a
// 2-lane column's tiles sit at fixed y-offsets within a fixed-height row,
// and a 1-lane (boss) column's single tile centers within that same row
// height -- landing exactly halfway between the other two, which is what
// makes the converging/diverging lines meet cleanly.
const TILE = 80;
const LANE_GAP = 8;
const ROW_HEIGHT = TILE * 2 + LANE_GAP;
const LANE_Y: Record<1 | 2, number[]> = {
  1: [ROW_HEIGHT / 2],
  2: [TILE / 2, TILE + LANE_GAP + TILE / 2],
};
const WIDTH = 32;

interface Props {
  from: 1 | 2;
  to: 1 | 2;
}

export default function AdventureConnector({ from, to }: Props) {
  const fromY = LANE_Y[from];
  const toY = LANE_Y[to];
  // Straight when lane counts match (each lane connects to its own
  // counterpart); otherwise every lane on the 2-lane side connects to the
  // single lane on the 1-lane side (converging into a boss, or diverging
  // out of one).
  const pairs: [number, number][] =
    from === to ? fromY.map((y, i): [number, number] => [y, toY[i]]) : from === 1 ? toY.map((y): [number, number] => [fromY[0], y]) : fromY.map((y): [number, number] => [y, toY[0]]);

  return (
    <svg
      width={WIDTH}
      height={ROW_HEIGHT}
      viewBox={`0 0 ${WIDTH} ${ROW_HEIGHT}`}
      className="shrink-0 self-center"
      aria-hidden="true"
    >
      {pairs.map(([y1, y2], i) => (
        <g key={i}>
          {/* Dark outline first, lighter fill on top -- reads as a
              carved-stone passage rather than a flat line. */}
          <line x1={0} y1={y1} x2={WIDTH} y2={y2} strokeWidth={16} strokeLinecap="round" className="stroke-stone-800" />
          <line x1={0} y1={y1} x2={WIDTH} y2={y2} strokeWidth={10} strokeLinecap="round" className="stroke-stone-700" />
        </g>
      ))}
    </svg>
  );
}
