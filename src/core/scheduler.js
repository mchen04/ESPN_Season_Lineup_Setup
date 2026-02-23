/**
 * Scheduler: builds the list of remaining game days from the schedule response.
 *
 * Each game day = { scoringPeriodId, playingTeamIds: Set<proTeamId> }
 */

import { normalizeSchedule } from '../api/normalizer.js';

/**
 * @param {object} scheduleRaw   — raw proTeamSchedules_wl response
 * @param {number} currentPeriod — inclusive start
 * @param {number} finalPeriod   — inclusive end
 * @returns {Array<{ scoringPeriodId: number, playingTeamIds: Set<number> }>}
 */
export function buildRemainingGameDays(scheduleRaw, currentPeriod, finalPeriod) {
  const scheduleMap = normalizeSchedule(scheduleRaw);
  const days = [];

  for (let p = currentPeriod; p <= finalPeriod; p++) {
    const playingTeamIds = scheduleMap[p] ?? new Set();
    days.push({ scoringPeriodId: p, playingTeamIds });
  }

  return days;
}
