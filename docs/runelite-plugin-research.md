# Research: a first-party RuneLite plugin instead of Dink

Status: exploratory research, not a committed direction. Written up
2026-09-02 in response to BACKLOG.md #10. See that item for the
one-line pointer.

## Why this came up

Today every event (kills, loot, deaths, XP, clog, pets, logout) reaches
us through [Dink](https://github.com/pajlads/DinkPlugin), a third-party
RuneLite plugin each host's players install and point at our
per-challenge webhook URL. The concrete motivation for looking at a
first-party replacement: **Dink's "Send screenshot" option is a
per-notifier setting on the player's own client, and we have no way to
turn it off from our side.** Today's mitigation is entirely social — a
setup-guide step telling hosts to turn it off for 7 of 10 notifiers
(shipped, see git history) — which only works if every player actually
follows it. A plugin we author simply never constructs a screenshot
payload in the first place; there's no setting to misconfigure, no
step a player can skip. That's the one thing a first-party plugin
achieves that no amount of documentation or reactive detection
(`increment_screenshot_stats`, the admin dashboard's ⚠ badge) can.

A secondary motivation raised earlier: whether Dink's events are
precise enough for BACKLOG.md #4's logout-gated baseline reset. Turns
out this one mostly evaporates on inspection -- see "The XP-precision
gap, revisited" below.

## What we actually consume from Dink today

`src/server/dinkWebhook.ts` handles exactly these notifier types:

| Type | Fields used | Purpose |
|---|---|---|
| `KILL_COUNT` | `boss`, `count`, `isPersonalBest`, `time` | `boss_kills` rows, `kcGained` conditions |
| `SLAYER` | `slayerTask`/`monster`, `slayerCompleted`, `slayerPoints`, `killCount` | `slayer_tasks` rows |
| `LOOT` | `items[]` (name/quantity/priceEach), `source`, `killCount` | `loot_drops` rows, value/item-set conditions |
| `DEATH` | `valueLost`, `isPvp`, `killerName`, `lostItems` | `deaths` rows, `maxDeaths` conditions |
| `COLLECTION` | `itemName`, `itemId`, `completedEntries`, `totalEntries` | `collection_log_entries` rows |
| `PET` | `petName`/`boss`, `duplicate` | `pet_obtains` rows |
| `LOGOUT` | (none -- just a trigger) | forces `syncOneParticipant`'s on-demand hiscores resync, and (as of BACKLOG.md #4) the Adventure baseline-reset gate |
| `LEVEL` | received, **explicitly unused** | comment in the handler says XP/skill-level conditions rely on hiscores polling instead, since `LEVEL` alone "can't provide" enough precision |

Every event also carries `playerName` (matched against
`challenge_participants.rsn`) and, optionally, a multipart screenshot
we currently just log the volume of (`recordScreenshot`).

## Dink as a dependency: is it actually at risk?

No, not currently. As of this research: **actively maintained, 70,696
active installs, last commit 2026-08-31.** The "what if the maintainer
stops" risk that partly motivated this research doesn't hold up
against the current evidence -- Dink isn't an abandoned or niche
plugin.

Pulled the full commit and release history from GitHub's API to check
the cadence directly rather than go on a single "last updated" date.
Over the trailing 12 months (2025-09-02 to 2026-09-02):

**121 commits**, roughly monthly, one real quiet stretch:

| Month | Commits |
|---|---|
| 2025-09 | 1 |
| 2025-10 | 12 |
| 2025-11 | 15 |
| 2025-12 | 11 |
| 2026-01 | 3 |
| 2026-02 | 13 |
| 2026-03 | 19 |
| 2026-04 | 11 |
| 2026-05 | 2 |
| 2026-06 | 1 |
| 2026-07 | 18 |
| 2026-08 | 15 |

**21 tagged releases**, averaging almost 2/month: `v1.11.14`
(2025-10-15) through five point releases in Oct-Nov, `v1.11.21`/`22`
in Dec, `v1.11.23`/`24` in Jan-Feb, `v1.12.0`/`1` in Feb, `v1.13.0`
through `.2` in Mar, `v1.14.0` in Apr (the one real gap -- nothing
released May-Jun), then `v1.14.1` through `.4` across Jul, and
`v1.15.0` on 2026-08-30, two days before this research.

The only lull was May-June 2026 (3 commits combined, zero releases) --
everything else is a steady stream of point releases. Reads as a
healthy, actively-maintained project, not one coasting toward
abandonment.

## The XP-precision gap, revisited

Dink's [full notifier list](https://github.com/pajlads/DinkPlugin) is
much bigger than what we consume -- 28 types, including several we
don't handle at all: `XP_MILESTONE`, `QUEST`, `CLUE`,
`COMBAT_ACHIEVEMENT`, `ACHIEVEMENT_DIARY`, `LOGIN`, and more.

The interesting one: **`LOGIN` sends a full, exact XP snapshot for
every skill at once** (`"experience": {"Hunter": 5420696, ...}`),
read directly from the client at the moment a session starts -- no
hiscores round-trip, no daily-poll staleness, no "account hidden from
hiscores" edge case. We don't consume it at all today.

This cuts against the plugin idea, not for it: BACKLOG.md #4's Adventure
baseline reset needed a whole `LOGOUT`-triggered hiscores-resync
mechanism specifically because nothing gave us an exact, instant XP
snapshot. Dink already sends exactly that, just on the *other* end of
a session (`LOGIN`, not `LOGOUT`). We're under-using Dink here, not
blocked by it. Worth its own small backlog item independent of any
plugin decision: consume `LOGIN`'s `experience` map.

## The actual question: can we block screenshots by owning the plugin?

Yes, trivially -- if we author the plugin, we simply never write the
multipart screenshot part into any notifier payload. There's no Jagex
or RuneLite rule requiring a notifier plugin to support screenshots;
Dink supports it because Dink chose to, for its general Discord-webhook
audience. Nothing stops a purpose-built plugin from omitting the
capability entirely. This is the one motivation in this document that
a first-party plugin actually and fully resolves, with no workaround
available any other way.

## Could an existing alternative plugin solve this instead?

Checked every Discord/webhook notification plugin listed in
[Dink's own comparison doc](https://github.com/pajlads/DinkPlugin/blob/master/docs/comparison.md)
that plausibly covers a meaningful chunk of our event set (`KILL_COUNT`/
`LOOT`/`SLAYER`/`DEATH`/`COLLECTION`/`PET`/`LOGOUT`). Install counts
and last-updated dates are from [runelite.phyce.dev](https://runelite.phyce.dev)
(Plugin Hub manifest stats) cross-checked against each repo's actual
last commit via the GitHub API where the two disagreed.

| Plugin | Installs | Code last touched | Screenshots? | Our events covered | Logout event? |
|---|---|---|---|---|---|
| **Dink** (pajlads) | 70,696 | 2026-08-31 | Yes, per-notifier, we can't disable it | KC/loot/slayer/death/clog/pet/logout -- all of it | Yes |
| [DropTracker](https://github.com/joelhalen/droptracker-plugin) (joelhalen) | -- (Plugin Hub, growing) | 2026-08-28 | Yes -- configurable per-event, same structural problem (player-side setting, not our control) | loot, clog, combat achievements, PBs, pets, XP/levels, quests -- **no explicit KC or slayer**, no logout | No |
| [Discord Notifications](https://github.com/ThatOhio/RuneLite-Discord-Notifications) (WintZ) | 18,994 | 2026-09-02 | Yes, optional | level, quest, death only | No |
| [Discord Collection Logger](https://github.com/PJGJ210/Discord-Collection-Logger) (Paul) | 22,594 | 2024-12-19 | No | collection log only | No |
| [Discord Loot Logger](https://github.com/Adam-/runelite-plugins) (Adam) | 27,890 | 2021-01-24 (abandoned) | No | loot only | No |
| [Universal Discord Notifications](https://github.com/MidgetJake/UniversalDiscordNotifier) (MidgetJake) | 3,277 | 2022-11-11 (abandoned) | No | loot, level, clog, slayer, quest, clues -- **no death, no pets, no KC, no logout** | No |
| Better Discord Loot Logger / Split Tracker (skyhawkgaming) | 1,515 | 2023-01-09 (abandoned) | Not documented | loot, clue, pet | No |

**Nothing threads the needle.** Every plugin that avoids screenshots
entirely is either single-purpose (collection log only, loot only) or
abandoned for 2-4+ years -- switching to one would mean losing
coverage on most of our event set and gluing together several
plugins per host, not a clean swap. Every plugin broad enough to
plausibly replace Dink's coverage (DropTracker, Discord Notifications)
still bundles an optional screenshot capability the same way Dink
does -- a per-player setting we still couldn't control from our side,
so it wouldn't actually solve the problem that motivated this search.

**Nobody but Dink fires on logout.** That's not surprising in
hindsight -- "player logged out" isn't something a Discord-notification
plugin has any reason to post about, so none of the narrower
alternatives implement it. We depend on it twice now: the daily
hiscores-resync trigger, and BACKLOG.md #4's Adventure baseline reset.
Losing it isn't an option regardless of the screenshot question.

**Conclusion**: switching to an existing alternative doesn't get us
out of the maintenance/review cost documented below -- it just trades
Dink's maintenance for a differently-scoped plugin's maintenance (or
several), without actually solving the screenshot problem in most
cases, and without logout support in any case. This doesn't change the
recommendation, but it does close off "just switch plugins" as a
cheaper alternative to building -- that door isn't actually open.

## Plugin Hub: review and submission process

Source: [runelite/runelite wiki, "Plugin Hub Review"](https://github.com/runelite/runelite/wiki/Plugin-Hub-Review)
and [pull requests on runelite/plugin-hub](https://github.com/runelite/plugin-hub/pulls).

- **Where the code lives**: a plugin's actual source is its own
  separate GitHub repo (Dink's is
  [pajlads/DinkPlugin](https://github.com/pajlads/DinkPlugin)) -- the
  `runelite/plugin-hub` repo itself just holds a small manifest/pointer
  entry per plugin (see the `dink` entry at
  `runelite/plugin-hub/plugins/dink`). Submitting is a pull request
  against `runelite/plugin-hub` adding that manifest entry, referencing
  our own repo.
- **What review checks, verbatim from the wiki**: "We verify that
  plugins aren't malicious, such as stealing account credentials or
  installing malware" and "We review plugin submissions for rule
  breaking behavior" (Jagex's third-party client rules). Code is
  restricted around reflection, native code, and dependencies, plus
  automated scanning; any dependency that isn't already a transitive
  dependency of `runelite-client` needs a manually-verified
  cryptographic hash.
- **What review explicitly does NOT check** (also verbatim): plugin
  functionality/usefulness, performance or lag, whether it breaks
  other plugins, or whether displayed information is accurate. This is
  a security/compliance gate, not a code-quality gate.
- **Updates after initial approval**: as of April 2026, an automated
  review bot can auto-approve updates to already-accepted plugins
  ("most simple plugins can be approved by the bot automatically"),
  with humans reviewing anything the bot's configured permissions
  don't cover. This meaningfully lowers the ongoing submission
  friction compared to a fully-manual process -- routine game-update
  compatibility bumps likely don't need to wait on a human reviewer.
- **Third-party network communication**: plugins that talk to a
  server outside Jagex's own need "a warning either on the plugin, or
  on the configuration option enabling the setting, explaining what
  data is being sent." Dink and several other webhook-posting plugins
  (e.g. `clan-chat-webhook`) already satisfy this and are live on the
  Hub -- so an opt-in, player-configured webhook is clearly an accepted
  shape, not a policy risk. (The wiki's "Rejected or Rolled-Back
  Features" language about plugins that "expose player information
  over HTTP" or "crowdsource data about other players" reads as being
  about a plugin passively serving an HTTP endpoint, or reporting on
  players who never opted in -- a different thing from a plugin that
  POSTs its own player's own events to a URL that player configured
  themselves, which is exactly Dink's shape and would be exactly ours.)
- **Abandonment has a policy answer already**: the wiki references a
  "plugin takeover policy" for plugins whose maintainer goes inactive
  -- meaning even Dink's own worst case (maintainer disappears) has an
  existing community process, not a hard dead end for every host
  relying on it.

## Cost side, unchanged by any of the above

- **Ongoing maintenance is real and ours alone.** Every OSRS game
  update that touches combat, loot, or skilling UI is a maintenance
  event Dink's maintainer currently absorbs for us, for free, across
  every server using it. Owning the plugin means owning that forever.
- **Distribution friction**: every host's clan would need to install a
  second/different plugin (ours) alongside or instead of Dink, which
  many already have for unrelated servers. Not a blocker, but real
  adoption friction per-host.
- **Review overhead is lower than it looked before this research** (the
  April 2026 automation), but still nonzero for anything the bot's
  permission profile doesn't cover.

## Recommendation

Not urgent, but no longer "purely exploratory" either -- there's now
one concrete, well-defined win (screenshot elimination at the source)
that nothing short of owning the plugin can deliver, confirmed against
every existing alternative (none combine our full event coverage,
logout support, and zero screenshots), and the review process isn't
the blocker it might have seemed (security/compliance gate only,
automated for routine updates, precedent already exists for our exact
webhook shape). The XP-precision motivation that originally prompted
this research turned out to be a red herring -- solvable for free by
consuming Dink's existing `LOGIN` event instead.

If/when this gets prioritized, scope it as "author + submit a
minimal notifier-only plugin covering just the 7 event types we
already consume, with screenshots never wired up" -- not a Dink
feature-parity rewrite. Smaller surface area, smaller ongoing
maintenance bill, and it only needs to beat Dink at the one thing that
actually motivated it.
