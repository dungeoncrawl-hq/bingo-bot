import { skillIconUrl, TOTAL_LEVEL_ICON_URL, PETS_ICON_URL, COINS_ICON_URL, CLUE_ICON_URL, COLLECTION_LOG_ICON_URL } from '../lib/tileIcons';
import { bossActivityIcon } from '../lib/bossActivities';

// A non-interactive illustration of an Adventure board's branching room
// path, for HomePage.tsx's hero -- shows the mechanic (a lane fork, a
// live frontier room, locked rooms, boss rooms) without needing a real
// challenge to point at. Real wiki icons via the same helpers tile
// authoring uses, and the same stone-texture-overlay tile recipe
// BoardPage.tsx's actual grid tiles use, so this reads as the real
// product, not a mockup of it. Topology mirrors the real small-Adventure
// layout exactly (adventureProgress.ts's ADVENTURE_SMALL_*): two lanes,
// a boss room, two more lanes, a second boss, two more lanes, a final
// boss -- not a simplified version of it.
type NodeState = 'done' | 'frontier' | 'locked' | 'boss';

const STATE_BORDER: Record<NodeState, string> = {
  done: 'border-emerald-500',
  frontier: 'border-amber-500',
  locked: 'border-stone-700',
  boss: 'border-amber-800',
};

function Node({
  icon,
  label,
  state,
  bossTag,
  size = 54,
}: {
  icon: string;
  label: string;
  state: NodeState;
  // "Boss Room" / "Final Boss" -- only set when state === 'boss'. Shown
  // outside the tile, above its own label, same as every other tile's
  // label/caption -- the tile itself holds only the icon.
  bossTag?: string;
  size?: number;
}) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div
        className={`relative overflow-hidden rounded-lg border-2 shadow-inner before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/stone-texture.svg')] before:bg-cover before:bg-center before:opacity-30 before:content-[''] ${STATE_BORDER[state]} ${state === 'frontier' ? 'animate-pulse' : ''}`}
        style={{ width: size, height: size }}
      >
        <div className="relative flex h-full w-full items-center justify-center">
          <img
            src={icon}
            alt=""
            className={`object-contain ${state === 'locked' ? 'opacity-45' : ''}`}
            style={{ width: size * 0.44, height: size * 0.44 }}
          />
        </div>
        {state === 'done' && (
          <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded bg-emerald-500">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke="#0c0a09" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex w-16 flex-col items-center">
        {bossTag && <span className="text-[7px] font-bold uppercase tracking-wide text-amber-700">{bossTag}</span>}
        <span
          className={`text-center text-[9px] leading-tight ${state === 'frontier' ? 'font-semibold text-amber-500' : state === 'locked' ? 'text-stone-600' : 'text-stone-500'}`}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

function Fork({ topIcon, bottomIcon }: { topIcon: string; bottomIcon: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="flex flex-col gap-1.5">
        <Node icon={topIcon} label="" state="locked" size={40} />
        <Node icon={bottomIcon} label="" state="locked" size={40} />
      </div>
      <span className="mt-0.5 w-16 text-center text-[8px] text-stone-600">Choose a lane</span>
    </div>
  );
}

function Connector() {
  return <div className="mx-0.5 mb-[17px] h-0 w-5 shrink-0 border-t-2 border-dashed border-stone-700" />;
}

export default function DungeonPathPreview() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-stone-800 bg-stone-900/40 p-6">
      <div className="pointer-events-none absolute inset-0 bg-[url('/stone-texture.svg')] bg-[length:340px] opacity-[0.14]" />
      <div className="relative">
        <p className="mb-4 text-[11px] font-bold uppercase tracking-widest text-stone-600">
          Adventure mode -- a live dungeon path
        </p>
        <div className="flex items-center overflow-x-auto pb-1">
          <Fork topIcon={TOTAL_LEVEL_ICON_URL} bottomIcon={skillIconUrl('Slayer')} />
          <Connector />
          <Node icon={bossActivityIcon('Zulrah') ?? ''} label="Zulrah" state="done" bossTag="Boss Room" size={68} />
          <Connector />
          <Fork topIcon={CLUE_ICON_URL} bottomIcon={COLLECTION_LOG_ICON_URL} />
          <Connector />
          <Node icon={bossActivityIcon('Vorkath') ?? ''} label="Vorkath" state="frontier" bossTag="Boss Room" size={68} />
          <Connector />
          <Fork topIcon={COINS_ICON_URL} bottomIcon={PETS_ICON_URL} />
          <Connector />
          <Node icon={bossActivityIcon('Corporeal Beast') ?? ''} label="Corporeal Beast" state="locked" bossTag="Final Boss" size={68} />
        </div>
      </div>
    </div>
  );
}
