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
2. ~~Improve the logic around the "Obtain a set of items" (`itemCount`)
   condition~~ -- **Shipped 2026-09-04.** The real gap turned out to be
   the item catalog (`itemSets.ts`), not the matching logic: only one
   preset set ("Barrows uniques") existed, so that was the only thing
   any itemCount/itemSetCollected tile could ever reference --
   `dinkWebhook.ts` only keeps a granular per-item loot row for a
   catalog item (or a big-value drop), so nothing outside the catalog
   was ever trackable at all. Expanded to 28 curated sets (every major
   raid, GWD, the full 95-item Slayer collection-log tab, and a batch of
   named bosses), each item verified against the OSRS Wiki's own
   drop-table pages rather than typed from memory. Also renamed to
   "Obtain specific uniques" and reworked so a host multi-selects which
   items within a chosen set actually count (Select all/none +
   checkboxes), rather than always summing the whole set -- the tile's
   icon reflects whichever item is first in that selection. See #16 for
   further catalog additions still wanted. **`itemSetCollected` ("Collect
   a full item set") removed entirely 2026-09-04** -- itemCount's new
   multi-select subsumes it (a host can just select every item in a set
   to reproduce the old "collect the full set" behavior), so keeping a
   second, narrower condition type around only added surface area. Also
   removed the now-permanently-dead `tileTaskDetail` (its only non-null
   case was itemSetCollected's "each counts once" caveat).
3. **Restrict GP/XP thresholds to K/M increments.** **Shipped
   2026-09-02** (`708796d`). Covers exactly 6 fields, all in `TileEditorForm.tsx`: the
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
4. **Adventure: logout-gated progress reset between tiles.** **Shipped
   2026-09-02** (`808e6c7`), refined 2026-09-03 (`e7c9f9e`) so only
   hiscores-backed conditions (XP/level/clue-tier) actually need the
   logout -- Dink-event-driven tiles (KC, loot, etc.) now evaluate
   against the previous tile's completion time instead, since their raw
   events already carry real per-event timestamps
   (`conditionNeedsBaseline`/`resolveAdventureTileWindow`). Original
   problem: every tile's condition was checked against a participant's
   *cumulative stats since the challenge's start date* -- nothing reset
   at unlock, so a tile several columns into the path could complete the
   instant it unlocked, off gains racked up earlier in the dungeon (or
   before reaching that fork at all). Mechanism: reset the baseline at
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

5. **"Randomize a board" starting point.** **Shipped 2026-09-02**
   (`f7361e2`) -- scoped to Standard/solo only (grid5x5, `game_mode: 'solo'`), same
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
   to remember. (`itemSetCollected` originally had its own
   percentage-of-the-set threshold here too -- moot since #2 removed the
   condition type entirely on 2026-09-04.)

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
9. ~~A page under `/dungeon-master-admin` to manage Discord messaging
   templates~~ -- **Shipped 2026-09-02** (`ad9df85`), verified still
   live 2026-09-06 (`discord_banter_lines` has real rows in
   production). Covers the "at minimum" half of the original scope:
   the 5 randomized completion-embed flavor pools
   (`discordBanter.ts`) moved from hardcoded arrays to
   `{points}`/`{rsn}`-templated strings in a new `discord_banter_lines`
   table, editable at `/dungeon-master-admin/discord-templates` with no
   code deploy needed. `tileCompletionFlavor`/`boardCompletionFlavor`
   stay pure and default to the hardcoded pools when none are passed,
   so no existing caller needed to change. **Not covered, still
   hardcoded**: `discordEmbeds.ts`'s fixed (non-randomized) title
   templates -- deferred at the time as a bigger lift (real
   conditional branching, not just interpolation) than the banter
   pools were.

   **Scoped and shipped 2026-09-09.** `discordEmbeds.ts` currently
   hardcodes 6 distinct title strings, not 5 like the banter pools --
   unlike a banter pool (many randomized variants, one picked per
   event), each title slot is a single deterministic string, so this
   needs a materially different admin UI, not a copy of the banter
   page's add/remove-a-line pattern.

   **The 6 slots**, extracted as-is from today's inline ternary chain in
   `buildTileCompletionEmbed`/`buildLineCompletionEmbed`/
   `buildBoardCompletionEmbed`, each becoming the new
   `DEFAULT_TITLE_TEMPLATES`:
   - `tileFirst`: `"{subject} was first to complete the {phrase} task!"`
   - `tileNotFirst`: `"{subject} completed the {phrase} task."`
   - `bossFirst`: `"{subject} was first to defeat {bossLabel} -- the {phrase} boss!"`
   - `bossNotFirst`: `"{subject} defeated {bossLabel} -- the {phrase} boss."`
   - `lineCompletion`: `"{subject} completed a line!"`
   - `boardCompletion`: `"{subject} completed the whole board!"`

   `{bossLabel}` (today's "a boss" / "the FINAL BOSS" distinction) stays
   a substituted variable rather than becoming 4 separate boss slots
   (mid-boss vs. final-boss × first vs. not-first) -- considered and
   rejected: doubles the boss section for a distinction an admin who
   cares can already express by using `{bossLabel}` prominently in their
   own wording. Same generic `{key}` substitution `discordBanter.ts`'s
   `fill()` already does, reused rather than reimplemented.

   **Data model**: new `discord_title_templates` table -- `slot` (the 6
   values above, `unique`, unlike `discord_banter_lines`' `pool` column
   which intentionally allows many rows per pool), `template`,
   `updated_at`. One row per slot, so saving is a per-slot upsert, not
   banter's delete-everything-then-reinsert-everything (that pattern
   exists there because a pool's *entire ordered list* is what's being
   replaced each save; a single title string doesn't need that). Same
   RLS shape as `discord_banter_lines` (public read, site-admin write).
   New `discordTitleStore.ts` (mirrors `discordBanterStore.ts` exactly,
   including its 60s TTL cache and per-slot fallback to the hardcoded
   default when a slot's row is missing or blank -- an admin clearing a
   field to empty must never post a blank Discord embed title).
   `challengeProgress.ts` fetches `titles` alongside its existing `pools`
   fetch and threads it through the same way.

   **Admin UI -- same page (`AdminDiscordTemplatesPage.tsx`), a new
   section above the existing banter pools** (titles are the first thing
   a reader sees in the embed, so editing them first matches the
   embed's own reading order; keeps every piece of Discord-embed
   customization on the one page rather than splitting it across two nav
   items). Concretely, *not* a reskin of the banter section's
   add/remove-a-line list -- six single-line inputs, grouped the way a
   host actually thinks about them rather than as an undifferentiated
   flat list of 6: a "Tile completions" group (`tileFirst`/`tileNotFirst`
   side by side), a "Boss completions" group (`bossFirst`/`bossNotFirst`,
   Adventure-only but shown regardless of board type, same as the
   banter page already does for its own boss pools), then
   `lineCompletion` and `boardCompletion` each on their own.

   Four specific UX decisions, each because titles carry more risk than
   a banter line (a banter line is supplementary flavor text below the
   fold; a broken title is the very first thing anyone reads):
   1. **A placeholder legend per field, not repeated prose.** A boss
      title can reference three placeholders at once
      (`{subject}`/`{bossLabel}`/`{phrase}`) -- the banter page's "Use
      `{rsn}` where it should go" sentence, repeated three times, reads
      clumsy. Show the available placeholders for that slot as small
      inline badges instead, once, above the input.
   2. **Live preview substituted with a realistic example, not literal
      placeholder text** -- e.g. `bossFirst`'s preview renders
      "ExampleRSN was first to defeat the FINAL BOSS -- the 1,000,000
      total XP boss!", not a sentence with `{phrase}` left unfilled.
      Directly reuses the banter page's existing preview-under-the-input
      pattern, just with a richer fixed example-variable set.
   3. **A required-placeholder warning, not a hard block.** If a saved
      template drops `{subject}` entirely, warn inline (a title with no
      one named in it reads as broken almost every time) but still allow
      saving -- an admin who genuinely wants a subject-less title has a
      legitimate reason to, the same way this app never blocks a host
      from an unusual-but-valid choice elsewhere.
   4. **Per-slot "Reset to default," alongside the existing page-wide
      "Reset to defaults."** Losing one of many banter lines to a
      misclick is low-stakes; losing your only custom board-completion
      title because a global reset also touched the other 5 you'd
      already gotten right is a real regression the current page's
      all-or-nothing reset doesn't protect against once titles have
      their own per-slot values to lose.

   **Deliberately not building**: a "send a real test post" button.
   Matches this project's own standing rule against posting test data to
   real Discord webhooks -- the live client-side preview (point 2 above)
   is the safe substitute, same as how the banter page already proves
   itself without ever touching a real channel.

   **Built as scoped**, one deliberate simplification: `discordTitles.ts`
   (new module, mirrors `discordBanter.ts`'s shape) holds
   `DEFAULT_TITLE_TEMPLATES` and the three pure title-builder functions;
   `discordEmbeds.ts`'s three embed builders each gained a `titles?`
   param threaded the same way `pools?` already was;
   `discordTitleStore.ts` (mirrors `discordBanterStore.ts`, same 60s TTL
   cache and per-slot default fallback) is fetched in
   `challengeProgress.ts` alongside the existing banter-pool fetch --
   unlike pools (only needed for tile/board embeds), titles are fetched
   whenever *any* embed will be built, since a line-completion title
   needs one too. `discordBanter.ts`'s own `fill()` is now exported and
   reused rather than reimplemented, per the scoping doc's own note.

   `AdminDiscordTemplatesPage.tsx` gained a "Titles" section above the
   existing flavor-pool section (one combined Save button covers both;
   the "Reset to defaults" button now resets both too), built exactly to
   the four UX decisions in the scoping doc above -- placeholder badges,
   realistic live preview, a soft (non-blocking) `{subject}` warning, and
   a per-slot Reset alongside the page-wide one. Also fixed this same
   page's header row to wrap instead of cramping on a narrow screen,
   part of the mobile-friendliness/nav pass done alongside this (see the
   `## Admin UX` note below).

   New table `discord_title_templates` -- migration written, **not yet
   run** (see bottom of this item for the SQL). Until it runs, both
   `discordTitleStore.ts` (server) and the admin page (client) degrade
   the same way #22/#26 already established this codebase's pattern for
   a brand-new standalone table: a missing-table query resolves to
   `{data: null, error}` for that one fetch, so every title/caption
   correctly falls back to `DEFAULT_TITLE_TEMPLATES` and the admin page
   still loads and previews correctly -- confirmed live (four expected
   404s in the console, nothing else broken).

   **Found and fixed in passing**: a live production `discord_banter_lines`
   row (`firstTile`'s "Somebody's speedrunning this challenge.") still had
   pre-#25 wording -- the terminology sweep only touched hardcoded source
   strings, never rows an admin had already saved to the DB before it ran.
   Fixed directly (now "...this dungeon.", matching the hardcoded default
   it was cloned from).

   Live-verified: the {subject}-missing warning correctly appears/clears
   when editing/resetting `tileFirst`'s input; per-slot Reset correctly
   restores just that one slot's default text without touching any
   other field; the page renders with no horizontal overflow at a
   375px-wide viewport, tab bar included.

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

11. ~~Define a maximum length a dungeon is allowed to run for~~ --
    **Shipped 2026-09-09.** Cap set to 180 days
    (`daysBetween(start_date, end_date) <= 180` -- a 180-day dungeon can
    run e.g. Jan 1 -> Jun 29, a 181-calendar-day inclusive span). New
    `MAX_DUNGEON_LENGTH_DAYS` (`dungeonStatus.ts`), reusing the existing
    `daysBetween` helper rather than adding a second date-math function.

    Checked in both `NewChallengePage.tsx` (creation) and
    `EditChallengePage.tsx`'s "Dungeon details" section (draft-only date
    editing, #26) -- client-side only, no migration, matching the
    existing "end date can't precede start date" check right next to it
    in both files (which itself had no DB constraint either). Found and
    fixed the same gap while here: `NewChallengePage.tsx` never actually
    checked end >= start at all (only that neither date was in the
    past) -- a host could already have set a backwards range on
    creation, which would also have broken the new day-span math (a
    negative span trivially clears "<= 180").

    **UX, not just validation**: the end-date `<input type="date">`'s
    `min`/`max` are now wired to the chosen start date (`min` was
    already `today`, unconditionally, even after a later start date was
    picked) -- the browser's own date picker won't offer an invalid or
    over-limit date at all, so the error text is a fallback for
    something that slipped past the picker (a pasted value, an older
    browser), not the primary way most hosts ever discover the limit. A
    small caption under the fields states the cap once a start date is
    picked but no end date yet.

    Live-verified: picking a start date correctly set the end-date
    picker's `max` to exactly start + 180 days (checked against
    independent date math); the native picker constraint blocked an
    out-of-range value at the browser level; removing that constraint to
    simulate a browser that doesn't enforce it confirmed the JS-level
    check still catches it and shows the same message.

## Tile authoring UX
12. Re-order the fields on the "Add Tile" modal (`TileEditorForm.tsx`).
    **Scroll-bar half shipped 2026-09-04**: the modal (`<form>`) is now a
    flex column capped at `max-h-[calc(100vh-2rem)]`, split into a fixed
    header (title + locked-challenge notice), a scrollable middle
    (every condition-specific field, the goal, points, bonus, and any
    error), and a fixed footer (Save/Cancel/Delete) -- a large catalog
    set (e.g. "Slayer monster uniques," 95 checkboxes) used to be able
    to push Save/Cancel off-screen with no way to reach them at all;
    now only the field list itself scrolls and the action buttons are
    always visible. Field *order* itself is unchanged -- no specific
    target order was set when this item was filed, and reshuffling
    without one risks just moving the complaint around. Needs a host
    decision on what the ideal order actually is before that half is
    worth doing.

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

## Board display
15. ~~The per-tile progress indicator (top-right corner, standard board
    grid) should be a solid filled circle in the progress color, not
    just an outline~~ -- **Shipped 2026-09-04.** Swapped the hollow `○`
    glyph for the filled `●` one in BoardPage.tsx's badge (and its
    legend text) -- one-character fix, `progressColor`'s color already
    applied correctly, it just had nothing solid to fill.

## Item catalog
16. ~~More curated sets to add to `itemSets.ts` (BACKLOG.md #2's
    catalog)~~ -- **Shipped 2026-09-09.** 12 new sets: Vorkath, Zulrah,
    the 4 DT2 bosses (Duke Sucellus, The Leviathan, The Whisperer,
    Vardorvis -- kept as 4 separate sets despite sharing the Virtus
    armour/Chromium ingot items on their real drop table, same reasoning
    as this file's existing reskinned-boss pairs), The Gauntlet and The
    Corrupted Gauntlet (also kept separate -- Corrupted's set includes
    the Gauntlet cape, regular's doesn't), Yama, Araxxor, Doom of
    Mokhaiotl, Grotesque Guardians.

    Every item name pulled from each boss's own OSRS Wiki drop-table page
    (not typed from memory), then all 42 candidate wiki image URLs
    live-verified with a HEAD request before adding, same process the
    original catalog used. Pets excluded from every new set (Vorki,
    Snakeling, Youngllef, Yami, Dom) -- matching this catalog's dominant
    convention, since `petsObtained` already exists as its own tile
    condition and doesn't need double representation here.

    New tests: all 12 names present, plus a dedicated check that The
    Gauntlet and The Corrupted Gauntlet stay distinct sets (the
    `startsWith` check the earlier 12-boss test uses would otherwise
    pass even if they'd been accidentally merged).

17. **"Obtain specific uniques" (itemCount) needs an ANY/ALL goal mode,
    plus showing the actual selected items on the player-facing tile
    modal.** **Shipped 2026-09-04.** Previously itemCount only summed
    quantity across the host's selected items (a fast Vorkath grinder
    could clear "get 2 of these 3 items" purely off 2 draconic visages)
    -- no way to require each selected item be obtained at least once.

    **ANY** (today's only behavior, becomes the default so no existing
    tile's meaning changes): progress is total quantity across the
    selection, duplicates of one item freely substitute for another.
    **ALL**: progress is how many of the selected items have been
    obtained at least once (duplicates of an already-obtained item
    don't help) -- this is exactly `itemSetCollected`'s old semantics
    (removed as its own condition type 2026-09-04, see #2), now meant
    to live as a mode on itemCount instead of a second sibling type,
    since the two share every other piece of the data model
    (itemNames/setName/threshold) and now the same multi-select UI.

    **Data model**: `itemCount` gained an optional `mode: 'any' |
    'all'` field, absent/defaulting to `'any'` on every tile saved
    before this shipped -- zero behavior change for them.
    `checkTile`'s itemCount case branches on it: `'any'` keeps the
    original `itemCounts` sum; `'all'` reuses the distinct-obtained-
    at-least-once counting logic `itemSetCollected` used to have.
    `formatTileGoal`/`formatTileProgress`/`describeTileCondition`/
    `tileTaskPhrase` are all mode-aware too, so "All" reads as "every
    one of these N items"/"X/Y items" rather than the ambiguous "Nx".

    **TileEditorForm.tsx**: an Any/All toggle shown once itemCount is
    selected, above the item checklist -- switching to "All" defaults
    the goal to the current selection's full size (the common case),
    without overwriting it again on further checkbox clicks.

    **Player-facing display**: `TileDetailModal.tsx` and
    `AdventureColumnModal.tsx` (per lane, for Adventure rooms) both
    list the tile's actual targeted items -- icon + name, via the same
    `itemIcon()` resolver the tile's own auto-icon already uses -- at
    the bottom of the modal, so a player can see exactly which items
    count without guessing from the catalog name alone.

    Live-verified in the browser: the toggle renders and auto-sets the
    goal on switching to "All"; the board grid caption reads "2/2
    items"; the tile detail modal lists the two selected items with
    resolved wiki icons.

## Feedback
18. ~~A lightweight feedback form~~, reachable from anywhere in the
    app -- **Shipped 2026-09-04**, no Discord relay (see #19).

    **Data model**: new `feedback` table -- `id`, `profile_id` (who
    submitted; not nullable, since every write in this app already
    requires auth -- no anonymous-submission path needed), `page_path`
    (captured automatically from `window.location.pathname` at submit
    time, not typed by the user -- context for free), `message` (the
    one field the user actually fills in), `created_at`, `reviewed`
    (boolean, default false -- lets the admin page dim/hide things
    already looked at without deleting the row). RLS: insert allowed
    for any authenticated user inserting their own `profile_id` (same
    shape as every other participant-writes-their-own-row policy in
    `schema.sql`); select/update restricted to `is_site_admin` (same
    `exists(...)` pattern already used for `randomize_settings`/
    `discord_banter_lines`) -- feedback text could say anything, so
    unlike most of this schema it shouldn't be publicly readable.

    Migration ran 2026-09-04 -- verified live (real submitted rows in
    production, including a since-cleaned-up test one) both then and
    again 2026-09-06.

    **Submit UI** (`FeedbackModal.tsx`): a small modal (styled like
    `TileDetailModal.tsx`), triggered from a "Feedback" link in
    `Footer.tsx` (next to "About us", shown only when signed in) --
    one textarea, a Submit button, a brief "thanks" state on success.
    No page navigation, so it stays usable mid-board without losing
    scroll position/state.

    **Review UI** (`AdminFeedbackPage.tsx`): new
    `/dungeon-master-admin/feedback` page (added to `AdminLayout`'s
    nav), listing rows newest-first with the submitter's display name,
    `page_path`, the message, and a "mark reviewed" toggle (optimistic,
    reverted on failure) -- reviewed rows are hidden by default behind
    a "Show reviewed" checkbox rather than deleted. No reply mechanism
    -- if a submission needs a response, that still happens out-of-band
    (Discord/in person); this is a capture-and-triage tool, not a
    support-ticket system.

19. Relay new feedback submissions (#18) to a site-wide Discord
    webhook, so they surface immediately instead of waiting for an
    admin-page visit. Deliberately deferred out of #18's v1 -- would
    need its own site-level webhook URL setting, since
    `challenges.discord_webhook_url` is per-challenge, likely another
    singleton-row settings table matching `randomize_settings`'
    pattern. Worth revisiting once there's real submission volume.

20. ~~A site-admin-authored changelog~~ -- **Shipped 2026-09-04**,
    minus the Discord-broadcast channel (see #21).

    **Data model**: new `announcements` table -- `title`, `body`,
    `created_at`, `published_at` (null = draft, invisible outside the
    admin page -- two RLS SELECT policies, public-read-if-published
    OR-combined with a blanket site-admin policy, same pattern as
    every other admin-authored table here), `emailed_at` (null until
    the one-time subscriber email for this row has gone out -- what
    stops a second accidental send). Publishing (visible on the
    site) and emailing subscribers are two separate, deliberate admin
    actions, not one Save button -- a typo-fix republish must never
    silently re-blast every inbox.

    **Email opt-out**: new `profiles.email_notifications` boolean,
    defaulting to true (opt-out, not opt-in) -- a toggle on
    `AccountPage.tsx` alongside Default RSN/the Dink webhook.
    Unrelated to Supabase's own auth emails (magic link/signup
    confirmation), which always send regardless of this flag.

    **One-click unsubscribe, no login required**: the link in every
    email is `/api/unsubscribe?profile=<id>&token=<hmac>` -- the token
    is `HMAC-SHA256(profileId, UNSUBSCRIBE_SECRET)`
    (`src/server/unsubscribeToken.ts`), verified statelessly with no DB
    lookup or session, so it works even from an email client that
    never has an app session. Includes `List-Unsubscribe`/
    `List-Unsubscribe-Post` headers for one-click compliance in Gmail
    etc.

    **Sending**: `src/server/resendEmail.ts` calls Resend's REST API
    directly (raw fetch, no `resend` npm dependency -- matches
    `supabaseAdmin.ts`'s own raw-fetch-over-SDK convention), batched
    at 100 recipients/call. `profiles` deliberately has no email
    column (see #18's own privacy note) and `auth.users` isn't
    reachable through PostgREST, so a new `subscribed_emails()` SQL
    function (security definer, execute revoked from every
    client-facing role) is the only way to resolve "which addresses
    opted in" without paging the Admin Auth API by hand.
    `api/announcements/send.ts` is gated by a new
    `src/server/adminAuth.ts` (`requireSiteAdmin`) -- resolves the
    caller's bearer token via Supabase's own `/auth/v1/user` endpoint
    rather than adding a JWT-verification dependency, then checks
    `is_site_admin`. Reusable by any future admin-only API route.

    **Reading it**: `HomePage.tsx` teases the latest 3 published
    entries; `/changelog` (`ChangelogPage.tsx`) lists the full
    history; `/feed.xml` (`api/feed.ts`, rewritten ahead of the SPA
    catch-all in `vercel.json`) is a plain RSS feed for anyone who'd
    rather subscribe that way. A small dot badge on the Footer's new
    "Updates" link compares the latest announcement's id against a
    `localStorage` "last seen" value (cleared on visiting
    `/changelog`) -- catches someone who's logged in but never
    revisits the home page, no account-level tracking needed.

    All three setup steps are done as of 2026-09-04: the `schema.sql`
    migration ran (verified live -- `subscribed_emails()` correctly
    resolves every opted-in account's email), `RESEND_API_KEY`/
    `UNSUBSCRIBE_SECRET` are set in Vercel, and dungeoncrawl.lol is
    verified in Resend with no sending subdomain (`FROM_ADDRESS` in
    `resendEmail.ts` already matched -- just needed its stale TODO
    comment cleared).

    **2026-09-08 follow-up**: `AdminAnnouncementsPage.tsx` only ever
    supported create/publish/unpublish/delete -- there was no way to fix
    a typo or reword an existing announcement (draft or already
    published) short of deleting and recreating it, found while drafting
    the site's actual first announcement. Added an inline Edit form per
    row (reuses the same `site admin all` RLS write access
    publish/unpublish already relies on -- no migration needed).

21. Broadcast new announcements (#20) to Discord too, opt-in per
    challenge, reusing that challenge's own `discord_webhook_url` --
    reaches players who never revisit the site between events, which
    email/the home page can't. Deliberately deferred out of #20's v1:
    off by default, since mixing gameplay completion pings with
    unrelated site news in someone's clan channel uninvited is a good
    way to get the webhook removed.

## Player identity
22. **A player-chosen profile icon**, shown next to their rsn on
    leaderboards and participant lists. **Shipped 2026-09-06.** Picked
    from icons this app already has elsewhere, grouped the same way
    those already are -- not a freeform image upload/URL.

    **Catalog** (`src/lib/profileIcons.ts`): Skills (24, `SKILL_ORDER`),
    Bosses (79, `BOSS_ACTIVITIES`), Items (one subgroup per item-catalog
    set, matching `TileEditorForm.tsx`'s own item-catalog dropdown --
    flattening all ~28 sets into one list would be hundreds of icons
    deep with no way to narrow it down), Clue Scrolls (7, all-tiers +
    each individual tier), Pets, and Other (Combat/Total Level/
    Collection Log/Coins/Skull/GOTR -- the remaining single-icon
    condition types). `tileIcons.ts`'s previously-module-private misc
    icon consts are now exported so this catalog doesn't retype the
    same URLs a second time.

    **Pets came from the sibling `rs` project, not this one** -- this
    app only ever used one generic pet icon (Baby Mole, for the
    `petsObtained` tile condition), which would've made "Pets" a
    category of one. `rs/src/lib/petIcons.ts` already has a full,
    wiki-verified, production-tested catalog of every OSRS pet (79
    boss/skilling/other pets); ported the icon-catalog portion of it
    into a new `src/lib/petIcons.ts` here (not the Dink-specific
    per-pet-name reverse lookup, which doesn't apply -- this app's
    `petsObtained` is a plain counter, not a named-pet log). Several
    reskinned boss pairs (Artio/Callisto, Spindel/Venenatis, the two
    Gauntlet variants, Chaos Elemental/Chaos Fanatic, the two Chambers
    of Xeric variants) share one literal in-game pet -- deduped by icon
    URL and labeled with the pet's own real name (derived from its icon
    filename) rather than showing the same icon twice under two
    different boss names.

    **Data model**: `profiles.icon_url text`, nullable (null = none
    chosen, nothing shown -- today's behavior for every existing
    account). CHECK restricts it to the `oldschool.runescape.wiki`
    host, same "no hotlinking arbitrary images" boundary already
    applied to every other icon URL in this schema -- doesn't enforce
    exact catalog membership (that list changes over time and
    duplicating it in SQL would drift), just blocks embedding an
    arbitrary external image. No new RLS needed -- profiles' existing
    "own row write" policy already covers it.

    **Picker** (`ProfileIconPicker.tsx`, opened from a new "Profile
    icon" section on `AccountPage.tsx`): top-level group tabs, a
    subgroup `<select>` when a group has more than one (Items, Pets),
    and a scrollable icon grid below -- same fixed-header/scrollable-
    middle/fixed-footer shape as `TileEditorForm.tsx`'s own modal,
    since Items' biggest subgroups run to dozens of icons.

    **Display**: threaded into every participant-facing name render --
    `BoardPage.tsx`'s ranked leaderboard and Coop roster,
    `EditChallengePage.tsx`'s Players list, and both
    `TileDetailModal.tsx`'s and `AdventureColumnModal.tsx`'s per-
    participant progress rows (team/pooled rows show no icon -- there's
    no single profile to represent). **2026-09-06**: also added to the
    small per-tile "who's here" chips on the Adventure board overlay --
    a chosen icon replaces the colored circle-with-initial-letter chip
    there too now (still falls back to the letter chip when no icon is
    set), on request after the rest of this item shipped.

    Migration ran 2026-09-06 -- verified live end-to-end in production:
    picked an icon on `/account`, confirmed it persisted
    (`profiles.icon_url`), and confirmed it actually renders (a real,
    loaded 16x16 image, not a broken link) next to a participant's rsn
    on a throwaway challenge's leaderboard, plus (after the Adventure-
    chip addition) a real 14x14 render replacing the frontier chip too,
    verified on a throwaway Adventure board.

23. **A player-chosen color** (#22 follow-up), used for their Adventure
    "who's here" chip background and their leaderboard text, so
    players are easier to tell apart at a glance. **Shipped
    2026-09-06.**

    **Chip shape**: also changed from a circle to a rounded square
    (both the icon version and the plain-letter fallback) -- requested
    alongside the color work, unrelated to color itself.

    **Palette**: a small closed set (`src/lib/playerColors.ts`'s
    `PLAYER_COLORS`, 6 colors), not a freeform color picker -- picked
    to read well against this site's dark stone background. Small and
    stable enough that `schema.sql`'s CHECK enumerates the exact list
    (unlike `icon_url`'s domain-prefix CHECK, whose catalog is too
    large/changeable to enumerate). `AccountPage.tsx` shows it as 6
    plain swatch buttons -- no picker modal needed at this size.

    **No color chosen -- random per dungeon**: `BoardPage.tsx`'s old
    `chipColorFor` (a hash of `challenge_participants.id`, already
    used for the frontier chip's background before this shipped) moved
    into `playerColors.ts` as `colorForParticipant` and now backs both
    the chip and the leaderboard text whenever `profiles.color` is
    null. Hashing the *participant row* id rather than the profile id
    is what makes this "random, but stable, per dungeon" rather than
    one fixed color for the account everywhere -- the same account
    joining a second challenge gets an independently-hashed color
    there, since it has a different `challenge_participants.id`.

    **Leaderboard text**: applies to `BoardPage.tsx`'s ranked list and
    Coop roster (solo/individual rows only -- a team has no single
    profile's color to use, same reasoning #22 already applied to
    icons). This retired the ranked list's old amber-for-"currently
    viewing" text color, which would have fought with a player's own
    color -- viewing a row is now shown with bold + underline instead,
    an orthogonal visual channel, so a player's color always means the
    same thing regardless of what's currently being viewed.

    **Scope**: deliberately just the Adventure chip and the
    leaderboard, matching what was asked -- not extended to
    `TileDetailModal.tsx`/`AdventureColumnModal.tsx`/
    `EditChallengePage.tsx`'s own name renders, which keep plain
    styling.

    Migration ran 2026-09-06 -- verified live end-to-end in production:
    picked Sky on `/account`, confirmed it persisted
    (`profiles.color`), and confirmed both consumers render the exact
    chosen color (`rgb(56, 189, 248)`/`#38bdf8`) -- the Adventure
    chip's background (computed `border-radius: 4px`, confirming the
    rounded-square shape too, not a circle) and the leaderboard text --
    on a throwaway Adventure challenge.

    **Learned the hard way while shipping this**: adding a column to
    an existing table that's already joined into a live query (here,
    `profiles(...)` inside `BoardPage.tsx`'s participants fetch) is
    riskier than adding a whole new standalone table (#18/#20's
    `feedback`/`announcements`) -- until the migration runs, the
    *entire query* errors and every leaderboard on the site renders as
    empty, not just the new field quietly missing. #22's `icon_url`
    carried this exact same risk (same query, same join) without it
    being caught at the time -- worth deploying and migrating
    back-to-back for this whole class of change from now on, not
    "deploy now, migrate whenever."

    **2026-09-06 follow-up, same day**: four refinements.
    - **Padding**: every icon badge now has a little breathing room
      around the icon instead of it touching the badge's edges --
      pulled into a new shared `PlayerIcon.tsx` (icon + colored
      background + padding + rounded-square shape in one place) so the
      fix, and every future one like it, only has to happen once.
    - **Palette fix**: `#fb923c` (orange) swapped for a cyan, plus a
      white option added -- orange was too close to `#f59e0b` (amber)
      to tell apart at a glance, undermining the whole point of a
      color palette. Needs its own CHECK-constraint migration (Postgres
      doesn't let a changed inline CHECK re-apply itself against a
      column that already exists) -- lower-stakes than #23's own
      column-add risk above, since existing colors keep working either
      way; only picking one of the two new options would fail (and
      revert cleanly, not crash) until this runs.
    - **Icon background everywhere, not just the Adventure chip**:
      `PlayerIcon` (see above) is now used everywhere a player's icon
      renders -- the leaderboard, `TileDetailModal.tsx`,
      `AdventureColumnModal.tsx`, `EditChallengePage.tsx`'s Players
      list -- not just the chip. Text color stays leaderboard-only, as
      already scoped above; this is icon-background only.
    - **Account page preview**: the icon preview box on `/account`
      shows the chosen color as its own background now too, so a host
      previews the actual combination before it ever appears on a
      board.

    CHECK-constraint migration ran 2026-09-06 (took two attempts -- the
    first report of it running didn't actually take, caught by testing
    the constraint directly rather than trusting the report). Verified
    live: cyan and white both save now, and the removed `#fb923c`
    (orange) is correctly rejected.

24. **Fixed broken grammar in the itemCount ("Obtain specific uniques")
    mode "all" description when only one item is targeted.** **Shipped
    2026-09-06.** `describeTileCondition`/`tileTaskPhrase`
    (`tileConditions.ts`) both built this text as `"every one of these
    N {setName} items"`, which reads fine for N > 1 but produces
    nonsense at N = 1 ("every one of these 1 Barrows uniques items")
    -- reported from the tile detail modal's own description line,
    also shown as the board tile's hover tooltip and in Discord
    completion posts ("completed the ... task").

    With only one targeted item there's no "every one of" or "N of M"
    distinction left to make -- fixed by naming the item directly
    (`cond.itemNames[0]`, e.g. `"Verac's flail"`) whenever
    `itemNames.length === 1`, which reads naturally in every context
    this string gets dropped into (a standalone tooltip/description
    line, or "completed the {phrase} task"). Multi-item phrasing is
    unchanged. Added test coverage for both functions -- the modal/
    tooltip line had none before this (`describeTileCondition` wasn't
    tested at all). Live-verified via the board tile's hover tooltip on
    a throwaway single-item tile.

    **Same-day follow-up**: naming the single item directly fixed the
    grammar, but for a single-item tile it meant the item's name now
    appeared *three* times on the tile detail modal -- once in the
    header (`tile.label`, already the item's own name --
    `defaultLabelFor`), once in this description line, and once more in
    the "Targeted items" list below. New
    `itemCountModalDescription(cond)` (`tileConditions.ts`) replaces
    `describeTileCondition` specifically on `TileDetailModal.tsx`'s/
    `AdventureColumnModal.tsx`'s description line (not the board tile's
    hover tooltip or Discord's "completed the ... task", which keep
    `describeTileCondition`'s own phrasing -- neither of those show an
    item list underneath, so there's nothing to be redundant with
    there): for itemCount mode "all", regardless of how many items are
    targeted, it returns one fixed sentence -- "Each of the targeted
    items below must be obtained. Duplicates do not count." -- instead
    of naming the count/setName/item a second time. Mode "any" (where
    duplicates *do* count, so that sentence would be wrong) keeps
    `describeTileCondition`'s normal text, as does every non-itemCount
    condition. Live-verified both the single- and multi-item case in
    the tile detail modal.

25. **"Challenge" → "Dungeon" user-facing terminology sweep.** **Shipped
    2026-09-06/07.** Started as one button + one page title
    (`DashboardPage.tsx`'s "New Dungeon" button, `NewChallengePage.tsx`'s
    heading), then widened into a full audit of every literal
    "challenge"/"Challenge" string actually shown to a user, since the
    site's own branding ("My Dungeons," etc.) had never been carried
    through consistently.

    **Audited and fixed** (12 files): `HomePage.tsx` (CTA + subhead),
    `NewChallengePage.tsx` (heading + submit button), `AboutPage.tsx`,
    `AccountPage.tsx` (Default RSN caption, Dink webhook caption),
    `BoardPage.tsx` (leave-dungeon confirm dialog, not-found state,
    sign-in prompt, Leave/Edit Dungeon buttons), `EditChallengePage.tsx`
    (publish/delete confirm dialogs, not-found and not-your-dungeon
    states, the invite-message template), `DashboardPage.tsx` (the same
    invite-message template, kept word-for-word in sync with
    `EditChallengePage.tsx`'s per an existing comment),
    `SetupGuidePage.tsx` (not-found state, two webhook captions),
    `TileEditorForm.tsx` (locked-tile notice), `discordBanter.ts` (one
    default flavor line), `AdminGrowthPage.tsx`/`AdminParticipantsPage.tsx`
    (table headers/captions -- `key: 'challenge'`'s own internal sort
    identifier left untouched, only its `label` changed).

    **The invite-message rewrite needed real thought, not a literal
    swap**: "Come join my Dungeon Crawl challenge" naively becomes "Come
    join my Dungeon Crawl dungeon" -- the word stacks awkwardly right
    next to the site's own name. Reworded to "Come join my dungeon on
    Dungeon Crawl, ..." instead, in both files at once.

    **Deliberately not touched**: `'Chambers of Xeric: Challenge Mode'`
    (`bossActivities.ts`/`petIcons.ts`/`randomizeSettings.ts`) -- the
    verbatim official OSRS Hiscores/game activity name, not this app's
    own branding; changing it would silently break matching against
    Jagex's own API and Dink's webhook payloads. Every `Challenge`/
    `challenge` type name, variable, prop, Supabase table/column
    (`challenges`, `challenge_participants`, `challenge_id`), file name,
    and code comment stays as-is -- internal identifiers, never shown to
    a user, and renaming them site-wide would be a large, purely
    cosmetic-to-nobody diff for zero user-facing benefit.

    Live-verified: About page copy, Account page captions, a
    nonexistent-slug "Dungeon not found." state, the Leave/Edit Dungeon
    buttons, and the reworded invite-message text (read directly out of
    the DOM) on a throwaway challenge.

## Co-hosting
26. **Let a host designate a co-host, who gets the same board-management
    access, plus a visual showing who the host(s) are on a dungeon.**
    Scoped 2026-09-07, **shipped the same day** -- migration not yet
    applied (see the bottom of this item).

    **Data model**: new join table `challenge_hosts` (`challenge_id`,
    `profile_id`, `added_at`, composite primary key) rather than a
    second `co_host_id` column on `challenges` -- matches this schema's
    existing pattern for a challenge's other many-relationships
    (`challenge_participants`, `teams`), and doesn't cap it at exactly
    one co-host if that turns out to be wanted later. A co-host
    candidate must already be a participant (`challenge_participants`
    row) -- keeps the UI simple (pick from the existing Players list,
    no separate invite-by-username flow) and means there's always a
    real row to attach a "Remove co-host" action to.

    **Permission split -- primary host keeps strictly more power than a
    co-host**, mirroring an owner/admin distinction rather than treating
    every host as interchangeable:
    - **Primary host** (`challenges.host_id`, unchanged): everything,
      including deleting the dungeon and adding/removing co-hosts.
    - **Co-host**: full tile/team/participant management (create, edit,
      delete tiles; assign teams; remove participants; edit the
      Discord webhook URL; publish/unpublish) -- everything BACKLOG.md
      #6/#7's own "host tooling" framing already means by "host
      access." **Cannot**: delete the dungeon, or add/remove co-hosts
      (including themselves) -- both stay primary-host-only, so there's
      always one clear owner and co-hosting can't chain into someone
      handing out access unbounded.

    **RLS changes** (4 existing policies, `schema.sql`): `tiles`'s and
    `teams`'s own `for all` "host writes own challenge's X" policies
    just need their `exists(...)` clause OR'd with a matching
    `challenge_hosts` check -- co-hosts need the same full rights there
    as the host, no split needed. `challenge_participants`'s "self or
    host writes" policy gets the same OR'd clause (removing a
    participant/assigning a team). `challenges` itself is the one
    genuinely different case: a co-host may UPDATE (a new, separate
    `for update` policy, `exists(...)` against `challenge_hosts`) but
    never DELETE (no delete policy for co-hosts at all) -- and even
    within UPDATE, a co-host reassigning `host_id` itself has to be
    blocked. Plain RLS can't express "the new row's host_id must equal
    the old row's" in a `WITH CHECK` clause (no old-row reference
    there), so this reuses the exact anti-tamper pattern already
    applied to `profiles.is_site_admin`: `revoke update (host_id) on
    challenges from authenticated;` -- nobody, co-host or even the
    primary host themselves, can reassign ownership through the client
    at all (not a requested feature here, so permanently closing it off
    is simpler than building transfer-of-ownership). `challenge_hosts`
    itself: public read (needed for the visual badge below to render
    for every viewer, not just the host), write restricted to the
    primary host only (`challenges.host_id = auth.uid()` -- deliberately
    NOT also checking `challenge_hosts`, so a co-host can never write
    to this table themselves).

    **Client changes needed**:
    - `EditChallengePage.tsx`: the host gate (currently
      `challenge.host_id !== session.user.id`) needs a `challenge_hosts`
      lookup OR'd in. The Players list (`src/pages/EditChallengePage.tsx`'s
      existing per-participant row, next to today's team-assignment
      `<select>`/Remove button) gets a new "Make co-host"/"Remove
      co-host" action -- visible only to the *primary* host, matching
      the RLS restriction, so a co-host viewing this same list doesn't
      see (and can't use, if they tried via a direct API call) a
      control that would fail anyway. Removing a participant who's
      also a co-host should clear their `challenge_hosts` row in the
      same action (application-level, not a DB-level cascade --
      `challenge_hosts` has no FK to `challenge_participants` to
      cascade through, only to `challenges`/`profiles` separately).
    - `BoardPage.tsx`: the `isHost` boolean (line ~404, gates the "Edit
      Dungeon" button) becomes host-OR-co-host.
    - `DashboardPage.tsx`: "My Dungeons"' load query (currently two
      branches -- challenges you host, challenges you've joined) needs
      a third branch for challenges you co-host, merged in with a role
      distinct enough for the existing HOST/PARTICIPANT badge
      (`DungeonRow`) to show "Co-host" as its own third label rather
      than collapsing into either existing one.

    **The visual host indicator** (the second half of this request,
    genuinely independent of the permission work -- worth building even
    on its own): a small 👑 next to a host's/co-host's rsn wherever
    participants are listed by name, matching this app's existing
    emoji-badge visual language (🥇🥈🥉 medals, ⭐ first-completer, ✓
    done, 🏆 board complete) rather than introducing a new icon system.
    Primary spot: `BoardPage.tsx`'s ranked leaderboard and Coop roster,
    since that's the one place every viewer already sees every
    participant's name together. `title="Host"` vs `title="Co-host"`
    on hover distinguishes the two without needing two different
    glyphs. `EditChallengePage.tsx`'s Players list gets the same badge
    for consistency, though it's less load-bearing there since the
    "Make/Remove co-host" button already makes the status obvious.

    **Confirmed 2026-09-07** (all three open questions above): co-hosts
    can't promote/demote other co-hosts (primary-host-only, as
    defaulted); no cap on co-host count (as defaulted); removing a
    co-host participant gets an *extra*, separate confirmation dialog
    ahead of the normal remove one (`handleRemoveParticipant` in
    `EditChallengePage.tsx`), not folded into a single combined prompt.

    **Same-day follow-up, requested mid-build**: hosts (primary or
    co-host) can also edit a dungeon's name/start date/end date, but
    only while it's still a draft -- publishing locks them, matching
    how tile conditions lock once a dungeon starts. New "Dungeon
    details" section on `EditChallengePage.tsx` (own name/date inputs +
    Save, same validation shape as `NewChallengePage.tsx`'s creation
    form -- end date can't precede start date), gated on
    `challenge.status === 'draft'` rather than on `tilesLocked`
    (published-but-not-yet-started still locks these, unlike tile
    conditions) and visible to anyone who already passed the page's own
    host-or-co-host gate, no separate permission check needed since it
    writes to the same `challenges` row the co-host UPDATE policy above
    already covers.

    **Migration applied and verified 2026-09-08.** The `challenge_hosts`
    table itself was low-risk to roll out the way #22's/#23's notes
    describe: queried as its own separate `Promise.all` entry in
    `BoardPage.tsx`/`EditChallengePage.tsx`/`DashboardPage.tsx`'s
    loaders, not joined into an existing query, so a missing table
    resolved to `{data: null, error}` for that one query only and
    everything else kept loading normally in the window before the
    migration ran.

    **Real bug found and fixed during verification**: the migration's
    `revoke update (host_id) on challenges from authenticated;` line
    was silently a no-op, twice, even after the user re-ran it. Root
    cause -- Postgres tracks table-level and column-level grants
    separately, and `authenticated` already holds a blanket table-level
    UPDATE grant on `challenges` (needed for the ordinary name/dates/
    status/webhook edits). That blanket grant implies UPDATE on every
    column including `host_id` regardless of any column-level revoke,
    so a co-host really could reassign ownership to themselves -- caught
    live via a minted-session test, not just trusted from the "sql ran"
    report. Fixed by revoking the table-level grant entirely and
    re-granting UPDATE on an explicit column allowlist instead (see
    `supabase/schema.sql`'s end-of-file block).

    Auditing turned up the *identical* bug already live in production on
    two unrelated, pre-existing anti-tamper columns that used the same
    column-only-revoke pattern: `profiles.is_site_admin` (any
    authenticated user could apparently have granted themselves site
    admin) and `challenge_participants`'s screenshot/webhook counters
    (any participant could apparently have zeroed their own tamper
    signal). Both fixed the same way, alongside the co-hosting fix, and
    all three re-verified live: `host_id` reassignment, `is_site_admin`
    self-promotion, and counter tampering now all correctly fail with
    `42501 permission denied`, while every legitimate client update path
    (dungeon details, account settings, rsn/team/adventure-path edits)
    still succeeds.

## Player icon updates
27. **Default fallback chip for players with no icon set.** **Shipped
    2026-09-08.** A player without a chosen `icon_url` previously
    rendered nothing at all next to their name -- every consuming page
    gated the chip on `icon_url` being truthy, so a brand-new profile
    just showed blank space on the leaderboard, participant lists, tile
    "who's here" chips, and both tile-detail modals.

    New shared `PlayerChip.tsx` (wrapping the existing `PlayerIcon.tsx`)
    is now the one place every one of those call sites goes through:
    shows the player's icon on their chosen/random background when
    `icon_url` is set (unchanged from #22/#23), otherwise a same-shaped
    rounded-square chip with the player's first initial -- on their
    chosen color if they picked one, plain white if they've set neither
    an icon nor a color. Consolidates what used to be several
    near-duplicate copies of this same background-fallback logic
    (`BoardPage.tsx` already had its own, just for the Adventure
    frontier chip) into one component. Team/pooled rows are unaffected
    -- no single profile to represent, so still no chip at all there,
    same as #22/#23's own scoping.

28. **A Food icon group added to the profile icon picker.** **Shipped
    2026-09-08.** 15 food-themed OSRS items (Potato, Shrimps, Trout,
    Cooked chicken, Burnt meat, Lobster, Swordfish, Monkfish, Shark,
    Anglerfish, Cooked karambwan, Cake, Pineapple pizza, Jug of wine,
    Beer) a player can pick as their profile icon (#22), alongside the
    existing Skills/Bosses/Items/Clue Scrolls/Pets/Other groups.

    Kept as its own small catalog (`src/lib/foodIcons.ts`), not added to
    `itemSets.ts`'s `PRESET_ITEM_SETS` (#2/#16's catalog) -- that list
    also drives `isNotableLootItem` (which loot items get their own
    tracked-drop row), and food is common, mundane loot that shouldn't
    start getting individually logged just because it's now a pickable
    icon. Every wiki icon URL verified live before wiring up.

## Pooled-tile transparency
29. **Per-player contribution breakdown on a Coop/Team tile, plus a
    ledger of the underlying events for Total Boss KC and Big Drop.**
    **Shipped 2026-09-08**, prompted by the first real Coop board going
    live (Ototo Dungeon).

    **Contributions**: a pooled tile's own status line (e.g. "Everyone --
    13 / 1000") already existed; this adds a ranked breakdown underneath
    it -- each pool member's own share of that progress, most to least,
    using the exact same number `checkTile` already computes for a solo
    tile (just run against each member's own stats before pooling, not
    after). No new stat-computation logic needed: `TileDetailModal.tsx`
    already builds `statsById` (every participant's own `ParticipantStats`)
    before reducing it into one pooled `poolStats` call for the Coop/Team
    row -- `contributionsFor(memberIds)` just reads that same per-member
    map instead of throwing it away. Scoped to Coop's one pooled row and
    each Team row; a solo row is already one person, so there's nothing
    to rank (`supportsContributionBreakdown` also excludes freeSpace/tbd,
    and `xpGainedLowestSkill`/`levelsGainedLowestSkill`, where every
    participant resolves a *different* skill so ranking them against each
    other isn't apples-to-apples -- moot today since those two are
    already excluded from a non-solo challenge's condition picker,
    `TileEditorForm.tsx`). New `formatContributionValue(cond, value)`
    formats one member's own number with the same per-type unit
    convention `formatTileGoal` already uses for the tile's threshold.

    **Ledgers**: two condition types get a second section below
    Contributions, since a bare number doesn't say *what* actually
    happened -- "Total Boss KC" (`bossKcGained`) lists every boss that
    contributed, most kills to least, merging each relevant participant's
    own `kcGainedByActivity` (already computed, never previously
    surfaced). "Big Drop" (`singleDropValue`) lists every individual drop
    that itself cleared the threshold -- player, source, item(s), value --
    via new `qualifyingBigDrops()` (`participantStats.ts`), filtered
    against each participant's own raw `loot_drops` rows and their own
    stats window (not just the challenge-wide one, since an Adventure
    participant's window can differ per room).

    **Scope, per the request**: Contributions is Coop/Team only (no solo
    row to rank). Both ledgers apply everywhere a row exists at all --
    solo, Coop, Team, and Adventure's boss rooms (`AdventureColumnModal.tsx`,
    nested per-participant there instead of pooled, since Adventure is
    always solo -- `NewChallengePage.tsx` forces `game_mode` back to
    `'solo'` the moment `board_type` is set to `'adventure'`). Adventure's
    existing "once a tile is done, stop trusting a live recompute of it"
    rule (BACKLOG.md #4's own baseline-reset caveat) applies here for
    free, with no special-casing needed -- the ledger is computed in the
    exact same branch as `statuses`, which already skips a done
    participant entirely.

    **Real bug found and fixed while building this**: `dinkWebhook.ts`'s
    loot-bucketing decision (which drops get their own row vs. fold into
    a running per-day total) only ever checked `bigDropsCount` tile
    thresholds, never `singleDropValue`'s. A challenge with a Big Drop
    tile but no `bigDropsCount` tile at all (or one with a *higher*
    threshold) would silently bucket exactly the drops its own ledger
    most needs to show -- a bucketed row only keeps a running
    `max_single_value`, not the source/item detail a ledger entry needs.
    Fixed by renaming `minBigDropsThreshold` to `minNotableDropThreshold`
    and folding `singleDropValue` thresholds into the same min()
    calculation. Ototo Dungeon's own board happened to already dodge this
    (its "2M+ Drops" `bigDropsCount` tile's threshold is lower than its
    "Big Drop" tile's), so this wasn't caught by that board's own data --
    found by reading the bucketing logic directly, not by observing a
    failure.

    Live-verified against Ototo Dungeon's real data: "Total Boss KC"
    correctly shows 26 Limont's 13 KC (all from Barrows) ranked above
    otototo's 0 (filtered out entirely, not shown at 0), with a "Bosses
    killed" ledger reading "Barrows -- 13 KC". "Big Drop" correctly ranks
    26 Limont's 106K-gp best drop above otototo's 344 gp, with no ledger
    section at all (nothing has cleared the 10M threshold yet -- the
    empty-state guard hides the section rather than showing an empty
    box). A plain "Total XP" tile confirmed Contributions renders alone,
    with neither ledger, on a condition type neither applies to.

30. **Fixed: a Coop/Team board's main grid showed one participant's own
    individual progress instead of the shared pooled/team total.**
    **Shipped 2026-09-09**, caught by a host asking why Ototo Dungeon's
    Collection Log tile still read "1 / 40" after a second player's
    collection log event had landed (should've read "2 / 40" -- both
    events were real, confirmed against `collection_log_entries`
    directly).

    **Root cause**: `BoardPage.tsx`'s main tile grid has always computed
    each tile's live caption/percent/badge from `viewedTileStatuses`,
    which was unconditionally `tileStatusesByParticipant[viewedParticipantId]`
    -- the signed-in viewer's *own* individually-computed stats, never
    pooled. This was correct for Solo (each participant genuinely has
    their own separate board) but silently wrong for Coop/Team, which
    have shared this exact code path since game modes shipped (#10) --
    the grid was effectively always showing "my own contribution" and
    mislabeling it as the shared/team total, for every Coop/Team board
    that's ever existed, not just Ototo's. `TileDetailModal.tsx` (the
    tile-detail popup) was never affected -- it already pools correctly
    via `poolStats`, which is exactly how this discrepancy became
    checkable: the modal's own "Everyone" row and the grid caption
    beneath the same tile could disagree.

    **Fix**: the data-loading effect now also captures each participant's
    raw `ParticipantStats` (not just their already-`checkTile`'d
    `TileStatus`), then pools them the same way `TileDetailModal.tsx`
    does -- once across everyone for Coop (`pooledTileStatuses`), once
    per `team_id` for Team (`teamTileStatuses`, keyed by team since the
    grid shows whichever team is currently being viewed). `viewedTileStatuses`
    now branches on `challenge.game_mode`: Coop reads the pooled set,
    Team reads the viewed participant's own team's set, Solo (and every
    Adventure board, which is always Solo) is unchanged. The "who's
    closest" badge-color heuristic (`closestPercent`) had the identical
    bug one level down -- it maxed over each individual participant's own
    percent even for Coop/Team, where that's not a meaningful question
    (there's one shared number, not several people to compare); it now
    reuses the tile's own already-pooled percent for those two modes,
    keeping the original per-participant max only for Solo.

    Live-verified against Ototo Dungeon: Collection Log corrected from
    1/40 to 2/40 immediately on reload, matching the two real
    `collection_log_entries` rows (26 Limont's Huntsman's kit, otototo's
    Blue tricorn hat); Total Boss KC and every other tile's numbers were
    unaffected (already correct, since either only one participant had
    contributed or both events fell on the same tile type that happened
    to still read right).

31. **A Collection Log ledger, matching #29's Boss KC/Big Drop pattern.**
    **Shipped 2026-09-09.** For `collectionLogGained` tiles, an "Items
    added" section now lists every collection-log entry that actually
    counted -- item name plus who got it -- below the Contributions
    ranking, newest first (unlike KC/drop value, there's no size to rank
    an item by, so recency is the only meaningful order for a log).

    Same shape as #29's other two ledgers: `RawParticipantData.collectionLogEntries`
    gained an optional `item_name` field (both modals' `collection_log_entries`
    select queries now fetch it, previously just `participant_id, created_at`),
    and new `collectionLogEntriesInWindow()` (`participantStats.ts`) filters
    a participant's raw entries to the relevant window -- no threshold to
    clear here, unlike `qualifyingBigDrops`, since every in-window entry
    already counts toward `collectionLogGained` as-is. Wired into both
    `TileDetailModal.tsx` (per row -- solo/Coop's one pooled row/each Team
    row) and `AdventureColumnModal.tsx` (per participant, Adventure being
    always-solo).

    Live-verified against Ototo Dungeon: opened the Collection Log tile
    (3/40 pooled) and confirmed Contributions read 26 Limont 2 items,
    otototo 1 item, with the ledger listing all three real entries newest
    first -- "Guthan's platebody -- 26 Limont", "Blue tricorn hat --
    otototo", "Huntsman's kit -- 26 Limont" -- matching `collection_log_entries`
    exactly.

## Adventure correctness
32. **Fixed: a boss tile showed live progress for a participant who
    hadn't reached it yet.** **Shipped 2026-09-09**, reported live
    against adventure-test's Final Boss "Big Drops" tile -- otototo
    showed 1/3 despite still being early on their own path, nowhere near
    the final room.

    **Root cause**: `TileDetailModal.tsx` handles both Standard-board
    tiles (every participant is simultaneously relevant -- no "reached"
    concept at all) and Adventure boss tiles (`kicker` set) via the same
    solo-mode branch, but never actually distinguished the two --
    `AdventureColumnModal.tsx` (fork columns) already correctly gates
    each participant through `resolveFrontier` before showing real
    progress, but this modal's boss-tile path never did. For a
    Dink-driven condition (`bigDropsCount` here, but the bug applied to
    any non-hiscores condition -- see `conditionNeedsBaseline`),
    `resolveAdventureTileWindow`'s window for a not-yet-reached tile
    falls back to "since this participant's last completion, whatever
    tile that was" -- it has no idea whether the boss room being checked
    is even where their path currently is, so whatever they'd farmed en
    route to an *earlier* tile counted toward a boss they hadn't
    unlocked at all.

    **Fix**: the solo branch now checks `resolveFrontier(tiles, p.adventure_path,
    doneTileIds)` per participant (skipped, and always `reached`, for a
    Standard-board tile -- `challenge.board_type !== 'adventure'`) before
    trusting any of `statsById[p.id]`'s computed status. A
    not-reached participant's row zeroes out status/contributions/every
    ledger and shows "Not reached yet" (same wording, same `text-stone-600`
    styling as `AdventureColumnModal.tsx` already uses for the identical
    state on fork columns), sorted after every reached row regardless of
    its zeroed status. Needed two new inputs this modal didn't have
    before: the full board's `tiles` (new optional prop, both
    `BoardPage.tsx` call sites now pass their own stable `tiles` state
    explicitly -- defaulted internally to a module-level `EMPTY_TILES`
    constant, never an inline `[]`, to avoid exactly the effect-restart-
    forever trap this file's own `teams` prop already has a comment
    warning about) and each participant's `adventure_path` (added to
    `ParticipantLite`, already fetched by both call sites for other
    reasons).

    Live-verified against adventure-test's real Final Boss tile: 26
    Limont (who has genuinely reached it, 8/9 tiles done) still shows
    real "0 / 3" progress; WheresMyGear and otototo (neither has reached
    it) both now correctly read "Not reached yet" instead of a live
    number.

## Admin UX
33. **Made the site-admin pages mobile-friendly and easier to navigate
    into/between.** **Shipped 2026-09-09**, done alongside #9 (the
    Discord-templates admin work directly needed a page that already
    worked well on a phone). Every `/dungeon-master-admin/*` page shares
    `AdminLayout.tsx`'s tab bar and gets this for free at once, rather
    than needing a per-page fix.

    **Found**: no way *into* `/dungeon-master-admin` existed anywhere in
    normal site navigation -- bookmark/typed-URL only, despite
    `is_site_admin` already being known client-side (`useAuth`'s
    `profile`). `AdminLayout.tsx`'s own 8-tab subnav was a plain
    `flex items-center gap-2` with no wrap or scroll handling at all, so
    a narrow phone would either clip tabs or force the whole page into
    horizontal scroll. `AdminRandomizeSettingsPage.tsx`'s KC farm-rate
    tier boxes were a fixed `grid-cols-3` (three cramped columns on any
    width, phone included) and its header row (title + Reset/Save
    buttons) had no wrap guard. `AdminGrowthPage.tsx`'s table was the
    only one of the three site-wide data tables with no
    `overflow-x-auto` wrapper.

    **Fixed**: `Header.tsx` gained an "Admin" link (shown only when
    `profile?.is_site_admin`) next to "My Dungeons" -- the first way in
    from normal navigation this site has ever had; that nav row and
    `AdminLayout.tsx`'s tab bar both now `flex-wrap` instead of
    overflowing, so every tab stays visible and tappable at any width
    rather than requiring a swipe-to-see-more gesture nobody's cued to
    try. `AdminRandomizeSettingsPage.tsx`'s tier grid is now
    `grid-cols-1 sm:grid-cols-3` (stacks on a phone, 3-across once there's
    room) and its header row wraps; `AdminGrowthPage.tsx`'s table got the
    same `overflow-x-auto` wrapper the other two data tables
    (`AdminAccountsPage.tsx`/`AdminParticipantsPage.tsx`) already had, for
    consistency even though its 3 columns are narrow enough to rarely
    need it. `AdminFeedbackPage.tsx`'s header row got the same wrap
    treatment as Randomize Settings' and the new Discord-templates
    section's.

    Live-verified at a 375px-wide viewport (`resize_window` "mobile"
    preset): no horizontal overflow anywhere on the Discord-templates or
    Randomize Settings pages (`document.documentElement.scrollWidth`
    equals `clientWidth` on both, and a screenshot of each confirms the
    tab bar/tier cards actually read as a clean single-column stack, not
    just an absence-of-scrollbar technicality).

34. **Fixed: "Barrows Chests KC" tiles could never gain progress.**
    **Shipped 2026-09-09**, reported live against Ototo Dungeon --
    confirmed by checking real `boss_kills` rows directly: Dink's own
    `KILL_COUNT` notifier reports this boss as plain `"Barrows"`, not
    `"Barrows Chests"` -- the name `bossActivities.ts`'s catalog had
    always used, sourced from the Hiscores API's own activity name
    rather than verified against real Dink data. Since `kcGained`'s
    progress lookup (`stats.kcGainedByActivity[cond.activity]`) is an
    exact string match, every "Barrows Chests" tile had silently been
    stuck at 0 forever, no matter how many chests were actually opened.

    Renamed the catalog entry (and its `randomizeSettings.ts`
    `bossToTier` counterpart) to `"Barrows"`, matching what Dink
    actually sends rather than the Hiscores name, since agreeing with
    Dink is this catalog's whole purpose. `bossActivities.ts`'s own
    header comment (which claimed every entry is Dink-verified) now
    flags this as a confirmed exception, and notes the other 78 entries
    haven't specifically been checked against real Dink data the way
    this one now has -- worth an eventual audit rather than assuming the
    rest are fine.

    **Data fix, not just code**: found and corrected 2 already-broken
    tiles site-wide (not just Ototo's) with `condition.activity =
    "Barrows Chests"` stored from before this fix, plus the site's one
    saved `randomize_settings` row, whose `bossToTier` map still had the
    old key (the randomizer picks a boss from the live `BOSS_ACTIVITIES`
    catalog and looks up its tier by name, so a stale key there would
    have silently dropped this boss to a different farm-rate tier than
    intended).

    Live-verified: reloading Ototo Dungeon shows "Barrows Chests KC"
    correctly reading 23/100 (previously stuck at 0), exactly matching
    "Total Boss KC"'s own 23/1000 -- Barrows is the only boss this
    account has farmed so far.

    **Same-day follow-up**: the fix above corrected `condition.activity`
    (what actually gates progress) but not each tile's own `label` --
    a separate, plain-text stored field, set once at tile-creation time
    from `defaultLabelFor`'s `${activity} KC` and never recomputed
    afterward, so both tiles still displayed "Barrows Chests KC" on the
    board and in the tile-detail modal even once progress was correctly
    updating underneath. Updated both tiles' stored `label` to "Barrows
    KC" to match. Live-verified: the board tile and its modal (title,
    description, and Contributions row) all now consistently read
    "Barrows KC".

35. **A Gear icon group added to the profile icon picker.** **Shipped
    2026-09-09.** 20 weapon/armor/cosmetic items a player can pick as
    their profile icon (#22), alongside the existing Skills/Bosses/
    Items/Clue Scrolls/Pets/Food/Other groups: Dragon scimitar, Rune
    scimitar, Dragon dagger(p++), Abyssal whip, Rune kiteshield (plain,
    (t), and (g)), Gilded kiteshield, the 6 treasure-trail god
    kiteshields (Guthix/Saradomin/Zamorak/Armadyl/Bandos/Ancient),
    Slayer helmet (i), Barrows gloves, Fire cape, Robin hood hat, Ranger
    boots, Cow slippers.

    The requested "any other special Rune Kiteshields from treasure
    trail drops" needed real research, not a guess -- the wiki's own
    Rune kiteshield page mostly documents the 16 Construction/POH
    heraldic reskins (Arrav, Asgarnia, Dragon, etc.), a *different*
    category from treasure-trail rewards despite sharing some god names.
    Confirmed via a second, targeted lookup that the actual treasure-
    trail kiteshields are 6 standalone "god kiteshield" items (not named
    "Rune kiteshield (God)") plus the (t)/(g) trim tiers and Gilded --
    those are what's in the catalog, not the Construction reskins.
    "Best Slayer Helmet" resolved to the standard `Slayer helmet (i)`
    (imbued) rather than a boss-trophy cosmetic recolor like the Tzkal
    variant -- same stats as any other recolor, but the one an average
    player asking "what's best" almost certainly means.

    Same pattern as Food (#31, BACKLOG.md's Wilderness/DT2 additions):
    kept as its own small catalog (`src/lib/gearIcons.ts`), not added to
    `itemSets.ts`'s `PRESET_ITEM_SETS`, for the same reason -- that list
    also drives `isNotableLootItem` and tile authoring, neither of which
    a purely-cosmetic icon pick should affect. Cow slippers needed the
    same `_(1)` filename override `itemSets.ts` already has on file for
    it (the naive name-to-filename convention doesn't resolve for this
    one item). Every one of the 20 wiki icon URLs live-verified with a
    HEAD request before adding, then confirmed actually loading
    (`naturalWidth > 0`) in the live picker afterward.

## Player-facing docs
36. **A player-facing page explaining how each tile condition actually
    gets its data.** **Shipped 2026-09-09.** New `/tracking`
    (`TrackingInfoPage.tsx`), linked from `Footer.tsx` (next to "Updates"/
    "About us") and cross-linked from `SetupGuidePage.tsx`'s intro
    paragraph.

    **Made public, not admin-only** -- the recurring pattern this same
    session kept surfacing (a player asking "why isn't this tile
    updating," which turned out to be a Dink-vs-Hiscores mixup, twice:
    the Otototo boss-tile reachedness question and the Barrows naming
    bug) is exactly the confusion this page exists to head off before it
    becomes a support question. An admin-only version would only ever
    reach the host, not the player actually confused mid-dungeon.

    **Content**, grouped by data source rather than by `TileCondition`'s
    own type names (a player thinks "why hasn't this updated," not
    "what's my condition's discriminant"):
    - **Synced instantly from Dink** -- one card per Dink notifier
      (Kill Count, Slayer, Loot, Collection Log, Death, Pets), matching
      `SetupGuidePage.tsx`'s own 6-section webhook walkthrough exactly,
      so a player who's already ticked those boxes can map each straight
      back to what they enabled.
    - **Synced from the OSRS Hiscores** -- XP/level/lowest-skill/clue-tier
      conditions, plus Guardians of the Rift (called out specifically:
      it reads like a minigame completion but rides the Hiscores sync
      instead, since Dink's Kill Count notifier can't detect "Rifts
      closed" -- the same fact `tileConditions.ts`'s own
      `gotrCompleted` comment documents).
    - An Adventure-specific callout (matching `SetupGuidePage.tsx`'s
      amber-box styling): a Hiscores-backed room needs an actual logout
      to start counting once reached; a Dink-backed room doesn't.
    - **Special tiles** -- Free space and TBD, no live data involved.

    Sourced directly from `tileConditions.ts`'s own header comments
    (which condition types Dink drives vs. which need
    `conditionNeedsBaseline`) rather than re-deriving the grouping from
    scratch, so the page can't silently drift from what the code
    actually does.

    Same visual language as `AboutPage.tsx`/`SetupGuidePage.tsx`
    (`max-w-2xl`, amber section headers, `rounded-lg` cards) --
    deliberately not a new design, so it reads as part of the existing
    docs set rather than a bolted-on admin report. Build/lint/test all
    passed; live-verified in the browser at both desktop and 375px-wide
    mobile viewports, no console errors, footer link and the
    `SetupGuidePage.tsx` cross-link both confirmed working.

37. **Replace the host/co-host 👑 emoji with a proper icon.** **Shipped
    2026-09-09.** The emoji (`BoardPage.tsx`'s leaderboard, both the
    Coop and ranked-list branches, plus `EditChallengePage.tsx`'s
    Players list) read as an out-of-place platform sticker against this
    site's dark stone/amber theme and its otherwise-consistent OSRS-wiki
    icon language (skills, bosses, pets, gear all render real in-game
    icons, never emoji).

    First pass was a text pill matching the existing screenshot-count
    badge style; reconsidered mid-build in favor of a white partyhat --
    an OSRS rare-item icon players already recognize as a status symbol,
    which fits this site's game-icon vocabulary directly rather than
    inventing a new visual language. New shared `HostBadge.tsx`
    (`src/components/HostBadge.tsx`), same icon for both Host and
    Co-host (only the tooltip/alt text differs, matching the emoji it
    replaced), wired into all 3 call sites. Icon URL verified with a
    HEAD request before adding, then confirmed actually loading
    (`naturalWidth > 0`) next to the host's name on a real production
    board (`adventure-test`).

## Visual identity
38. **A redesigned homepage that visually tells the product's story,
    plus a real logo mark.** **Shipped 2026-09-09.** The homepage was
    previously just a centered headline, one sentence, and a button --
    scoped and mocked up first as a Claude Design canvas (hero visual,
    logo mark options, how-it-works strip, leaderboard teaser,
    changelog cards), then built for real minus the changelog section
    (kept the existing live `announcements` block as-is instead of
    reskinning it).

    **Logo mark** (`src/components/Logo.tsx`): a dungeon archway with a
    torch flame, picked from 3 sketched directions (the other two --a
    "D" monogram shaped like a key, and a 3x3 grid glyph with one glowing
    cell-- were dropped, not built). Pure inline SVG, no wiki-icon
    dependency. Wired into `Header.tsx` next to the wordmark, and also
    shipped as the site's first-ever favicon (`public/favicon.svg`,
    linked from `index.html`) -- there was none before this.

    **Hero** (`src/components/DungeonPathPreview.tsx`): replaced the
    one-line pitch with an illustrated Adventure dungeon path -- done
    rooms, a lane fork, a pulsing amber frontier room, locked rooms
    ahead, a Corporeal Beast capstone boss room -- built from real wiki
    icons (`bossActivityIcon`, `skillIconUrl`, and the existing
    `tileIcons.ts` constants; `PETS_ICON_URL` exported from there for
    this, matching every other misc icon constant already exported for
    reuse) and the exact same stone-texture-overlay tile recipe
    `BoardPage.tsx`'s real grid tiles use, so it reads as the actual
    product rather than a mockup of it.

    **How it works**: a 3-step strip (custom-drawn grid/people/bolt
    icons, no emoji) replacing the old one-sentence pitch.

    **Leaderboard teaser** (`src/components/LeaderboardPreview.tsx`):
    built from the real `PlayerChip`/`HostBadge` components fed
    illustrative example rows (clearly labeled "Example leaderboard,"
    not a live fetch -- the homepage has no challenge context to pull
    real data from), plus a decorative strip in the real
    `progressColor.ts` red-yellow-green gradient.

    **Found in passing**: a live, already-emailed `announcements` row
    (2026-09-08's co-hosting announcement) still said "look for the
    crown next to a host's name" -- stale since #37 replaced the crown
    with a partyhat. Patched the on-site copy directly (can't recall
    the email that already went out, same as every other "fix the
    display, not the sent email" precedent this project has).

    **Explicitly deferred**: reskinning the *real* Adventure board
    (`BoardPage.tsx`) to match this hero's tile styling -- the host
    liked the look and wants it ported over, but as its own follow-up
    change, not bundled into the homepage work.

    Live-verified: build/lint/295 tests all passed; checked in the
    browser at desktop and a 375px mobile width -- caught and fixed a
    real bug at mobile width (`min-w-[420px]`/`min-w-[320px]` on the
    hero's flex children forced 436px of content into a 375px viewport,
    a genuine horizontal-scroll bug; replaced with `min-w-0` +
    `basis-[Npx]` so the columns can actually shrink below their
    preferred width once wrapped to their own row). No console errors;
    favicon confirmed served (200, `image/svg+xml`).

39. **Ported #38's homepage-hero styling onto the real Adventure board.**
    **Shipped 2026-09-10.** Five specific asks, all on `BoardPage.tsx`'s
    Adventure grid (the Standard/grid5x5 board and the fork/column
    detail modals were untouched -- out of scope for this pass):

    1. **Connector lines are now simple dashed lines, never diagonal.**
       `AdventureConnector.tsx` was previously an SVG "hallway" whose
       lines angled to bridge a fork's two lane heights into a boss
       column's single centered one. Rewritten to draw `min(from, to)`
       plain horizontal dashes via CSS grid (1 row when either side is
       a single-lane boss column, 2 rows for a fork-to-fork gap) --
       relies on the surrounding flex row already stretching every
       column to the row's tallest sibling, not hardcoded pixel
       geometry, so it still tracks real tile+label height even though
       tiles got shorter and labels moved outside (#2 below).
    2. **All 3 boss rooms get one consistent border, not a state-varying
       one.** Previously a boss tile's border still came from its
       done/frontier/locked state, with a red drop-shadow layered on
       top. Now boss rooms always render `border-amber-800`
       regardless of state -- completion still shows via the badge
       (#5), and a not-yet-reached boss still dims via opacity, same
       as any other locked tile; only the border color itself stopped
       being state-driven. Labeled "Boss Room" / "Boss Room" / "Final
       Boss" (computed inline from `isBossColumn`/the existing
       `ADVENTURE_SMALL_FINAL_BOSS_COLUMN` check -- deliberately not
       routed through `adventureProgress.ts`'s existing
       `bossLabelForColumn`, which returns "First Boss"/"Second
       Boss"/"Final Boss" for a different, already-tested consumer,
       `TileDetailModal`'s kicker text).
    3. **Labels moved outside the tile -- only the icon stays inside.**
       Each lane's tile used to be one bordered/textured box holding
       icon + label + caption together. Restructured into two
       siblings: a smaller icon-only bordered box, then the label/
       caption/boss-tag text below it, outside the box -- same split
       DungeonPathPreview.tsx already uses.
    4. **The frontier tile now pulses** (`animate-pulse`), including
       when the frontier happens to be a boss room (the amber-800
       border and the pulse both apply at once).
    5. **The done badge is a rounded square, not a circle** -- `rounded`
       (4px) instead of `rounded-full`, 16x16, drawn SVG instead of a
       bare glyph. Green check for a normal completion; gold star
       (`bg-amber-400`) for whoever was first to clear that room,
       reusing the same `firstCompleters`/`isFirst` computation that
       already existed, just re-skinned. New shared
       `AdventureDoneBadge` component in `BoardPage.tsx` backs both.
       `DungeonPathPreview.tsx`'s own done badge got the same
       circle-to-square fix for consistency between the two surfaces.

    **Homepage layout also restructured to match**, per a direct ask
    once the host saw the real board rendering: `DungeonPathPreview.tsx`
    previously showed 2 straight rooms into 1 fork into 1 final boss --
    not what the real small-Adventure layout actually is. Rebuilt to
    mirror `ADVENTURE_SMALL_BOSS_COLUMNS`' real shape exactly: fork,
    boss room (Zulrah, done), fork, second boss room (Vorkath, frontier
    -- pulsing, to show that state combined with a boss border), fork,
    final boss (Corporeal Beast, locked). The boss tag ("Boss Room"/
    "Final Boss") moved from an inside-the-tile banner to outside,
    matching point 3 above.

    The legend's old "Rooms with a red glow are boss rooms" line updated
    to describe the new fixed-border look instead, with a matching swatch.

    Live-verified against the real `adventure-test` challenge (not just
    the homepage): switched between participants via `?p=` to confirm a
    completed board (26 Limont, 9/9) shows a mix of gold-star and
    green-check badges (both 4px-radius rounded squares, confirmed via
    computed style, not just visually) on all 3 boss rooms, and that an
    in-progress participant (WheresMyGear, 5/9) has their actual
    frontier -- which happens to be a boss room -- rendering with both
    `border-amber-800` and `animate-pulse` at once. Build/lint/295 tests
    all passed; no console errors; no new horizontal-overflow regression
    at a 375px viewport on either the real board or the homepage hero.

40. **#39's connectors, boss borders, and done badges refined again**
    off a hand-drawn mockup the host sent showing what "good" actually
    looks like. **Shipped 2026-09-10.**

    1. **Connector lines now route per the viewed participant's actual
       chosen path, colored by state, and draw nothing at all for a lane
       that wasn't chosen.** #39's connector already drew a plain dashed
       line per column-gap regardless of which specific lane (if either)
       was on-path -- correct shape, no state awareness. Replaced with a
       connector that's computed per VIEWED PARTICIPANT: a new
       `onPathInfoForColumn(column)` (`BoardPage.tsx`) resolves which
       lane (or 'center' for a boss) is actually on their path at that
       column, plus whether that column's on-path tile is done/
       frontier/neither -- returning `null` when a fork touching this
       gap hasn't been chosen yet. Two adjacent resolved columns get an
       `AdventureConnector` (green solid when both are done, amber
       dashed when the source is done and the target is the frontier,
       neutral dashed otherwise); either side `null` gets a same-width
       blank `AdventureConnectorGap` instead -- no line drawn at all,
       satisfying "no lines for a path not chosen" by construction
       (a connector endpoint is only ever computed from the CHOSEN lane,
       never the unchosen one).
    2. **Connectors are orthogonal (elbow-routed), not simple dashes.**
       `AdventureConnector.tsx` rewritten around an SVG `<path>` with a
       single 90-degree bend (`M 0 {fromY} H 50 V {toY} H 100`) -- still
       never diagonal (#38's original ask), but now actually visualizes
       a lane changing height between columns instead of a flat dash
       that ignored it. Lane height is `top`/`center`/`bottom` ->
       25/50/75% of the connector's own stretched height (the
       surrounding flex row already stretches every child to the row's
       tallest sibling; `preserveAspectRatio="none"` + `vector-effect:
       non-scaling-stroke` keeps horizontal/vertical segments exactly
       horizontal/vertical and the stroke width constant even though
       the SVG scales non-uniformly) -- no pixel measurement needed.
    3. **`EditChallengePage.tsx`'s host-authoring grid needed its own,
       separate connector.** It shows the dungeon's static shape while a
       host places tiles -- no participant, no chosen path, nothing to
       color. Reusing the new per-participant `AdventureConnector` there
       doesn't type-check (no lane/variant to give it) and wouldn't mean
       anything if it did. Added `AdventureShapeConnector` (same file) --
       the plain `min(from, to)`-lane neutral-dashed connector #38
       originally built, kept alive under its own name for exactly this
       one non-participant consumer instead of deleting it.
    4. **A done boss room's border turns green**, same as any other done
       tile -- `border-amber-800` (the fixed "this is a boss room" color
       from #38) now only applies while a boss room is locked/frontier/
       awaiting-baseline; `done` overrides it to `border-green-500`
       directly in `BoardPage.tsx`'s className expression. A cleared
       boss room reads as cleared first, boss room second.
    5. **The done badge (star/check) no longer looks like the tile's own
       border is clipping into it.** Pulled further off the tile corner
       (`-right-1.5/-top-1.5`, was `-right-1/-top-1`) and given a 2px
       `ring-stone-950` (the page's own background color) -- the ring is
       what actually fixes the overlap: without it the badge's square
       corners sat flush against the tile's rounded-lg corner with
       nothing separating them; with it the badge reads as a distinct
       floating chip. Same fix applied to both `AdventureDoneBadge`
       (`BoardPage.tsx`) and `DungeonPathPreview.tsx`'s own done badge.

    **Homepage hero rebuilt to actually demonstrate all of the above**,
    per a direct ask to make its example accurate: `DungeonPathPreview.tsx`
    now imports and reuses the real `AdventureConnector`/
    `AdventureConnectorGap` components directly (not a local
    reimplementation) and tells a fully sequential, honest story --
    first room done (green check) -> green path -> first boss done
    (green border + check) -> green path -> second room done -> amber
    dashed path into the second boss, which is the current frontier
    (pulsing amber-800 border, no badge yet) -> nothing beyond it, since
    the third fork hasn't been reached and there's no chosen lane to
    draw a line for. The previously-generic "chosen" fork lane now
    renders as a real done tile (icon + green check) instead of a
    neutral placeholder, and its unchosen sibling renders with the same
    dim "not taken" treatment the real board gives one.

    Live-verified against the real `adventure-test` challenge: read each
    rendered connector's own SVG `d`/`stroke`/`stroke-dasharray`
    attributes (not just eyeballed) for both a completed participant and
    an in-progress one whose chosen lane actually switches sides between
    forks (top lane at fork 1, bottom at fork 2) -- confirmed exactly 5
    connectors render for 5 resolved on-path gaps, all green except one
    correctly-orange-dashed segment into the true frontier, and the
    remaining 3 gaps past the frontier render nothing. Confirmed the
    done-boss-turns-green override and the badge ring fix via computed
    style, not just visually. Same connector-path check repeated against
    the homepage hero, confirming its 3 connectors match the intended
    green/green/amber-dashed sequence exactly. Build/lint/295 tests all
    passed; no console errors; no horizontal-overflow regression at
    375px on either surface.

41. **The connector lines from #39/#40 didn't actually touch the tiles.**
    **Shipped 2026-09-10.** Root cause: #40's elbow paths positioned
    themselves at 25/50/75% of an SVG whose height came from the
    surrounding flex row's *stretched* size -- an estimate, not a
    measurement, and nothing tied those percentages to any tile's real
    on-screen position. It happened to look plausible with every tile
    the same size; it stopped being even approximately right once tile
    sizes and label heights actually varied.

    **Rebuilt around real CSS Grid instead of flex + assumed
    coordinates** -- tiles and connectors now share one coordinate
    system by construction, so a connector's endpoint IS a tile's real
    center, not a guess at it. New `src/lib/adventureGrid.ts` (moved out
    of `AdventureConnector.tsx` so that file stays component-only, no
    react-refresh lint warnings): 2 fixed-height row tracks
    (`LANE_ROW_HEIGHT` = 72px each) separated by a fixed `LANE_ROW_GAP`
    (32px) -- a top-lane tile sits at `grid-row: 1 / 2`, bottom-lane at
    `2 / 3`, a boss/single-lane tile (or a connector) at `1 / 3`
    (spanning both). Centering a spanning item across two *equal-height*
    rows always lands its center exactly on the boundary between them,
    regardless of anything in the gap -- that equal-height property is
    what makes this exact instead of another estimate. Tile columns and
    the gap columns between them alternate along one
    `grid-template-columns` (`tileColumnLine(i)` / `gapColumnLine(i)`),
    so `AdventureConnector` just reads `column`/`fromLane`/`toLane` off
    props and draws a fixed-pixel-geometry elbow (`M 0 {fromY} H {mid} V
    {toY} H {width}`) -- no `preserveAspectRatio` scaling trick needed
    anymore, since the height is now a real known constant
    (`CONNECTOR_SPAN_HEIGHT` = 176px), not something to approximate.

    **The other half of the fix: labels stopped being part of the grid
    at all.** They're absolutely positioned off the *icon box's own*
    bottom edge (`top: 100%`), not a grid row -- a label's height (one
    line vs. two, a boss-tag-plus-name vs. a plain caption) has zero
    effect on row height or connector alignment now. `LANE_ROW_GAP`
    just has to stay tall enough to give a floating label room before
    the next lane's icon begins (the scroll container's own
    `padding-bottom` was bumped to give the bottom-most row's labels
    room too, since forcing `overflow-x: auto` on one axis makes the
    other axis compute to `auto` as well -- content past the padding
    would otherwise clip or force an unwanted scrollbar). Also fixed
    while rebuilding this: the icon box switched from `overflow-hidden`
    to `overflow-visible` (with the stone-texture backdrop and the
    progress-percent bar each keeping their own `rounded-lg`/
    `rounded-l-lg` so nothing bleeds past the tile's rounded corners) --
    the done badge had actually been getting clipped by the old
    `overflow-hidden`, not just visually crowded like #40 assumed;
    that's likely the real source of the "border overlapping the icon"
    complaint that prompted #40's badge tweak in the first place.

    `EditChallengePage.tsx`'s host-authoring grid (no participant, no
    chosen path to color) was deliberately left on its own older
    flex-based layout -- `AdventureShapeConnector` (same file) still
    backs it, unchanged.

    Live-verified with real measurements, not eyeballing: read every
    connector SVG's and every tile box's actual `getBoundingClientRect()`
    against the real `adventure-test` challenge (a fully completed
    participant, 8/8 connectors; an in-progress one whose chosen lane
    switches sides between forks) -- every connector's endpoint Y
    matched its target tile's center Y exactly (e.g. 316/368/420px,
    to the pixel) with zero exceptions across 8 connectors and 15
    tiles. Repeated on the homepage hero (now 6 columns matching the
    real topology's *shape*, not its exact 9-column count, since the
    homepage only needs to show fork/boss/fork/boss/fork/boss, not
    every individual room). Build/lint (now warning-free)/295 tests all
    passed; no console errors; no new horizontal-overflow regression.

42. **Replaced the hand-drawn placeholder logo with the host's own
    design.** **Shipped 2026-09-10.** `public/logo.svg`/
    `public/favicon.svg` now hold the host-supplied artwork (a few
    thousand hand-authored path segments -- not something to
    hand-maintain as inline JSX), both copies of the same file. Served
    as a static asset rather than inlined: `Logo.tsx` is now a thin
    `<img src="/logo.svg">` wrapper, keeping that weight out of the JS
    bundle entirely. No consumer changes needed -- `Header.tsx` already
    just rendered `<Logo />`. Confirmed both files serve correctly
    (200, `image/svg+xml`, full byte count) from the dev server.
