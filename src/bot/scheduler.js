import schedule from 'node-schedule';
import fs from 'fs';
import { fetchNBADayScoreboard } from '../api/espn-client.js';
import { runSeasonSetup } from '../core/submitter.js';
import { toYYYYMMDD } from '../utils/date-utils.js';
import { STATE_FILE_PATH, parseState } from './config.js';

function getUserState() {
    if (!fs.existsSync(STATE_FILE_PATH)) return null;
    try {
        return parseState(JSON.parse(fs.readFileSync(STATE_FILE_PATH, 'utf8')));
    } catch (e) {
        console.error('[Scheduler] Error reading state.json', e.message);
        return null;
    }
}

export function startScheduler() {
    // Master Scheduler: runs every day at 00:01 local server time
    schedule.scheduleJob('1 0 * * *', async () => {
        console.log('[Scheduler] Running daily master check at 12:01 AM...');

        // 1. Get user state
        const userState = getUserState();
        if (!userState) {
            console.log('[Scheduler] No active/complete user state in state.json. Sleeping.');
            return;
        }

        console.log(`[Scheduler] Found active user state to optimize.`);

        // 2. Fetch today's NBA scoreboard
        const yyyymmdd = toYYYYMMDD(new Date());
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
            runOptimizerJob(userState).catch(e => console.error('[Scheduler] optimizer failed:', e));
        } else {
            console.log(`[Scheduler] Scheduled optimizer for ${optimizeTime.toISOString()}`);
            schedule.scheduleJob(optimizeTime, () => runOptimizerJob(userState).catch(e => console.error('[Scheduler] optimizer failed:', e)));
        }
    });

    console.log('[Scheduler] Daily master scheduler initialized.');
}

async function runOptimizerJob(userState) {
    console.log(`[Scheduler] Running daily lineup optimizer...`);

    try {
        const auth = { swid: userState.swid, espnS2: userState.espnS2 };

        // runSeasonSetup fetches the league itself and derives the current scoring period.
        // headless mode: onProgress defaults to a no-op inside runSeasonSetup
        const result = await runSeasonSetup({
            leagueId: userState.leagueId,
            teamId: userState.teamId,
            seasonYear: userState.seasonYear,
            auth,
        });

        console.log(`[Scheduler] Finished lineup optimization. Submitted: ${result.submitted}, Skipped: ${result.skipped}, Errors: ${result.errors.length}`);
    } catch (err) {
        console.error(`[Scheduler] Error running optimizer:`, err.message);
    }

    console.log('\n[Scheduler] Daily optimization complete.');
}
