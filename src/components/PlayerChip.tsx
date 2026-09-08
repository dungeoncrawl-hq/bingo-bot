import PlayerIcon from './PlayerIcon';
import { colorForParticipant } from '../lib/playerColors';

// The one place that decides what shows next to a player's name across
// every list (leaderboard, participant rosters, tile modals, "who's here"
// chips): their chosen icon on their chosen background, or -- if either
// is unset -- a plain rounded-square chip with their initial letter. A
// missing icon used to mean nothing rendered at all; this replaces that
// gap the same way everywhere instead of leaving it fixed in one spot
// (the Adventure tile chip) and blank in the rest.
//
// `color` is the raw, unresolved profiles.color -- null means "never
// picked one". When there's no icon, no color falls back to plain white
// (the deliberate default for a fully blank profile). When there IS an
// icon but no color, no color instead falls back to colorForParticipant's
// per-dungeon random pick, matching the site's existing "a color is
// chosen automatically" behavior for icon backgrounds.
interface Props {
  iconUrl: string | null;
  color: string | null;
  participantId: string;
  rsn: string;
  size?: number;
  title?: string;
}

export default function PlayerChip({ iconUrl, color, participantId, rsn, size = 16, title }: Props) {
  if (iconUrl) {
    return <PlayerIcon iconUrl={iconUrl} color={color ?? colorForParticipant(participantId)} size={size} title={title} />;
  }
  return (
    <span
      title={title}
      className="inline-flex shrink-0 items-center justify-center rounded font-bold leading-none text-stone-950"
      style={{ width: size, height: size, backgroundColor: color ?? '#ffffff', fontSize: Math.round(size * 0.6) }}
    >
      {rsn.slice(0, 1).toUpperCase()}
    </span>
  );
}
