# ESPN Season Lineup Setup — Product Spec

## Overview

A Google Chrome Extension that performs a **one-time bulk lineup setup** for an entire ESPN Fantasy Basketball season. Think of ESPN's "Quick Lineup" feature, but instead of optimizing just the current week, it submits optimal starters for **every remaining game day of the season** in a single click.

The tool is smarter than ESPN's built-in Quick Lineup in one critical way: it **accounts for injured players' expected return dates** and pre-fills them into starting slots from that date forward, rather than ignoring them entirely.

---

## Problem with ESPN's Quick Lineup

ESPN's Quick Lineup:
- Skips injured players entirely — won't roster them even if they're coming back soon
- Doesn't look ahead — only handles the current week
- Doesn't account for IR slot strategy when multiple players are injured

This leaves value on the table. A player expected back in 3 days should be pre-slotted as a starter for the rest of the season from day 3 onward.

---

## Core Features

### 1. Season-Wide Lineup Submission
- On run, the extension reads the user's ESPN roster and the full NBA schedule
- For every remaining game day of the season, it determines the optimal starting lineup
- It bulk-submits all of those lineup decisions to ESPN (via ESPN's private fantasy API)
- This is a **one-time setup** — run once, done for the season
- User can **re-run at any time** to refresh (e.g., after a trade, pickup, or player return from injury)

### 2. Start/Bench Decision Logic (Priority Order)

For each game day, the extension fills active roster slots using this priority:

1. **Healthy + has a game** — best option, always preferred
2. **Injured + has a game** — some chance of scoring beats a guaranteed 0 from a rest day
3. **Healthy + no game** — no points but available if nothing better
4. **Injured + no game** — last resort

Within each tier, rank by **projected points / season averages**.

> Return dates are NOT used in lineup decisions. Injured return dates get pushed back constantly and can't be trusted. Injury status is treated as a binary: injured or healthy.

### 3. IR Slot Strategy

When the user has multiple injured players but limited IR slots:

- **Latest expected return date → IR slot**
  - The player who will be out the longest occupies the IR slot
  - This keeps an active roster spot free for shorter-term injured players
  - Shorter-term injured players sit on the active bench (benched, but pre-slotted as starters once their return date passes)

Example: 3 players injured, 1 IR slot, return dates are Jan 10, Feb 1, Mar 15:
- Mar 15 player → IR
- Feb 1 player → active bench (starts in lineup from Feb 1 onward)
- Jan 10 player → active bench (starts in lineup from Jan 10 onward)

### 4. Re-Run Anytime
- The extension can be re-run at any point in the season
- Re-running overwrites all future lineup submissions with freshly optimized decisions
- Use case: player returns from injury and is now healthy, trade happens, new pickup added

---

## Lineup Slot Filling Rules

Standard ESPN NBA roster slots: `PG, SG, SF, PF, C, G, F, UTIL, Bench×N, IR×N`

Filling logic per game day:
1. For each active slot (PG, SG, SF, PF, C, G, F, UTIL), find the best eligible player
2. Rank candidates for each slot by priority tier (healthy+game > injured+game > healthy+no game > injured+no game), then by projected points within each tier
5. Fill bench slots with remaining rostered players

---

## Data Sources (ESPN Unofficial API)

The extension pulls all data from ESPN's private fantasy API (same endpoints ESPN's own app uses):

| Data | ESPN Endpoint |
|------|--------------|
| User's roster | `fantasy.espn.com` league roster endpoint |
| Player injury status | ESPN player data (injury flag + estimated return) |
| Player projections | ESPN projected stats / season averages |
| NBA game schedule | ESPN schedule API |
| Lineup submission | ESPN fantasy lineup set endpoint |

The extension runs authenticated as the logged-in user (uses existing ESPN session cookies), so no separate login is needed.

---

## League Configuration

- **Scoring type**: Points league (each stat worth a set point value)
- Optimization goal: maximize total projected points in active slots across all game days

---

## User Flow

1. User opens their ESPN Fantasy Basketball league in Chrome
2. User clicks the extension icon
3. Extension shows a preview:
   - Current injured players and proposed IR assignment
   - Summary of how many game days will be submitted
4. User clicks **"Set Season Lineup"**
5. Extension bulk-submits lineup for every remaining game day
6. Confirmation shown: "X lineup days submitted"

---

## Edge Cases & Constraints

| Scenario | Behavior |
|----------|----------|
| Player return date unknown | Treat as indefinitely injured — skip for all future dates |
| Multiple players eligible for same slot | Higher projected points wins |
| Only injured players at a position | Leave the slot empty / bench — never start an injured player |
| All IR slots full | Put longest-out player in the furthest IR slot; if no IR slot available, injured player stays on bench (benched for all dates until return) |
| Re-run mid-season | Overwrites only future dates; past submissions untouched |
| Player on waivers / dropped | Not on roster, not considered |

---

## Out of Scope (v1)

- Opponent matchup/defense adjustments
- Trade recommendations
- Waiver wire suggestions
- Notification/alerts when a player returns
- Auto-triggered re-optimization (one-time manual setup only)
- Support for leagues other than points format
