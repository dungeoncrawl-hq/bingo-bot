// Per-challenge Dink webhook processing -- multi-tenant equivalent of
// rs/src/server/dinkWebhook.ts. The challenge is already resolved (by
// dink_secret) before this runs; everything here is scoped to that one
// challenge and the participant the event's playerName matches within it.
import { selectRows, upsertRow, insertRowUnlessRecentDuplicate, callRpc } from './supabaseAdmin.js';
import { checkChallengeProgress } from './challengeProgress.js';
import { syncOneParticipant } from './participantSync.js';
import { isNotableLootItem } from '../lib/itemSets.js';
import type { Challenge, Tile } from '../db/types.js';

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

interface ParticipantSlim {
  id: string;
  rsn: string;
}

async function matchParticipant(challengeId: string, playerName: string | undefined): Promise<ParticipantSlim | null> {
  if (!playerName) return null;
  const name = playerName.trim().toLowerCase();
  const rows = await selectRows<ParticipantSlim>(
    'challenge_participants',
    `challenge_id=eq.${encodeURIComponent(challengeId)}&select=id,rsn`,
  );
  return rows.find((r) => r.rsn.toLowerCase() === name) ?? null;
}

async function handleKillCount(challengeId: string, participantId: string, extra: Record<string, unknown>): Promise<WebhookResult> {
  const boss = String(extra.boss ?? '').trim();
  const kc = Number(extra.count);
  if (!boss || !Number.isFinite(kc)) return { status: 400, body: { error: 'Missing boss/count' } };

  const isPersonalBest = extra.isPersonalBest === true;
  const bestTime = isPersonalBest && typeof extra.time === 'string' ? extra.time : null;

  await upsertRow(
    'boss_kills',
    { challenge_id: challengeId, participant_id: participantId, boss, kc, is_personal_best: isPersonalBest, best_time: bestTime },
    'participant_id,boss,kc',
  );
  return { status: 200, body: { ok: true } };
}

async function handleSlayer(challengeId: string, participantId: string, extra: Record<string, unknown>): Promise<WebhookResult> {
  const monster = String(extra.slayerTask ?? extra.monster ?? '').trim();
  const tasksCompleted = Number(extra.slayerCompleted);
  const points = Number(extra.slayerPoints ?? 0);
  const killCount = extra.killCount != null ? Number(extra.killCount) : null;
  if (!monster || !Number.isFinite(tasksCompleted)) {
    return { status: 400, body: { error: 'Missing slayerTask/slayerCompleted' } };
  }

  await upsertRow(
    'slayer_tasks',
    {
      challenge_id: challengeId,
      participant_id: participantId,
      monster,
      points,
      tasks_completed: tasksCompleted,
      kill_count: killCount,
    },
    'participant_id,tasks_completed',
  );
  return { status: 200, body: { ok: true } };
}

interface RawLootItem {
  name?: unknown;
  quantity?: unknown;
  priceEach?: unknown;
}

// The lowest dropValueThreshold across a challenge's own 'bigDropsCount'
// tiles (see tileConditions.ts), or null if it has none -- this is what
// determines whether a big-but-untracked-item drop needs its own row
// (see handleLoot below), not a baked-in number. Cached briefly at module
// scope since this runs on every LOOT event and a warm serverless
// instance can see a burst of them from one active player; a cold
// instance just pays for the (small, single-table) query again.
const bigDropsThresholdCache = new Map<string, { value: number | null; expiresAt: number }>();
const BIG_DROPS_CACHE_TTL_MS = 60_000;

