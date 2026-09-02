# Backlog

Ideas and known gaps not yet scheduled into a milestone. Not prioritized/
ordered -- just captured so they don't get lost.

## Tile mechanics
1. Hidden/mystery tiles -- a tile that doesn't reveal itself until some
   trigger happens. Needs further design (what triggers it? does it show
   as a blank slot, a "?" placeholder, or not appear in the grid at
   all?). Worth a look at #7's Adventure gating for a ready-made answer
   to "what triggers it": a tile past a participant's current frontier
   is already conceptually hidden (not yet relevant) purely by
   sequence -- may not need its own new trigger concept at all, at
   least for Adventure boards.
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
Items 4-6 were scoped before board types (#7) or game modes (#11)
existed -- none of them currently say what "randomize"/"library"/"copy"
means for anything but a Standard/solo board. Simplest path: scope all
three to Standard + solo only for v1, same deferral already applied to
Coop/Team and to combining Adventure with a game mode -- an Adventure
board's "random tile" needs different pools per lane/boss, and copying
a challenge needs to carry `board_type`/`board_size`/`game_mode`
forward, not just tiles, once those exist to copy.

4. "Randomize a board" starting point -- host picks random tiles/
   conditions to seed a new board, then edits/tweaks from there instead
   of starting from a fully blank grid.
5. A library of pre-made boards hosts can pick from to start a challenge.
6. "Copy a past challenge" -- start a new challenge that mirrors an
   existing/past board's tiles instead of rebuilding it from scratch.

## Dungeon types
7. Support more than one board shape/ruleset ("dungeon type"), building
   on `challenges.board_type` (already unconstrained text specifically
   so a new type needs no migration -- see its own comment in
   `supabase/schema.sql`). The current 5x5 grid becomes the "Standard"
   type (today's only value, `'grid5x5'`). A second type, "Adventure,"
   is a branching path -- tiles represent physical rooms the player
   moves through sequentially, like a horizontal hopscotch board, with
   forks where the player picks a route. Scope here is just the
   "small" Adventure dungeon; medium/large are TBD later (the design
   below should generalize to them, but only small is being built now).

   **Layout ("small").** 9 columns, shape `2,2,1,2,2,1,2,2,1`: two
   2-tile lanes (top/bottom) converging on a boss, three times, ending
   at a final boss. 15 tile slots total, but only 9 are ever "in play"
   for one participant (see path choice below) -- 3 bosses + 2 tiles
   from whichever lane they picked at each of the 3 forks.
   `tiles.layout` becomes `{ column: 0-8, lane: 'top' | 'bottom' |
   'center' }` instead of `{row, col}` -- same jsonb column, no
   migration, exactly the extensibility it was built for. Boss slots
   are inherently `lane: 'center'` at columns 2/5/8 (2 mid-bosses +
   1 final) -- nothing marks a slot as a boss, its fixed position in
   the canonical small-adventure layout already does.

   **Path choice is real branching, not just ordering.** At the start
   and after each boss, the player picks top or bottom; the other
   lane's 2 tiles are never required for that player. Persisted as
   `challenge_participants.adventure_path` (new jsonb column), keyed
   by fork index (0/1/2 for small): `{"0": "top", "1": "bottom", "2":
   "top"}`.

   **Progress is gated, sequentially.** Tile 1 of the chosen lane ->
   tile 2 -> boss -> next fork. `checkChallengeProgress` only ever
   attempts to record a completion for a participant's current
   *frontier* tile (needs a new pure resolver, structurally like
   `resolveLowestSkill` in `tileConditions.ts`: walk the chosen path
   against `tile_completions`, return the first not-done tile). This
   doesn't touch `checkTile`/condition evaluation at all -- conditions
   keep working exactly as they do today (cumulative gains since
   challenge start); if a participant's stats already clear a tile's
   bar the instant it unlocks, it completes immediately, same as a
   `freeSpace` tile or a tile added mid-challenge already can.

   **A boss is mechanically just a tile** with a bigger
   points/threshold -- not a new condition type, no special editor UI.
   Its Discord completion embed reuses `buildTileCompletionEmbed`
   as-is, just with boss-flavored title/description text when
   `tile.layout.lane === 'center'` (bigger "cleared the dungeon" text
   for the final boss) -- no new embed builder needed.

   **Leaderboard denominator is a fixed constant per size**, not
   derived from the board's total tile count (15) or a participant's
   specific path length -- every small-dungeon participant always has
   exactly 9 tiles in play, so it's always "X / 9", not "X / 15".

   **Type + size are chosen once, at creation, in
   `NewChallengePage.tsx`** (today hardcodes `board_type: 'grid5x5'`)
   and never editable after -- once tiles exist against a layout
   shape, changing it out from under them has no sane migration.
   New `challenges.board_size` column (`'small' | null`, only
   meaningful for `board_type = 'adventure'`) -- typed as just
   `'small'` for now rather than the full future union, since
   exposing sizes that don't do anything yet is worse than adding them
   when they're real. UI: a Standard/Adventure card picker (Standard
   stays the default), Adventure shows a static "Small -- 15 tiles,
   branching path" sub-line rather than a size dropdown with one
   option.

   **Host authoring falls out of the layout model for free** once the
   board renderer (below) exists to click on: a canonical
   `ADVENTURE_SMALL_LAYOUT` constant (15 `{column, lane}` slots) plays
   the same role `GRID_SIZE=5` plays for Standard's `row*5+col` slots
   in `EditChallengePage.tsx` -- click an empty slot, same
   `TileEditorForm`, no new authoring concept.

   **`TileDetailModal` opens per column, not per tile.** For a fork
   column, it shows every participant (ranked, including "not reached
   yet" ones, same pattern as today), each scored against whichever
   lane's tile they actually picked, with a lane badge next to their
   name (fork index for a column = `Math.floor(column / 3)`). For a
   boss column it collapses to exactly today's single-condition modal.
   Implies the board renderer needs a whole *column* as one click
   target, not individual tile cells.

   **Still fully unscoped: the board's visual rendering.** An entirely
   new component, not a variant of the 5x5 grid -- horizontal,
   branching, connecting lines, locked/unlocked/other-lane-not-taken
   states, mobile layout, whole-column click targets. Probably faster
   to hash out while building than in the abstract.

   Combining Adventure with a Coop/Team game mode (#11) is explicitly
   deferred, not forgotten -- see that item.

## Anti-abuse
8. Whether/who to email when a participant's screenshot count crosses a
   concerning threshold -- detection itself already shipped
   (`increment_screenshot_stats`, the ⚠ badge on `EditChallengePage.tsx`'s
   Players list, a console.warn every 10th screenshot), this is just the
   open notification-behavior question: email the player, the host, both,
   or leave it at the badge/log the host already has? A site-admin
   dashboard (see #12) is the planned first step here -- aggregate,
   site-wide visibility before deciding who gets a targeted email.

## Notifications
9. Full rewrite of Discord notification content (`discordEmbeds.ts`) --
   keep the current embed structure (title/description/fields/image),
   but replace the fixed flavor-text lines (e.g. "Aren't they just
   showing off at this point?") with randomized joke/banter variants
   pulled from a pool, to lean into the site's ".lol" branding. Design
   this aware of the other things already reshaping the same flavor
   text: #7's boss-vs-regular-tile swap and #11's solo/"the group"/
   "Team X" subject swap. Those are two independent dimensions
   (is-boss x who's-the-subject) that'll both exist by the time this
   gets built -- the banter pool should be parameterized by both from
   the start, not bolted on after, or this needs redoing once
   Adventure/Coop/Team ship.

## Account / profile
10. A user profile page letting someone change their email and set a
    default RSN, so they don't have to retype it every time they join a
    new challenge. Two different underlying mechanisms: email lives on
    Supabase's own `auth.users` (changing it goes through
    `supabase.auth.updateUser()`, which re-sends a confirmation email --
    not a plain field update), while a default RSN would need a new
    column on `profiles` (today just `id`, `display_name`,
    `created_at` -- see `supabase/schema.sql`), then `BoardPage.tsx`'s
    join form pre-filling from it instead of starting blank.

## Game modes
11. New game modes, applying to any dungeon type (orthogonal to #7's
    board *type* -- Standard/Adventure -- this is about how a board is
    *scored*, not shaped). New `challenges.game_mode` column (`'solo' |
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
12. A site-administrator role, for the site owner only -- not a
    per-challenge host permission, a whole-site one. Surfaces at an
    unpublished/unlinked URL (not in any nav), showing aggregate stats
    across every challenge: total challenges/participants, screenshot-
    flood offenders site-wide (today's ⚠ badge is scoped to one host's
    own `EditChallengePage.tsx`, with no cross-challenge view at all),
    growth over time, error rates. Directly unblocks #8's "who to
    email" question -- decide that with real aggregate data in front
    of you, not a guess. Scoping still to do: how "site admin" is
    granted (a flag on one specific `profiles` row, presumably, rather
    than a new role system), what the unpublished URL actually needs
    to show first, and whether it's read-only or also lets the admin
    act (e.g. force-close an abusive challenge) from day one.
