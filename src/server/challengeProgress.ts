// Completion detection -- multi-tenant equivalent of rs's bingoDiscord.ts.
// Called after every successful Dink event (best-effort, see dinkWebhook.ts)
// for the one participant that event was attributed to. Fetches that
// participant's raw event rows, computes stats + per-tile done/not-done via
// tileConditions.ts, diffs against existing tile_completions, and inserts
// any newly-completed tile/line/board rows (race-safe -- see
// insertRowReturning's comment in supabaseAdmin.ts).
import { selectRows, insertRowReturning, callRpc, callRpcReturning } from './supabaseAdmin.js';
import { relayToDiscord } from './discordRelay.js';
import { buildTileCompletionEmbed, buildLineCompletionEmbed, buildBoardCompletionEmbed } from './discordEmbeds.js';
import type { ParticipantLite } from './discordEmbeds.js';
import { fetchBanterPools } from './discordBanterStore.js';
import { checkTile, gridLines } from '../lib/tileConditions.js';
import { computeParticipantStats, poolStats } from '../lib/participantStats.js';
import type { RawParticipantData } from '../lib/participantStats.js';
import type { ParticipantStats } from '../lib/tileConditions.js';
import { computeHiscoresRecap, computeHiscoresRecapFromBaseline } from '../lib/hiscoresRecap.js';
import type { SnapshotRow } from '../lib/hiscoresRecap.js';
import { computeLeaderboard } from '../lib/leaderboard.js';
import { computeFirstCompleters } from '../lib/firstCompletions.js';
import { resolveFrontier } from '../lib/adventureProgress.js';
import type { AdventurePath } from '../lib/adventureProgress.js';
import type { Challenge, GridLayout, Team, Tile } from '../db/types.js';

interface ParticipantRow {
  id: string;
  challenge_id: string;
  rsn: string;
  chosen_lowest_skill: string | null;
  adventure_path: AdventurePath | null;
  team_id: string | null;
  adventure_baseline_at: string | null;
  adventure_baseline_snapshot: SnapshotRow | null;
}

interface CompletionRow {
  kind: 'tile' | 'line' | 'board';
  ref: string;
}

interface ChallengeCompletionRow {
  participant_id: string;
  kind: string;
  ref: string;
  completed_at: string;
}

const GRID_SIZE = 5;

// Every pool member's raw event rows + computed ParticipantStats, in
// bulk (one .in(participant_id, ...) query per raw table, not one round
// trip per member) -- the same pattern BoardPage.tsx's
// tileStatusesByParticipant effect already uses client-side, ported
// server-side here since a pooled mode's completions depend on
// everyone's data, not just the triggering participant's (BACKLOG.md
// #10). Each member still gets their own hiscoresRecap from their own
// snapshots (hiscores are per-account, never merged) and their own
// computeParticipantStats call -- only the results get pooled by the
// caller.
interface PoolStatsResult {
  statsList: ParticipantStats[];
  // Adventure's baseline-reset branch (BACKLOG.md #4) needs the
  // triggering participant's own raw materials to recompute stats
  // against a *different* window than the challenge-wide one used
  // above -- Adventure is always solo (pool size 1), so this is simply
  // that one member's data, kept alongside the already-reduced
  // statsList rather than re-fetched a second time.
  rawByMember: Map<string, RawParticipantData>;
  snapshotsByMember: Map<string, SnapshotRow[]>;
}

