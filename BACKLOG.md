# Backlog

Ideas and known gaps not yet scheduled into a milestone. Not prioritized/
ordered -- just captured so they don't get lost.

## UI/UX polish
1. Cap the tile label length (open question: 40 characters?) so hosts
   can't create labels that break the layout.

## Tile mechanics
2. Hidden/mystery tiles -- a tile that doesn't reveal itself until some
   trigger happens. Needs further design (what triggers it? does it show
   as a blank slot, a "?" placeholder, or not appear in the grid at
   all?).
3. Improve the logic around the "Obtain a set of items" (`itemCount`)
   condition -- currently just a flat comma-separated item-name list
   matched case-insensitively against loot; needs a closer look (exact
   scope TBD).
4. Restrict `lootValueGained`/`singleDropValue`/`xpGained`-style GP and
   XP thresholds to increments of 1,000 instead of any raw number a
   host types in. In `TileEditorForm.tsx`, replace the free-typed
   number with a denomination selector (K/M) plus a value, so the host
   picks e.g. "100" + "M" to form a 100,000,000 threshold instead of
   typing the full number by hand.
5. New condition: "XP gained in lowest skill." Unlike `skillXpGained`
   (host picks a fixed skill), the skill itself is derived per
   participant -- whichever skill was their *lowest level* as of their
   final hiscores sync before the challenge's start_date. Open
   questions: tie-break rule if two skills are tied for lowest; what
   "final sync before start" means for someone who joins mid-challenge
   (no pre-start snapshot to anchor to); whether the resolved skill name
   should be shown on the tile so players know what they're being
   judged on.
6. New condition: "Levels gained in lowest skill" -- same per-participant
   lowest-skill resolution as #5 above, tracking `skillLevelsGained`
   instead of `skillXpGained`. Shares the same open design questions.

## Host tooling
7. "Randomize a board" starting point -- host picks random tiles/
   conditions to seed a new board, then edits/tweaks from there instead
   of starting from a fully blank grid.
8. A library of pre-made boards hosts can pick from to start a challenge.
9. "Copy a past challenge" -- start a new challenge that mirrors an
   existing/past board's tiles instead of rebuilding it from scratch.
10. Restrict which icons are selectable based on the tile's condition,
    instead of the full picker always being open. E.g. a loot-value
    condition should always be the 10k coin stack; a total-XP condition
    should always be the generic skill icon; a specific-skill condition
    (e.g. Attack) should always be that skill's icon. Where more than one
    icon could reasonably fit, offer a small curated set instead of the
    full picker. Goal: fewer decisions for the host, and a standardized,
    recognizable look across boards for players.
11. Once a challenge has started, its tile conditions should no longer be
    editable from `EditChallengePage.tsx` -- changing a condition
    mid-challenge could invalidate progress players have already made
    toward it. (Tile *metadata* like label/icon presumably still fine to
    edit; scope of what counts as "started" and what stays editable
    needs a closer look.) Deferred for now -- every current challenge is
    still a test board, so there's no live risk yet.

## My Dungeons page (rename of "My Challenges" / DashboardPage.tsx)
12. Rename the page/route from "My Challenges" to "My Dungeons"
    (`DashboardPage.tsx`, `Header.tsx`'s nav link, any other on-site
    copy) and enhance it:
    - A quick button on each row to copy that challenge's Dink webhook
      URL to the clipboard, without opening the setup guide page.
    - A quick "copy invite message" button per row -- copies a short,
      shareable message (a quick invite sentence plus a link to the
      board's public page, `/c/:slug`, where an invited player finds the
      Join form and instructions) that a host can paste straight into
      Discord/etc. to invite others, distinct from the webhook-URL copy
      above.
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
13. Support more than one board shape/ruleset ("dungeon type"), building
    on `challenges.board_type` (already unconstrained text specifically
    so a new type needs no migration -- see its own comment in
    `supabase/schema.sql`). The current 5x5 grid becomes the "Standard"
    type (today's only value, `'grid5x5'`). A second type, "Adventure,"
    gets its own `size` attribute (`small` | `medium` | `large`) --
    scope for this backlog entry is just the "small" Adventure dungeon;
    medium/large and Adventure's actual rules (what a size even changes)
    are TBD, to be defined later.

## Onboarding feedback (from a first-time playtester)
14. "Threshold" wasn't obvious as a label when setting up a tile's
    condition in `TileEditorForm.tsx` -- needs clearer wording and/or a
    short explanatory hint (e.g. "the amount/count needed to complete
    this tile").
15. Not obvious how to invite other players to a challenge once it's
    created -- likely addressed by #12's "copy invite message" button
    above, but flagging as its own confirmed pain point in case that
    alone doesn't make it discoverable enough (e.g. it may also need
    to be reachable from somewhere more prominent than the My Dungeons
    row, like the board page itself for a host viewing their own
    challenge).
16. Confusing how to set up Dink when participating in more than one
    challenge at once -- `SetupGuidePage.tsx` only ever shows one
    challenge's webhook URL, with no mention of what to do if you're
    already tracking another. Fix: each of Dink's webhook fields
    accepts multiple URLs, one per line -- update the setup guide's
    instructions to say so explicitly, so a player in multiple
    challenges adds every challenge's webhook URL on its own line
    within the same field instead of only ever seeing/using one.

## Anti-abuse
17. Figure out how to handle a participant who leaves Dink's
    "send screenshot" setting on and floods the site with screenshot
    data (bandwidth/storage). Open question from the host: should this
    email both the player and the host when it happens, or just log/
    flag it for the host to notice? Needs detection first (nothing in
    `dinkWebhook.ts` currently inspects payload size or screenshot
    presence at all) before any notification behavior can be built.

## Notifications
18. Full rewrite of Discord notification content (`discordEmbeds.ts`) --
    keep the current embed structure (title/description/fields/image),
    but replace the fixed flavor-text lines (e.g. "Aren't they just
    showing off at this point?") with randomized joke/banter variants
    pulled from a pool, to lean into the site's ".lol" branding.
