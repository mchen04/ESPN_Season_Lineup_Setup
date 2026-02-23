# ESPN Fantasy Basketball Hidden API

Documented from live reverse-engineering and empirical testing in this codebase.
Confirmed working as of the 2025–26 NBA season (Feb 2026).

---

## Authentication

All private league endpoints require two cookies and two custom headers.

### Cookies

| Cookie | Where to find it |
|--------|-----------------|
| `espn_s2` | DevTools → Application → Cookies → `fantasy.espn.com` |
| `SWID` | Same place. Format: `{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}` (with curly braces) |

### Required Headers

```
Cookie: espn_s2=<value>; SWID=<value>
X-Fantasy-Source: kona
X-Fantasy-Platform: kona-PROD-m.fantasy.espn.com-android
```

`X-Fantasy-Source` and `X-Fantasy-Platform` are required — requests without them are rejected or return incomplete data.

### Notes on SWID format

ESPN stores `SWID` with curly braces in the cookie (`{ABC-123}`). In transaction payloads the `memberId` field uses the raw value with braces. In `team.owners` arrays, ESPN sometimes stores the SWID without braces — matching code must check both forms.

---

## Base URLs

| Purpose | Base URL |
|---------|----------|
| Read (private) | `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/{year}/segments/0/leagues/{leagueId}` |
| Write (private) | `https://lm-api-writes.fantasy.espn.com/apis/v3/games/fba/seasons/{year}/segments/0/leagues/{leagueId}` |
| Public scoreboard | `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard` |

- `{year}` = season year (e.g. `2026` for the 2025–26 season)
- `segments/0` = regular season segment (always 0 for regular use)

---

## Read Endpoints

### League data (roster + settings)

```
GET {READ_BASE}?view=mRoster&view=mTeam&view=mSettings
```

Returns everything needed for initial setup: all team rosters, player data, and league settings.

**Key response fields:**

```
raw.scoringPeriodId                              // current scoring period (game day number)
raw.status.finalScoringPeriod                   // last period of the season
raw.settings.rosterSettings.lineupSlotCounts    // { slotId: count } e.g. {"0":1,"1":1,...,"13":2}
raw.teams[]
  .id                                           // team ID (integer)
  .name                                         // team name (full name, may be undefined)
  .abbrev                                       // team abbreviation (e.g. "MC")
  .owners[]                                     // array of SWID strings (find your team by matching)
  .roster.entries[]
    .playerId                                   // player ID
    .lineupSlotId                               // current slot (0–13)
    .playerPoolEntry.player.fullName
    .playerPoolEntry.player.proTeamId           // NBA franchise ID (0 = no team)
    .playerPoolEntry.player.eligibleSlots[]     // slot IDs this player can fill
    .playerPoolEntry.injuryStatus               // 'ACTIVE' | 'OUT' | 'DOUBTFUL' | 'QUESTIONABLE' | 'PROBABLE'
```

**Team name quirk:** `team.location` and `team.nickname` are frequently `undefined`. Prefer `team.name` (full custom name), fall back to `team.abbrev`.

---

### Roster for a specific scoring period

```
GET {READ_BASE}?scoringPeriodId={id}&view=mRoster
```

Returns the roster state *as of that scoring period* — i.e., which slot each player occupies on that future day. Critical for knowing accurate `fromLineupSlotId` values before submitting lineup changes.

**Why this matters:** If you rely on the current-day roster state for future submissions, `fromLineupSlotId` will be stale after the first submission mutates slots. ESPN enforces exact `fromLineupSlotId` matching; a mismatch causes 400 errors on future periods.

---

### Player projection data

```
GET {READ_BASE}?view=kona_player_info
X-Fantasy-Filter: {"players":{"filterIds":{"value":[12345,67890]}}}
```

Returns detailed player stats/projections. The `X-Fantasy-Filter` header is a JSON string.

---

### Public NBA scoreboard (no auth)

```
GET https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates={YYYYMMDD}
```

No authentication required. Returns all games for a given calendar day.

**Key response fields:**

```
raw.events[]
  .competitions[0].competitors[]
    .id       // ESPN team ID (string — cast to Number)
    .team.id  // same
```

**Usage:** Fetch 60 days in parallel to build a complete schedule. If `raw.events` is empty or missing, no games that day.

---

## Write Endpoint

### Submit lineup

```
POST {WRITE_BASE}/transactions/
Content-Type: application/json
```

This is the **only write endpoint** for lineup management — used for both current-day and future-day changes.

