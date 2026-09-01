import { Link } from 'react-router-dom';

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">About us</h1>
        <Link to="/" className="shrink-0 text-sm text-stone-500 underline hover:text-stone-300">
          &larr; back home
        </Link>
      </div>

      <div className="mt-6 space-y-4 text-sm text-stone-400">
        <p>
          Dungeon Crawl is a small, no-frills way to run OSRS bingo and challenge boards with your friends -- host a
          board, invite your group, and watch it fill in on its own.
        </p>
        <p>
          Every tile syncs automatically from RuneLite's Dink plugin, so nobody's manually updating a spreadsheet or
          screenshotting drops. Just play, and the board catches up.
        </p>
        <p>Built by a player who got tired of tracking bingo progress by hand.</p>
      </div>
    </div>
  );
}
