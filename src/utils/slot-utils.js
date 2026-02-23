/**
 * ESPN Fantasy Basketball (FBA) lineup slot IDs and eligibility helpers.
 *
 * Slot IDs (basketball — different from football):
 *   PG   = 0
 *   SG   = 1
 *   SF   = 2
 *   PF   = 3
 *   C    = 4
 *   G    = 5   (PG/SG swing)
 *   F    = 6   (SF/PF swing)
 *   UTIL = 11
 *   BENCH= 12
 *   IR   = 13
 */

export const SLOT = {
  PG: 0,
  SG: 1,
  SF: 2,
  PF: 3,
  C: 4,
  G: 5,
  F: 6,
  UTIL: 11,
  BENCH: 12,
  IR: 13,
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
    [SLOT.SG]: 'SG',
    [SLOT.SF]: 'SF',
    [SLOT.PF]: 'PF',
    [SLOT.C]: 'C',
    [SLOT.G]: 'G',
    [SLOT.F]: 'F',
    [SLOT.UTIL]: 'UTIL',
    [SLOT.BENCH]: 'Bench',
    [SLOT.IR]: 'IR',
  };
  return names[slotId] ?? `Slot${slotId}`;
}
