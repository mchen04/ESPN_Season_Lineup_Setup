/**
 * Date helpers shared by the extension and the Node bot.
 *
 * ESPN scoring periods map 1:1 to calendar days, and every NBA day lookup keys
 * on a "YYYYMMDD" string. These helpers are the single source for that format
 * and for the local-midnight anchor used to walk forward day-by-day.
 */

/** Local midnight for `date` (default today). Anchoring at midnight avoids DST drift across months. */
function localMidnight(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Format a Date as ESPN's "YYYYMMDD" day key. */
export function toYYYYMMDD(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

/** `count` consecutive Date objects starting at `start` (default local midnight today). */
export function forwardDays(count, start = localMidnight()) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Array.from({ length: count }, (_, i) => new Date(start.getTime() + i * msPerDay));
}

/** "YYYYMMDD" keys for `count` consecutive days starting at local midnight today. */
export function forwardDayKeys(count) {
  return forwardDays(count).map(toYYYYMMDD);
}

/**
 * NBA season year per ESPN's convention: a season is identified by its ENDING
 * year and starts in October (month index 9), so Oct–Dec dates belong to the
 * next calendar year's season.
 */
export function calculateNBASeasonYear(date = new Date()) {
  return date.getMonth() >= 9 ? date.getFullYear() + 1 : date.getFullYear();
}
