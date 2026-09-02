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
10. Research: build a first-party RuneLite plugin instead of depending
    on the third-party Dink plugin for every game event this site
    relies on (`KILL_COUNT`/`LOOT`/`SLAYER`/`DEATH`/`COLLECTION`/`PET`/
    `LOGOUT`/`LEVEL`, plus the screenshot payloads `dinkPayload.ts`
    already has to defensively discard). A real undertaking, not a
    small research spike -- effectively re-implementing everything Dink
    already does, plus RuneLite Plugin Hub review/approval, ongoing
    maintenance against game updates, and asking every host's players
    to install a second/different plugin instead of one many already
    have. Purely exploratory for now: what would actually motivate this
    (more event types than Dink exposes? faster/more precise event
    timing, relevant to #4's logout-gated reset? less dependency risk on
    a third party's plugin staying maintained?), not a committed
    direction.
