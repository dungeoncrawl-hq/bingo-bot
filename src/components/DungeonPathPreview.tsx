import { skillIconUrl, TOTAL_LEVEL_ICON_URL, PETS_ICON_URL, COINS_ICON_URL, CLUE_ICON_URL, COLLECTION_LOG_ICON_URL } from '../lib/tileIcons';
import { bossActivityIcon } from '../lib/bossActivities';
import AdventureConnector from './AdventureConnector';
import { adventureGridColumns, tileColumnLine, LANE_ROW_HEIGHT, LANE_ROW_GAP, TILE_SIZE, BOSS_SIZE, type Lane } from '../lib/adventureGrid';

// A non-interactive illustration of an Adventure board's branching room
// path, for HomePage.tsx's hero -- shows the mechanic (a lane fork, a
// live frontier room, locked rooms, boss rooms, and how the path lines
// themselves read) without needing a real challenge to point at. Real
// wiki icons via the same helpers tile authoring uses, the same
// stone-texture-overlay tile recipe BoardPage.tsx's actual grid tiles
// use, and the SAME CSS Grid + AdventureConnector this illustrates for
// real -- not a reimplementation of either -- so this reads as the real
// product, not a mockup of it. (Six columns here, not the real small
// layout's nine -- this only needs to show the SHAPE, fork/boss/fork/
// boss/fork/boss, not every individual room a real board has.)
//
// The story is deliberately sequential and accurate to how completion
// actually reads on the real board: the first room done, a green path
// to a done first boss, a green path to a done second room, an orange
// dashed path into the current (frontier) second boss -- then nothing
// beyond it, since the third fork hasn't been reached yet and there's
// no chosen path to draw a line for.
const COLUMN_COUNT = 6;
const IS_BOSS_COLUMN = (column: number) => column === 1 || column === 3 || column === 5;

type NodeState = 'done' | 'frontier' | 'locked';

const STATE_BORDER: Record<NodeState, string> = {
  done: 'border-emerald-500',
  frontier: 'border-amber-500',
  locked: 'border-stone-700',
};

// Which lane (if any) is "on path" at each of the 6 columns, and that
// lane's own state -- the single source both this component's layout
// AND its connectors read from, same shape as BoardPage.tsx's real
// onPathInfoForColumn. null means unresolved (column 4's fork hasn't
// been reached) -- a gap touching a null side draws no connector.
const ON_PATH: Record<number, { lane: Lane; done: boolean; isFrontier: boolean } | null> = {
  0: { lane: 'top', done: true, isFrontier: false },
  1: { lane: 'center', done: true, isFrontier: false },
  2: { lane: 'top', done: true, isFrontier: false },
  3: { lane: 'center', done: false, isFrontier: true },
  4: null,
  5: null,
};

function Cell({ lane, column, children }: { lane: Lane; column: number; children: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{ gridColumn: tileColumnLine(column), gridRow: lane === 'top' ? '1 / 2' : lane === 'bottom' ? '2 / 3' : '1 / 3' }}
    >
      {children}
    </div>
  );
}

function Node({
  icon,
  label,
  state,
  boss = false,
  bossTag,
  size = TILE_SIZE,
}: {
  icon: string;
  label: string;
  state: NodeState;
  boss?: boolean;
  // "Boss Room" / "Final Boss" -- only set for a boss node. Shown
  // outside the tile, above its own label -- the tile itself holds only
  // the icon.
  bossTag?: string;
  // Always TILE_SIZE or BOSS_SIZE in practice -- see adventureGrid.ts's
  // own comment on why a tile's box must exactly match its column's
  // track width for a connector to actually meet its edge.
  size?: number;
}) {
  const borderClass = boss ? (state === 'done' ? 'border-green-500' : 'border-amber-800') : STATE_BORDER[state];
  return (
    <div
      className={`relative overflow-visible rounded-lg border-2 shadow-inner before:pointer-events-none before:absolute before:inset-0 before:rounded-lg before:bg-[url('/stone-texture.svg')] before:bg-cover before:bg-center before:opacity-30 before:content-[''] ${borderClass} ${state === 'frontier' ? 'animate-pulse' : ''}`}
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
      <div className="absolute top-full flex flex-col items-center" style={{ width: 72, left: '50%', transform: 'translateX(-50%)', marginTop: 4 }}>
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
    <div
      className="relative overflow-visible rounded-lg border border-stone-800 opacity-40 shadow-inner before:pointer-events-none before:absolute before:inset-0 before:rounded-lg before:bg-[url('/stone-texture.svg')] before:bg-cover before:bg-center before:opacity-30 before:content-['']"
      style={{ width: TILE_SIZE, height: TILE_SIZE }}
    >
      <div className="relative flex h-full w-full items-center justify-center">
        <img src={icon} alt="" className="object-contain" style={{ width: TILE_SIZE * 0.44, height: TILE_SIZE * 0.44 }} />
      </div>
      <span className="absolute top-full mt-1 text-[8px] text-stone-600" style={{ width: 72, left: '50%', transform: 'translateX(-50%)' }}>
        not taken
      </span>
    </div>
  );
}

