/**
 * Normalizer: raw ESPN API JSON → clean domain objects.
 *
 * Player shape:
 * {
 *   playerId, name, teamId,
 *   proTeamId,          // NBA team id (0 = free agent / none)
 *   injuryStatus,       // 'ACTIVE' | 'OUT' | 'DOUBTFUL' | 'QUESTIONABLE' | 'PROBABLE' | null
 *   lineupSlotId,       // current slot (0=PG, 20=bench, 21=IR, …)
 *   eligibleSlots,      // int[]
 *   projectedPoints,    // float (0 if unavailable)
 *   estimatedReturnDate // ISO string or null
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
  const irSlotCount = lineupSlotCounts['21'] ?? lineupSlotCounts[21] ?? 0;

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
      const eligibleSlots = playerData.eligibleSlots ?? entry.playerPoolEntry?.eligibleSlots ?? [];

      // Injury status: only treat 'OUT' as injured per spec
      const injuryStatus = poolEntry.injuryStatus ?? playerData.injuryStatus ?? null;

      // Projected points from onTeamRoster stats (season average)
      let projectedPoints = 0;
      const stats = poolEntry.playerPoolEntry?.stats ?? poolEntry.stats ?? [];
      for (const s of stats) {
        if (s.statSplitTypeId === 1 && s.seasonId && s.appliedTotal != null) {
          projectedPoints = s.appliedAverage ?? s.appliedTotal ?? 0;
          break;
        }
      }

      // Return date (sometimes present as an injury detail)
      const estimatedReturnDate = poolEntry.injuryDate ?? null;

      players.push({
        playerId,
        name,
        teamId,
        proTeamId,
        injuryStatus,
        lineupSlotId: entry.lineupSlotId,
        eligibleSlots: Array.isArray(eligibleSlots) ? eligibleSlots : [],
        projectedPoints: Number(projectedPoints) || 0,
        estimatedReturnDate,
      });
    }
  }

  return players;
}

/**
 * Parse the proTeamSchedules_wl response into a map:
 *   scoringPeriodId → Set<proTeamId> (teams playing that day)
 */
export function normalizeSchedule(raw) {
  const scheduleMap = {}; // periodId → Set<proTeamId>

  const proTeams = raw.settings?.proTeams ?? [];
  for (const team of proTeams) {
    const proTeamId = team.id;
    const proGamesByScoringPeriod = team.proGamesByScoringPeriod ?? {};

    for (const [periodStr, games] of Object.entries(proGamesByScoringPeriod)) {
      const periodId = Number(periodStr);
      if (!scheduleMap[periodId]) scheduleMap[periodId] = new Set();
      if (Array.isArray(games) && games.length > 0) {
        scheduleMap[periodId].add(proTeamId);
      }
    }
  }

  return scheduleMap;
}
