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
4. New condition: "XP gained in lowest skill." Unlike `skillXpGained`
   (host picks a fixed skill), the skill itself is derived per
   participant -- whichever skill was their *lowest level* as of their
   final hiscores sync before the challenge's start_date. Tie-break rule
   (decided): find the skill(s) with the lowest XP; if more than one
   skill is tied for lowest, the player picks which of the tied skills
   they're judged on at the moment they join a challenge containing this
   condition. Still open: what "final sync before start" means for
   someone who joins mid-challenge (no pre-start snapshot to anchor to).
5. New condition: "Levels gained in lowest skill" -- same per-participant
   lowest-skill resolution and tie-break rule as #4 above, tracking
   `skillLevelsGained` instead of `skillXpGained`.

## Host tooling
6. "Randomize a board" starting point -- host picks random tiles/
   conditions to seed a new board, then edits/tweaks from there instead
   of starting from a fully blank grid.
7. A library of pre-made boards hosts can pick from to start a challenge.
8. "Copy a past challenge" -- start a new challenge that mirrors an
   existing/past board's tiles instead of rebuilding it from scratch.
9. Once a challenge has started, its tile conditions should no longer be
   editable from `EditChallengePage.tsx` -- changing a condition
   mid-challenge could invalidate progress players have already made
   toward it. (Tile *metadata* like label/icon presumably still fine to
   edit; scope of what counts as "started" and what stays editable
   needs a closer look.) Deferred for now -- every current challenge is
   still a test board, so there's no live risk yet.

## My Dungeons page (rename of "My Challenges" / DashboardPage.tsx)
10. Rename the page/route from "My Challenges" to "My Dungeons"
    (`DashboardPage.tsx`, `Header.tsx`'s nav link, any other on-site
    copy) and enhance it:
    - A quick button on each row to copy that challenge's Dink webhook
      URL to the clipboard, without opening the setup guide page.
    - Colored status badges: Active = green, Draft, Upcoming, Past, etc.
      (today `c.status` just prints as plain uppercase text -- see
      `challenges.status`, currently `'draft' | 'active' | 'ended'`; an
      "Upcoming" status implied here doesn't exist yet -- active vs.
      upcoming presumably needs deriving from `start_date` vs. today
      rather than a new stored status, since a challenge is published
      -- `status = 'active'` -- before its start_date arrives).
    - Replace the "Edit" text link with an icon button, and either turn
      "View public page" into a recognizable icon too or make the whole
      row itself a clickable link to the board.
    - Friendlier date formatting -- "Sep 1 - Sep 13" instead of the raw
      `2026-09-01` / `2026-09-13` strings.
    - "X days remaining" on an Active row, "X days until it begins" on
      an Upcoming row, "X days to publish" on a Draft row -- all derived
      from `start_date`/`end_date` vs. today, not stored.
    - Move past/ended challenges out of the main list into their own
      section further down the page.

## Dungeon types
11. Support more than one board shape/ruleset ("dungeon type"), building
    on `challenges.board_type` (already unconstrained text specifically
    so a new type needs no migration -- see its own comment in
    `supabase/schema.sql`). The current 5x5 grid becomes the "Standard"
    type (today's only value, `'grid5x5'`). A second type, "Adventure,"
    gets its own `size` attribute (`small` | `medium` | `large`) --
    scope for this backlog entry is just the "small" Adventure dungeon;
    medium/large and Adventure's actual rules (what a size even changes)
    are TBD, to be defined later.

## Anti-abuse
12. Figure out how to handle a participant who leaves Dink's
    "send screenshot" setting on and floods the site with screenshot
    data (bandwidth/storage). Open question from the host: should this
    email both the player and the host when it happens, or just log/
    flag it for the host to notice? Needs detection first (nothing in
    `dinkWebhook.ts` currently inspects payload size or screenshot
    presence at all) before any notification behavior can be built.

## Notifications
13. Full rewrite of Discord notification content (`discordEmbeds.ts`) --
    keep the current embed structure (title/description/fields/image),
    but replace the fixed flavor-text lines (e.g. "Aren't they just
    showing off at this point?") with randomized joke/banter variants
    pulled from a pool, to lean into the site's ".lol" branding.

## Account / profile
14. A user profile page letting someone change their email and set a
    default RSN, so they don't have to retype it every time they join a
    new challenge. Two different underlying mechanisms: email lives on
    Supabase's own `auth.users` (changing it goes through
    `supabase.auth.updateUser()`, which re-sends a confirmation email --
    not a plain field update), while a default RSN would need a new
    column on `profiles` (today just `id`, `display_name`,
    `created_at` -- see `supabase/schema.sql`), then `BoardPage.tsx`'s
    join form pre-filling from it instead of starting blank.

## Game modes
15. New game modes, applying to any dungeon type (orthogonal to #11's
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
