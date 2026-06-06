/**
 * Scheduler: builds the list of remaining game days.
 *
 * Period-to-date mapping: today's date = currentPeriod, each subsequent
 * period is one calendar day forward.
 *
 * Each game day = { scoringPeriodId, playingTeamIds: Set<proTeamId>, date: "M/D" }
 */

import { toYYYYMMDD, forwardDays, forwardDayKeys } from '../utils/date-utils.js';
import { fetchNBADayScoreboard } from '../api/espn-client.js';
import { normalizePublicSchedule } from '../api/normalizer.js';

/**
 * @param {Object<string, Set<number>>} dateToTeams  — YYYYMMDD → Set<ESPN teamId>
 * @param {number} currentPeriod — inclusive start (today)
 * @param {number} finalPeriod   — inclusive end
 * @returns {Array<{ scoringPeriodId: number, playingTeamIds: Set<number>, date: string }>}
 */
export function buildRemainingGameDays(dateToTeams, currentPeriod, finalPeriod) {
  return forwardDays(finalPeriod - currentPeriod + 1).map((d, i) => {
    const dateStr = toYYYYMMDD(d);
    return {
      scoringPeriodId: currentPeriod + i,
      playingTeamIds: dateToTeams[dateStr] ?? new Set(),
      date: `${d.getMonth() + 1}/${d.getDate()}`,
    };
  });
}

const SCHEDULE_WINDOW_DAYS = 60;

/**
 * Fetch the fixed forward window of NBA scoreboards and normalize it into a
 * date → playing-team-IDs map. Shared by the popup preview and the season run
 * so the window size and fetch strategy live in one place. The fixed window
 * also avoids a sequential dependency on finalScoringPeriodId.
 *
 * @returns {Promise<Object<string, Set<number>>>} YYYYMMDD → Set<ESPN teamId>
 */
export async function fetchScheduleWindow() {
  const dateKeys = forwardDayKeys(SCHEDULE_WINDOW_DAYS);
  const dayRaws = await Promise.all(dateKeys.map(d => fetchNBADayScoreboard(d)));
  const dayResults = dateKeys.map((dateStr, i) => ({ dateStr, raw: dayRaws[i] }));
  return normalizePublicSchedule(dayResults);
}
