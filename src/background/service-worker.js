/**
 * Service Worker — message router for ESPN Season Lineup Setup.
 * Proxies all ESPN API fetches (cross-origin requires extension context).
 */

import { fetchLeague } from '../api/espn-client.js';
import { normalizeLeague, formatTeamName, getMyPlayers } from '../api/normalizer.js';
import { buildRemainingGameDays, fetchScheduleWindow } from '../core/scheduler.js';
import { assignIRSlots } from '../core/ir-assigner.js';
import { runSeasonSetup } from '../core/submitter.js';
import { setStorage } from '../api/chrome-storage.js';
import { syncTokensToBot } from './bot-sync.js'; // also registers the cookie-change token bridge

let progressPort = null;
chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'lineup-progress') {
    progressPort = port;
    port.onDisconnect.addListener(() => { if (progressPort === port) progressPort = null; });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch(err => {
    console.error('[SW] Unhandled error:', err);
    sendResponse({ ok: false, error: err.message });
  });
  return true; // keep channel open for async response
});

/**
 * Main message router for incoming events from the Chrome Extension popup.
 * Handles fetching preview specs or initiating the manual season-long setup run.
 * @param {object} msg - The message payload
 * @returns {Promise<object>} The response payload ({ok, ...})
 */
async function handleMessage(msg) {
  switch (msg.type) {
    case 'GET_PREVIEW':
      return getPreview(msg);
    case 'RUN_SETUP':
      return runSetup(msg);
    case 'MANUAL_SYNC_TOKENS':
      syncTokensToBot(); // fire-and-forget; result is not awaited by the popup
      return { ok: true };
    default:
      return { ok: false, error: `Unknown message type: ${msg.type}` };
  }
}

async function getPreview({ leagueId, seasonYear, auth }) {
  const raw = await fetchLeague(leagueId, seasonYear, auth);
  const { league, players } = normalizeLeague(raw);

  const teamId = findMyTeamId(raw, auth.swid);
  if (!teamId) return { ok: false, error: 'Could not find your team in this league.' };

  const myPlayers = getMyPlayers(players, teamId);

  const dateToTeams = await fetchScheduleWindow();
  const gameDays = buildRemainingGameDays(dateToTeams, league.currentScoringPeriodId, league.finalScoringPeriodId);

  const irAssignments = assignIRSlots(myPlayers, league.irSlotCount);

  const teamEntry = (raw?.teams || []).find(t => t.id === teamId);
  const teamName = formatTeamName(teamEntry, teamId);

  // Store league context for the 24/7 background bot auth sync (fire-and-forget)
  setStorage({ leagueId, teamId, seasonYear })
    .catch(err => console.warn('[SW] failed to store league context:', err.message));

  return {
    ok: true,
    teamId,
    teamName,
    gameDayCount: gameDays.length,
    currentScoringPeriodId: league.currentScoringPeriodId,
    irAssignments,
  };
}

async function runSetup({ leagueId, teamId, seasonYear, currentScoringPeriodId, auth }) {
  const result = await runSeasonSetup({
    leagueId,
    teamId,
    seasonYear,
    currentScoringPeriodId,
    auth,
    onProgress(completed, total) {
      if (progressPort) {
        try {
          progressPort.postMessage({ type: 'PROGRESS', completed, total });
        } catch {
          progressPort = null; // popup port disconnected mid-submission — stop posting
        }
      }
    },
  });

  return { ok: true, ...result };
}

/** Find the team owned by the given SWID. */
function findMyTeamId(rawLeague, swid) {
  for (const team of rawLeague.teams || []) {
    const members = team.owners || [];
    if (members.some(m => m === swid || m === `{${swid}}`)) {
      return team.id;
    }
  }
  return null;
}
