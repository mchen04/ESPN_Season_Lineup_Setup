/**
 * Per-day lineup optimizer.
 *
 * Priority tiers (lower = better):
 *   Tier 1: healthy + has game
 *   Tier 2: injured + has game
 *   Tier 3: healthy + no game
 *   Tier 4: injured + no game
 *
 * "Injured" = injuryStatus === 'OUT' only.
 * DOUBTFUL / QUESTIONABLE / PROBABLE / null → healthy.
 */

import { SLOT, isEligibleForSlot } from '../utils/slot-utils.js';

/**
 * Build lineup items for a single scoring period.
 *
 * @param {Player[]} activePlayers  — rostered players NOT in IR slots
 * @param {Player[]} irPlayers      — players assigned to IR slots
 * @param {Set<number>} playingTeamIds — pro team IDs with games today
 * @param {number} scoringPeriodId
 * @param {number} currentScoringPeriodId — periods beyond this are future days (IR untouchable)
 * @param {Map<number, number>} currentSlots — playerId → current lineupSlotId for this period
 * @param {number[]} activeSlots — league-derived starting slots in fill order (required)
 * @returns {LineupItem[]}
 */
export function optimizeLineup(activePlayers, irPlayers, playingTeamIds, scoringPeriodId, currentScoringPeriodId, currentSlots = new Map(), activeSlots) {
  const currentSlotOf = player => currentSlots.get(player.playerId) ?? player.lineupSlotId;
  // ESPN rejects IR transactions on future days, so a player already in IR there is untouchable.
  const isFutureIr = slotId => scoringPeriodId > currentScoringPeriodId && slotId === SLOT.IR;

  // Annotate each active player with tier
  const annotated = activePlayers.map(p => ({
    ...p,
    tier: computeTier(p, playingTeamIds),
  }));

  // Sort: tier ASC, projectedPoints DESC
  annotated.sort((a, b) =>
    a.tier !== b.tier ? a.tier - b.tier : b.projectedPoints - a.projectedPoints
  );

  const assignments = []; // { slotId, player } — array so multiple same-slotId entries survive
  const usedPlayerIds = new Set();

  // Greedily fill active slots
  for (const slotId of activeSlots) {
    for (const player of annotated) {
      if (usedPlayerIds.has(player.playerId)) continue;
      if (isFutureIr(currentSlotOf(player))) continue; // can't pull players off IR on future days
      if (!isEligibleForSlot(player, slotId)) continue;
      assignments.push({ slotId, player });
      usedPlayerIds.add(player.playerId);
      break;
    }
    // If no candidate found, slot stays empty (no item emitted)
  }

  const items = [];

  // Active slot assignments
  for (const { slotId: toSlotId, player } of assignments) {
    items.push({
      playerId: player.playerId,
      type: 'LINEUP',
      fromLineupSlotId: currentSlotOf(player),
      toLineupSlotId: toSlotId,
    });
  }

  // Bench: unassigned active players
  for (const player of annotated) {
    if (usedPlayerIds.has(player.playerId)) continue;
    if (isFutureIr(currentSlotOf(player))) continue; // stuck on IR for a future day — leave them there
    items.push({
      playerId: player.playerId,
      type: 'LINEUP',
      fromLineupSlotId: currentSlotOf(player),
      toLineupSlotId: SLOT.BENCH,
    });
  }

  // IR players: only submit IR moves for TODAY's period. Future periods reject IR transactions.
  if (scoringPeriodId <= currentScoringPeriodId) {
    for (const player of irPlayers) {
      items.push({
        playerId: player.playerId,
        type: 'LINEUP',
        fromLineupSlotId: currentSlotOf(player),
        toLineupSlotId: SLOT.IR,
      });
    }
  }

  // Filter out NO-OP moves to prevent TRAN_INVALID_SCORINGPERIOD_NOT_CURRENT on future days
  return items.filter(item => item.fromLineupSlotId !== item.toLineupSlotId);
}

function computeTier(player, playingTeamIds) {
  const isInjured = player.injuryStatus === 'OUT';
  const hasGame = playingTeamIds.has(player.proTeamId);

  if (!isInjured && hasGame) return 1;
  if (isInjured && hasGame) return 2;
  if (!isInjured && !hasGame) return 3;
  return 4; // injured + no game
}
