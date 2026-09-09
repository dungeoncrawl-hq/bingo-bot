import { Link } from 'react-router-dom';

interface ConditionInfo {
  name: string;
  detail: string;
}

// Grouped by Dink notifier, matching SetupGuidePage.tsx's own 6 webhook
// sections -- a player who's already set those up can map each group here
// straight back to a checkbox they ticked.
const DINK_GROUPS: { notifier: string; conditions: ConditionInfo[] }[] = [
  {
    notifier: 'Kill Count',
    conditions: [
      { name: 'Total boss KC', detail: 'Every boss and minigame kill/completion added together.' },
      { name: 'Specific boss/minigame KC', detail: 'Kills on one chosen boss or minigame.' },
    ],
  },
  {
    notifier: 'Slayer',
    conditions: [{ name: 'Slayer tasks completed', detail: 'Counts each task turned in to a Slayer master.' }],
  },
  {
    notifier: 'Loot',
    conditions: [
      { name: 'Total loot value', detail: 'Running GP total of everything picked up, added together.' },
      { name: 'Single drop value', detail: "Whether any one drop's own value cleared a GP bar." },
      { name: 'Big drops count', detail: 'How many separate drops each cleared their own GP bar.' },
      { name: 'Specific items', detail: 'Matches drops by name against a host-chosen list of items.' },
    ],
  },
  {
    notifier: 'Collection Log',
    conditions: [{ name: 'New collection log slots', detail: 'Counts newly-unlocked entries, not existing ones.' }],
  },
  {
    notifier: 'Death',
    conditions: [
      { name: 'Max deaths', detail: 'Starts complete and breaks once your death count climbs past the limit.' },
    ],
  },
  {
    notifier: 'Pets',
    conditions: [{ name: 'Pets obtained', detail: "Counts a new pet drop. A duplicate of one you already own doesn't." }],
  },
];

const HISCORES_CONDITIONS: ConditionInfo[] = [
  { name: 'Total XP', detail: 'XP gained across every skill combined.' },
  { name: 'Skill XP', detail: 'XP gained in one chosen skill.' },
  { name: 'Skill levels', detail: 'Levels gained in one chosen skill.' },
  { name: 'Lowest-skill XP', detail: "XP gained in whichever skill was your own lowest when you joined -- picked per player, not by the host." },
  { name: 'Lowest-skill levels', detail: "Levels gained in whichever skill was your own lowest when you joined -- picked per player, not by the host." },
  { name: 'Clue scrolls (any tier / all combined)', detail: 'Clues completed, either one specific tier or every tier added together.' },
  {
    name: 'Guardians of the Rift',
    detail:
      "Rift completions. This one looks like a minigame completion, but Dink's Kill Count notifier can't actually detect it, so it rides the same hiscores sync as XP and clues instead of updating instantly.",
  },
];

function GroupCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-stone-800 bg-stone-900/50 p-4">
      <h3 className="text-sm font-semibold text-stone-200">{title}</h3>
      <ul className="mt-2 space-y-2">{children}</ul>
    </div>
  );
}

function ConditionRow({ c }: { c: ConditionInfo }) {
  return (
    <li className="text-sm">
      <span className="font-medium text-stone-100">{c.name}</span>
      <span className="text-stone-500"> -- {c.detail}</span>
    </li>
  );
}

export default function TrackingInfoPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">How tile tracking works</h1>
        <Link to="/" className="shrink-0 text-sm text-stone-500 underline hover:text-stone-300">
          &larr; back home
        </Link>
      </div>
      <p className="mt-2 text-sm text-stone-400">
        Every tile updates itself from what your account actually does in-game. It gets there through one of two
        different sources, and knowing which one a tile uses explains how fast it should update.
      </p>

      <div className="mt-8 space-y-6">
        <section>
          <h2 className="text-lg font-semibold text-amber-400">Synced instantly from Dink</h2>
          <p className="mt-1 text-sm text-stone-400">
            RuneLite's Dink plugin sends an event the moment something happens in-game -- a kill, a drop, a level.
            These tiles update within seconds, no logout or waiting required, as long as the matching Dink section is
            enabled (see the{' '}
            <span className="text-stone-300">setup guide</span> linked from any dungeon you've joined).
          </p>
          <div className="mt-4 space-y-4">
            {DINK_GROUPS.map((g) => (
              <GroupCard key={g.notifier} title={`Dink's "${g.notifier}" notifier`}>
                {g.conditions.map((c) => (
                  <ConditionRow key={c.name} c={c} />
                ))}
              </GroupCard>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-amber-400">Synced from the OSRS Hiscores</h2>
          <p className="mt-1 text-sm text-stone-400">
            XP, levels, and clues aren't sent by Dink as they happen -- they're read from your account's public
            Hiscores page instead. That refreshes automatically once a day for everyone. If you want it sooner, log
            out with Dink's <span className="text-stone-300">Custom Metadata Handler</span> field set (also in the
            setup guide) and it refreshes the instant you do.
          </p>
          <div className="mt-4">
            <GroupCard title="Hiscores-backed conditions">
              {HISCORES_CONDITIONS.map((c) => (
                <ConditionRow key={c.name} c={c} />
              ))}
            </GroupCard>
          </div>
        </section>

        <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-500/90">
          <span className="font-semibold">On Adventure boards specifically:</span> a Hiscores-backed room only starts
          counting progress once you've logged out at least once after reaching it -- the once-daily automatic sync
          everyone gets doesn't unlock it. A Dink-backed room has no such requirement; it starts counting the moment
          you reach it, no logout needed.
        </div>

        <section>
          <h2 className="text-lg font-semibold text-amber-400">Special tiles</h2>
          <div className="mt-4">
            <GroupCard title="No live data involved">
              <ConditionRow c={{ name: 'Free space', detail: 'Always complete for everyone, from the moment you join.' }} />
              <ConditionRow c={{ name: 'TBD', detail: "A placeholder for a task the host hasn't decided yet. Never completes until they set it." }} />
            </GroupCard>
          </div>
        </section>
      </div>
    </div>
  );
}
