# Backlog

Ideas and known gaps not yet scheduled into a milestone. Not prioritized/
ordered -- just captured so they don't get lost.

## UI/UX polish
1. Tiles should keep a square aspect ratio on mobile (currently only
   verified on desktop widths).
2. The board page's title area should say "`<rsn>`'s board" in a
   sub-header, so it's clear whose progress is being shown.
3. The Players list currently shows the signed-in display name alongside
   the RSN -- should show RSN only.
4. A very long word in a tile label overflows outside the tile instead of
   wrapping/truncating -- needs a fix (e.g. `break-words`, or lean on the
   character limit below).
5. Cap the tile label length (open question: 40 characters?) so hosts
   can't create labels that break the layout.

## Multiplayer / social
6. A signed-in participant should be able to view another participant's
   board within the same challenge (currently the board only ever shows
   the viewer's own progress).
7. Every challenge should have a leaderboard (who has the most points --
   depends on the point system below).
8. A point system for assigning values to completed tiles/tasks (needed
   before the leaderboard is meaningful -- right now completion is
   boolean, no weighting).
9. "First to complete" recognition for a given tile -- players should be
   able to tell at a glance which tiles are already claimed by someone
   else, which are still open, and which ones *they* were first to finish.
22. Let the host define how many points a player gets for being *first*
    to complete a given task -- right now (see item 8, the point system)
    every completion of a tile is worth the same flat points regardless
    of who got there first; needs a separate first-completer bonus value
    the host sets, on top of the base points.

## Tile mechanics
10. Hidden/mystery tiles -- a tile that doesn't reveal itself until some
    trigger happens. Needs further design (what triggers it? does it show
    as a blank slot, a "?" placeholder, or not appear in the grid at
    all?).
11. Improve the logic around the "Obtain a set of items" (`itemCount`)
    condition -- currently just a flat comma-separated item-name list
    matched case-insensitively against loot; needs a closer look (exact
    scope TBD).
19. Improve the "KC gained on a specific boss" (`kcGained`) condition --
    right now `activity` is host-typed free text (see TileEditorForm.tsx).
    Three parts: (1) restrict it to a fixed, curated list of bosses/
    minigames/raids instead of freeform typing -- same "catalog, not
    freeform" pattern already used for item sets (`src/lib/itemSets.ts`)
    and now `bigDropsCount`'s value floor; (2) give each boss/minigame/
    raid in that list its own specific icon instead of the generic combat
    icon every `kcGained`/`bossKcGained` tile shares today
    (`defaultIconFor` in `src/lib/tileIcons.ts`); (3) make sure that
    specific icon actually shows up everywhere a tile's icon is used --
    the board grid, the tile editor, and the Discord completion embed's
    thumbnail (`src/server/discordEmbeds.ts`).
21. Add a "Free space" tile condition -- always shows as completed for
    every participant, awards no points. Distinct from every other
    condition type in that `checkTile` never has to evaluate any raw
    stats for it; it's just an always-true special case.
23. Restrict `lootValueGained`/`singleDropValue`/`xpGained`-style GP and
    XP thresholds to increments of 1,000 instead of any raw number a
    host types in. In `TileEditorForm.tsx`, replace the free-typed
    number with a denomination selector (K/M) plus a value, so the host
    picks e.g. "100" + "M" to form a 100,000,000 threshold instead of
    typing the full number by hand.

## Host tooling
12. "Randomize a board" starting point -- host picks random tiles/
    conditions to seed a new board, then edits/tweaks from there instead
    of starting from a fully blank grid.
13. A library of pre-made boards hosts can pick from to start a challenge.
14. "Copy a past challenge" -- start a new challenge that mirrors an
    existing/past board's tiles instead of rebuilding it from scratch.
15. Restrict which icons are selectable based on the tile's condition,
    instead of the full picker always being open. E.g. a loot-value
    condition should always be the 10k coin stack; a total-XP condition
    should always be the generic skill icon; a specific-skill condition
    (e.g. Attack) should always be that skill's icon. Where more than one
    icon could reasonably fit, offer a small curated set instead of the
    full picker. Goal: fewer decisions for the host, and a standardized,
    recognizable look across boards for players.
20. Once a challenge has started, its tile conditions should no longer be
    editable from `EditChallengePage.tsx` -- changing a condition
    mid-challenge could invalidate progress players have already made
    toward it. (Tile *metadata* like label/icon presumably still fine to
    edit; scope of what counts as "started" and what stays editable
    needs a closer look.)

## Notifications
16. Enhance Discord notifications for tile/line/board completions --
    currently plain-text only (`src/server/discordRelay.ts`,
    `src/server/challengeProgress.ts`); richer embeds, per-tile custom
    messages, first-completer callouts, etc. (`rs`'s `bingoDiscord.ts` has
    a fuller version of this worth referencing).

## Tile detail view
17. Clicking a tile should open a detail view: the full condition
    description (`describeTileCondition`, already exists), and every
    participant's progress bar for that specific tile, sorted from most
    to least complete -- today the board only ever shows the *viewer's
    own* progress (see item 6, viewing other players' boards -- related
    but this is scoped to one tile across everyone, not one player across
    every tile).

## Auth / email
18. Create a new confirmation email template for the magic-link sign-in
    email (currently whatever Supabase's default template sends).