// A fork whose lane hasn't been reached/chosen yet -- both lanes equally
// unresolved, neutral "choose a lane" treatment, one shared caption
// below both mini-tiles.
function PendingFork({ topIcon, bottomIcon }: { topIcon: string; bottomIcon: string }) {
  return (
    <div className="relative flex flex-col gap-1.5">
      {[topIcon, bottomIcon].map((icon, i) => (
        <div
          key={i}
          className="relative h-10 w-10 overflow-hidden rounded-lg border border-stone-700 shadow-inner before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/stone-texture.svg')] before:bg-cover before:bg-center before:opacity-30 before:content-['']"
        >
          <div className="relative flex h-full w-full items-center justify-center">
            <img src={icon} alt="" className="object-contain opacity-45" style={{ width: 18, height: 18 }} />
          </div>
        </div>
      ))}
      <span className="absolute top-full mt-1 text-center text-[8px] text-stone-600" style={{ width: 72, left: '50%', transform: 'translateX(-50%)' }}>
        Choose a lane
      </span>
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
        <div className="overflow-x-auto pb-9">
          <div
            className="relative grid"
            style={{
              gridTemplateColumns: adventureGridColumns(COLUMN_COUNT, IS_BOSS_COLUMN),
              gridTemplateRows: `${LANE_ROW_HEIGHT}px ${LANE_ROW_HEIGHT}px`,
              rowGap: LANE_ROW_GAP,
            }}
          >
            <Cell lane="top" column={0}>
              <Node icon={TOTAL_LEVEL_ICON_URL} label="Total XP" state="done" />
            </Cell>
            <Cell lane="bottom" column={0}>
              <NotTakenNode icon={skillIconUrl('Slayer')} />
            </Cell>
            <Cell lane="center" column={1}>
              <Node icon={bossActivityIcon('Zulrah') ?? ''} label="Zulrah" state="done" boss bossTag="Boss Room" size={BOSS_SIZE} />
            </Cell>
            <Cell lane="top" column={2}>
              <Node icon={CLUE_ICON_URL} label="Clue Scrolls" state="done" />
            </Cell>
            <Cell lane="bottom" column={2}>
              <NotTakenNode icon={COLLECTION_LOG_ICON_URL} />
            </Cell>
            <Cell lane="center" column={3}>
              <Node icon={bossActivityIcon('Vorkath') ?? ''} label="Vorkath" state="frontier" boss bossTag="Boss Room" size={BOSS_SIZE} />
            </Cell>
            <Cell lane="center" column={4}>
              <PendingFork topIcon={COINS_ICON_URL} bottomIcon={PETS_ICON_URL} />
            </Cell>
            <Cell lane="center" column={5}>
              <Node
                icon={bossActivityIcon('Corporeal Beast') ?? ''}
                label="Corporeal Beast"
                state="locked"
                boss
                bossTag="Final Boss"
                size={BOSS_SIZE}
              />
            </Cell>

            {Array.from({ length: COLUMN_COUNT - 1 }, (_, column) => {
              const from = ON_PATH[column];
              const to = ON_PATH[column + 1];
              if (!from || !to) return null;
              return (
                <AdventureConnector
                  key={column}
                  column={column}
                  fromLane={from.lane}
                  toLane={to.lane}
                  variant={from.done && to.done ? 'done' : from.done && to.isFrontier ? 'toFrontier' : 'neutral'}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
