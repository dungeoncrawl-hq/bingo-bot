import { skillIconUrl, TOTAL_LEVEL_ICON_URL, PETS_ICON_URL, COINS_ICON_URL, CLUE_ICON_URL, COLLECTION_LOG_ICON_URL } from '../lib/tileIcons';
import { bossActivityIcon } from '../lib/bossActivities';
import AdventureConnector, { AdventureConnectorGap } from './AdventureConnector';

// A non-interactive illustration of an Adventure board's branching room
// path, for HomePage.tsx's hero -- shows the mechanic (a lane fork, a
// live frontier room, locked rooms, boss rooms, and how the path lines
// themselves read) without needing a real challenge to point at. Real
// wiki icons via the same helpers tile authoring uses, the same
// stone-texture-overlay tile recipe BoardPage.tsx's actual grid tiles
// use, and the real AdventureConnector component (not a reimplementation
// of it) so this reads as the real product, not a mockup of it.
//
// Topology mirrors the real small-Adventure layout exactly
// (adventureProgress.ts's ADVENTURE_SMALL_*): two lanes, a boss room,
// two more lanes, a second boss, two more lanes, a final boss.
//
// The story is deliberately sequential and accurate to how completion
// actually reads on the real board: the first room done, a green path to
// a done first boss, a green path to a done second room, an orange
// dashed path into the current (frontier) second boss -- then nothing
// beyond it, since the third fork hasn't been reached yet and there's no
// chosen path to draw a line for.
type NodeState = 'done' | 'frontier' | 'locked';

const STATE_BORDER: Record<NodeState, string> = {
  done: 'border-emerald-500',
  frontier: 'border-amber-500',
  locked: 'border-stone-700',
};

function Node({
  icon,
  label,
  state,
  boss = false,
  bossTag,
  size = 54,
}: {
  icon: string;
  label: string;
  state: NodeState;
  boss?: boolean;
  // "Boss Room" / "Final Boss" -- only set for a boss node. Shown outside
  // the tile, above its own label -- the tile itself holds only the icon.
  bossTag?: string;
  size?: number;
}) {
  const borderClass = boss ? (state === 'done' ? 'border-green-500' : 'border-amber-800') : STATE_BORDER[state];
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div
        className={`relative overflow-hidden rounded-lg border-2 shadow-inner before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/stone-texture.svg')] before:bg-cover before:bg-center before:opacity-30 before:content-[''] ${borderClass} ${state === 'frontier' ? 'animate-pulse' : ''}`}
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
          <div className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded ring-2 ring-stone-950 bg-emerald-500">
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

// The lane a fork's participant didn't pick -- dim, no completion state,
// same "not taken" treatment the real board gives an unchosen lane.
function NotTakenNode({ icon }: { icon: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1 opacity-40">
      <div
        className="relative overflow-hidden rounded-lg border border-stone-800 shadow-inner before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/stone-texture.svg')] before:bg-cover before:bg-center before:opacity-30 before:content-['']"
        style={{ width: 40, height: 40 }}
      >
        <div className="relative flex h-full w-full items-center justify-center">
          <img src={icon} alt="" className="object-contain" style={{ width: 18, height: 18 }} />
        </div>
      </div>
      <span className="text-[8px] text-stone-600">not taken</span>
    </div>
  );
}

// A fork whose lane hasn't been reached/chosen yet -- both lanes equally
// unresolved, same neutral "choose a lane" treatment as before.
function PendingFork({ topIcon, bottomIcon }: { topIcon: string; bottomIcon: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="flex flex-col gap-1.5">
        <div className="relative h-10 w-10 overflow-hidden rounded-lg border border-stone-700 shadow-inner before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/stone-texture.svg')] before:bg-cover before:bg-center before:opacity-30 before:content-['']">
          <div className="relative flex h-full w-full items-center justify-center">
            <img src={topIcon} alt="" className="object-contain opacity-45" style={{ width: 18, height: 18 }} />
          </div>
        </div>
        <div className="relative h-10 w-10 overflow-hidden rounded-lg border border-stone-700 shadow-inner before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/stone-texture.svg')] before:bg-cover before:bg-center before:opacity-30 before:content-['']">
          <div className="relative flex h-full w-full items-center justify-center">
            <img src={bottomIcon} alt="" className="object-contain opacity-45" style={{ width: 18, height: 18 }} />
          </div>
        </div>
      </div>
      <span className="mt-0.5 w-16 text-center text-[8px] text-stone-600">Choose a lane</span>
    </div>
  );
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
          <div className="flex shrink-0 flex-col gap-1.5">
            <Node icon={TOTAL_LEVEL_ICON_URL} label="Total XP" state="done" size={40} />
            <NotTakenNode icon={skillIconUrl('Slayer')} />
          </div>
          <AdventureConnector fromLane="top" toLane="center" variant="done" />
          <Node icon={bossActivityIcon('Zulrah') ?? ''} label="Zulrah" state="done" boss bossTag="Boss Room" size={68} />
          <AdventureConnector fromLane="center" toLane="top" variant="done" />
          <div className="flex shrink-0 flex-col gap-1.5">
            <Node icon={CLUE_ICON_URL} label="Clue Scrolls" state="done" size={40} />
            <NotTakenNode icon={COLLECTION_LOG_ICON_URL} />
          </div>
          <AdventureConnector fromLane="top" toLane="center" variant="toFrontier" />
          <Node icon={bossActivityIcon('Vorkath') ?? ''} label="Vorkath" state="frontier" boss bossTag="Boss Room" size={68} />
          <AdventureConnectorGap />
          <PendingFork topIcon={COINS_ICON_URL} bottomIcon={PETS_ICON_URL} />
          <AdventureConnectorGap />
          <Node icon={bossActivityIcon('Corporeal Beast') ?? ''} label="Corporeal Beast" state="locked" boss bossTag="Final Boss" size={68} />
        </div>
      </div>
    </div>
  );
}
