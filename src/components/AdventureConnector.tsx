// A decorative "hallway" between two adjacent Adventure columns, so the
// board reads as connected rooms rather than a flat grid of tiles. Purely
// structural/decorative -- draws the dungeon's shape (which columns have
// 1 lane vs 2), not any one participant's specific chosen path.
//
// Deliberately simple dashed lines, never diagonal (matches
// DungeonPathPreview.tsx's homepage hero, which this was ported from) --
// a fork/boss transition changes lane COUNT, not each dash's own
// straight-across geometry. When one side is a single boss lane, only
// `min(from, to)` dash(es) are drawn, centered in the row via CSS grid
// rather than measured pixel math; the surrounding flex row already
// stretches every column/connector to the row's tallest sibling, so this
// tracks each lane's real height (labels and all) instead of assuming a
// fixed tile size.
interface Props {
  from: 1 | 2;
  to: 1 | 2;
}

export default function AdventureConnector({ from, to }: Props) {
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