---

## Transaction Payload

### Current period (today)

```json
{
  "isLeagueManager": false,
  "teamId": 7,
  "type": "LINEUP",
  "memberId": "{SWID-WITH-BRACES}",
  "scoringPeriodId": 126,
  "executionType": "EXECUTE",
  "items": [
    {
      "playerId": 4871145,
      "type": "LINEUP",
      "fromLineupSlotId": 11,
      "toLineupSlotId": 0
    }
  ]
}
```

### Future periods

Identical but `type` changes to `"FUTURE_ROSTER"`:

```json
{
  "isLeagueManager": false,
  "teamId": 7,
  "type": "FUTURE_ROSTER",
  "memberId": "{SWID-WITH-BRACES}",
  "scoringPeriodId": 127,
  "executionType": "EXECUTE",
  "items": [...]
}
```

### Item fields

| Field | Description |
|-------|-------------|
| `playerId` | ESPN player ID |
| `type` | Always `"LINEUP"` for lineup moves |
| `fromLineupSlotId` | The slot the player is **currently** in on ESPN's server for this period |
| `toLineupSlotId` | The slot you want to move them to |

---

## Slot ID Reference (Basketball)

| Slot | ID | Notes |
|------|----|-------|
| PG | 0 | |
| SG | 1 | |
| SF | 2 | |
| PF | 3 | |
| C | 4 | |
| G | 5 | PG/SG swing slot |
| F | 6 | SF/PF swing slot |
| UTIL | 11 | Any position eligible |
| Bench | 12 | |
| IR | 13 | |

Slot counts per league come from `settings.rosterSettings.lineupSlotCounts`. A league with 3 UTIL slots will have `{"11": 3}` and the active slot array must repeat `11` three times.

---

## Behavioral Rules (Empirically Confirmed)

### `fromLineupSlotId` must be exact

ESPN validates that `fromLineupSlotId` matches the player's actual server-side slot for that scoring period. Sending a stale value (from a previous day's state) causes a 400. Solution: fetch the roster for each target period (`?scoringPeriodId=N&view=mRoster`) before building the payload.

### No-op moves must be filtered

Sending a move where `fromLineupSlotId === toLineupSlotId` on a future period causes `TRAN_INVALID_SCORINGPERIOD_NOT_CURRENT`. Filter these out before submitting.

### IR moves are forbidden for future periods

Transactions that include moves to/from `slotId 13` (IR) are rejected when `scoringPeriodId > currentScoringPeriodId`. Only submit IR moves for the current day.

### Current-day lineup lock

Once NBA games start (or by ESPN's configured lock time), the current scoring period lineup becomes read-only. ESPN returns `400 {"messages":["Invalid Input."]}` — a generic error, not the `TRAN_LINEUP_LOCKED` code used for future-period locks. Handle both.

### FUTURE_ROSTER vs LINEUP

- `type: "LINEUP"` — current scoring period only
- `type: "FUTURE_ROSTER"` — any period after the current one

Using `"LINEUP"` for a future period or `"FUTURE_ROSTER"` for the current period causes a 400.

### Rate limiting

Submitting too fast causes throttling. A 300ms delay between submissions works reliably (~39 seconds for a full 130-day season run).

---

## Known Error Messages

| Error | Cause |
|-------|-------|
| `TRAN_LINEUP_LOCKED` | Period is locked (game in progress, past date) |
| `TRAN_INVALID_SCORINGPERIOD_NOT_CURRENT` | No-op item submitted for a future period |
| `Invalid Input` (400) | Stale `fromLineupSlotId`, wrong `type` for period, IR move on future day, or current-day lineup locked |

---

## Live Log Observations (2026-02-23 test run)

From a successful full-season run against league `1025017462`:

```
[Normalizer] public schedule: 48 dates with games, range 20260223–20260412
[Submitter] gameDays: 49 total, 48 with ≥1 NBA game
[Submitter] rosterSlots: {0:1,1:1,2:1,3:1,4:1,5:1,6:1,7:0,...,11:3,12:3,13:2,14:0}
             activeSlots: [0,1,2,3,4,5,6,11,11,11]   ← 3 UTIL slots repeated
```

- Period 126 (today): **400 Invalid Input** — current period was locked (games in progress)
- Periods 127–174 (2/24–4/12): all submitted successfully, 0 additional errors

The optimizer correctly reduced 15 raw items to 5 after no-op filtering for period 126, showing the filter works.
