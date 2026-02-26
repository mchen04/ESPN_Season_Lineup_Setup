import schedule from 'node-schedule';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchNBADayScoreboard, fetchLeague } from '../api/espn-client.js';
import { runSeasonSetup } from '../core/submitter.js';
import { normalizeLeague } from '../api/normalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE_PATH = path.resolve(__dirname, '../../state.json');

function getUserState() {
    if (!fs.existsSync(STATE_FILE_PATH)) return null;
    try {
        const data = fs.readFileSync(STATE_FILE_PATH, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error('[Scheduler] Error reading state.json', e.message);
        return null;
    }
}

export function startScheduler() {
    // Master Scheduler: runs every day at 00:01 local server time
    schedule.scheduleJob('1 0 * * *', async () => {
        console.log('[Scheduler] Running daily master check at 12:01 AM...');

        const userState = getUserState();
        if (!userState || !userState.swid || !userState.espn_s2) {
            console.log('[Scheduler] No active user state with tokens found. Sleeping.');
            return;
        }

        console.log(`[Scheduler] Found active user state to optimize.`);

        // 2. Fetch today's NBA scoreboard
        const now = new Date();
        const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const scoreboard = await fetchNBADayScoreboard(yyyymmdd);

        if (!scoreboard || !scoreboard.events || scoreboard.events.length === 0) {
            console.log('[Scheduler] No games today. Sleeping until tomorrow.');
            return;
        }

        // 3. Find earliest game time
        const gameTimes = scoreboard.events.map(e => new Date(e.date).getTime());
        const earliestGameDate = new Date(Math.min(...gameTimes));
        console.log(`[Scheduler] Earliest game today is at ${earliestGameDate.toISOString()}`);

        // 4. Schedule the optimizer 5 minutes before that game
        const optimizeTime = new Date(earliestGameDate.getTime() - 5 * 60 * 1000);

        if (optimizeTime <= new Date()) {
            console.log('[Scheduler] Game is starting soon or already started! Running optimizer immediately.');
            runOptimizerJob(userState);
        } else {
            console.log(`[Scheduler] Scheduled optimizer for ${optimizeTime.toISOString()}`);
            schedule.scheduleJob(optimizeTime, () => runOptimizerJob(userState));
        }
    });

    console.log('[Scheduler] Daily master scheduler initialized.');
}

async function runOptimizerJob(userState) {
    console.log(`[Scheduler] Running daily lineup optimizer...`);

    try {
        const auth = { swid: userState.swid, espnS2: userState.espn_s2 };

        // Fetch current league mapping
        const leagueRaw = await fetchLeague(userState.league_id, userState.season_year, auth);
        const { league } = normalizeLeague(leagueRaw);

        console.log(`[Scheduler] Current scoring period: ${league.currentScoringPeriodId}`);

        const result = await runSeasonSetup({
            leagueId: userState.league_id,
            teamId: userState.team_id,
            seasonYear: userState.season_year,
            currentScoringPeriodId: league.currentScoringPeriodId,
            auth,
            onProgress: (c, t) => { } // headless mode
        });

        console.log(`[Scheduler] Finished lineup optimization. Submitted: ${result.submitted}, Skipped: ${result.skipped}, Errors: ${result.errors.length}`);
    } catch (err) {
        console.error(`[Scheduler] Error running optimizer:`, err.message);
    }

    console.log('\n[Scheduler] Daily optimization complete.');
}
