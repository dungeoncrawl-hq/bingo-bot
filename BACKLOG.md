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

## Tile mechanics
10. Hidden/mystery tiles -- a tile that doesn't reveal itself until some
    trigger happens. Needs further design (what triggers it? does it show
    as a blank slot, a "?" placeholder, or not appear in the grid at
    all?).

## Host tooling
11. "Randomize a board" starting point -- host picks random tiles/
    conditions to seed a new board, then edits/tweaks from there instead
    of starting from a fully blank grid.
12. A library of pre-made boards hosts can pick from to start a challenge.
13. "Copy a past challenge" -- start a new challenge that mirrors an
    existing/past board's tiles instead of rebuilding it from scratch.

## Notifications
14. Enhance Discord notifications for tile/line/board completions --
    currently plain-text only (`src/server/discordRelay.ts`,
    `src/server/challengeProgress.ts`); richer embeds, per-tile custom
    messages, first-completer callouts, etc. (`rs`'s `bingoDiscord.ts` has
    a fuller version of this worth referencing).

## Tile detail view
15. Clicking a tile should open a detail view: the full condition
    description (`describeTileCondition`, already exists), and every
    participant's progress bar for that specific tile, sorted from most
    to least complete -- today the board only ever shows the *viewer's
    own* progress (see item 6, viewing other players' boards -- related
    but this is scoped to one tile across everyone, not one player across
    every tile).
