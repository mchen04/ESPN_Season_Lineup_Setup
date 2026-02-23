# ESPN API Research: Setting Lineups for Future Scoring Periods

**Date:** 2026-02-22
**Context:** Investigating why ROSTER transactions fail for scoring periods beyond the current matchup week.

---

## TL;DR

The endpoint and payload type are correct. The bug is a **stale `fromLineupSlotId`** — player slot positions are fetched once at startup and never updated between submissions. ESPN is lenient about this within the current matchup week, but enforces strict validation at week boundaries, causing all future-week submissions to fail.

---

## ESPN Write API

### Endpoint
```
POST https://lm-api-writes.fantasy.espn.com/apis/v3/games/fba/seasons/{year}/segments/0/leagues/{leagueId}/transactions/
```

This is the **only known write endpoint** for lineup management. There is no separate "set future lineup" endpoint. ESPN's own web UI, the Bionic extension, and all other tools that support future-day lineup setting all use this same endpoint.

### Payload (ROSTER type)
```json
{
  "teamId": 1,
  "type": "ROSTER",
  "memberId": "{SWID}",
  "scoringPeriodId": 145,
  "executionType": "EXECUTE",
  "items": [
    {
      "playerId": 12345,
      "type": "LINEUP",
      "fromLineupSlotId": 12,
      "toLineupSlotId": 0
    }
  ]
}
```

- `scoringPeriodId` = the specific game day (e.g., 145 = day 145 of the NBA season)
- `fromLineupSlotId` = the slot the player is currently in on ESPN's server
- `toLineupSlotId` = the slot you want to move them to

---

## Slot ID Reference (Basketball)

| Slot | ID |
|------|----|
| PG   | 0  |
| SG   | 1  |
| SF   | 2  |
| PF   | 3  |
| C    | 4  |
| G (swing) | 5 |
| F (swing) | 6 |
| UTIL | 11 |
| Bench | 12 |
| IR   | 13 |

---

## Root Cause: Stale `fromLineupSlotId`

### What happens step by step

1. **Startup fetch:** Player A is in slot 12 (bench). Code stores `player.lineupSlotId = 12`.
2. **Day 1 submit:** `fromLineupSlotId=12 → toLineupSlotId=0 (PG)`. ESPN accepts it. ESPN's server now has Player A in slot 0.
3. **Day 2 submit:** Code sends `fromLineupSlotId=12` again (stale — never updated). ESPN's server sees Player A in slot 0. Mismatch.

### Why it works for the current week but not future weeks

Within the **current matchup week**, ESPN appears lenient — it accepts stale `fromLineupSlotId` values, possibly treating them as advisory rather than enforced. This might be because the active matchup period is in a more "fluid" validation state.

At the **week boundary** (transition to the next matchup period), ESPN enforces strict `fromLineupSlotId` validation. The stale value (12/bench) doesn't match ESPN's server state (0/PG), so the transaction is rejected for every player.

This exactly matches the observed symptom: **works within the current week, fails at and beyond the week boundary.**

---

## What Was Ruled Out

### Different endpoint for future weeks
No evidence of a separate endpoint. ESPN's UI uses the same `/transactions/` path for all dates. Public open-source ESPN API wrappers do not document an alternate endpoint.

### `matchupPeriodId` required in payload
Not present in any known working implementation. ESPN football (better documented) uses the same payload structure without a `matchupPeriodId` field for lineup changes.

### ESPN blocking future-week scoringPeriodIds entirely
Ruled out because:
- ESPN's web UI allows setting lineups for any future week
- Third-party extensions (Bionic) claim to support multi-week range lineup setting
- If ESPN blocked future periods at the API level, none of these tools would work

---

## Fix

### 1. Track slot state in `src/core/submitter.js`

Initialize a `currentSlots` map from the initial roster fetch. After each successful submission, update it with the `toLineupSlotId` values that were just applied.

```javascript
// Initialize
const currentSlots = new Map();
for (const p of [...activePlayers, ...irPlayers]) {
  currentSlots.set(p.playerId, p.lineupSlotId);
}

// After each successful submitLineup():
for (const item of items) {
  currentSlots.set(item.playerId, item.toLineupSlotId);
}
```

### 2. Accept `currentSlots` in `src/core/optimizer.js`

```javascript
export function optimizeLineup(activePlayers, irPlayers, playingTeamIds, scoringPeriodId, teamId, currentSlots = new Map()) {
  // ...
  // When building items:
  fromLineupSlotId: currentSlots.get(player.playerId) ?? player.lineupSlotId,
}
```

### 3. Expand error logging in `src/api/espn-client.js`

Current limit is 200 chars — too short to see ESPN's full error message. Increase to 500+.

```javascript
throw new Error(`ESPN API ${res.status}: ${res.statusText} — ${url}\n${text.slice(0, 500)}`);
```

---

## Files to Change

| File | Change |
|------|--------|
| `src/core/submitter.js` | Add `currentSlots` map, update after each submit, pass to optimizer |
| `src/core/optimizer.js` | Accept optional `currentSlots` param, use it for `fromLineupSlotId` |
| `src/api/espn-client.js` | Increase error body capture from 200 to 500 chars |

---

## Verification Steps

1. Load the extension unpacked in `chrome://extensions`
2. Navigate to your ESPN league page
3. Run the season setup
4. Watch progress — should reach beyond Day 7 with no errors
5. Navigate to ESPN → Set Lineup → jump to Week 3+ → confirm players are in correct positions
6. Confirm error count = 0 in the result popup

---

## Sources

- [cwendt94/espn-api](https://github.com/cwendt94/espn-api) — most actively maintained ESPN API wrapper (Python)
- [pseudo-r/Public-ESPN-API](https://github.com/pseudo-r/Public-ESPN-API) — community endpoint documentation
- [ESPN hidden API Docs (akeaswaran gist)](https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b) — endpoint catalog
- [magnusbakken/espn-fantasy-autopick](https://github.com/magnusbakken/espn-fantasy-autopick) — Chrome extension with lineup automation
- [ESPN Fan Support — Lineup Lock Times](https://support.espn.com/hc/en-us/articles/360054748151-Lineup-and-Roster-Lock-Times)
- [ESPN Fantasy Basketball Chrome Web Store extensions](https://chromewebstore.google.com/detail/bionic/hjpjljchacdncdgdbehnbinbaopnijlp) — Bionic extension supporting multi-day range setting
