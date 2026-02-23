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

import { ACTIVE_SLOTS, SLOT, isEligibleForSlot } from '../utils/slot-utils.js';

/**
 * Build lineup items for a single scoring period.
 *
 * @param {Player[]} activePlayers  — rostered players NOT in IR slots
 * @param {Player[]} irPlayers      — players assigned to IR slots
 * @param {Set<number>} playingTeamIds — pro team IDs with games today
 * @param {number} scoringPeriodId
 * @param {number} teamId
 * @returns {LineupItem[]}
 */
export function optimizeLineup(activePlayers, irPlayers, playingTeamIds, scoringPeriodId, teamId, currentScoringPeriodId, currentSlots = new Map()) {
  // Annotate each active player with tier
  const annotated = activePlayers.map(p => ({
    ...p,
    tier: computeTier(p, playingTeamIds),
  }));

  // Sort: tier ASC, projectedPoints DESC
  annotated.sort((a, b) =>
    a.tier !== b.tier ? a.tier - b.tier : b.projectedPoints - a.projectedPoints
  );

  const assigned = new Map(); // slotId → player
  const usedPlayerIds = new Set();

  // Greedily fill active slots
  for (const slotId of ACTIVE_SLOTS) {
    for (const player of annotated) {
      if (usedPlayerIds.has(player.playerId)) continue;

      // Do not pull players off IR on future days
      const currentSlot = currentSlots.get(player.playerId) ?? player.lineupSlotId;
      if (scoringPeriodId > currentScoringPeriodId && currentSlot === SLOT.IR) {
        continue; // ESPN doesn't allow touching IR status on future days
      }

      if (!isEligibleForSlot(player, slotId)) continue;
      assigned.set(slotId, player);
      usedPlayerIds.add(player.playerId);
      break;
    }
    // If no candidate found, slot stays empty (no item emitted)
  }

  const items = [];

  // Active slot assignments
  for (const [toSlotId, player] of assigned) {
    items.push({
      playerId: player.playerId,
      type: 'LINEUP',
      fromLineupSlotId: currentSlots.get(player.playerId) ?? player.lineupSlotId,
      toLineupSlotId: toSlotId,
    });
  }

  // Bench: unassigned active players
  for (const player of annotated) {
    if (!usedPlayerIds.has(player.playerId)) {
      const currentSlot = currentSlots.get(player.playerId) ?? player.lineupSlotId;

      // Again, if they are stuck on IR on a future day, we can't bench them. They stay in IR.
      if (scoringPeriodId > currentScoringPeriodId && currentSlot === SLOT.IR) {
        continue;
      }

      items.push({
        playerId: player.playerId,
        type: 'LINEUP',
        fromLineupSlotId: currentSlot,
        toLineupSlotId: SLOT.BENCH,
      });
    }
  }

  // IR players
  // Only submit IR lineup moves for TODAY's period. Future periods reject IR transactions.
  if (scoringPeriodId <= currentScoringPeriodId) {
    for (const player of irPlayers) {
      items.push({
        playerId: player.playerId,
        type: 'LINEUP',
        fromLineupSlotId: currentSlots.get(player.playerId) ?? player.lineupSlotId,
        toLineupSlotId: SLOT.IR,
      });
    }
  }

  return items;
}

function computeTier(player, playingTeamIds) {
  const isInjured = player.injuryStatus === 'OUT';
  const hasGame = playingTeamIds.has(player.proTeamId);

  if (!isInjured && hasGame) return 1;
  if (isInjured && hasGame) return 2;
  if (!isInjured && !hasGame) return 3;
  return 4; // injured + no game
}
