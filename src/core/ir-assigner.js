/**
 * IR Slot Assignment
 *
 * Fills the IR slots from the pool of injured players. ESPN's payload exposes an
 * injury onset date (not a projected return date), so injury timing is used as a
 * proxy: players already in IR stay, then players with no injury date, then by
 * injury date descending. NOTE: if a true return-date signal becomes available,
 * sort by that instead to better approximate "out the longest".
 */

import { SLOT } from '../utils/slot-utils.js';

/**
 * Assigns IR slots to injured players.
 *
 * @param {Player[]} players   — all rostered players for my team
 * @param {number}   irCount   — number of IR slots from league settings
 * @returns {Array<{ player: Player, assignedSlot: number }>}
 *   All injured players annotated with their slot (IR=13 or BENCH=12).
 */
export function assignIRSlots(players, irCount) {
  const injured = players.filter(p => p.injuryStatus === 'OUT');

  // Sort:
  // 1. Players currently in IR stay in IR
  // 2. no injury date (unknown timing) first
  // 3. by injury date desc (most recently recorded first)
  const sorted = [...injured].sort((a, b) => {
    const aInIR = a.lineupSlotId === SLOT.IR;
    const bInIR = b.lineupSlotId === SLOT.IR;
    if (aInIR !== bInIR) {
      return aInIR ? -1 : 1;
    }

    if (!a.injuryDate && !b.injuryDate) return 0;
    if (!a.injuryDate) return -1; // no injury date → sort to front
    if (!b.injuryDate) return 1;
    return new Date(b.injuryDate) - new Date(a.injuryDate);
  });

  return sorted.map((player, i) => ({
    player,
    assignedSlot: i < irCount ? SLOT.IR : SLOT.BENCH,
  }));
}

/**
 * Returns the Set of playerIds that should be in IR slots.
 */
export function getIRPlayerIds(players, irCount) {
  const assignments = assignIRSlots(players, irCount);
  const ids = new Set();
  for (const { player, assignedSlot } of assignments) {
    if (assignedSlot === SLOT.IR) ids.add(player.playerId);
  }
  return ids;
}
