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
      const eligibleSlots = playerData.eligibleSlots ?? entry.playerPoolEntry?.eligibleSlots ?? [];

      // Injury status: only treat 'OUT' (or its variants 'O', 'IL') as injured per spec
      let injuryStatus = poolEntry.injuryStatus ?? playerData.injuryStatus ?? null;
      if (injuryStatus === 'O' || injuryStatus === 'IL') {
        injuryStatus = 'OUT';
      }

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

  const datesWithGames = Object.keys(dateToTeams).sort();
  console.log(`[Normalizer] public schedule: ${datesWithGames.length} dates with games, range ${datesWithGames[0] ?? '—'}–${datesWithGames[datesWithGames.length - 1] ?? '—'}`);
  if (datesWithGames.length > 0) {
    const sample = datesWithGames[0];
    console.log(`[Normalizer] sample ${sample}: teams`, [...dateToTeams[sample]]);
  }

  return dateToTeams;
}
