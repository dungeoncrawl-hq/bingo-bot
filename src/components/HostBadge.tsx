// The small icon next to a host's/co-host's name on a leaderboard or
// participant list. Used to be a bare 👑 emoji -- swapped for a white
// partyhat instead, an OSRS rare-item icon players already recognize as
// a status symbol, so it reads as part of this site's own game-icon
// language (skills, bosses, pets, gear) rather than a generic sticker
// dropped on top of it. Same icon for both roles, same as the emoji it
// replaces -- only the tooltip tells Host and Co-host apart.
const WHITE_PARTYHAT_ICON_URL = 'https://oldschool.runescape.wiki/images/White_partyhat.png';

export default function HostBadge({ role, size = 16 }: { role: 'Host' | 'Co-host'; size?: number }) {
  return (
    <img
      src={WHITE_PARTYHAT_ICON_URL}
      alt={role}
      title={role}
      className="inline-block shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}
