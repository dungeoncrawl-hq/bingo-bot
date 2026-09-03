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
3. **Restrict GP/XP thresholds to K/M increments.** Resolved design
   below. Covers exactly 6 fields, all in `TileEditorForm.tsx`: the
   shared `threshold` field when the condition is `xpGained`,
   `skillXpGained`, `xpGainedLowestSkill`, `lootValueGained`, or
   `singleDropValue`, plus `bigDropsCount`'s own separate
   `dropValueThreshold` field. `bigDropsCount`'s *other* field (its
   `threshold` -- how many such drops) stays a plain integer, since
   that's a drop count, not a GP/XP amount.

   **Control**: replace the bare number input for just these 6 fields
   with a two-part control -- a whole-number value input plus a K
   (x1,000) / M (x1,000,000) toggle, combined to form the actual
   threshold. Guarantees every new/edited threshold lands on a clean
   multiple of 1,000 (an integer times 1,000 or 1,000,000 always is)
   with no separate min-increment validator needed. K alone covers any
   value M can't hit cleanly (e.g. "1500" + K for what'd otherwise be
   1.5M) -- no decimal support needed in either field.

   **Existing values on an already-authored tile**: decompose the
   stored raw number back into (value, unit) when the form opens --
   exact M if divisible by 1,000,000, else exact K if divisible by
   1,000, else (a tile saved before this existed, or hand-edited to an
   odd number) falls back to K with the value rounded
   (`Math.round(n / 1000)`) -- a best-effort display only, re-quantized
   to a clean multiple the next time the host actually touches and
   re-saves that field.

   **No knock-on changes needed elsewhere**: every `randomizeBoard.ts`
   default threshold (#5 below) already lands on a clean K/M value
   (200K, 500K, 1.5M, 1M, 5M, 20M, 250K, 100K, 300K -- checked against
   all 6 affected fields), so nothing there needs adjusting.
   `bigDropsCount`'s existing `MIN_DROP_VALUE_THRESHOLD` (100,000)
   clamp on save is unchanged -- the K/M control doesn't need its own
   copy of that rule, just to still produce a number the existing
   clamp can check.
4. **Adventure: logout-gated progress reset between tiles.** Today,
   every tile's condition is checked against a participant's *cumulative
   stats since the challenge's start date* -- nothing resets at unlock,
   so a tile several columns into the path can complete the instant it
   unlocks, off gains racked up earlier in the dungeon (or before
   reaching that fork at all). Resolved design: reset the baseline at
   every tile transition, gated on a Dink `LOGOUT` event specifically --
   not a timestamp/snapshot recorded at tile-completion time, since
   hiscores only get polled daily except when a logout forces an
   on-demand resync (`syncOneParticipant`, already wired up in
   `dinkWebhook.ts`'s `LOGOUT` case) -- a logout is the only moment
   precise enough to serve as a clean baseline for XP/level/clue-tier
   conditions, not just the Dink-event-driven ones.

   **Mechanism.** When tile *N* completes: if the triggering Dink event
   was itself a `LOGOUT`, that event's fresh stat-pull immediately
   becomes tile *N+1*'s baseline, no waiting. If it wasn't, tile *N+1*
   is locked and **not evaluated at all** -- not "hasn't progressed," a
   distinct state -- until the participant's next `LOGOUT` event
   arrives; that logout's fresh pull becomes the baseline the moment it
   lands. The very first tile in a participant's path keeps today's
   behavior (baseline = challenge start) since there's nothing to reset
   yet.

   **New column**: `challenge_participants.adventure_baseline_at
   timestamptz`, nullable. Null = "awaiting a qualifying logout,"
   blocking the frontier tile entirely. Cleared back to null the moment
   a tile completes, so the next tile starts in the same "awaiting"
   state.

   **New plumbing**: `checkChallengeProgress(participantId)` has no
   idea today what kind of Dink event triggered it -- needs an
   `isLogout` flag threaded down from `dinkWebhook.ts`'s `processDinkWebhook`.

   **The one real deviation from today's pattern**: for XP/skill-level/
   clue-tier conditions, `hiscoresRecap.ts` doesn't diff "since a
   timestamp" -- it searches for "the most recent *daily* snapshot
   before a date," which would still leak same-day progress across the
   reset if reused as-is. To make the logout's snapshot the *exact*
   baseline, the reset needs to pin directly to that specific snapshot
   row rather than date-search for it -- a genuinely different code
   path from every other tile-checking flow today, not a reuse of
   `computeHiscoresRecap`'s existing search.

   **New UI state needed**: today's model only has locked/frontier/
   done/other-lane-not-taken. This adds a distinct "reached, but log
   out to start counting" state on the board and in
   `AdventureColumnModal.tsx` -- otherwise a player sees a room right in
   front of them and can't tell why their already-sufficient stats
   aren't registering.

   **Accepted, intended side effect**: one Dink event can no longer
   cascade through several already-satisfied tiles at once (today's
   `while` loop in `challengeProgress.ts`'s Adventure branch) -- each
   tile now genuinely requires a fresh logout before the next one is
   even checkable, so a single big stat lead can't clear multiple rooms
   in one pass anymore. That's the direct mechanism closing the gap,
   not a regression to work around.

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

5. **"Randomize a board" starting point.** Resolved design below --
   scoped to Standard/solo only (grid5x5, `game_mode: 'solo'`), same
   deferral as the section intro above. Fills empty slots with random
   tiles a host then tweaks/replaces by hand, rather than starting from
   a fully blank 25-cell grid.

   **Where it lives**: a "Randomize" button/flow on `EditChallengePage.tsx`,
   next to the grid -- tile authoring only ever happens there today
   (`NewChallengePage.tsx` just creates the `challenges` row and
   redirects), so there's no separate new-vs-existing path to design
   around.

   **Fill scope**: only ever fills currently-empty slots, never
   overwrites a tile the host (or a prior randomize pass) already
   placed. Rerolling one tile is just delete-then-randomize, no
   "was this auto-generated" tracking needed. Consistent with
   `EditChallengePage.tsx`'s existing rule that adding a new tile to an
   empty slot stays allowed even after a challenge has started (only
   editing an *existing* tile's condition locks) -- randomize needs no
   special-casing there.

   **Condition pool**: every `TileCondition` type except `freeSpace`/
   `tbd` (placeholders, not real content -- never auto-generated). No
   center-square free space special case; all 25 slots are treated
   identically. To avoid the pool accidentally skewing (7 of ~15 raw
   types are clue-tier variants alone), a fill picks the *condition
   group* uniformly first (`TileEditorForm.tsx`'s own `CONDITION_GROUPS`
   -- Experience & Levels / Combat / Loot / Clue Scrolls / Collection
   Log / Pets), then a type within that group, then a skill/boss/
   item-set param -- matches how a host naturally spreads a board
   across categories rather than flat-uniform sampling. No exact
   duplicate (type + skill/boss/item-set) combo on one board. Label and
   icon need no new logic at all -- both are already pure functions of
   a tile's condition (`defaultLabelFor`/`defaultIconFor`).

   **The hard part: thresholds.** Nothing in the codebase has ever
   picked a tile's goal number automatically -- `TileEditorForm.tsx`
   just defaults every threshold to `1` and leaves it to the host.
   Resolved as a difficulty picker (Easy/Medium/Hard) at randomize-time,
   each condition type carrying one Medium baseline that Easy/Hard
   scale from. `maxDeaths` is inverted (a *lower* threshold is harder)
   and handled as its own case, not a footnote every future reader has
   to remember. `itemSetCollected`'s threshold is a *fraction* of the
   chosen preset's item count (50% Medium/25% Easy/100% Hard), not a
   flat number, so it stays sane as more item-set presets get added to
   `itemSets.ts` beyond today's single "Barrows uniques" entry.

   `kcGained` is the one type needing real per-item curation: 79 bosses
   in `bossActivities.ts` span wildly different farm rates (50 Giant
   Mole KC is trivial, 50 TzKal-Zuk KC is absurd), so it can't share one
   flat number. Bucketed into 3 farm-rate tiers instead -- fast (GWD,
   Zulrah/Vorkath, Barrows, Mole, etc., Medium 30 KC), slow (Nex, ToB,
   ToA, Whisperer, Leviathan, etc., Medium 10 KC), very slow (Inferno/
   Colosseum/Hard-Mode-raid tier -- Jad, Zuk, Sol Heredit, Phosani's,
   ToB HM, ToA Expert, Medium 2 KC).

   Points scale with difficulty (Easy 1pt / Medium 2pt / Hard 3pt);
   `first_completer_bonus` always starts at 0, same as a host manually
   adding a tile today -- added by hand afterward if wanted.

   **Site-admin-editable, not hardcoded.** These numbers will need
   real-world tuning after launch, so they don't live as TS constants --
   new table `randomize_settings`: a single settings row (`settings
   jsonb`, `updated_at`), holding the whole config as one document --
   per-type Easy/Medium/Hard thresholds, the boss-name-to-tier map plus
   per-tier KC thresholds, and the points-by-difficulty table. RLS:
   public read (the randomize flow needs to read it client-side, same
   as every other tile-authoring write today -- no new server
   endpoint), write restricted to `is_site_admin`. New page
   `/dungeon-master-admin/randomize-settings`, gated by the same
   `is_site_admin` check `AdminLayout.tsx` already enforces for every
   other admin route -- no new auth pattern. `bossActivities.ts`'s
   catalog itself (names/icons) stays a hardcoded TS list, since that's
   static OSRS content that essentially never changes; only the *tier
   assignment* becomes admin-editable, referencing that static list by
   name. The migration seeds the table with the exact values worked out
   above, so admins start tuning from a populated, sensible baseline,
   not an empty one.

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

## Site administration
9. A page under `/dungeon-master-admin` to manage Discord messaging
   templates -- today's completion-embed titles/flavor text are hardcoded
   across `discordEmbeds.ts` and `discordBanter.ts`'s banter pools, so
   changing any wording needs a code change and a deploy. Scope TBD: at
   minimum, editing the banter pools' text without touching code;
   possibly also the fixed (non-randomized) title templates. Needs
   design work on where the editable content actually lives (a new DB
   table the banter pools read from at request time, vs. some other
   store) before this is buildable.

## Infrastructure research
10. **Build a first-party RuneLite plugin instead of depending on Dink.**
    Full research written up in
    [`docs/runelite-plugin-research.md`](docs/runelite-plugin-research.md)
    -- summary here, details there.

    **Actual motivation**: Dink's "Send screenshot" option is a
    per-notifier client setting we have no way to disable from our
    side -- today's mitigation is a setup-guide step asking hosts to
    turn it off for 7 of 10 notifiers, which only works if every player
    follows it. A plugin we author simply never constructs a screenshot
    payload; there's no setting to misconfigure. Nothing short of
    owning the plugin closes this gap.

    **Checked whether an existing alternative plugin already solves
    this** -- surveyed every Discord/webhook notifier plugin broad
    enough to plausibly replace Dink (DropTracker, Discord
    Notifications, Discord Collection/Loot Logger, Universal Discord
    Notifications, others). None thread the needle: the ones that skip
    screenshots entirely are single-purpose or abandoned 2-4+ years;
    the ones broad enough to matter (DropTracker, updated 2026-08-28;
    Discord Notifications, updated 2026-09-02) still bundle an
    optional per-player screenshot setting, the same structural problem
    as Dink. None of them fire on logout at all -- we'd lose both the
    daily hiscores-resync trigger and #4's baseline reset. "Just switch
    plugins" isn't actually a cheaper option than building.

    **Not a blocker, found during research**: RuneLite Plugin Hub
    review is security/Jagex-rules compliance only (not a functionality
    review), and as of April 2026 an automated bot can auto-approve
    routine updates to already-accepted plugins -- so ongoing review
    friction is lower than it looked at first glance. An opt-in,
    player-configured webhook (our exact shape) already has clear
    precedent (Dink itself, `clan-chat-webhook`, others).

    **Turned out to be a non-issue**: the original secondary
    motivation -- whether Dink's events are precise enough for #4's
    logout-gated baseline reset -- mostly evaporates on inspection.
    Dink's `LOGIN` notifier already sends a full, exact per-skill XP
    snapshot straight from the client, no hiscores round-trip needed;
    we just don't consume it today. Worth its own small backlog item
    independent of any plugin decision.

    **Real, unchanged cost**: owning a plugin means owning game-update
    maintenance forever (currently absorbed by Dink's maintainer for
    free), plus asking every host's clan to install a second/different
    plugin. Dink itself is healthy (67k+ installs, updated ~monthly) --
    not an abandonment risk right now.

    **If prioritized**: scope as a minimal notifier-only plugin
    covering just the 7 event types we actually consume today, with
    screenshots never wired up -- not a Dink feature-parity rewrite.

## Challenge setup
Appended here rather than inserted into an earlier section -- several
`(BACKLOG.md #N)` references are already baked into code comments
across the repo, so new items get appended (next number, new section)
instead of renumbering the existing list.

11. Define a maximum length a dungeon is allowed to run for (start_date
    to end_date span) -- today a host can set an arbitrarily long
    challenge with no upper bound. Exact cap TBD.

## Tile authoring UX
12. Re-order the fields on the "Add Tile" modal (`TileEditorForm.tsx`).
    Also add a scroll bar for modals taller than the viewport -- e.g.
    "Obtain a set of items" (itemCount/itemSetCollected, whose item
    catalog list can push the form past the screen) currently has no
    way to reach fields/buttons below the fold.

## Webhook setup UX
13. **One stable per-account Dink URL instead of one per challenge.**
    **Shipped 2026-09-03.** Originally landed as a second, additive
    secret type (`profile_secrets.dink_secret`) alongside the original
    per-challenge `challenges.dink_secret`, so both kept working side
    by side. The "not yet resolved" question from that first pass --
    whether per-challenge URLs should stick around as a documented
    alternative -- was answered the same day: no. The per-challenge
    mechanism was removed entirely (`challenges.dink_secret` dropped,
    `resolveAndProcessDinkWebhook` now only resolves account secrets,
    `SetupGuidePage.tsx`/`DashboardPage.tsx`/`BoardPage.tsx` no longer
    mention it anywhere). One account-wide URL, set up once, is now the
    only way to configure Dink. Accepted, known cost of that cutover:
    any player already using a challenge's own URL (from before this
    feature existed) had to switch to their account URL manually --
    there was no dual-running transition window.

## Timezone handling
14. **Let hosts set a per-dungeon timezone instead of implicit UTC.**
    **Assessed 2026-09-03, not building the full version below for now**
    -- the actual harm is pure UX confusion (nothing was lost or
    mis-awarded, a tile just completed a few hours "earlier" than
    expected), it's only been reported once, and the full fix carries
    real risk (the dual-window split below, four duplicated call sites,
    a cron edge case) for a problem this narrow. Shipped a cheaper
    mitigation instead: the UTC anchoring is now surfaced everywhere
    instead of hidden -- `NewChallengePage.tsx` shows a host's picked
    dates converted into their own browser-detected timezone as they
    pick them, and `BoardPage.tsx` shows a friendlier date range, a
    "Your time: ..." line with the same per-viewer local conversion, and
    a live "N days/hours remaining" countdown (new `formatLocalRange`/
    `preciseCountdownText` in `dungeonStatus.ts`). Revisit the full
    per-host-timezone version below if this recurs for other hosts.

    Prompted by a real report (2026-09-02, ~11:28pm Eastern): WheresMyGear
    completed a tile on `adventure-test` (`start_date: '2026-09-03'`)
    that evening, before the challenge "felt" started. Root cause,
    confirmed against production data: every bare date in this codebase
    is anchored to UTC midnight, both for server-side gating
    (`src/lib/participantStats.ts`'s `boundaryMs`, called from
    `challengeProgress.ts`) and for client-side display
    (`dungeonStatus.ts`'s `displayStatus`, driven by
    `new Date().toISOString().slice(0, 10)`). UTC midnight on Sept 3 fell
    at 8:00pm Eastern on Sept 2 -- 3+ hours before the completion. Not a
    bug (`src/lib/participantStats.ts` even has a comment anticipating
    exactly this: "Revisit if hosts in other timezones report boundary
    tiles completing a day early/late") -- but confusing enough to be
    worth fixing.

    **Resolved direction**: `challenges.timezone`, an IANA identifier
    (e.g. `'America/New_York'`), `not null default 'UTC'` -- every
    existing challenge (including the live `adventure-test`) keeps
    behaving exactly as it does today unless a host explicitly changes
    it. A new small helper module, `src/lib/timezone.ts`, built on
    vanilla `Intl` (no new dependency, same pattern `dungeonStatus.ts`'s
    `formatDateRange` already uses for UTC formatting):
    - `zonedDateToInstant(date, timeZone, edge: 'start' | 'end')` -- a
      bare `"YYYY-MM-DD"` plus a zone, resolved to the UTC instant of
      that zone's midnight (`edge: 'start'`) or end-of-day
      (`edge: 'end'`), via the standard double-format-and-adjust trick
      against `Intl.DateTimeFormat`.
    - `todayInZone(timeZone)` -- "today" as a bare date, as observed in
      that zone (`Intl.DateTimeFormat('en-CA', { timeZone }).format(new
      Date())` conveniently formats as `YYYY-MM-DD`).

    **The non-obvious part**: the four places that build a challenge's
    stats window today --
    `src/server/challengeProgress.ts:190` (server, authoritative),
    `src/pages/BoardPage.tsx:148`, `src/components/TileDetailModal.tsx:84`,
    `src/components/AdventureColumnModal.tsx:71` (client, all three
    near-identical duplicates) -- each build one `{ start, end }` window
    that feeds *two* different consumers with different needs:
    `computeHiscoresRecap` (`src/lib/hiscoresRecap.ts`) wants bare UTC
    calendar-date strings, since `participant_snapshots.recorded_on` is
    stamped once per UTC day regardless of any challenge's timezone
    (`participantSync.ts`'s `recorded_on: todayUtc()`) -- while
    `computeParticipantStats`/`inWindow`/`kcGainedByBoss`
    (`participantStats.ts`) want a real zoned instant. Naively
    zone-converting the whole window would silently corrupt
    `computeHiscoresRecap`'s day-1-baseline lookup (a lexicographic
    string comparison against bare `recorded_on` dates). Each of the
    four sites needs to keep its existing bare-date window for
    `computeHiscoresRecap` untouched and add a second, new zoned-instant
    window (via `zonedDateToInstant`) for everything else -- worth
    factoring the duplicated block into one shared function while
    touching all four anyway.

    `dungeonStatus.ts`'s `displayStatus`/`countdownText` keep their
    existing signature (still just take a plain `today` string) --
    `DungeonDates` gains `timezone`, and callers (`DashboardPage.tsx`,
    `EditChallengePage.tsx`) compute `today` per-challenge via
    `todayInZone(c.timezone)` instead of one shared UTC `today` for
    every row.

    `challengeLifecycle.ts`'s `closeEndedChallenges()` cron can't stay
    one blanket `end_date=lt.${todayUtc()}` filter across every active
    challenge once timezones differ. Keep that UTC filter as a cheap
    first-pass candidate list (anything more than a day past end_date in
    UTC is over in every zone, no exceptions), then for the remaining
    handful of borderline rows, check `now >= zonedDateToInstant(end_date,
    timezone, 'end')` per challenge before actually closing it -- low
    volume, since only challenges near their end date ever reach this
    check.

    UI: `NewChallengePage.tsx` and `EditChallengePage.tsx` get a
    timezone `<select>` next to the date inputs. A short curated list
    (US Eastern/Central/Mountain/Pacific, UK, and a few other
    OSRS-community-common zones, plus UTC) keeps this a plain `<select>`
    instead of needing a searchable combobox for the full ~400-zone IANA
    list. Default it to `Intl.DateTimeFormat().resolvedOptions().timeZone`
    (the host's own browser-detected zone) on the New Challenge form --
    very likely what they already mean by "today." `BoardPage.tsx`'s
    plain `{start_date} – {end_date}` header could also append the zone
    (e.g. "Sep 3 – Sep 12 (Eastern)") so players in a different zone than
    the host know which clock the dates are on -- a clarity nice-to-have,
    not required for correctness.

    **Explicitly out of scope / unaffected**:
    - `hiscoresRecap.ts`'s own window stays on bare UTC dates, per the
      dual-window split above -- `participant_snapshots` are already
      only UTC-day granular (one per day, whenever the sync cron runs),
      so zone-aligning that window wouldn't add real precision, and its
      existing before/after fallback logic already tolerates a day or so
      of slop by design.
    - This is a per-*dungeon* (host-set) setting, not a per-viewer one --
      two players in different zones looking at the same board see the
      same status/dates/gating, anchored to the host's chosen zone
      instead of a hardcoded one. Same "one shared reference clock for
      everyone" model as today, just host-configurable instead of
      always UTC.
    - DST transitions mid-challenge need no special handling -- IANA
      zone identifiers already encode DST rules, so `Intl` resolves them
      correctly on its own.

    **Testing**: `src/lib/timezone.ts` gets its own unit tests (a
    non-UTC zone, a DST-boundary date, an end-of-day edge case);
    `dungeonStatus.test.ts` and `participantStats.test.ts` each gain a
    timezone-aware case alongside their existing UTC ones.

    **Migration**: `alter table challenges add column timezone text not
    null default 'UTC';` -- additive, zero behavior change for every
    existing challenge until a host explicitly edits it.
