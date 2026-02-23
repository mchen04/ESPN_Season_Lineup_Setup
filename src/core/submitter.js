/**
 * Season setup orchestrator.
 *
 * Fetches all data, assigns IR slots once, then for each remaining game day
 * optimizes the lineup and POSTs it to ESPN with a 300ms delay between requests.
 */

import { fetchLeague, fetchNBADayScoreboard, submitLineup, fetchRosterForPeriod } from '../api/espn-client.js';
import { normalizeLeague, normalizePublicSchedule } from '../api/normalizer.js';
import { buildRemainingGameDays } from './scheduler.js';
import { getIRPlayerIds } from './ir-assigner.js';
import { optimizeLineup } from './optimizer.js';
import { buildActiveSlots, slotName } from '../utils/slot-utils.js';

const DELAY_MS = 300;

/**
 * @param {object} opts
 * @param {number} opts.leagueId
 * @param {number} opts.teamId
 * @param {number} opts.seasonYear
 * @param {number} opts.currentScoringPeriodId
 * @param {{ espnS2: string, swid: string }} opts.auth
 * @param {(completed: number, total: number) => void} opts.onProgress
 * @returns {{ submitted: number, skipped: number, errors: string[] }}
 */
export async function runSeasonSetup({ leagueId, teamId, seasonYear, currentScoringPeriodId, auth, onProgress }) {
  // 1. Fetch league data and the next 60 calendar days of NBA scoreboards in parallel.
  // Using a fixed 60-day window avoids a sequential dependency on finalScoringPeriodId.
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  const datesToFetch = Array.from({ length: 60 }, (_, i) => {
    const d = new Date(todayMidnight.getTime() + i * msPerDay);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  });
  const [leagueRaw, ...dayRaws] = await Promise.all([
    fetchLeague(leagueId, seasonYear, auth),
    ...datesToFetch.map(d => fetchNBADayScoreboard(d)),
  ]);

  const { league, players } = normalizeLeague(leagueRaw);
  const activeSlots = buildActiveSlots(league.rosterSlots);
  console.log('[Submitter] rosterSlots:', league.rosterSlots, 'activeSlots:', activeSlots);
  const myPlayers = players.filter(p => p.teamId === teamId);

  // 2. Assign IR slots once (static for the whole run)
  const irPlayerIds = getIRPlayerIds(myPlayers, league.irSlotCount);
  const activePlayers = myPlayers.filter(p => !irPlayerIds.has(p.playerId));
  const irPlayers = myPlayers.filter(p => irPlayerIds.has(p.playerId));

  // 3. Build remaining game days
  const dayResults = datesToFetch.map((dateStr, i) => ({ dateStr, raw: dayRaws[i] }));
  const dateToTeams = normalizePublicSchedule(dayResults);
  const gameDays = buildRemainingGameDays(dateToTeams, currentScoringPeriodId, league.finalScoringPeriodId);
  const daysWithGames = gameDays.filter(d => d.playingTeamIds.size > 0).length;
  console.log(`[Submitter] gameDays: ${gameDays.length} total, ${daysWithGames} with ≥1 NBA game`);
  if (gameDays.length > 0) {
    console.log(`[Submitter] first day: ${gameDays[0].date} (period ${gameDays[0].scoringPeriodId}) teams=${gameDays[0].playingTeamIds.size}`);
    console.log(`[Submitter] day +1:   ${gameDays[1]?.date} (period ${gameDays[1]?.scoringPeriodId}) teams=${gameDays[1]?.playingTeamIds.size ?? 0}`);
  }

  // (Removed manual currentSlots initialization. We will fetch dynamically per day)

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
      const teamEntry = periodRosterRaw.teams.find(t => t.id === teamId);

      const currentSlots = new Map();
      if (teamEntry && teamEntry.roster && teamEntry.roster.entries) {
        for (const entry of teamEntry.roster.entries) {
          currentSlots.set(entry.playerId, entry.lineupSlotId);
        }
      }
      if (scoringPeriodId === currentScoringPeriodId + 1) {
        const sample = teamEntry?.roster?.entries?.[0];
        console.log(`[Submitter] [${date}] period ${scoringPeriodId} sample entry keys:`, sample ? Object.keys(sample) : null);
        console.log(`[Submitter] [${date}] period ${scoringPeriodId} sample entry.playerId:`, sample?.playerId, 'entry.playerPoolEntry?.player?.id:', sample?.playerPoolEntry?.player?.id);
        console.log(`[Submitter] [${date}] period ${scoringPeriodId} currentSlots size:`, currentSlots.size, 'first few:', [...currentSlots.entries()].slice(0, 3));
      }

      const items = optimizeLineup(
        activePlayers,
        irPlayers,
        playingTeamIds,
        scoringPeriodId,
        teamId,
        currentScoringPeriodId,
        currentSlots,
        activeSlots
      );

      console.log(`[Submitter] [${date}] period ${scoringPeriodId}: ${items.length} items`, items.slice(0, 3));
      if (items.length === 0) {
        const summary = buildLineupSummary(activePlayers, irPlayers, currentSlots, playingTeamIds);
        console.log(`[Submitter] [${date}] period ${scoringPeriodId}: lineup already optimal — ${summary}`);
        skipped++;
        onProgress(submitted + skipped, total);
        continue;
      }

      const isFuture = scoringPeriodId > currentScoringPeriodId;
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

function buildLineupSummary(activePlayers, irPlayers, currentSlots, playingTeamIds) {
  const parts = [];
  for (const p of activePlayers) {
    const slotId = currentSlots.get(p.playerId) ?? p.lineupSlotId;
    const isInjured = p.injuryStatus === 'OUT';
    const hasGame = playingTeamIds.has(p.proTeamId);
    const tierStr = !isInjured && hasGame ? 'game'
      : isInjured && hasGame ? 'inj+game'
      : !isInjured ? 'no game'
      : 'inj+no game';
    const lastName = p.name.split(' ').slice(1).join(' ') || p.name;
    parts.push(`${slotName(slotId)}=${lastName}(${tierStr})`);
  }
  for (const p of irPlayers) {
    const lastName = p.name.split(' ').slice(1).join(' ') || p.name;
    parts.push(`IR=${lastName}`);
  }
  return parts.join(' ');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
