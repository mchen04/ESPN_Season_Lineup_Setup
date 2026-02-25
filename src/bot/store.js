import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storePath = path.join(__dirname, '..', '..', 'state.json');

/**
 * Update the ESPN tokens and league context.
 * 
 * @param {string} swid 
 * @param {string} espnS2 
 * @param {number} leagueId 
 * @param {number} teamId 
 * @param {number} seasonYear 
 */
export const updateTokens = (swid, espnS2, leagueId, teamId, seasonYear) => {
    const data = { swid, espn_s2: espnS2, league_id: leagueId, team_id: teamId, season_year: seasonYear, updated_at: new Date().toISOString() };
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf8');
};

/**
 * Retrieve the current ESPN tokens and league context.
 * 
 * @returns {object|undefined} {swid, espn_s2, league_id, team_id, season_year}
 */
export const getTokens = () => {
    try {
        if (fs.existsSync(storePath)) {
            const data = fs.readFileSync(storePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('[Store] Error reading tokens:', err);
    }
    return undefined;
};
