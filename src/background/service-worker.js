/**
 * Service Worker — message router for ESPN Season Lineup Setup.
 * Proxies all ESPN API fetches (cross-origin requires extension context).
 */

import { fetchLeague, fetchPlayers, fetchNBADayScoreboard, submitLineup } from '../api/espn-client.js';
import { normalizeLeague, normalizePublicSchedule } from '../api/normalizer.js';
import { buildRemainingGameDays } from '../core/scheduler.js';
import { assignIRSlots } from '../core/ir-assigner.js';
import { runSeasonSetup } from '../core/submitter.js';
import './bot-sync.js'; // Initializes the token bridge listener

let progressPort = null;
chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'lineup-progress') {
    progressPort = port;
    port.onDisconnect.addListener(() => { progressPort = null; });
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
    default:
      return { ok: false, error: `Unknown message type: ${msg.type}` };
  }
}

async function getPreview({ leagueId, seasonYear, auth }) {
  const raw = await fetchLeague(leagueId, seasonYear, auth);
  const { league, players } = normalizeLeague(raw);

  const teamId = findMyTeamId(raw, auth.swid);
  if (!teamId) return { ok: false, error: 'Could not find your team in this league.' };

  const myPlayers = players.filter(p => p.teamId === teamId);

  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  const datesToFetch = Array.from({ length: 60 }, (_, i) => {
    const d = new Date(todayMidnight.getTime() + i * msPerDay);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  });
  const dayRaws = await Promise.all(datesToFetch.map(d => fetchNBADayScoreboard(d)));
  const dayResults = datesToFetch.map((dateStr, i) => ({ dateStr, raw: dayRaws[i] }));
  const dateToTeams = normalizePublicSchedule(dayResults);
  const gameDays = buildRemainingGameDays(dateToTeams, league.currentScoringPeriodId, league.finalScoringPeriodId);

  const irAssignments = assignIRSlots(myPlayers, league.irSlotCount);

  const teamEntry = raw.teams.find(t => t.id === teamId);
  console.log('[SW] teamEntry keys:', teamEntry ? Object.keys(teamEntry) : null);
  console.log('[SW] teamEntry name fields:', teamEntry ? { location: teamEntry.location, nickname: teamEntry.nickname, name: teamEntry.name, abbrev: teamEntry.abbrev } : null);
  const teamName = teamEntry
    ? (teamEntry.name || `${teamEntry.location || ''} ${teamEntry.nickname || ''}`.trim() || teamEntry.abbrev || `Team ${teamId}`)
    : `Team ${teamId}`;

  // Store league context for the 24/7 background bot auth sync
  chrome.storage.local.set({ leagueId, teamId, seasonYear });

  return {
    ok: true,
    teamId,
    teamName,
    gameDayCount: gameDays.length,
    currentScoringPeriodId: league.currentScoringPeriodId,
    irAssignments,
    injuredPlayers: myPlayers.filter(p => p.injuryStatus === 'OUT'),
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
        } catch (_) { /* port may be closed */ }
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

