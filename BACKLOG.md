# Backlog

Ideas and known gaps not yet scheduled into a milestone. Not prioritized/
ordered -- just captured so they don't get lost.

## Tile mechanics
1. Hidden/mystery tiles -- a tile that doesn't reveal itself until some
   trigger happens. Needs further design (what triggers it? does it show
   as a blank slot, a "?" placeholder, or not appear in the grid at
   all?). Worth a look at Adventure mode's gating
   (`src/lib/adventureProgress.ts`, shipped) for a ready-made answer to
   "what triggers it": a tile past a participant's current frontier is
   already conceptually hidden (not yet relevant) purely by sequence --
   may not need its own new trigger concept at all, at least for
   Adventure boards.
2. Improve the logic around the "Obtain a set of items" (`itemCount`)
   condition -- currently just a flat comma-separated item-name list
   matched case-insensitively against loot; needs a closer look (exact
   scope TBD).
3. Restrict `lootValueGained`/`singleDropValue`/`xpGained`-style GP and
   XP thresholds to increments of 1,000 instead of any raw number a
   host types in. In `TileEditorForm.tsx`, replace the free-typed
   number with a denomination selector (K/M) plus a value, so the host
   picks e.g. "100" + "M" to form a 100,000,000 threshold instead of
   typing the full number by hand.

## Host tooling
Items 4-6 were scoped before board types (Adventure mode, shipped) or
game modes (Coop/Team, also shipped) existed -- none of them currently
say what "randomize"/"library"/"copy" means for anything but a Standard/
solo board. Simplest path: scope all three to Standard + solo only for
v1, same deferral Coop/Team's own scope already applied to combining
Adventure with a game mode -- an Adventure
board's "random tile" needs different pools per lane/boss, and copying
a challenge needs to carry `board_type`/`board_size`/`game_mode`
forward, not just tiles, once those exist to copy.

4. "Randomize a board" starting point -- host picks random tiles/
   conditions to seed a new board, then edits/tweaks from there instead
   of starting from a fully blank grid.
5. A library of pre-made boards hosts can pick from to start a challenge.
6. "Copy a past challenge" -- start a new challenge that mirrors an
   existing/past board's tiles instead of rebuilding it from scratch.

## Anti-abuse
7. Whether/who to email when a participant's screenshot count crosses a
   concerning threshold -- detection itself already shipped
   (`increment_screenshot_stats`, the ⚠ badge on `EditChallengePage.tsx`'s
   Players list, a console.warn every 10th screenshot), this is just the
   open notification-behavior question: email the player, the host, both,
   or leave it at the badge/log the host already has? The site-admin
   dashboard (shipped -- `/dungeon-master-admin`, cross-challenge
   screenshot/webhook-volume visibility) was the planned prerequisite for
   deciding this with real aggregate data instead of a guess -- now that
   it exists, this question is actually ready to resolve.

## Notifications
8. Full rewrite of Discord notification content (`discordEmbeds.ts`) --
   keep the current embed structure (title/description/fields/image),
   but replace the fixed flavor-text lines (e.g. "Aren't they just
   showing off at this point?") with randomized joke/banter variants
   pulled from a pool, to lean into the site's ".lol" branding. Design
   this aware of the other things already reshaping the same flavor
   text: Adventure's boss-vs-regular-tile swap and Coop/Team's solo/
   "the group"/"Team X" subject swap -- both shipped. Two independent
   dimensions (is-boss x who's-the-subject) that both already exist --
   the banter pool needs to be parameterized by both, not bolted on
   after.

## Account / profile
9. A user profile page letting someone change their email and set a
   default RSN, so they don't have to retype it every time they join a
   new challenge. Two different underlying mechanisms: email lives on
   Supabase's own `auth.users` (changing it goes through
   `supabase.auth.updateUser()`, which re-sends a confirmation email --
   not a plain field update), while a default RSN would need a new
   column on `profiles` (today just `id`, `display_name`,
   `created_at` -- see `supabase/schema.sql`), then `BoardPage.tsx`'s
   join form pre-filling from it instead of starting blank.