async function fetchPoolStats(
  poolMembers: ParticipantRow[],
  window: { start: string; end: string },
): Promise<PoolStatsResult> {
  const ids = poolMembers.map((m) => encodeURIComponent(m.id)).join(',');
  const [bossKills, slayerTasks, lootDrops, deaths, collectionLogEntries, petObtains, snapshots] = await Promise.all([
    selectRows<{ participant_id: string; boss: string; kc: number; created_at: string }>(
      'boss_kills',
      `participant_id=in.(${ids})&select=participant_id,boss,kc,created_at`,
    ),
    selectRows<{ participant_id: string; created_at: string }>('slayer_tasks', `participant_id=in.(${ids})&select=participant_id,created_at`),
    selectRows<{
      participant_id: string;
      items: { name: string; quantity: number }[];
      total_value: number;
      created_at: string;
      is_misc: boolean;
      max_single_value: number | null;
    }>('loot_drops', `participant_id=in.(${ids})&select=participant_id,items,total_value,created_at,is_misc,max_single_value`),
    selectRows<{ participant_id: string; created_at: string }>('deaths', `participant_id=in.(${ids})&select=participant_id,created_at`),
    selectRows<{ participant_id: string; created_at: string }>(
      'collection_log_entries',
      `participant_id=in.(${ids})&select=participant_id,created_at`,
    ),
    selectRows<{ participant_id: string; updated_at: string }>('pet_obtains', `participant_id=in.(${ids})&select=participant_id,updated_at`),
    selectRows<SnapshotRow & { participant_id: string }>(
      'participant_snapshots',
      `participant_id=in.(${ids})&select=participant_id,recorded_on,total_xp,skills,activities`,
    ),
  ]);

  function groupBy<T extends { participant_id: string }>(rows: T[]): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const list = map.get(row.participant_id) ?? [];
      list.push(row);
      map.set(row.participant_id, list);
    }
    return map;
  }
  const bossKillsByP = groupBy(bossKills);
  const slayerByP = groupBy(slayerTasks);
  const lootByP = groupBy(lootDrops);
  const deathsByP = groupBy(deaths);
  const clogByP = groupBy(collectionLogEntries);
  const petsByP = groupBy(petObtains);
  const snapshotsByP = groupBy(snapshots);

  const rawByMember = new Map<string, RawParticipantData>();
  const snapshotsByMember = new Map<string, SnapshotRow[]>();
  const statsList = poolMembers.map((m) => {
    const raw: RawParticipantData = {
      bossKills: bossKillsByP.get(m.id) ?? [],
      slayerTasks: slayerByP.get(m.id) ?? [],
      lootDrops: lootByP.get(m.id) ?? [],
      deaths: deathsByP.get(m.id) ?? [],
      collectionLogEntries: clogByP.get(m.id) ?? [],
      petObtains: petsByP.get(m.id) ?? [],
    };
    rawByMember.set(m.id, raw);
    const memberSnapshots = snapshotsByP.get(m.id) ?? [];
    snapshotsByMember.set(m.id, memberSnapshots);
    const hiscoresRecap = computeHiscoresRecap(memberSnapshots, window);
    return computeParticipantStats(raw, window, hiscoresRecap, m.chosen_lowest_skill);
  });
  return { statsList, rawByMember, snapshotsByMember };
}

const PARTICIPANT_SELECT =
  'id,challenge_id,rsn,chosen_lowest_skill,adventure_path,team_id,adventure_baseline_at,adventure_baseline_snapshot';