async function minBigDropsThreshold(challengeId: string): Promise<number | null> {
  const cached = bigDropsThresholdCache.get(challengeId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const tiles = await selectRows<{ condition: Tile['condition'] }>(
    'tiles',
    `challenge_id=eq.${encodeURIComponent(challengeId)}&select=condition`,
  );
  const thresholds = tiles
    .map((t) => t.condition)
    .filter((c): c is Extract<Tile['condition'], { type: 'bigDropsCount' }> => c.type === 'bigDropsCount')
    .map((c) => c.dropValueThreshold);
  const value = thresholds.length > 0 ? Math.min(...thresholds) : null;

  bigDropsThresholdCache.set(challengeId, { value, expiresAt: Date.now() + BIG_DROPS_CACHE_TTL_MS });
  return value;
}

async function handleLoot(challengeId: string, participantId: string, extra: Record<string, unknown>): Promise<WebhookResult> {
  const rawItems = Array.isArray(extra.items) ? (extra.items as RawLootItem[]) : [];
  if (rawItems.length === 0) return { status: 400, body: { error: 'Missing items' } };

  const items = rawItems.map((it) => ({
    name: String(it.name ?? 'Unknown'),
    quantity: Number(it.quantity ?? 1),
    priceEach: Number(it.priceEach ?? 0),
  }));
  const totalValue = items.reduce((sum, it) => sum + it.quantity * it.priceEach, 0);
  const source = String(extra.source ?? 'Unknown').trim();
  const killCount = extra.killCount != null ? Number(extra.killCount) : null;

  // A drop only needs its own row if a tile could actually need it
  // individually: either it contains an item from the curated catalog
  // (src/lib/itemSets.ts -- the only source of items an itemCount/
  // itemSetCollected tile can ever reference, so catalog membership is
  // both necessary and sufficient), or its value clears whatever
  // threshold this challenge's own 'bigDropsCount' tile(s) actually use.
  // A challenge with no such tile applies no value-based preservation at
  // all -- everything else folds into one running bucket row per
  // participant per day (increment_misc_loot).
  const hasNotableItem = items.some((it) => isNotableLootItem(it.name));
  const bigDropsCutoff = await minBigDropsThreshold(challengeId);
  const needsOwnRow = hasNotableItem || (bigDropsCutoff !== null && totalValue >= bigDropsCutoff);

  if (!needsOwnRow) {
    await callRpc('increment_misc_loot', {
      p_challenge_id: challengeId,
      p_participant_id: participantId,
      p_recorded_on: new Date().toISOString().slice(0, 10),
      p_value: totalValue,
    });
    return { status: 200, body: { ok: true } };
  }

  await insertRowUnlessRecentDuplicate(
    'loot_drops',
    { challenge_id: challengeId, participant_id: participantId, source, items, total_value: totalValue, kill_count: killCount },
    ['participant_id', 'source', 'total_value'],
  );
  return { status: 200, body: { ok: true } };
}

async function handleDeath(challengeId: string, participantId: string, extra: Record<string, unknown>): Promise<WebhookResult> {
  const valueLost = Number(extra.valueLost ?? 0);
  const isPvp = extra.isPvp === true;
  const killerName = typeof extra.killerName === 'string' ? extra.killerName : null;
  const lostItems = Array.isArray(extra.lostItems) ? extra.lostItems : [];

  await insertRowUnlessRecentDuplicate(
    'deaths',
    {
      challenge_id: challengeId,
      participant_id: participantId,
      value_lost: valueLost,
      is_pvp: isPvp,
      killer_name: killerName,
      lost_items: lostItems,
    },
    ['participant_id', 'value_lost', 'killer_name'],
  );
  return { status: 200, body: { ok: true } };
}

async function handleCollectionLog(challengeId: string, participantId: string, extra: Record<string, unknown>): Promise<WebhookResult> {
  const itemName = String(extra.itemName ?? '').trim();
  if (!itemName) return { status: 400, body: { error: 'Missing itemName' } };
  const itemId = extra.itemId != null ? Number(extra.itemId) : null;
  const completedEntries = extra.completedEntries != null ? Number(extra.completedEntries) : null;
  const totalEntries = extra.totalEntries != null ? Number(extra.totalEntries) : null;

  await upsertRow(
    'collection_log_entries',
    {
      challenge_id: challengeId,
      participant_id: participantId,
      item_name: itemName,
      item_id: itemId,
      completed_entries: completedEntries,
      total_entries: totalEntries,
    },
    'participant_id,item_name',
  );
  return { status: 200, body: { ok: true } };
}

// Unlike rs, no live-hiscores disambiguation for pets shared between
// reskinned boss pairs -- petsObtained is a pure count/threshold in
// tileConditions.ts, so which specific boss doesn't affect scoring, only
// display. The boss name Dink reports is stored as-is.
async function handlePet(challengeId: string, participantId: string, extra: Record<string, unknown>): Promise<WebhookResult> {
  if (extra.duplicate === true) {
    return { status: 200, body: { ok: true, skipped: 'duplicate pet' } };
  }
  const bossName = String(extra.petName ?? extra.boss ?? 'Unknown').trim();

  await upsertRow(
    'pet_obtains',
    { challenge_id: challengeId, participant_id: participantId, boss_name: bossName, updated_at: new Date().toISOString() },
    'participant_id,boss_name',
    'merge-duplicates',
  );
  return { status: 200, body: { ok: true } };
}

export async function processDinkWebhook(challenge: Challenge, payload: unknown): Promise<WebhookResult> {
  if (typeof payload !== 'object' || payload === null) {
    return { status: 400, body: { error: 'Invalid payload' } };
  }
  const { type, playerName, extra } = payload as { type?: string; playerName?: string; extra?: Record<string, unknown> };
  const data = extra ?? {};

  try {
    const participant = await matchParticipant(challenge.id, playerName);
    if (!participant) {
      return { status: 400, body: { error: `Unrecognized playerName "${playerName}"` } };
    }

    let result: WebhookResult;
    switch (type) {
      case 'KILL_COUNT':
        result = await handleKillCount(challenge.id, participant.id, data);
        break;
      case 'SLAYER':
        result = await handleSlayer(challenge.id, participant.id, data);
        break;
      case 'LOOT':
        result = await handleLoot(challenge.id, participant.id, data);
        break;
      case 'DEATH':
        result = await handleDeath(challenge.id, participant.id, data);
        break;
      case 'COLLECTION':
        result = await handleCollectionLog(challenge.id, participant.id, data);
        break;
      case 'PET':
        result = await handlePet(challenge.id, participant.id, data);
        break;
      case 'LOGOUT':
        // Refresh this participant's hiscores snapshot the moment their
        // session ends, rather than waiting for the daily cron -- same
        // rationale as rs's LOGOUT-triggered syncOneAccount.
        await syncOneParticipant(challenge.id, participant.id, playerName ?? participant.rsn);
        result = { status: 200, body: { ok: true } };
        break;
      case 'LEVEL':
        // Consciously deferred, not forgotten -- xp/skill-level tile
        // conditions need hiscores polling, which LEVEL alone can't
        // provide (see Milestone 4).
        result = { status: 200, body: { ok: true, note: 'xp tracking not yet implemented' } };
        break;
      default:
        return { status: 400, body: { error: `Unsupported type "${type}"` } };
    }

    // Best-effort: a progress-check/Discord-post failure must never turn a
    // successful Dink write into a failed webhook response (which would
    // make Dink retry a call that already succeeded).
    if (result.status === 200) {
      try {
        await checkChallengeProgress(participant.id);
      } catch (err) {
        console.error('Challenge progress check failed:', err);
      }
    }

    return result;
  } catch (err) {
    return { status: 500, body: { error: err instanceof Error ? err.message : 'Webhook processing failed' } };
  }
}
