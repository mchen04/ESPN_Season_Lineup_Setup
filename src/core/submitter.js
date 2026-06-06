/**
 * Season setup orchestrator.
 *
 * Fetches all data, assigns IR slots once, then for each remaining game day
 * optimizes the lineup and POSTs it to ESPN with a 300ms delay between requests.
 */

import { fetchLeague, submitLineup, fetchRosterForPeriod } from '../api/espn-client.js';
import { normalizeLeague, getMyPlayers } from '../api/normalizer.js';
import { buildRemainingGameDays, fetchScheduleWindow } from './scheduler.js';
import { getIRPlayerIds } from './ir-assigner.js';
import { optimizeLineup } from './optimizer.js';
import { buildActiveSlots } from '../utils/slot-utils.js';

const DELAY_MS = 300;

/**
 * @param {object} opts
 * @param {number} opts.leagueId
 * @param {number} opts.teamId
 * @param {number} opts.seasonYear
 * @param {number} [opts.currentScoringPeriodId] — optional; defaults to the league's current period
 * @param {{ espnS2: string, swid: string }} opts.auth
 * @param {(completed: number, total: number) => void} [opts.onProgress] — optional; no-op if omitted
 * @returns {{ submitted: number, skipped: number, errors: string[] }}
 */
export async function runSeasonSetup({ leagueId, teamId, seasonYear, currentScoringPeriodId, auth, onProgress = () => {} }) {
  // 1. Fetch league data and the NBA scoreboard window in parallel.
  const [leagueRaw, dateToTeams] = await Promise.all([
    fetchLeague(leagueId, seasonYear, auth),
    fetchScheduleWindow(),
  ]);

  const { league, players } = normalizeLeague(leagueRaw);
  const activeSlots = buildActiveSlots(league.rosterSlots);
  const myPlayers = getMyPlayers(players, teamId);

  // 2. Assign IR slots once (static for the whole run)
  const irPlayerIds = getIRPlayerIds(myPlayers, league.irSlotCount);
  const activePlayers = myPlayers.filter(p => !irPlayerIds.has(p.playerId));
  const irPlayers = myPlayers.filter(p => irPlayerIds.has(p.playerId));

  // 3. Build remaining game days. currentScoringPeriodId is optional — the bot
  // path omits it and lets the freshly-fetched league supply the current period.
  const effectivePeriod = currentScoringPeriodId ?? league.currentScoringPeriodId;
  const gameDays = buildRemainingGameDays(dateToTeams, effectivePeriod, league.finalScoringPeriodId);

  const total = gameDays.length;
  let submitted = 0;
  let skipped = 0;
  const errors = [];

  // 4. Submit lineup for each game day
  for (let i = 0; i < gameDays.length; i++) {
    const { scoringPeriodId, playingTeamIds, date } = gameDays[i];

    try {
      // Fetch exact roster for this specific period to eliminate any desyncs
      const periodRosterRaw = await fetchRosterForPeriod(leagueId, seasonYear, scoringPeriodId, auth);
      const teamEntry = (periodRosterRaw?.teams || []).find(t => t.id === teamId);

      const currentSlots = new Map();
      if (teamEntry && teamEntry.roster && teamEntry.roster.entries) {
        for (const entry of teamEntry.roster.entries) {
          currentSlots.set(entry.playerId, entry.lineupSlotId);
        }
      }

      const items = optimizeLineup(
        activePlayers,
        irPlayers,
        playingTeamIds,
        scoringPeriodId,
        effectivePeriod,
        currentSlots,
        activeSlots
      );

      if (items.length === 0) {
        skipped++;
        onProgress(submitted + skipped, total);
        continue;
      }

      const isFuture = scoringPeriodId > effectivePeriod;
      const payload = {
        isLeagueManager: false,
        teamId,
        type: isFuture ? 'FUTURE_ROSTER' : 'ROSTER',
        memberId: auth.swid,
        scoringPeriodId,
        executionType: 'EXECUTE',
        items,
      };

      await submitLineup(leagueId, seasonYear, auth, payload);
      submitted++;

    } catch (err) {
      if (err.message.includes('TRAN_LINEUP_LOCKED')) {
        console.warn(`[Submitter] [${date}] period ${scoringPeriodId} partially locked (${err.message}). Continuing...`);
      } else {
        console.error(`[Submitter] [${date}] period ${scoringPeriodId} error:`, err);
        errors.push(`[${date}] period ${scoringPeriodId}: ${err.message}`);
      }
    }

    onProgress(submitted + skipped, total);

    // Rate-limit: skip delay on the last iteration
    if (i < gameDays.length - 1) {
      await delay(DELAY_MS);
    }
  }

  return { submitted, skipped, errors };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
