/**
 * Shared paths for the local 24/7 bot. STATE_FILE_PATH is the single source for
 * the token/state file that the server writes and the scheduler reads.
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const STATE_FILE_PATH = path.resolve(__dirname, '../../state.json');

// On-disk state.json shape: { swid, espn_s2, league_id, team_id, season_year, updated_at }.
// serializeState/parseState own the camelCase<->snake_case mapping so the write side
// (server) and read side (scheduler) can never drift on the key names.

/** Build the persisted (snake_case) state record from the extension's camelCase token payload. */
export function serializeState({ swid, espn_s2, leagueId, teamId, seasonYear }) {
  return {
    swid,
    espn_s2,
    league_id: leagueId,
    team_id: teamId,
    season_year: seasonYear,
    updated_at: new Date().toISOString(),
  };
}

/** Parse a state record into the camelCase shape the optimizer uses, or null if any field is missing. */
export function parseState(raw) {
  if (!raw) return null;
  const { swid, espn_s2, league_id, team_id, season_year } = raw;
  if (!swid || !espn_s2 || !league_id || !team_id || !season_year) return null;
  return { swid, espnS2: espn_s2, leagueId: league_id, teamId: team_id, seasonYear: season_year };
}
