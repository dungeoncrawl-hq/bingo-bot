# Backlog

Ideas and known gaps not yet scheduled into a milestone. Not prioritized/
ordered -- just captured so they don't get lost.

## Tile mechanics
1. Hidden/mystery tiles -- a tile that doesn't reveal itself until some
   trigger happens. Needs further design (what triggers it? does it show
   as a blank slot, a "?" placeholder, or not appear in the grid at
   all?).
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
4. "Randomize a board" starting point -- host picks random tiles/
   conditions to seed a new board, then edits/tweaks from there instead
   of starting from a fully blank grid.
5. A library of pre-made boards hosts can pick from to start a challenge.
6. "Copy a past challenge" -- start a new challenge that mirrors an
   existing/past board's tiles instead of rebuilding it from scratch.
7. Once a challenge has started, its tile conditions should no longer be
   editable from `EditChallengePage.tsx` -- changing a condition
   mid-challenge could invalidate progress players have already made
   toward it. (Tile *metadata* like label/icon presumably still fine to
   edit; scope of what counts as "started" and what stays editable
   needs a closer look.) Deferred for now -- every current challenge is
   still a test board, so there's no live risk yet.

## Dungeon types
8. Support more than one board shape/ruleset ("dungeon type"), building
   on `challenges.board_type` (already unconstrained text specifically
   so a new type needs no migration -- see its own comment in
   `supabase/schema.sql`). The current 5x5 grid becomes the "Standard"
   type (today's only value, `'grid5x5'`). A second type, "Adventure,"
   gets its own `size` attribute (`small` | `medium` | `large`) --
   scope for this backlog entry is just the "small" Adventure dungeon;
   medium/large and Adventure's actual rules (what a size even changes)
   are TBD, to be defined later.

## Anti-abuse
9. Whether/who to email when a participant's screenshot count crosses a
   concerning threshold -- detection itself already shipped
   (`increment_screenshot_stats`, the ⚠ badge on `EditChallengePage.tsx`'s
   Players list, a console.warn every 10th screenshot), this is just the
   open notification-behavior question: email the player, the host, both,
   or leave it at the badge/log the host already has?
10. A challenge past its end_date can still have players' Dink installs
    pointed at its webhook URL, sending events nobody will ever see --
    wasted processing and (per item #9) even more screenshot-flood
    surface area. `api/dink/[secret].ts` already has a guard for exactly
    this (`if (challenge.status === 'ended') return early`), but nothing
    in the codebase ever actually sets a challenge's status to `'ended'`
    -- `togglePublish` in `EditChallengePage.tsx` only ever toggles
    between `'draft'`/`'active'`, so that guard is dead code today. Needs
    either an automatic transition (a cron once today > end_date, mirroring
    the `displayStatus` "past" derivation already built for the My
    Dungeons page in `src/lib/dungeonStatus.ts`) or a host-visible way to
    close out a challenge manually -- and probably worth telling the
    player directly too (e.g. a note on the board page once a challenge
    is past its end date) so they know to go turn Dink off, not just
    silently dropping their events server-side.

## Notifications
11. Full rewrite of Discord notification content (`discordEmbeds.ts`) --
    keep the current embed structure (title/description/fields/image),
    but replace the fixed flavor-text lines (e.g. "Aren't they just
    showing off at this point?") with randomized joke/banter variants
    pulled from a pool, to lean into the site's ".lol" branding.

## Account / profile
12. A user profile page letting someone change their email and set a
    default RSN, so they don't have to retype it every time they join a
    new challenge. Two different underlying mechanisms: email lives on
    Supabase's own `auth.users` (changing it goes through
    `supabase.auth.updateUser()`, which re-sends a confirmation email --
    not a plain field update), while a default RSN would need a new
    column on `profiles` (today just `id`, `display_name`,
    `created_at` -- see `supabase/schema.sql`), then `BoardPage.tsx`'s
    join form pre-filling from it instead of starting blank.

## Game modes
13. New game modes, applying to any dungeon type (orthogonal to #8's
    board *type* -- Standard/Adventure -- this is about how a board is
    *scored*, not shaped). Today every participant has their own
    private board/completions (`challenge_participants` ->
    `tile_completions`, one row per participant). Two new modes:
    - Cooperative: one shared board for the whole challenge -- every
      participant's stat gains count toward the *same* tile's
      condition, not just their own board.
    - Team-based: participants are grouped into teams, each team has
      its own shared board (same pooled-contribution idea as
      Cooperative, but scoped per team instead of the whole challenge).
      Needs a teams concept that doesn't exist yet (a team grouping for
      `challenge_participants`, presumably a new table).
    Both need real design work before implementation: how `checkTile`
    (currently one participant's stats in, one status out) aggregates
    multiple participants' contributions, how the leaderboard/points
    model changes when scoring isn't 1 board = 1 person, and how
    Discord completion embeds attribute credit when a tile completes
    from pooled progress rather than one person's own gain.
