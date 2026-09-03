import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getSupabase } from '../db/supabaseClient';
import type { Challenge, Team, Tile } from '../db/types';
import {
  checkTile,
  describeTileCondition,
  formatTileGoal,
  formatTileProgress,
  progressPercent,
  type TileStatus,
} from '../lib/tileConditions';
import { computeParticipantStats, type RawParticipantData } from '../lib/participantStats';
import { computeHiscoresRecap, computeHiscoresRecapFromBaseline, type SnapshotRow } from '../lib/hiscoresRecap';
import { computeLeaderboard } from '../lib/leaderboard';
import { computeFirstCompleters } from '../lib/firstCompletions';
import { progressColor } from '../lib/progressColor';
import { formatDateRange, formatLocalRange, preciseCountdownText } from '../lib/dungeonStatus';
import TileDetailModal from '../components/TileDetailModal';
import AdventureColumnModal from '../components/AdventureColumnModal';
import AdventureConnector from '../components/AdventureConnector';
import {
  ADVENTURE_SMALL_COLUMNS,
  ADVENTURE_SMALL_FINAL_BOSS_COLUMN,
  bossLabelForColumn,
  forkIndexForColumn,
  isBossColumn,
  laneCountForColumn,
  resolveFrontier,
  roomNumberForColumn,
} from '../lib/adventureProgress';

const GRID_SIZE = 5;
// Every small-dungeon participant always has exactly 9 tiles in play (3
// bosses + 2 from whichever lane they picked at each of 3 forks) --
// regardless of how many total slots (15) exist or which lanes were
// chosen, so the leaderboard denominator is this fixed constant, not
// tiles.length.
const ADVENTURE_SMALL_TILES_IN_PLAY = 9;
// Every challenge date is a fixed UTC calendar date (BACKLOG.md #14) --
// this is the viewer's own zone, used only to show what those UTC
// boundaries mean on their clock, never for gating/status logic itself.
const VIEWER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

interface ParticipantRow {
  id: string;
  profile_id: string;
  rsn: string;
  chosen_lowest_skill: string | null;
  adventure_path: Record<string, 'top' | 'bottom'>;
  team_id: string | null;
  // Adventure logout-gated reset (BACKLOG.md #4) -- null means this
  // participant's next tile is locked, awaiting a qualifying Dink
  // LOGOUT event.
  adventure_baseline_at: string | null;
  adventure_baseline_snapshot: SnapshotRow | null;
}

interface CompletionRow {
  participant_id: string;
  kind: 'tile' | 'line' | 'board';
  ref: string;
  completed_at: string;
}

