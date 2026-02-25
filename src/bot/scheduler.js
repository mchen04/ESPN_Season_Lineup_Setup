import schedule from 'node-schedule';
import { fetchNBADayScoreboard, fetchLeague } from '../api/espn-client.js';
import { getFirstUser, getTokens } from './db.js';
import { runSeasonSetup } from '../core/submitter.js';
import { normalizeLeague } from '../api/normalizer.js';

export function startScheduler() {
    // Master Scheduler: runs every day at 00:01 local server time
    schedule.scheduleJob('1 0 * * *', async () => {
        console.log('[Scheduler] Running daily master check at 12:01 AM...');

        // 1. Get user & tokens (Supporting single-user mode for now)
        const user = getFirstUser();
        if (!user) {
            console.log('[Scheduler] No user registered. Skipping daily run.');
            return;
        }
        const tokens = getTokens(user.id);
        if (!tokens || !tokens.swid || !tokens.espn_s2 || !tokens.league_id) {
            console.log('[Scheduler] Missing ESPN tokens or league info. Skipping.');
            return;
        }

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
            runOptimizerJob(tokens);
        } else {
            console.log(`[Scheduler] Scheduled optimizer for ${optimizeTime.toISOString()}`);
            schedule.scheduleJob(optimizeTime, () => runOptimizerJob(tokens));
        }
    });

    console.log('[Scheduler] Daily master scheduler initialized.');
}

async function runOptimizerJob(tokens) {
    console.log('[Scheduler] Running daily lineup optimizer...');
    try {
        const auth = { swid: tokens.swid, espnS2: tokens.espn_s2 };

        // Fetch league info to get the `currentScoringPeriodId`
        const leagueRaw = await fetchLeague(tokens.league_id, tokens.season_year, auth);
        const { league } = normalizeLeague(leagueRaw);

        console.log(`[Scheduler] Current scoring period: ${league.currentScoringPeriodId}`);

        // Run the existing season rollout script which optimizes today and future days
        // We can just restrict it to 1 day or let it run fully (idempotent)
        const result = await runSeasonSetup({
            leagueId: tokens.league_id,
            teamId: tokens.team_id,
            seasonYear: tokens.season_year,
            currentScoringPeriodId: league.currentScoringPeriodId,
            auth,
            onProgress: (c, t) => { } // no-op progress
        });

        console.log(`[Scheduler] Lineup optimizer finished. Submitted: ${result.submitted}, Skipped: ${result.skipped}, Errors: ${result.errors.length}`);
    } catch (err) {
        console.error('[Scheduler] Error running lineup optimizer:', err);
    }
}
