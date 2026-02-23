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
    throw new Error(`ESPN API ${res.status}: ${res.statusText} — ${url}\n${text.slice(0, 200)}`);
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
 * Fetch the NBA pro team schedule (all scoring periods).
 */
export async function fetchProSchedule(leagueId, seasonYear, auth) {
  const url = `${BASE}/${seasonYear}/segments/0/leagues/${leagueId}?view=proTeamSchedules_wl`;
  return espnFetch(url, auth);
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
