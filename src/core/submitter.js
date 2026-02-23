/**
 * Season setup orchestrator.
 *
 * Fetches all data, assigns IR slots once, then for each remaining game day
 * optimizes the lineup and POSTs it to ESPN with a 300ms delay between requests.
 */

import { fetchLeague, fetchProSchedule, submitLineup } from '../api/espn-client.js';
import { normalizeLeague } from '../api/normalizer.js';
import { buildRemainingGameDays } from './scheduler.js';
import { getIRPlayerIds } from './ir-assigner.js';
import { optimizeLineup } from './optimizer.js';

const DELAY_MS = 300;

/**
 * @param {object} opts
 * @param {number} opts.leagueId
 * @param {number} opts.teamId
 * @param {number} opts.seasonYear
 * @param {number} opts.currentScoringPeriodId
 * @param {{ espnS2: string, swid: string }} opts.auth
 * @param {(completed: number, total: number) => void} opts.onProgress
 * @returns {{ submitted: number, errors: string[] }}
 */
export async function runSeasonSetup({ leagueId, teamId, seasonYear, currentScoringPeriodId, auth, onProgress }) {
  // 1. Fetch all required data
  const [leagueRaw, scheduleRaw] = await Promise.all([
    fetchLeague(leagueId, seasonYear, auth),
    fetchProSchedule(leagueId, seasonYear, auth),
  ]);

  const { league, players } = normalizeLeague(leagueRaw);
  const myPlayers = players.filter(p => p.teamId === teamId);

  // 2. Assign IR slots once (static for the whole run)
  const irPlayerIds = getIRPlayerIds(myPlayers, league.irSlotCount);
  const activePlayers = myPlayers.filter(p => !irPlayerIds.has(p.playerId));
  const irPlayers = myPlayers.filter(p => irPlayerIds.has(p.playerId));

  // 3. Build remaining game days
  const gameDays = buildRemainingGameDays(
    scheduleRaw,
    currentScoringPeriodId,
    league.finalScoringPeriodId
  );

  // Initialize tracked slot states
  const currentSlots = new Map();
  for (const p of [...activePlayers, ...irPlayers]) {
    currentSlots.set(p.playerId, p.lineupSlotId);
  }

  const total = gameDays.length;
  let submitted = 0;
  const errors = [];

  // 4. Submit lineup for each game day
  for (let i = 0; i < gameDays.length; i++) {
    const { scoringPeriodId, playingTeamIds } = gameDays[i];

    try {
      const items = optimizeLineup(
        activePlayers,
        irPlayers,
        playingTeamIds,
        scoringPeriodId,
        teamId,
        currentScoringPeriodId,
        currentSlots
      );

      if (items.length === 0) {
        // Nothing to submit for this day
        submitted++;
        onProgress(submitted, total);
        continue;
      }

      const payload = {
        teamId,
        type: 'ROSTER',
        memberId: auth.swid,
        scoringPeriodId,
        executionType: 'EXECUTE',
        items,
      };

      await submitLineup(leagueId, seasonYear, auth, payload);
      submitted++;

      // Update local state with the new slot assignments
      for (const item of items) {
        currentSlots.set(item.playerId, item.toLineupSlotId);
      }
    } catch (err) {
      if (err.message.includes('TRAN_LINEUP_LOCKED')) {
        console.warn(`[Submitter] Period ${scoringPeriodId} partially locked (${err.message}). Continuing...`);
      } else {
        console.error(`[Submitter] Error on period ${scoringPeriodId}:`, err);
        errors.push(`Period ${scoringPeriodId}: ${err.message}`);
      }
    }

    onProgress(submitted, total);

    // Rate-limit: skip delay on the last iteration
    if (i < gameDays.length - 1) {
      await delay(DELAY_MS);
    }
  }

  return { submitted, errors };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
