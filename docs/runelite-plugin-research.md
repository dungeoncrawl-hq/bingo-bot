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

No, not currently. As of this research: **actively maintained, 67,709
active installs, last updated about a month ago.** The "what if the
maintainer stops" risk that partly motivated this research doesn't
hold up against the current evidence -- Dink isn't an abandoned or
niche plugin.

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
that nothing short of owning the plugin can deliver, and the review
process isn't the blocker it might have seemed (security/compliance
gate only, automated for routine updates, precedent already exists for
our exact webhook shape). The XP-precision motivation that originally
prompted this research turned out to be a red herring -- solvable for
free by consuming Dink's existing `LOGIN` event instead.

If/when this gets prioritized, scope it as "author + submit a
minimal notifier-only plugin covering just the 7 event types we
already consume, with screenshots never wired up" -- not a Dink
feature-parity rewrite. Smaller surface area, smaller ongoing
maintenance bill, and it only needs to beat Dink at the one thing that
actually motivated it.
