/**
 * Service Worker — message router for ESPN Season Lineup Setup.
 * Proxies all ESPN API fetches (cross-origin requires extension context).
 */

import { fetchLeague, fetchPlayers, fetchProSchedule, submitLineup } from '../api/espn-client.js';
import { normalizeLeague } from '../api/normalizer.js';
import { buildRemainingGameDays } from '../core/scheduler.js';
import { assignIRSlots } from '../core/ir-assigner.js';
import { runSeasonSetup } from '../core/submitter.js';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch(err => {
    console.error('[SW] Unhandled error:', err);
    sendResponse({ ok: false, error: err.message });
  });
  return true; // keep channel open for async response
});

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

  const scheduleRaw = await fetchProSchedule(leagueId, seasonYear, auth);
  const gameDays = buildRemainingGameDays(
    scheduleRaw,
    league.currentScoringPeriodId,
    league.finalScoringPeriodId
  );

  const irAssignments = assignIRSlots(myPlayers, league.irSlotCount);

  const teamEntry = raw.teams.find(t => t.id === teamId);
  console.log('[SW] teamEntry keys:', teamEntry ? Object.keys(teamEntry) : null);
  console.log('[SW] teamEntry name fields:', teamEntry ? { location: teamEntry.location, nickname: teamEntry.nickname, name: teamEntry.name, abbrev: teamEntry.abbrev } : null);
  const teamName = teamEntry
    ? (teamEntry.name || `${teamEntry.location || ''} ${teamEntry.nickname || ''}`.trim() || teamEntry.abbrev || `Team ${teamId}`)
    : `Team ${teamId}`;

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
  const portName = 'lineup-progress';

  let progressPort = null;
  chrome.runtime.onConnect.addListener(function onConnect(port) {
    if (port.name === portName) {
      progressPort = port;
      chrome.runtime.onConnect.removeListener(onConnect);
    }
  });

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