// isLogout: whether the Dink event that triggered this check was
// specifically a LOGOUT -- Adventure's baseline reset (BACKLOG.md #4)
// only ever establishes a new baseline in response to one, never a
// KILL_COUNT/LOOT/etc. completing a tile, and never the daily cron sync
// or a join-time baseline sync either (both refresh hiscores the same
// way a logout does, but neither IS one).
export async function checkChallengeProgress(participantId: string, isLogout: boolean): Promise<void> {
  const [participant] = await selectRows<ParticipantRow>(
    'challenge_participants',
    `id=eq.${encodeURIComponent(participantId)}&select=${PARTICIPANT_SELECT}`,
  );
  if (!participant) return;

  const [challenge] = await selectRows<Challenge>(
    'challenges',
    `id=eq.${encodeURIComponent(participant.challenge_id)}&select=*`,
  );
  if (!challenge) return;

  const tiles = await selectRows<Tile>('tiles', `challenge_id=eq.${encodeURIComponent(challenge.id)}&select=*`);
  if (tiles.length === 0) return;

  // Solo (default): the pool is just the triggering participant, exactly
  // today's behavior. Coop: everyone in the challenge. Team: everyone
  // sharing this participant's team_id -- if they haven't been assigned
  // one yet, there's nothing to pool into, so there's nothing to check
  // (their raw events still recorded normally; the moment a teammate's
  // event fires after they're assigned, the pool picks their data up
  // automatically -- no special "since assignment" trigger needed).
  let poolMembers: ParticipantRow[];
  if (challenge.game_mode === 'coop') {
    poolMembers = await selectRows<ParticipantRow>(
      'challenge_participants',
      `challenge_id=eq.${encodeURIComponent(challenge.id)}&select=${PARTICIPANT_SELECT}`,
    );
  } else if (challenge.game_mode === 'team') {
    if (!participant.team_id) return;
    poolMembers = await selectRows<ParticipantRow>(
      'challenge_participants',
      `team_id=eq.${encodeURIComponent(participant.team_id)}&select=${PARTICIPANT_SELECT}`,
    );
  } else {
    poolMembers = [participant];
  }
  const poolParticipantIds = poolMembers.map((m) => m.id);

  const pid = encodeURIComponent(participantId);
  const window = { start: challenge.start_date, end: challenge.end_date };
  const [{ statsList, rawByMember, snapshotsByMember }, existingCompletions] = await Promise.all([
    fetchPoolStats(poolMembers, window),
    selectRows<CompletionRow>('tile_completions', `participant_id=eq.${pid}&select=kind,ref`),
  ]);
  // Pooled or not, feed checkTile the exact same ParticipantStats shape
  // it always has -- poolStats is only needed once there's more than one
  // member to combine.
  const stats = statsList.length === 1 ? statsList[0] : poolStats(statsList);

  const alreadyTileIds = new Set(existingCompletions.filter((c) => c.kind === 'tile').map((c) => c.ref));

  // Phase 1: do every insert first, collecting only what actually landed
  // (insertCompletion races on a unique constraint -- see its own
  // comment). Discord embeds are built and sent in phase 2, once, using
  // challenge-wide data that must reflect all of this event's inserts.
  // In a pooled mode, every insert fans out to every pool member (a
  // pooled tile completes for everyone at once) -- a tile/line/board
  // only counts as newly-announced once per event, not once per member.
  const insertedTileIds: string[] = [];
  const insertedLineIndices: string[] = [];
  let boardInserted = false;

  async function insertForPool(kind: string, ref: string): Promise<boolean> {
    let landed = false;
    for (const pid2 of poolParticipantIds) {
      if (await insertCompletion(challenge.id, pid2, kind, ref)) landed = true;
    }
    return landed;
  }

  if (challenge.board_type === 'grid5x5') {
    // Every tile's condition is independent here -- any tile can complete
    // on its own, so it's safe (and needed for line/board detection
    // below) to check the whole board against `stats` in one sweep.
    // Adventure (below) deliberately does NOT do this -- see its comment.
    const doneTileIds = new Set(tiles.filter((t) => checkTile(t.condition, stats).done).map((t) => t.id));
    const newlyDoneTileIds = [...doneTileIds].filter((id) => !alreadyTileIds.has(id));
    for (const tileId of newlyDoneTileIds) {
      if (await insertForPool('tile', tileId)) insertedTileIds.push(tileId);
    }

    const tileByIndex = new Map(tiles.map((t) => [(t.layout as GridLayout).row * GRID_SIZE + (t.layout as GridLayout).col, t]));
    const alreadyLineIndices = new Set(existingCompletions.filter((c) => c.kind === 'line').map((c) => c.ref));
    const lines = gridLines(GRID_SIZE);

    for (let i = 0; i < lines.length; i++) {
      const allDone = lines[i].every((idx) => {
        const tile = tileByIndex.get(idx);
        return tile != null && doneTileIds.has(tile.id);
      });
      if (allDone && !alreadyLineIndices.has(String(i))) {
        if (await insertForPool('line', String(i))) insertedLineIndices.push(String(i));
      }
    }

    const boardDone = tiles.length === GRID_SIZE * GRID_SIZE && tiles.every((t) => doneTileIds.has(t.id));
    const alreadyBoard = existingCompletions.some((c) => c.kind === 'board');
    if (boardDone && !alreadyBoard) {
      boardInserted = await insertForPool('board', 'board');
    }
  } else if (challenge.board_type === 'adventure') {
    // Gated sequentially -- a cumulative stat could already clear a later
    // tile's bar before an earlier one is even reached, so (unlike
    // grid5x5 above) completions are never driven by sweeping every tile
    // against `stats` at once. Only the participant's current frontier is
    // ever checked.
    //
    // The participant's very first tile ever (done.size === 0 below)
    // keeps today's behavior verbatim -- cumulative since the challenge
    // started, using the same `stats` grid5x5 uses -- since there's no
    // prior tile to reset from. From the second tile onward,
    // BACKLOG.md #4's logout-gated baseline reset applies: the tile
    // isn't even evaluated until a qualifying Dink LOGOUT event
    // establishes a fresh baseline, which the loop then checks stats
    // against instead of the challenge-wide `stats`.
    const path = participant.adventure_path ?? {};
    const done = new Set(alreadyTileIds);
    // Adventure is always solo (Coop/Team combined with it is
    // deliberately deferred), so poolMembers is always just this one
    // participant -- rawByMember always has an entry for them.
    const raw = rawByMember.get(participant.id)!;
    const memberSnapshots = snapshotsByMember.get(participant.id) ?? [];
    let baselineAt = participant.adventure_baseline_at;
    let baselineSnapshot = participant.adventure_baseline_snapshot;

    async function establishBaseline(): Promise<void> {
      const latest = [...memberSnapshots].sort((a, b) => a.recorded_on.localeCompare(b.recorded_on)).at(-1) ?? null;
      baselineAt = await callRpcReturning<string>('establish_adventure_baseline', {
        p_participant_id: participant.id,
        p_snapshot: latest,
      });
      baselineSnapshot = latest;
    }

    while (true) {
      const frontier = resolveFrontier(tiles, path, done);
      if (frontier.kind !== 'tile') break;

      let tileStats: ParticipantStats;
      if (done.size === 0) {
        tileStats = stats; // first tile ever -- unchanged behavior
      } else {
        if (!baselineAt) {
          if (!isLogout) break; // still awaiting a qualifying logout
          await establishBaseline();
          break; // just reset -- nothing could have happened in this same instant
        }
        const recap = baselineSnapshot ? computeHiscoresRecapFromBaseline(baselineSnapshot, memberSnapshots) : null;
        tileStats = computeParticipantStats(raw, { start: baselineAt, end: window.end }, recap, participant.chosen_lowest_skill);
      }

      if (!checkTile(frontier.tile.condition, tileStats).done) break;
      if (await insertCompletion(challenge.id, participant.id, 'tile', frontier.tile.id)) {
        insertedTileIds.push(frontier.tile.id);
      }
      done.add(frontier.tile.id);

      if (isLogout) {
        // This same logout immediately becomes the *next* tile's
        // baseline too -- no need to wait for a second one. The loop
        // continues, but a freshly-reset baseline means ~zero elapsed
        // time, so only a freeSpace-style tile could complete
        // immediately -- same as freeSpace already can everywhere else.
        await establishBaseline();
      } else {
        await callRpc('clear_adventure_baseline', { p_participant_id: participant.id });
        baselineAt = null;
        baselineSnapshot = null;
        break; // next tile now locked, awaiting a fresh logout
      }
    }

    const alreadyBoard = existingCompletions.some((c) => c.kind === 'board');
    if (!alreadyBoard && resolveFrontier(tiles, path, done).kind === 'clear') {
      boardInserted = await insertCompletion(challenge.id, participant.id, 'board', 'board');
    }
  }

  // Phase 2: nothing to announce -- skip the extra challenge-wide queries
  // entirely.
  if (insertedTileIds.length === 0 && insertedLineIndices.length === 0 && !boardInserted) return;

  const [allParticipants, challengeCompletions, allTeams] = await Promise.all([
    selectRows<ParticipantLite & { team_id: string | null }>(
      'challenge_participants',
      `challenge_id=eq.${encodeURIComponent(challenge.id)}&select=id,rsn,team_id`,
    ),
    selectRows<ChallengeCompletionRow>(
      'tile_completions',
      `challenge_id=eq.${encodeURIComponent(challenge.id)}&select=participant_id,kind,ref,completed_at`,
    ),
    challenge.game_mode === 'team'
      ? selectRows<Team>('teams', `challenge_id=eq.${encodeURIComponent(challenge.id)}&select=*`)
      : Promise.resolve([] as Team[]),
  ]);
  const firstCompleters = computeFirstCompleters(challengeCompletions);
  const participantLite: ParticipantLite = { id: participant.id, rsn: participant.rsn };
  const challengeLite = { name: challenge.name, slug: challenge.slug, board_type: challenge.board_type };
  const teamNameById = new Map(allTeams.map((t) => [t.id, t.name]));

  // Subject/leaderboard shape per mode -- solo keeps today's behavior
  // exactly (participant.rsn, the real per-participant leaderboard).
  // Coop names "the group" and never claims a "first." Team names the
  // triggering participant's own team and collapses the leaderboard/
  // embed-participants to one representative id per team (same "collapse
  // to one representative" trick BACKLOG.md specifies for the web
  // leaderboard too), relabeled with the team's name so
  // formatLeaderboardField/computeLeaderboard need no changes at all.
  let subject: string | undefined;
  let noFirstConcept = false;
  let leaderboardParticipantIds = allParticipants.map((p) => p.id);
  let embedParticipants: ParticipantLite[] = allParticipants;

  if (challenge.game_mode === 'coop') {
    subject = 'The group';
    noFirstConcept = true;
  } else if (challenge.game_mode === 'team' && participant.team_id) {
    const teamName = teamNameById.get(participant.team_id) ?? 'Unknown Team';
    subject = `Team ${teamName}`;
    // One representative per team, lexicographically smallest id --
    // matches computeLeaderboard's own tie-break convention.
    const representativeByTeam = new Map<string, string>();
    for (const p of allParticipants) {
      if (!p.team_id) continue;
      const current = representativeByTeam.get(p.team_id);
      if (!current || p.id < current) representativeByTeam.set(p.team_id, p.id);
    }
    leaderboardParticipantIds = [...representativeByTeam.values()];
    embedParticipants = leaderboardParticipantIds.map((id) => {
      const rep = allParticipants.find((p) => p.id === id)!;
      return { id: rep.id, rsn: `Team ${teamNameById.get(rep.team_id!) ?? 'Unknown Team'}` };
    });
  }

  const leaderboard = computeLeaderboard(tiles, challengeCompletions, leaderboardParticipantIds, firstCompleters);

  // BACKLOG.md #9 -- fetched once per webhook call (60s-cached in
  // discordBanterStore.ts), not once per tile. Only needed when there's
  // actually a tile or board completion to flavor -- buildLineCompletionEmbed
  // takes no pools, so a line-only completion skips this fetch entirely.
  const pools = insertedTileIds.length > 0 || boardInserted ? await fetchBanterPools() : undefined;

  for (const tileId of insertedTileIds) {
    const tile = tiles.find((t) => t.id === tileId);
    if (!tile) continue;
    // A free space completes for everyone the instant it exists (usually
    // right on joining) -- not an achievement worth a Discord post, and
    // posting one for every new joiner would just be noise.
    if (tile.condition.type === 'freeSpace') continue;
    let isFirst = firstCompleters[tileId] === participant.id;
    let firstCompleterRsn = isFirst
      ? participant.rsn
      : (allParticipants.find((p) => p.id === firstCompleters[tileId])?.rsn ?? participant.rsn);
    if (challenge.game_mode === 'coop') {
      isFirst = false; // handled by noFirstConcept -- firstCompleterRsn is ignored
    } else if (challenge.game_mode === 'team') {
      // "First" means this participant's *team* was first, not this
      // specific participant -- map the winning completion back to its
      // team for both the flag and the display text.
      const winnerTeamId = allParticipants.find((p) => p.id === firstCompleters[tileId])?.team_id ?? null;
      isFirst = winnerTeamId != null && winnerTeamId === participant.team_id;
      firstCompleterRsn = winnerTeamId ? `Team ${teamNameById.get(winnerTeamId) ?? 'Unknown Team'}` : firstCompleterRsn;
    }
    const embed = buildTileCompletionEmbed({
      participant: participantLite,
      subject,
      tile,
      isFirst,
      firstCompleterRsn,
      noFirstConcept,
      leaderboard,
      participants: embedParticipants,
      challenge: challengeLite,
      pools,
    });
    await relayToDiscord(challenge.discord_webhook_url, embed);
  }
  for (let i = 0; i < insertedLineIndices.length; i++) {
    await relayToDiscord(
      challenge.discord_webhook_url,
      buildLineCompletionEmbed({ participant: participantLite, subject, challenge: challengeLite }),
    );
  }
  if (boardInserted) {
    await relayToDiscord(
      challenge.discord_webhook_url,
      buildBoardCompletionEmbed({ participant: participantLite, subject, challenge: challengeLite, pools }),
    );
  }
}

async function insertCompletion(challengeId: string, participantId: string, kind: string, ref: string): Promise<boolean> {
  const rows = await insertRowReturning<{ id: string }>(
    'tile_completions',
    { challenge_id: challengeId, participant_id: participantId, kind, ref },
    'participant_id,challenge_id,kind,ref',
  );
  return rows.length > 0;
}
