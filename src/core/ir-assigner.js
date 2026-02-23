/**
 * IR Slot Assignment
 *
 * Strategy: players who will be out the longest occupy IR slots,
 * freeing active roster spots for shorter-term injured players.
 *
 * Sort order: null return date (indefinitely out) → last,
 * then by return date descending (latest date first).
 */

import { SLOT } from '../utils/slot-utils.js';

/**
 * Assigns IR slots to injured players.
 *
 * @param {Player[]} players   — all rostered players for my team
 * @param {number}   irCount   — number of IR slots from league settings
 * @returns {Array<{ player: Player, assignedSlot: number }>}
 *   All injured players annotated with their slot (IR=21 or BENCH=20).
 */
export function assignIRSlots(players, irCount) {
  const injured = players.filter(p => p.injuryStatus === 'OUT');

  // Sort:
  // 1. Players currently in IR stay in IR
  // 2. indefinitely out (null) first
  // 3. by return date desc (latest first)
  const sorted = [...injured].sort((a, b) => {
    const aInIR = a.lineupSlotId === SLOT.IR;
    const bInIR = b.lineupSlotId === SLOT.IR;
    if (aInIR !== bInIR) {
      return aInIR ? -1 : 1;
    }

    if (!a.estimatedReturnDate && !b.estimatedReturnDate) return 0;
    if (!a.estimatedReturnDate) return -1; // null → sort to front (longest out)
    if (!b.estimatedReturnDate) return 1;
    return new Date(b.estimatedReturnDate) - new Date(a.estimatedReturnDate);
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