export default function BoardPage() {
  const { slug } = useParams<{ slug: string }>();
  const { session, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [challenge, setChallenge] = useState<Challenge | null | 'not-found'>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [rsn, setRsn] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [editingRsn, setEditingRsn] = useState(false);
  const [rsnDraft, setRsnDraft] = useState('');
  const [savingRsn, setSavingRsn] = useState(false);
  const [rsnError, setRsnError] = useState('');
  const [tileStatusesByParticipant, setTileStatusesByParticipant] = useState<Record<string, Record<string, TileStatus>>>({});
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<number | null>(null);

  const myParticipant = session ? participants.find((p) => p.profile_id === session.user.id) : undefined;
  // Which participant's board is currently displayed -- explicit via ?p=,
  // defaulting to the signed-in viewer's own board if they've joined.
  // Anyone (signed in or not) can view anyone's board this way, since the
  // underlying raw event tables are all public-read RLS.
  const viewedParticipantId = searchParams.get('p') ?? myParticipant?.id ?? null;

  const load = useCallback(async () => {
    if (!slug) return;
    const supabase = getSupabase();
    const { data: challengeData } = await supabase.from('challenges').select('*').eq('slug', slug).maybeSingle();
    if (!challengeData) {
      setChallenge('not-found');
      return;
    }
    setChallenge(challengeData as Challenge);
    const [{ data: tilesData }, { data: participantsData }, { data: completionsData }, { data: teamsData }] = await Promise.all([
      supabase.from('tiles').select('*').eq('challenge_id', challengeData.id),
      supabase
        .from('challenge_participants')
        .select('id, profile_id, rsn, chosen_lowest_skill, adventure_path, team_id, adventure_baseline_at, adventure_baseline_snapshot')
        .eq('challenge_id', challengeData.id),
      supabase
        .from('tile_completions')
        .select('participant_id, kind, ref, completed_at')
        .eq('challenge_id', challengeData.id),
      supabase.from('teams').select('*').eq('challenge_id', challengeData.id),
    ]);
    setTiles((tilesData as Tile[]) ?? []);
    setParticipants((participantsData as ParticipantRow[]) ?? []);
    setCompletions((completionsData as CompletionRow[]) ?? []);
    setTeams((teamsData as Team[]) ?? []);
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  // Pre-fills the join form from the signed-in viewer's saved default RSN
  // (set on /account) exactly once, the first time it becomes available --
  // guarded by a ref rather than "only when rsn is empty" so clearing the
  // field afterward to type something else doesn't keep snapping it back.
  const prefilledDefaultRsn = useRef(false);
  useEffect(() => {
    if (!prefilledDefaultRsn.current && profile?.default_rsn) {
      setRsn(profile.default_rsn);
      prefilledDefaultRsn.current = true;
    }
  }, [profile]);

  // Live progress (not just done/not-done) for every participant, not only
  // the one currently being viewed -- computed client-side by re-running the
  // same pure functions the server uses (challengeProgress.ts), since the
  // intermediate progress numbers are never persisted, only the final
  // done/not-done result. Fetched in bulk (one `.in(participant_id, ...)`
  // query per raw table, not one round trip per participant) so the "who's
  // closest" badge coloring below has every participant's numbers, not just
  // the viewer's own.
  useEffect(() => {
    if (participants.length === 0 || tiles.length === 0 || challenge === null || challenge === 'not-found') {
      setTileStatusesByParticipant({});
      return;
    }
    const supabase = getSupabase();
    const participantIds = participants.map((p) => p.id);
    const window = { start: challenge.start_date, end: challenge.end_date };
    (async () => {
      const [bossKills, slayerTasks, lootDrops, deaths, collectionLogEntries, petObtains, snapshots] = await Promise.all([
        supabase.from('boss_kills').select('participant_id, boss, kc, created_at').in('participant_id', participantIds),
        supabase.from('slayer_tasks').select('participant_id, created_at').in('participant_id', participantIds),
        supabase
          .from('loot_drops')
          .select('participant_id, items, total_value, created_at, is_misc, max_single_value')
          .in('participant_id', participantIds),
        supabase.from('deaths').select('participant_id, created_at').in('participant_id', participantIds),
        supabase.from('collection_log_entries').select('participant_id, created_at').in('participant_id', participantIds),
        supabase.from('pet_obtains').select('participant_id, updated_at').in('participant_id', participantIds),
        supabase
          .from('participant_snapshots')
          .select('participant_id, recorded_on, total_xp, skills, activities')
          .in('participant_id', participantIds),
      ]);

      const rawByParticipant: Record<string, RawParticipantData> = {};
      for (const pid of participantIds) {
        rawByParticipant[pid] = {
          bossKills: [],
          slayerTasks: [],
          lootDrops: [],
          deaths: [],
          collectionLogEntries: [],
          petObtains: [],
        };
      }
      type WithParticipant<T> = T & { participant_id: string };
      for (const row of ((bossKills.data ?? []) as WithParticipant<RawParticipantData['bossKills'][number]>[])) {
        rawByParticipant[row.participant_id]?.bossKills.push(row);
      }
      for (const row of ((slayerTasks.data ?? []) as WithParticipant<RawParticipantData['slayerTasks'][number]>[])) {
        rawByParticipant[row.participant_id]?.slayerTasks.push(row);
      }
      for (const row of ((lootDrops.data ?? []) as WithParticipant<RawParticipantData['lootDrops'][number]>[])) {
        rawByParticipant[row.participant_id]?.lootDrops.push(row);
      }
      for (const row of ((deaths.data ?? []) as WithParticipant<RawParticipantData['deaths'][number]>[])) {
        rawByParticipant[row.participant_id]?.deaths.push(row);
      }
      for (const row of ((collectionLogEntries.data ?? []) as WithParticipant<RawParticipantData['collectionLogEntries'][number]>[])) {
        rawByParticipant[row.participant_id]?.collectionLogEntries.push(row);
      }
      for (const row of ((petObtains.data ?? []) as WithParticipant<RawParticipantData['petObtains'][number]>[])) {
        rawByParticipant[row.participant_id]?.petObtains.push(row);
      }
      const snapshotsByParticipant: Record<string, SnapshotRow[]> = {};
      for (const row of ((snapshots.data ?? []) as WithParticipant<SnapshotRow>[])) {
        (snapshotsByParticipant[row.participant_id] ??= []).push(row);
      }

      const chosenSkillByParticipant = new Map(participants.map((p) => [p.id, p.chosen_lowest_skill]));
      const statuses: Record<string, Record<string, TileStatus>> = {};
      for (const pid of participantIds) {
        const hiscoresRecap = computeHiscoresRecap(snapshotsByParticipant[pid] ?? [], window);
        const stats = computeParticipantStats(rawByParticipant[pid], window, hiscoresRecap, chosenSkillByParticipant.get(pid) ?? null);
        const tileStatuses: Record<string, TileStatus> = {};
        for (const tile of tiles) {
          tileStatuses[tile.id] = checkTile(tile.condition, stats);
        }
        statuses[pid] = tileStatuses;

        // Adventure's logout-gated baseline reset (BACKLOG.md #4): once
        // a participant is past their first tile, their frontier tile's
        // live progress must reflect stats since their baseline, not
        // since the challenge started -- mirrors
        // challengeProgress.ts's own server-side distinction. Every
        // other tile (done, locked, other-lane) keeps using the
        // challenge-wide computation above, since only the frontier
        // tile's number is ever actually shown. If no baseline is
        // established yet, this is left alone -- the render below shows
        // the "awaiting logout" state instead of any number for it.
        if (challenge.board_type === 'adventure') {
          const p = participants.find((pp) => pp.id === pid);
          const doneIds = new Set(completions.filter((c) => c.kind === 'tile' && c.participant_id === pid).map((c) => c.ref));
          const frontier = resolveFrontier(tiles, p?.adventure_path ?? {}, doneIds);
          if (frontier.kind === 'tile' && doneIds.size > 0 && p?.adventure_baseline_at) {
            const recap = p.adventure_baseline_snapshot
              ? computeHiscoresRecapFromBaseline(p.adventure_baseline_snapshot, snapshotsByParticipant[pid] ?? [])
              : null;
            const sinceBaselineStats = computeParticipantStats(
              rawByParticipant[pid],
              { start: p.adventure_baseline_at, end: window.end },
              recap,
              chosenSkillByParticipant.get(pid) ?? null,
            );
            tileStatuses[frontier.tile.id] = checkTile(frontier.tile.condition, sinceBaselineStats);
          }
        }
      }
      setTileStatusesByParticipant(statuses);
    })();
  }, [participants, tiles, challenge, completions]);

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!session || !rsn.trim() || !challenge || challenge === 'not-found') return;
    setJoining(true);
    setJoinError('');
    const { data, error } = await getSupabase()
      .from('challenge_participants')
      .insert({ challenge_id: challenge.id, profile_id: session.user.id, rsn: rsn.trim() })
      .select('id')
      .single();
    setJoining(false);
    if (error) {
      setJoinError(error.message);
      return;
    }
    setRsn('');
    await load();

    // Best-effort baseline hiscores snapshot the moment they join, so
    // XP/skill-level/clue tiles have an accurate starting point instead of
    // only catching up on their first Dink LOGOUT event or the next daily
    // cron sweep -- without this, any progress made in that gap is
    // permanently uncounted, not just delayed.
    fetch('/api/sync-participant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId: data.id }),
    }).catch(() => {});
  }

  async function handleRenameRsn(e: FormEvent) {
    e.preventDefault();
    if (!myParticipant || !rsnDraft.trim()) return;
    setSavingRsn(true);
    setRsnError('');
    const { error } = await getSupabase()
      .from('challenge_participants')
      .update({ rsn: rsnDraft.trim() })
      .eq('id', myParticipant.id);
    setSavingRsn(false);
    if (error) {
      setRsnError(error.message);
      return;
    }
    setEditingRsn(false);
    await load();
  }

  async function handleChooseLowestSkill(skill: string) {
    if (!myParticipant) return;
    await getSupabase().from('challenge_participants').update({ chosen_lowest_skill: skill }).eq('id', myParticipant.id);
    await load();
  }

  // A lane choice, once made, is never revisited -- real branching, not
  // just ordering (see BACKLOG.md #7) -- so this only ever adds a new
  // fork entry, it doesn't offer to change an existing one.
  async function handleChooseLane(forkIndex: number, lane: 'top' | 'bottom') {
    if (!myParticipant) return;
    const nextPath = { ...myParticipant.adventure_path, [String(forkIndex)]: lane };
    await getSupabase().from('challenge_participants').update({ adventure_path: nextPath }).eq('id', myParticipant.id);
    await load();
  }

  async function handleLeave() {
    if (!myParticipant) return;
    if (!window.confirm('Leave this challenge? Your progress history on this board will be deleted.')) return;
    await getSupabase().from('challenge_participants').delete().eq('id', myParticipant.id);
    await load();
  }

  if (challenge === null) return null;
  if (challenge === 'not-found') {
    return <p className="mx-auto max-w-lg py-24 text-center text-stone-400">Challenge not found.</p>;
  }

  const tileAt = (row: number, col: number) =>
    tiles.find((t) => 'row' in t.layout && t.layout.row === row && t.layout.col === col) ?? null;
  const adventureTileAt = (column: number, lane: 'top' | 'bottom' | 'center') =>
    tiles.find((t) => 'lane' in t.layout && t.layout.column === column && t.layout.lane === lane) ?? null;
  const isHost = session?.user.id === challenge.host_id;
  const viewedParticipant = participants.find((p) => p.id === viewedParticipantId);
  const viewedTileStatuses = (viewedParticipantId && tileStatusesByParticipant[viewedParticipantId]) || {};
  const viewedCompletedTileIds = new Set(
    completions.filter((c) => c.kind === 'tile' && c.participant_id === viewedParticipantId).map((c) => c.ref),
  );

  function hasCompletedBoard(participantId: string): boolean {
    return completions.some((c) => c.kind === 'board' && c.participant_id === participantId);
  }

  // Real (already-recorded) completions only -- never the checkTile-
  // against-stats sweep used for Standard's badges, since Adventure's
  // frontier is gated by position, not just "stats already clear it" (see
  // challengeProgress.ts's own comment on the same distinction).
  function doneTileIdsFor(participantId: string): Set<string> {
    return new Set(completions.filter((c) => c.kind === 'tile' && c.participant_id === participantId).map((c) => c.ref));
  }

  const viewedFrontier =
    challenge.board_type === 'adventure' && viewedParticipant
      ? resolveFrontier(tiles, viewedParticipant.adventure_path ?? {}, viewedCompletedTileIds)
      : null;
  const myFrontier =
    challenge.board_type === 'adventure' && myParticipant
      ? resolveFrontier(tiles, myParticipant.adventure_path ?? {}, doneTileIdsFor(myParticipant.id))
      : null;
  const pendingLaneChoice = myFrontier && myFrontier.kind === 'needsLaneChoice' ? myFrontier : null;
  // Reached a new room, but locked until a qualifying Dink LOGOUT event
  // establishes a fresh baseline (BACKLOG.md #4) -- never true for a
  // participant's very first tile ever, matching challengeProgress.ts.
  const myAwaitingBaselineReset =
    myFrontier?.kind === 'tile' && doneTileIdsFor(myParticipant?.id ?? '').size > 0 && !myParticipant?.adventure_baseline_at;

  // Any tile status of the signed-in participant's own (not the viewed
  // participant's -- the choice below is only actionable for your own
  // membership) that's still waiting on a lowest-skill tie-break. Every
  // lowestSkill-type tile shares the same candidate set for one
  // participant, so the first one found is enough to drive the prompt.
  const myTileStatuses = myParticipant ? tileStatusesByParticipant[myParticipant.id] : undefined;
  const pendingSkillChoice = myTileStatuses ? Object.values(myTileStatuses).find((s) => s.needsSkillChoice) : undefined;

  const firstCompleters = computeFirstCompleters(completions);

  // Team: one representative id per team (lexicographically smallest,
  // matching computeLeaderboard's own tie-break convention), relabeled
  // with the team's name -- same "collapse to one representative" trick
  // used for the Discord embed (challengeProgress.ts), so
  // computeLeaderboard itself needs no changes to produce a correct
  // per-team ranking. Coop skips ranking entirely -- see the render body.
  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));
  const representativeIdByTeam = new Map<string, string>();
  if (challenge.game_mode === 'team') {
    for (const p of participants) {
      if (!p.team_id) continue;
      const current = representativeIdByTeam.get(p.team_id);
      if (!current || p.id < current) representativeIdByTeam.set(p.team_id, p.id);
    }
  }
  const leaderboardParticipantIds =
    challenge.game_mode === 'team' ? [...representativeIdByTeam.values()] : participants.map((p) => p.id);
  const leaderboard = computeLeaderboard(tiles, completions, leaderboardParticipantIds, firstCompleters);

  const tilesInPlay = challenge.board_type === 'adventure' ? ADVENTURE_SMALL_TILES_IN_PLAY : tiles.length;
  const teamGateBlocksJoining = challenge.game_mode === 'team' && teams.length === 0;
  const countdown = preciseCountdownText(challenge.start_date, challenge.end_date, Date.now());

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-semibold">{challenge.name}</h1>
      <p className="text-sm text-stone-500">{formatDateRange(challenge.start_date, challenge.end_date)}</p>
      <p className="text-xs text-stone-600">Your time: {formatLocalRange(challenge.start_date, challenge.end_date, VIEWER_TIMEZONE)}</p>
      {countdown && <p className="mt-1 text-xs font-medium text-amber-500">{countdown}</p>}
      {viewedParticipant && <p className="mt-2 text-sm font-medium text-stone-400">{viewedParticipant.rsn}'s board</p>}

      <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
        {/* Board -- above the leaderboard on mobile, left column (~80%) on desktop. */}
        <div className="order-2 min-w-0 lg:order-1 lg:flex-1">
          {challenge.board_type === 'adventure' ? (
            <div className="overflow-x-auto pb-2">
              <div className="flex gap-2" style={{ minWidth: `${ADVENTURE_SMALL_COLUMNS * 90}px` }}>
                {Array.from({ length: ADVENTURE_SMALL_COLUMNS }, (_, column) => {
                  const boss = isBossColumn(column);
                  const isFinalBoss = column === ADVENTURE_SMALL_FINAL_BOSS_COLUMN;
                  // Extra visual weight on top of (not instead of) each
                  // tile's own state-driven border color below -- a boss
                  // room still needs to read as done/frontier/locked just
                  // like any other tile, this just makes it look heavier.
                  const bossExtra = boss
                    ? isFinalBoss
                      ? 'border-2 shadow-[0_0_20px_rgba(239,68,68,0.5)]'
                      : 'border-2 shadow-[0_0_14px_rgba(220,38,38,0.35)]'
                    : '';
                  const lanes: ('top' | 'bottom' | 'center')[] = boss ? ['center'] : ['top', 'bottom'];
                  const fork = boss ? null : forkIndexForColumn(column);
                  const chosenLane = fork !== null ? viewedParticipant?.adventure_path?.[String(fork)] : undefined;
                  const columnHasAnyTile = lanes.some((lane) => adventureTileAt(column, lane) != null);

                  return (
                    <Fragment key={column}>
                      {column > 0 && <AdventureConnector from={laneCountForColumn(column - 1)} to={laneCountForColumn(column)} />}
                      <div
                        onClick={columnHasAnyTile ? () => setSelectedColumn(column) : undefined}
                        className={`flex w-20 shrink-0 flex-col justify-center gap-2 ${columnHasAnyTile ? 'cursor-pointer' : ''}`}
                      >
                      {lanes.map((lane) => {
                        const tile = adventureTileAt(column, lane);
                        const isOtherLane = !boss && chosenLane != null && chosenLane !== lane;
                        const isPendingChoice = !boss && chosenLane == null;
                        const isOnPath = boss || (chosenLane != null && chosenLane === lane);
                        const done = tile != null && isOnPath && viewedCompletedTileIds.has(tile.id);
                        const isFrontier =
                          tile != null && isOnPath && !done && viewedFrontier?.kind === 'tile' && viewedFrontier.tile.id === tile.id;
                        // Reached, but locked until a qualifying Dink
                        // LOGOUT event establishes a fresh baseline
                        // (BACKLOG.md #4) -- distinct from "locked" below,
                        // which means "not reached yet." Never true for a
                        // participant's very first tile ever (nothing to
                        // reset from), matching challengeProgress.ts.
                        const awaitingBaselineReset = isFrontier && viewedCompletedTileIds.size > 0 && !viewedParticipant?.adventure_baseline_at;
                        const locked = tile != null && isOnPath && !done && !isFrontier;
                        const status = tile ? viewedTileStatuses[tile.id] : undefined;
                        // Only the frontier tile's status reflects the
                        // logout-gated baseline (BACKLOG.md #4) -- every
                        // other on-path tile still has a real checkTile
                        // result sitting in viewedTileStatuses (computed
                        // against cumulative challenge-wide stats, same as
                        // every non-Adventure board), it's just never
                        // actually awarded server-side. Showing it here
                        // would visually "complete" a room the player
                        // hasn't even reached yet, so a locked tile only
                        // ever shows its goal, never live progress.
                        const percent =
                          tile && status && isFrontier && !awaitingBaselineReset ? progressPercent(tile.condition, status) : null;
                        const baseCaption =
                          tile && isOnPath && !awaitingBaselineReset
                            ? isFrontier || done
                              ? (status && formatTileProgress(tile.condition, status)) ?? formatTileGoal(tile.condition)
                              : formatTileGoal(tile.condition)
                            : null;
                        const caption = awaitingBaselineReset
                          ? 'Log out to start'
                          : status?.resolvedSkill
                            ? `${baseCaption} (${status.resolvedSkill})`
                            : status?.needsSkillChoice
                              ? 'Pick a skill below'
                              : baseCaption;
                        const isFirst =
                          tile != null && done && tile.condition.type !== 'freeSpace' && firstCompleters[tile.id] === viewedParticipantId;

                        return (
                          <div
                            key={lane}
                            title={tile ? describeTileCondition(tile.condition) : undefined}
                            className={`relative flex aspect-square min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden rounded-lg border p-2 text-center shadow-inner before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/stone-texture.svg')] before:bg-cover before:bg-center before:opacity-30 before:content-[''] ${bossExtra} ${
                              isOtherLane || isPendingChoice
                                ? 'border-stone-800/40 bg-stone-950/30 opacity-40'
                                : done
                                  ? 'border-green-500 bg-green-950/40'
                                  : awaitingBaselineReset
                                    ? 'border-sky-600 bg-sky-950/20'
                                    : isFrontier
                                      ? 'border-amber-500 bg-stone-900'
                                      : tile
                                        ? locked
                                          ? 'border-stone-800 bg-stone-950/60 opacity-60'
                                          : 'border-stone-700 bg-stone-900'
                                        : 'border-stone-800/60 bg-stone-950/50'
                            }`}
                          >
                            {percent !== null && (
                              <div className="absolute inset-y-0 left-0 w-1 bg-stone-900">
                                <div
                                  className="absolute inset-x-0 bottom-0"
                                  style={{ height: `${percent}%`, backgroundColor: progressColor(percent) }}
                                />
                              </div>
                            )}
                            {isFirst && <span className="absolute right-1 top-1 text-xs text-amber-400">⭐</span>}
                            {!isFirst && done && <span className="absolute right-1 top-1 text-xs text-green-400">✓</span>}
                            {tile ? (
                              <>
                                {tile.icon && <img src={tile.icon} alt="" className="h-6 w-6 shrink-0" />}
                                <span className="mt-1 line-clamp-2 w-full break-words text-[11px]">{tile.label}</span>
                                {isOnPath && caption && <span className="w-full break-words text-[9px] text-stone-500">{caption}</span>}
                                {isOtherLane && <span className="text-[9px] text-stone-600">not taken</span>}
                              </>
                            ) : (
                              <span className="text-xs text-stone-700">—</span>
                            )}
                          </div>
                        );
                      })}
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          ) : (
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
              const row = Math.floor(i / GRID_SIZE);
              const col = i % GRID_SIZE;
              const tile = tileAt(row, col);
              const done = tile != null && viewedCompletedTileIds.has(tile.id);
              const status = tile ? viewedTileStatuses[tile.id] : undefined;
              const percent = tile && status && !done ? progressPercent(tile.condition, status) : null;
              // formatTileProgress (current/goal, e.g. "620K / 1.5M XP") only
              // covers the condition types where a running total is large
              // enough for shorthand to actually help -- everything else
              // falls back to the plain goal-only caption.
              const baseCaption = tile ? (status && formatTileProgress(tile.condition, status)) ?? formatTileGoal(tile.condition) : null;
              // xpGainedLowestSkill/levelsGainedLowestSkill's caption is
              // otherwise skill-agnostic (the same tile means a different
              // skill for every participant) -- append which skill this
              // viewer's own progress is actually measuring, or a prompt if
              // they still need to break a tie (see the Actions section).
              const caption = status?.resolvedSkill
                ? `${baseCaption} (${status.resolvedSkill})`
                : status?.needsSkillChoice
                  ? 'Pick a skill below'
                  : baseCaption;
              // A free space has no "first" worth bragging about -- everyone
              // gets it the instant it exists, so it's excluded here even
              // though computeFirstCompleters technically records one
              // (whoever's sync happened to land first). Same reasoning
              // excludes Coop -- credit lands on everyone at once from one
              // pooled event, so whichever participant's fanout insert
              // happened to land first in the loop isn't a real "first"
              // worth a star (matches discordEmbeds.ts's noFirstConcept).
              const isFirst =
                tile != null &&
                done &&
                tile.condition.type !== 'freeSpace' &&
                challenge.game_mode !== 'coop' &&
                firstCompleters[tile.id] === viewedParticipantId;
              const noOneCompleted = tile != null && !completions.some((c) => c.kind === 'tile' && c.ref === tile.id);
              const someoneElseCompleted =
                tile != null && !done && completions.some((c) => c.kind === 'tile' && c.ref === tile.id);
              // How close the closest participant is to finishing this
              // still-unclaimed tile, across everyone (not just the viewer)
              // -- colors the circle badge below from red (no one's close)
              // to green (someone's nearly there).
              const closestPercent =
                tile && noOneCompleted
                  ? Math.max(
                      0,
                      ...participants.map((p) => {
                        const s = tileStatusesByParticipant[p.id]?.[tile.id];
                        return s ? (progressPercent(tile.condition, s) ?? 0) : 0;
                      }),
                    )
                  : 0;
              const badge: { glyph: string; className?: string; color?: string } | null = !tile
                ? null
                : isFirst
                  ? { glyph: '⭐', className: 'text-amber-400' }
                  : done
                    ? { glyph: '✓', className: 'text-green-400' }
                    : someoneElseCompleted
                      ? { glyph: '✕', className: 'text-red-400' }
                      : noOneCompleted
                        ? { glyph: '○', color: progressColor(closestPercent) }
                        : null;
              return (
                <div
                  key={i}
                  title={tile ? describeTileCondition(tile.condition) : undefined}
                  onClick={tile ? () => setSelectedTile(tile) : undefined}
                  className={`relative flex aspect-square min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden rounded-lg border p-2 text-center shadow-inner before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/stone-texture.svg')] before:bg-cover before:bg-center before:opacity-30 before:content-[''] ${tile ? 'cursor-pointer' : ''} ${
                    done
                      ? 'border-green-500 bg-green-950/40'
                      : tile
                        ? 'border-stone-700 bg-stone-900'
                        : 'border-stone-800/60 bg-stone-950/50'
                  }`}
                >
                  {percent !== null && (
                    <div className="absolute inset-y-0 left-0 w-1 bg-stone-900">
                      <div
                        className="absolute inset-x-0 bottom-0"
                        style={{ height: `${percent}%`, backgroundColor: progressColor(percent) }}
                      />
                    </div>
                  )}
                  {badge && (
                    <span
                      className={`absolute right-1 top-1 text-xs ${badge.className ?? ''}`}
                      style={badge.color ? { color: badge.color } : undefined}
                    >
                      {badge.glyph}
                    </span>
                  )}
                  {tile ? (
                    <>
                      {tile.icon && <img src={tile.icon} alt="" className="h-6 w-6 shrink-0" />}
                      <span className="mt-1 line-clamp-2 w-full break-words text-[11px]">{tile.label}</span>
                      {caption && <span className="w-full break-words text-[9px] text-stone-500">{caption}</span>}
                    </>
                  ) : (
                    <span className="text-xs text-stone-700">—</span>
                  )}
                </div>
              );
            })}
          </div>
          )}
        </div>

        {/* Leaderboard + actions -- above the board on mobile, right column
            (~20%, fixed-width so entries never wrap) on desktop. */}
        <div className="order-1 lg:order-2 lg:w-72 lg:shrink-0">
          <h2 className="text-lg font-semibold">Leaderboard</h2>
          {challenge.game_mode === 'coop' ? (
            // No ranking -- everyone's progress is always identical in
            // Coop, so a shared readout replaces the ranked list
            // (BACKLOG.md #10).
            <div className="mt-3 space-y-2 text-sm">
              {leaderboard[0] && (
                <p className="font-semibold text-amber-400">
                  {leaderboard[0].points} pts · {leaderboard[0].tilesCompleted}/{tilesInPlay} tiles
                </p>
              )}
              <ul className="space-y-1 text-stone-300">
                {participants.map((p) => (
                  <li key={p.id}>{p.rsn}</li>
                ))}
                {participants.length === 0 && <li className="text-stone-500">No one's joined yet.</li>}
              </ul>
            </div>
          ) : (
            <ul className="mt-3 space-y-1 text-sm">
              {leaderboard.map((entry, i) => {
                const isTeam = challenge.game_mode === 'team';
                const p = participants.find((pp) => pp.id === entry.participantId);
                if (!p) return null;
                const label = isTeam ? (p.team_id && teamNameById.get(p.team_id)) || 'Unknown Team' : p.rsn;
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                const isViewed = isTeam ? p.team_id != null && p.team_id === viewedParticipant?.team_id : entry.participantId === viewedParticipantId;
                const isYou = isTeam ? p.team_id != null && p.team_id === myParticipant?.team_id : entry.participantId === myParticipant?.id;
                return (
                  <li key={p.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSearchParams({ p: p.id })}
                      className={`whitespace-nowrap text-left hover:underline ${isViewed ? 'font-semibold text-amber-400' : 'text-stone-300'}`}
                    >
                      {`#${i + 1}${medal ? ` ${medal}` : ''} ${label} — ${entry.points} pts (${entry.tilesCompleted}/${tilesInPlay} tiles)`}
                    </button>
                    {isYou && <span className="shrink-0 text-xs text-stone-500">(you)</span>}
                    {hasCompletedBoard(p.id) && <span className="shrink-0 text-yellow-400">🏆 Complete!</span>}
                  </li>
                );
              })}
              {leaderboard.length === 0 && <li className="text-stone-500">No one's joined yet.</li>}
            </ul>
          )}

          {/* Actions available to the current viewer for this challenge. */}
          <div className="mt-6 space-y-3">
            {!session && (
              <p className="text-sm text-stone-400">
                <Link to="/login" className="underline">
                  Sign in
                </Link>{' '}
                to join this challenge.{' '}
                <Link to={`/c/${challenge.slug}/setup`} className="underline">
                  See what's involved
                </Link>
                .
              </p>
            )}
            {session && !myParticipant && teamGateBlocksJoining && (
              <p className="text-sm text-stone-500">The host hasn't set up any teams yet -- check back soon.</p>
            )}
            {session && !myParticipant && !teamGateBlocksJoining && (
              <form onSubmit={handleJoin} className="flex flex-col gap-2">
                <input
                  required
                  value={rsn}
                  onChange={(e) => setRsn(e.target.value)}
                  placeholder="Your OSRS username"
                  className="rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={joining}
                  className="rounded-lg bg-amber-500 hover:bg-amber-400 transition-colors px-4 py-2 text-sm font-semibold text-stone-950 disabled:opacity-40"
                >
                  {joining ? 'Joining…' : 'Join'}
                </button>
              </form>
            )}
            {joinError && <p className="text-sm text-red-400">{joinError}</p>}

            {session && myParticipant && !editingRsn && (
              <p className="text-sm text-stone-400">
                You're in as {myParticipant.rsn}.{' '}
                <button
                  type="button"
                  onClick={() => {
                    setRsnDraft(myParticipant.rsn);
                    setEditingRsn(true);
                    setRsnError('');
                  }}
                  className="underline"
                >
                  Edit
                </button>{' '}
                ·{' '}
                <Link to={`/c/${challenge.slug}/setup`} className="underline">
                  Set up Dink &rarr;
                </Link>
              </p>
            )}
            {session && myParticipant && editingRsn && (
              <form onSubmit={handleRenameRsn} className="flex flex-col gap-2">
                <input
                  required
                  autoFocus
                  value={rsnDraft}
                  onChange={(e) => setRsnDraft(e.target.value)}
                  className="rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={savingRsn}
                    className="rounded-lg bg-amber-500 hover:bg-amber-400 transition-colors px-4 py-2 text-sm font-semibold text-stone-950 disabled:opacity-40"
                  >
                    {savingRsn ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingRsn(false)}
                    className="rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
            {rsnError && <p className="text-sm text-red-400">{rsnError}</p>}

            {pendingSkillChoice && (
              <div className="rounded-lg border border-amber-800 bg-amber-950/30 p-3">
                <p className="text-sm text-stone-300">
                  This board has a "lowest skill" tile, and you're tied for lowest in more than one skill. Pick which
                  one you'll be judged on:
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {pendingSkillChoice.skillChoices?.map((skill) => (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => handleChooseLowestSkill(skill)}
                      className="rounded-lg border border-stone-700 px-3 py-1 text-xs text-stone-300 hover:border-amber-500"
                    >
                      {skill}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {pendingLaneChoice && (
              <div className="rounded-lg border border-amber-800 bg-amber-950/30 p-3">
                <p className="text-sm text-stone-300">Pick your path:</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleChooseLane(pendingLaneChoice.forkIndex, 'top')}
                    className="rounded-lg border border-stone-700 px-3 py-1 text-xs text-stone-300 hover:border-amber-500"
                  >
                    Top
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChooseLane(pendingLaneChoice.forkIndex, 'bottom')}
                    className="rounded-lg border border-stone-700 px-3 py-1 text-xs text-stone-300 hover:border-amber-500"
                  >
                    Bottom
                  </button>
                </div>
              </div>
            )}

            {myAwaitingBaselineReset && (
              <div className="rounded-lg border border-sky-800 bg-sky-950/30 p-3">
                <p className="text-sm text-stone-300">
                  You've reached a new room. Log out in-game to start counting progress toward it -- nothing before
                  that counts.
                </p>
              </div>
            )}

            {myParticipant && (
              <button
                type="button"
                onClick={handleLeave}
                className="w-full rounded-lg border border-red-900 px-4 py-2 text-sm text-red-400 hover:bg-red-950/40"
              >
                Leave Challenge
              </button>
            )}
            {isHost && (
              <Link
                to={`/c/${challenge.slug}/edit`}
                className="block w-full rounded-lg border border-stone-700 px-4 py-2 text-center text-sm text-stone-300 hover:border-amber-500"
              >
                Edit Challenge
              </Link>
            )}
          </div>
        </div>
      </div>

      {selectedTile && (
        <TileDetailModal
          tile={selectedTile}
          participants={participants}
          challenge={challenge}
          firstCompleters={firstCompleters}
          gameMode={challenge.game_mode}
          teams={teams}
          onClose={() => setSelectedTile(null)}
        />
      )}

      {selectedColumn !== null &&
        (isBossColumn(selectedColumn) ? (
          (() => {
            const bossTile = adventureTileAt(selectedColumn, 'center');
            return bossTile ? (
              <TileDetailModal
                tile={bossTile}
                kicker={bossLabelForColumn(selectedColumn)}
                participants={participants}
                challenge={challenge}
                firstCompleters={firstCompleters}
                onClose={() => setSelectedColumn(null)}
              />
            ) : null;
          })()
        ) : (
          <AdventureColumnModal
            forkIndex={forkIndexForColumn(selectedColumn)}
            roomNumber={roomNumberForColumn(selectedColumn)}
            topTile={adventureTileAt(selectedColumn, 'top')}
            bottomTile={adventureTileAt(selectedColumn, 'bottom')}
            participants={participants}
            challenge={challenge}
            firstCompleters={firstCompleters}
            onClose={() => setSelectedColumn(null)}
          />
        ))}
    </div>
  );
}
