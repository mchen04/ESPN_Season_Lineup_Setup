/**
 * ESPN NBA lineup slot IDs and eligibility helpers.
 *
 * Slot IDs:
 *   PG   = 0
 *   G    = 1
 *   SG   = 2
 *   SF   = 4
 *   F    = 5
 *   PF   = 6
 *   C    = 12
 *   UTIL = 17
 *   BENCH= 20
 *   IR   = 21
 */

export const SLOT = {
  PG: 0,
  G: 1,
  SG: 2,
  SF: 4,
  F: 5,
  PF: 6,
  C: 12,
  UTIL: 17,
  BENCH: 20,
  IR: 21,
};

/** Active (starting) slot IDs in fill order. */
export const ACTIVE_SLOTS = [
  SLOT.PG,
  SLOT.SG,
  SLOT.SF,
  SLOT.PF,
  SLOT.C,
  SLOT.G,
  SLOT.F,
  SLOT.UTIL,
];

/** Returns true if the player is eligible for the given slot. */
export function isEligibleForSlot(player, slotId) {
  return player.eligibleSlots.includes(slotId);
}

/** Human-readable slot name. */
export function slotName(slotId) {
  const names = {
    [SLOT.PG]: 'PG',
    [SLOT.G]: 'G',
    [SLOT.SG]: 'SG',
    [SLOT.SF]: 'SF',
    [SLOT.F]: 'F',
    [SLOT.PF]: 'PF',
    [SLOT.C]: 'C',
    [SLOT.UTIL]: 'UTIL',
    [SLOT.BENCH]: 'Bench',
    [SLOT.IR]: 'IR',
  };
  return names[slotId] ?? `Slot${slotId}`;
}
