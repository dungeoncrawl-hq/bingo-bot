// A player's chosen (or per-dungeon-fallback) profile icon, shown on a
// small colored badge -- one shared component so every place a player's
// icon appears (the Adventure "who's here" chip, the leaderboard, both
// tile-detail modals, the host's Players list) stays visually consistent,
// including the padding around the icon itself so it doesn't touch the
// badge's edges.
interface Props {
  iconUrl: string;
  color: string;
  size?: number;
  title?: string;
}

export default function PlayerIcon({ iconUrl, color, size = 16, title }: Props) {
  return (
    <span
      title={title}
      className="inline-flex shrink-0 items-center justify-center rounded p-0.5"
      style={{ width: size, height: size, backgroundColor: color }}
    >
      <img src={iconUrl} alt="" className="h-full w-full object-contain" />
    </span>
  );
}
