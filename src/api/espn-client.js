/**
 * ESPN Fantasy API client.
 * All requests are made from the service worker (cross-origin permitted via host_permissions).
 */

const BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons';
const WRITE_BASE = 'https://lm-api-writes.fantasy.espn.com/apis/v3/games/fba/seasons';

/**
 * Core fetch wrapper with ESPN auth headers.
 * @param {string} url
 * @param {{ espnS2: string, swid: string }} auth
 * @param {RequestInit} [options]
 */
async function espnFetch(url, auth, options = {}) {
  const headers = {
    'Cookie': `espn_s2=${auth.espnS2}; SWID=${auth.swid}`,
    'X-Fantasy-Source': 'kona',
    'X-Fantasy-Platform': 'kona-PROD-m.fantasy.espn.com-android',
    ...(options.headers || {}),
  };

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ESPN API ${res.status}: ${res.statusText} — ${url}\n${text.slice(0, 500)}`);
  }

  return res.json();
}

/**
 * Fetch league data: roster, team info, settings.
 */
export async function fetchLeague(leagueId, seasonYear, auth) {
  const url = `${BASE}/${seasonYear}/segments/0/leagues/${leagueId}` +
    `?view=mRoster&view=mTeam&view=mSettings`;
  return espnFetch(url, auth);
}

/**
 * Fetch the exact roster state for a specific scoring period.
 * This guarantees we know exactly what is in SLOT.IR on future days.
 */
export async function fetchRosterForPeriod(leagueId, seasonYear, scoringPeriodId, auth) {
  const url = `${BASE}/${seasonYear}/segments/0/leagues/${leagueId}?scoringPeriodId=${scoringPeriodId}&view=mRoster`;
  return espnFetch(url, auth);
}

/**
 * Fetch player projection data.
 * Uses kona_player_info view with a filter for all rostered players.
 */
export async function fetchPlayers(leagueId, seasonYear, auth, playerIds) {
  const filter = JSON.stringify({
    players: {
      filterIds: { value: playerIds },
      filterStatsForCurrentSeasonScoringPeriodId: { value: [] },
    },
  });

  const url = `${BASE}/${seasonYear}/segments/0/leagues/${leagueId}?view=kona_player_info`;
  return espnFetch(url, auth, {
    headers: { 'X-Fantasy-Filter': filter },
  });
}

/**
 * Fetch the NBA scoreboard for one calendar day from ESPN's public site API (no auth required).
 * @param {string} yyyymmdd - e.g. "20260223"
 * @returns {object|null} raw scoreboard response, or null on failure
 */
export async function fetchNBADayScoreboard(yyyymmdd) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${yyyymmdd}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[ESPN] NBA scoreboard ${yyyymmdd}: HTTP ${res.status}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.warn(`[ESPN] NBA scoreboard ${yyyymmdd} fetch error:`, err.message);
    return null;
  }
}

/**
 * Submit a lineup for a given scoring period.
 * @param {number} leagueId
 * @param {number} seasonYear
 * @param {{ espnS2: string, swid: string }} auth
 * @param {object} payload  — full transaction body
 */
export async function submitLineup(leagueId, seasonYear, auth, payload) {
  const url = `${WRITE_BASE}/${seasonYear}/segments/0/leagues/${leagueId}/transactions/`;
  return espnFetch(url, auth, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
