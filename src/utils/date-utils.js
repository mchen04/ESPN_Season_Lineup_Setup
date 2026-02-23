/**
 * Date utilities: scoringPeriod ↔ calendar date helpers.
 *
 * ESPN scoring periods for NBA start on the first day of the season.
 * Period 1 = opening day. Each period = 1 calendar day.
 *
 * NOTE: The actual mapping isn't needed for our algorithm —
 * we rely entirely on scoringPeriodId integers from ESPN's API.
 * These helpers are included for debugging / display purposes.
 */

/**
 * Approximate date for a scoring period given a known anchor.
 * @param {number} scoringPeriodId
 * @param {number} anchorPeriodId  — a period whose date is known
 * @param {Date}   anchorDate
 * @returns {Date}
 */
export function periodToDate(scoringPeriodId, anchorPeriodId, anchorDate) {
  const diff = scoringPeriodId - anchorPeriodId;
  const d = new Date(anchorDate);
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * Format a Date to YYYY-MM-DD.
 */
export function formatDate(date) {
  return date.toISOString().slice(0, 10);
}
