/**
 * Scheduler: builds the list of remaining game days.
 *
 * Period-to-date mapping: today's date = currentPeriod, each subsequent
 * period is one calendar day forward.
 *
 * Each game day = { scoringPeriodId, playingTeamIds: Set<proTeamId>, date: "M/D" }
 */

/**
 * @param {Object<string, Set<number>>} dateToTeams  — YYYYMMDD → Set<ESPN teamId>
 * @param {number} currentPeriod — inclusive start (today)
 * @param {number} finalPeriod   — inclusive end
 * @returns {Array<{ scoringPeriodId: number, playingTeamIds: Set<number>, date: string }>}
 */
export function buildRemainingGameDays(dateToTeams, currentPeriod, finalPeriod) {
  const now = new Date();
  // Normalize to midnight local time to prevent DST drift across months
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  const days = [];

  for (let p = currentPeriod; p <= finalPeriod; p++) {
    const d = new Date(todayMidnight.getTime() + (p - currentPeriod) * msPerDay);
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
    const playingTeamIds = dateToTeams[dateStr] ?? new Set();
    days.push({ scoringPeriodId: p, playingTeamIds, date: dateLabel });
  }

  return days;
}
