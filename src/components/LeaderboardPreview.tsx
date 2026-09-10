import PlayerChip from './PlayerChip';
import HostBadge from './HostBadge';
import { PLAYER_COLORS } from '../lib/playerColors';

// Illustrative-data leaderboard card for HomePage.tsx's hero section --
// built from the real PlayerChip/HostBadge components (so it's pixel-true
// to what a real board actually renders), fed fabricated rows rather than
// a live fetch, since the homepage has no challenge context to pull from.
const EXAMPLE_ROWS = [
  { name: 'IronBaron', color: PLAYER_COLORS[0], host: true, pts: 14, tiles: '9/9' },
  { name: 'Mossy Bones', color: PLAYER_COLORS[1], host: false, pts: 9, tiles: '6/9' },
  { name: 'Whipstitch', color: PLAYER_COLORS[4], host: false, pts: 3, tiles: '2/9' },
] as const;

export default function LeaderboardPreview() {
  return (
    <div className="rounded-2xl border border-stone-800 bg-stone-900/40 p-5">
      <p className="mb-3.5 text-[11px] font-bold uppercase tracking-widest text-stone-600">Example leaderboard</p>
      <ul className="space-y-2.5 text-sm">
        {EXAMPLE_ROWS.map((row, i) => (
          <li key={row.name} className="flex items-center gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-800 text-[11px] font-bold text-stone-400">
              {i + 1}
            </span>
            <PlayerChip iconUrl={null} color={row.color} participantId={row.name} rsn={row.name} size={22} />
            <span className="font-semibold" style={{ color: row.color }}>
              {row.name}
            </span>
            {row.host && <HostBadge role="Host" size={16} />}
            <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-stone-500">
              {row.pts} pts &middot; {row.tiles} tiles
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 border-t border-stone-800 pt-3.5">
        <p className="mb-2 text-[11px] text-stone-600">Tile progress, at a glance</p>
        <div className="h-1.5 rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500" />
      </div>
    </div>
  );
}
