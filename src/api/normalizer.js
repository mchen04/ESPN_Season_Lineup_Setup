/**
 * Normalizer: raw ESPN API JSON → clean domain objects.
 *
 * Player shape:
 * {
 *   playerId, name, teamId,
 *   proTeamId,          // NBA team id (0 = free agent / none)
 *   injuryStatus,       // 'OUT' for injured (raw ESPN 'O'/'IL' folded to 'OUT'); other raw codes pass through and are treated as healthy; null when absent
 *   lineupSlotId,       // current slot (basketball: 0=PG, 12=BENCH, 13=IR, …)
 *   eligibleSlots,      // int[]
 *   projectedPoints,    // float (0 if unavailable)
 *   injuryDate          // injury onset date (ISO string) or null; ESPN exposes no projected return date
 * }
 *
 * LeagueSettings shape:
 * {
 *   currentScoringPeriodId,
 *   finalScoringPeriodId,
 *   irSlotCount,
 *   rosterSlots,        // { slotId: count }
 * }
 */

export function normalizeLeague(raw) {
  const settings = extractSettings(raw);
  const players = extractPlayers(raw);
  return { league: settings, players };
}

function extractSettings(raw) {
  const status = raw.status || {};
  const rosterSettings = raw.settings?.rosterSettings || {};

  const lineupSlotCounts = rosterSettings.lineupSlotCounts || {};
  const irSlotCount = lineupSlotCounts['13'] ?? lineupSlotCounts[13] ?? 0; // basketball IR = slot 13

  return {
    currentScoringPeriodId: status.currentMatchupPeriod
      ? raw.scoringPeriodId ?? status.currentMatchupPeriod
      : raw.scoringPeriodId ?? 1,
    finalScoringPeriodId: status.finalScoringPeriod ?? status.finalMatchupPeriod ?? 154,
    irSlotCount: Number(irSlotCount),
    rosterSlots: lineupSlotCounts,
  };
}

function extractPlayers(raw) {
  const players = [];

  for (const team of raw.teams || []) {
    const teamId = team.id;
    const roster = team.roster?.entries || [];

    for (const entry of roster) {
      const playerData = entry.playerPoolEntry?.player || {};
      const poolEntry = entry.playerPoolEntry || {};

      const playerId = playerData.id ?? entry.playerId;
      const name = playerData.fullName ?? `Player ${playerId}`;
      const proTeamId = playerData.proTeamId ?? 0;
      const eligibleSlots = playerData.eligibleSlots ?? poolEntry.eligibleSlots ?? [];

      // Injury status: only treat 'OUT' (or its variants 'O', 'IL') as injured per spec
      let injuryStatus = poolEntry.injuryStatus ?? playerData.injuryStatus ?? null;
      if (injuryStatus === 'O' || injuryStatus === 'IL') {
        injuryStatus = 'OUT';
      }

      // Projected points from onTeamRoster stats (season average)
      let projectedPoints = 0;
      const stats = poolEntry.stats ?? [];
      for (const s of stats) {
        if (s.statSplitTypeId === 1 && s.seasonId && s.appliedTotal != null) {
          projectedPoints = s.appliedAverage ?? s.appliedTotal ?? 0;
          break;
        }
      }

      // Injury onset date from the pool entry. ESPN's roster payload does not
      // expose a projected return date, so this is the only injury-timing signal.
      const injuryDate = poolEntry.injuryDate ?? null;

      players.push({
        playerId,
        name,
        teamId,
        proTeamId,
        injuryStatus,
        lineupSlotId: entry.lineupSlotId,
        eligibleSlots: Array.isArray(eligibleSlots) ? eligibleSlots : [],
        projectedPoints: Number(projectedPoints) || 0,
        injuryDate,
      });
    }
  }

  return players;
}

/**
 * Parse per-day ESPN public scoreboard responses into a date → team IDs map.
 *
 * @param {Array<{dateStr: string, raw: object|null}>} dayResults
 *   One entry per fetchNBADayScoreboard call. dateStr is "YYYYMMDD".
 * @returns {Object<string, Set<number>>} YYYYMMDD → Set<ESPN teamId>
 */
export function normalizePublicSchedule(dayResults) {
  const dateToTeams = {};

  for (const { dateStr, raw } of dayResults) {
    if (!raw) continue;

    if (!raw.events || raw.events.length === 0) continue;

    const teams = new Set();
    for (const event of raw.events) {
      for (const comp of event.competitions?.[0]?.competitors ?? []) {
        const id = Number(comp.id ?? comp.team?.id);
        if (id) teams.add(id);
      }
    }
    if (teams.size > 0) {
      dateToTeams[dateStr] = teams;
    }
  }

  return dateToTeams;
}

/** Filter normalized players down to a single fantasy team ("my team"). */
export function getMyPlayers(players, teamId) {
  return players.filter(p => p.teamId === teamId);
}

/**
 * Resolve a team's display name from its raw ESPN team entry, with fallbacks.
 *
 * @param {object|undefined} teamEntry — raw ESPN team object (may be undefined)
 * @param {number} fallbackTeamId — used when no name fields resolve
 * @returns {string}
 */
export function formatTeamName(teamEntry, fallbackTeamId) {
  if (!teamEntry) return `Team ${fallbackTeamId}`;
  return teamEntry.name
    || `${teamEntry.location || ''} ${teamEntry.nickname || ''}`.trim()
    || teamEntry.abbrev
    || `Team ${fallbackTeamId}`;
}
