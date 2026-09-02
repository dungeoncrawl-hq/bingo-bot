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
Items 4-6 were scoped before board types (Adventure mode, now shipped) or
game modes (#10) existed -- none of them currently say what "randomize"/
"library"/"copy" means for anything but a Standard/solo board. Simplest
path: scope all three to Standard + solo only for v1, same deferral
already applied to Coop/Team and to combining Adventure with a game
mode -- an Adventure
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
   or leave it at the badge/log the host already has? A site-admin
   dashboard (see #11) is the planned first step here -- aggregate,
   site-wide visibility before deciding who gets a targeted email.

## Notifications
8. Full rewrite of Discord notification content (`discordEmbeds.ts`) --
   keep the current embed structure (title/description/fields/image),
   but replace the fixed flavor-text lines (e.g. "Aren't they just
   showing off at this point?") with randomized joke/banter variants
   pulled from a pool, to lean into the site's ".lol" branding. Design
   this aware of the other things already reshaping the same flavor
   text: Adventure's boss-vs-regular-tile swap (shipped) and #10's
   solo/"the group"/"Team X" subject swap. Those are two independent
   dimensions (is-boss x who's-the-subject) that'll both exist by the
   time this gets built -- the banter pool should be parameterized by
   both from the start, not bolted on after, or this needs redoing once
   Coop/Team ships.

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

## Game modes
10. New game modes, applying to any dungeon type (orthogonal to
    Adventure's board *type*, now shipped -- this is about how a board
    is *scored*, not shaped). New `challenges.game_mode` column (`'solo' |
    'coop' | 'team'`, default `'solo'` = today's behavior). Scope for
    both modes below is Standard boards only -- combining either with
    Adventure (e.g. a team sharing one branching path) is real design
    work of its own, deliberately deferred, not forgotten.

    **Open question that applies to both modes: threshold balance.** A
    condition tuned for one solo player (e.g. "1M GP looted") becomes
    trivial once pooled across 5 Coop/Team participants -- their
    combined throughput is ~5x what the host was picturing when they
    set the number. Worth a host-facing hint in `TileEditorForm.tsx`
    when `game_mode` isn't `'solo'` ("this will be pooled across N
    participants"), rather than leaving it a silent trap.

    ### Cooperative
    One shared board for the whole challenge -- every participant's
    stat gains count toward the same tile's condition, not just their
    own board.

    **Storage stays as-is; only who gets credited changes.**
    `tile_completions` keeps its current per-participant shape. When a
    Coop tile's *pooled* condition is met, insert an identical
    completion row for every participant at once. Consequence: since
    everyone's completions are always identical, viewing any
    participant's board (`?p=`) already shows the shared state
    correctly -- `BoardPage.tsx`'s grid itself needs no changes, only
    the leaderboard and notifications do. Bingo line/board completions
    (`tile_completions.kind = 'line'/'board'`) need no changes either
    -- `challengeProgress.ts`'s `gridLines` check already just asks "does
    this participant have every tile in the line done," which stays
    correct since pooled completions are identical across everyone in
    the pool.

    **Pooling sums outputs, doesn't merge inputs.** Each participant's
    `ParticipantStats` still computes exactly as today (unchanged --
    including their own `hiscoresRecap`, since hiscores snapshots are
    per-account and can't be merged). New afterward: a
    `poolStats(statsList: ParticipantStats[]): ParticipantStats`
    reducer -- sums the numeric fields (`xpGained`, `bossKcGained`,
    `lootValueGained`...), merges the per-key maps
    (`kcGainedByActivity`, `skillXpGained`, `itemCounts`...),
    concatenates `dropValues`. Feed the pooled result into `checkTile`,
    completely unchanged. So Coop is additive -- a new pooling function
    plus new completion fanout -- not a rewrite of the scoring engine.

    **Leaderboard is replaced with shared progress.** Everyone's points/
    completions are always identical in Coop, so ranking participants
    against each other is meaningless -- show one shared readout
    ("14/25 tiles") instead of a ranked list.

    **First-completer bonus is forced off**, same mechanism as
    `freeSpace` forcing points to 0 -- there's no "first" when credit
    lands on everyone simultaneously from one pooled event.

    **Discord embeds go anonymous to the group**: "The group completed
    the Y task!" instead of naming a participant -- same swapped-subject
    pattern as Adventure's boss-tile flavor text. Applies to all three
    embed builders, not just `buildTileCompletionEmbed` --
    `buildLineCompletionEmbed`/`buildBoardCompletionEmbed` also name an
    individual today ("X completed a line!"/"X completed the whole
    board!") and need the identical swap.

    **`TileDetailModal` doesn't fit as-is, same root problem as the
    leaderboard.** Ranking participants who all have identical pooled
    progress is just noise -- N rows all showing the same number. For
    Coop this probably wants to become one aggregate view (pooled
    progress toward the tile) rather than a per-participant list, and
    could optionally show a contribution breakdown (how much did each
    person add to the pool) as a nice-to-have rather than the default.

    **`xpGainedLowestSkill`/`levelsGainedLowestSkill` are excluded**
    from the condition picker on Coop tiles -- "the group's lowest
    skill" isn't a coherent pooled concept the way "the group's total
    XP" is.

    **Every Dink event gets pricier to process.**
    `checkChallengeProgress` today re-aggregates one participant's raw
    data per event. Coop means any participant's event has to re-fetch
    and re-pool *everyone's* raw data, since anyone's contribution
    could tip a pooled threshold -- more expensive per event, but the
    same bulk-fetch-by-`.in(participant_id, ...)` pattern already
    exists (`BoardPage.tsx`'s `tileStatusesByParticipant` effect), just
    needs to run server-side per event instead of client-side on page
    load.

    ### Team-based
    Same pooled-contribution idea as Cooperative, scoped per team
    instead of the whole challenge -- reuses Coop's `poolStats` and
    completion-fanout logic unchanged, just partitioned by `team_id`
    first (pool each team's roster separately; fan out a completion to
    that team's members only, not the whole challenge). Also inherits
    Coop's line/board-completion reassurance, and needs the same
    `buildLineCompletionEmbed`/`buildBoardCompletionEmbed` subject-swap
    and `TileDetailModal` rework -- for Team, the modal's natural shape
    is one row per *team* instead of per participant (same "collapse to
    one representative" trick the leaderboard uses), rather than Coop's
    single aggregate view.

    **Scales better than Coop per event.** Coop has to re-fetch and
    re-pool literally every participant's raw data on every single
    Dink event, regardless of challenge size. Team only needs that
    event's *sender's team* -- a smaller, bounded fetch no matter how
    many teams or how large the overall roster gets.

    **New teams concept.** A `teams` table (`id, challenge_id, name` --
    scoped to one challenge, not reusable across challenges, matching
    every other host-owned entity here) plus
    `challenge_participants.team_id` (nullable).

    **Host manages all team details and assignments** -- no
    participant self-selection. Host creates/names teams (a small
    management UI in `EditChallengePage.tsx`, similar to how Players/
    Discord webhook are managed today) and assigns each participant to
    one from the Players list (a team-select dropdown per row, same
    interaction shape as the existing RSN edit). A participant can join
    the challenge before being assigned (sits with `team_id: null`
    until the host sorts them) -- their raw Dink events still record
    normally in the meantime and count retroactively from challenge
    start the moment they're assigned, no special "since assignment"
    windowing needed.

    **Joining is blocked until the host has created at least one
    team** -- same reasoning as there being nothing to sync without
    tiles. The join form itself doesn't change otherwise (still just
    RSN) since assignment is host-driven, not chosen at join time.

    **Open question: mid-challenge reassignment.** Since host-driven
    assignment (above) implies the host can also *re*assign someone
    later, what happens to completions their old team already earned
    with their contribution baked in? Simplest rule is probably "past
    stays past" -- moving teams doesn't retroactively strip credit from
    the old team or grant it to the new one, only future pooled
    progress follows the move -- but this is a real fairness question
    for the host to weigh in on, not just an implementation detail.
    Same "don't let host actions invalidate progress players already
    made" reasoning behind the tile-condition lock (`EditChallengePage.tsx`
    already refuses to edit a started challenge's tile conditions)
    applies here too.

    **Unlike Coop, the leaderboard comes back** -- teams compete
    against each other, so ranking is meaningful again even though
    ranking *within* a team isn't. Since every teammate's completions
    are identical (fanout), run the existing `computeLeaderboard` on
    one representative participant per team and label rows by team name
    instead of RSN -- no new leaderboard algorithm needed.

    **First-completer bonus comes back too, scoped to "first team."**
    `computeFirstCompleters` already finds the earliest completion
    timestamp per tile; since a team's members complete simultaneously,
    whichever participant "wins" that lookup identifies the winning
    team. Just needs mapping that participant back to their `team_id`
    for display -- "Team Red was first!"

    **Discord embeds name the team**: "Team Red completed the Y task!"
    -- same swapped-subject pattern as Coop's "the group," naming the
    team instead.

## Site administration
11. A site-administrator role, for the site owner only -- not a
    per-challenge host permission, a whole-site one. Directly unblocks
    #7's "who to email" question -- decide that with real aggregate
    data in front of you, not a guess. Read-only for v1: no force-close/
    ban actions yet, just visibility. That's a natural later addition
    once the view itself proves useful, not a day-one requirement.

    **Access.** A boolean `is_site_admin` column on `profiles` (today
    just `id`, `display_name`, `created_at`), checked the same way
    `host_id` ownership is already checked in `EditChallengePage.tsx` --
    no new role system, no per-permission granularity, since there's
    exactly one admin. Route itself still requires normal auth on top
    of the flag; the URL being unlinked is a bonus, not the actual
    security boundary.

    **Route.** `/dungeon-master-admin`, not in any nav. Structured as a
    dashboard-first hierarchy per the site's existing page conventions,
    not one giant page:
    - `/dungeon-master-admin` (index) -- top-line KPIs (challenges by
      status: draft/active/ended, total participants, total tiles
      completed site-wide) plus a "flags" section surfacing the worst
      screenshot/traffic offenders inline, each linking out to the full
      view.
    - `/dungeon-master-admin/participants` -- full sortable table:
      screenshot count/bytes, webhook call count, last-active
      timestamp, which challenge, RSN. The cross-challenge view today's
      ⚠ badge doesn't have (`EditChallengePage.tsx`'s badge is scoped to
      one host's own Players list).
    - `/dungeon-master-admin/growth` -- challenges/participants over
      time, simple daily/weekly counts from existing `created_at`
      columns. No chart library needed for v1, a plain table is enough
      to start.

    **New instrumentation: general webhook volume, not just
    screenshots.** `screenshot_count`/`screenshot_bytes`
    (`increment_screenshot_stats`) are today's only per-request volume
    signal, and only fire when a screenshot rides along -- an ordinary
    burst of ordinary events (or an ended challenge whose Dink client
    never got pointed elsewhere) is invisible. Add
    `challenge_participants.webhook_call_count` (integer, default 0)
    and `last_webhook_at` (timestamptz, nullable), bumped once per
    incoming call in `processDinkWebhook` (`dinkWebhook.ts`) regardless
    of event type -- one small upsert alongside the existing
    `recordScreenshot` call, cheap on the hot path. This is what makes
    "who's generating excessive traffic" and "is a dead challenge still
    getting hit" answerable at all, not just "who left screenshots on."

    **Error rates: explicitly cut from v1.** No existing logging
    pipeline (Vercel's own function logs aren't queried anywhere in the
    app today) to build this on top of -- not worth a new log table
    just to seed one dashboard stat. Revisit if/when there's an actual
    error-tracking pipeline in place for other reasons.
