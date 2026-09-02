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
4. **Open question: does a newly-unlocked Adventure tile start at 0, or
   can earlier progress already count?** Current actual behavior
   (confirmed against the shipped code, not a guess): every tile's
   condition is checked against the participant's *cumulative stats
   since the challenge's start date* -- not "since this tile became
   reachable." So a tile several columns into the path can complete
   the instant it unlocks, off stat gains the player racked up earlier
   in the dungeon (or even before reaching that fork at all) -- nothing
   resets at unlock. This was a deliberate simplification when Adventure
   shipped (`checkTile`/`ParticipantStats` reused completely unchanged,
   no per-tile "gains since unlock" tracking), called out in its own
   code comment (`src/lib/adventureProgress.ts`) but never actually
   weighed as a design choice against the alternative. Real consequence
   worth deciding on purpose: two tiles sharing the same condition type
   at different points in the path (e.g. two "Slayer XP" tiles) can
   both complete back to back off one pool of cumulative progress,
   without the player doing anything new between them -- may or may not
   match the intended "earn each room as you reach it" feel. If a
   per-tile "gains since unlock" model is wanted instead, it needs a
   stored baseline (stats snapshot, or simply `frontier reached at`
   timestamp) per participant per tile to diff against, which is a real
   scope increase over today's stateless-recompute approach.

## Host tooling
Items 5-7 were scoped before board types (Adventure mode, shipped) or
game modes (Coop/Team, also shipped) existed -- none of them currently
say what "randomize"/"library"/"copy" means for anything but a Standard/
solo board. Simplest path: scope all three to Standard + solo only for
v1, same deferral Coop/Team's own scope already applied to combining
Adventure with a game mode -- an Adventure
board's "random tile" needs different pools per lane/boss, and copying
a challenge needs to carry `board_type`/`board_size`/`game_mode`
forward, not just tiles, once those exist to copy.

5. "Randomize a board" starting point -- host picks random tiles/
   conditions to seed a new board, then edits/tweaks from there instead
   of starting from a fully blank grid.
6. A library of pre-made boards hosts can pick from to start a challenge.
7. "Copy a past challenge" -- start a new challenge that mirrors an
   existing/past board's tiles instead of rebuilding it from scratch.

## Anti-abuse
8. Whether/who to email when a participant's screenshot count crosses a
   concerning threshold -- detection itself already shipped
   (`increment_screenshot_stats`, the ⚠ badge on `EditChallengePage.tsx`'s
   Players list, a console.warn every 10th screenshot), this is just the
   open notification-behavior question: email the player, the host, both,
   or leave it at the badge/log the host already has? The site-admin
   dashboard (shipped -- `/dungeon-master-admin`, cross-challenge
   screenshot/webhook-volume visibility) was the planned prerequisite for
   deciding this with real aggregate data instead of a guess -- now that
   it exists, this question is actually ready to resolve.
