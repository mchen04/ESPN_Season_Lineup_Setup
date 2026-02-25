# 24/7 Fantasy Basketball Bot Architecture

## Overview
This document outlines the architecture for a standalone 24/7 Node.js bot that autonomously sets ESPN fantasy basketball lineups right before tip-off. Unlike a Chrome extension, this bot runs continuously on a server, evaluating injuries and roster moves exactly when games are about to start.

## Hosting & Platform
The bot must be hosted on an always-on environment to ensure high-precision scheduling (e.g., executing exactly 5 minutes before a game starts).
- **Primary Recommendation: Oracle Cloud "Always Free" VPS** (Ubuntu Linux, up to 24GB RAM, ARM). structurally ignores scaling scale-to-zero "sleep" mechanics.
- **Alternative:** Any low-cost ($5/mo) traditional VPS like DigitalOcean or Hetzner, or a permanently-on local Raspberry Pi.

*Note: Avoid GitHub Actions or "Serverless" free tiers (like Render or Koyeb), as they spin down under inactivity and may miss exact tip-off schedules due to cold-start delays.*

## Authentication (The Session Problem)
Since the bot runs on a headless server, it cannot "log in" through the normal ESPN website UI (which uses complex, heavily bot-protected login flows).

### How ESPN Auth Works
ESPN API requests require two specific cookies and two custom headers:
1. **Cookies**:
   - `SWID`: A static unique identifier for your account (must include the `{}` braces, e.g., `{ABC-123}`). This rarely changes.
   - `espn_s2`: A session token. This proves you are currently authenticated.
2. **Headers**:
   - `X-Fantasy-Source: kona`
   - `X-Fantasy-Platform: kona-PROD-m.fantasy.espn.com-android`
   *(Without these headers, private API requests will be rejected.)*

### How the Bot Authenticates: The Secure Token Bridge
Because the login flow is too difficult to automate reliably, the standard approach for headless ESPN bots used to be manual token injection. We avoid this by implementing an **Automated Secure Token Bridge**:

1. **The Extension Observer:** The Chrome extension runs in the background and observes cookies on the `fantasy.espn.com` domain.
2. **Token Capture:** Whenever you log into ESPN Fantasy on your normal desktop browser, the extension automatically captures the active `espn_s2` and `SWID` cookies.
3. **AES-256 Encryption:** The extension uses the Web Crypto API to encrypt these tokens using `AES-256-GCM` and a user-provided `BOT_SECRET_KEY`.
4. **Secure Transmission:** The extension sends the encrypted ciphertext to a strict CORS-protected endpoint on the 24/7 Bot server (`POST /api/espn/tokens`).
5. **Server Storage:** The bot server natively decrypts the payload using the same `.env` secret key and gracefully updates its persistent storage (a local `state.json` file) to keep its API requests authenticated seamlessly.

### Token Expiration Handling
**The Catch:** The `espn_s2` cookie will eventually expire (often lasting several months, but forced logouts happen).
- If ESPN forces a logout or the token expires naturally, the bot's API requests will start failing (returning `HTTP 401 Unauthorized`).
- **Resolution:** By simply re-logging into ESPN on your desktop browser (with the extension active), the new tokens are instantly captured, encrypted, and piped to the server, silently reviving the headless bot without any manual server intervention or restarts.

## Core Loop & Scheduling

The bot requires two layers of scheduling to handle dynamic game times:

### 1. The Daily Master Scheduler
Runs exactly when the new fantasy day rolls over (e.g., 12:01 AM PST / 3:01 AM EST) using `node-schedule` or `node-cron`.
- **Action:** Calls `fetchNBADayScoreboard` for the current date.
- **Purpose:** Identifies all NBA games scheduled for that day and finds the **earliest game start time**.

### 2. The Daily Lineup Optimizer
Within the Daily Master Scheduler loop, the bot schedules a single, high-priority execution for the entire day.
- **Trigger:** scheduled for `(Earliest Game Start Time) - 5 minutes`.
- **Action:**
  1. Fetch current live roster and injury states via `fetchPlayers`.
  2. Run `optimizeLineup` to determine if injured or healthy players need to be swapped, **explicitly moving players in and out of IR slots based on late injury updates** to maximize the active daily lineup.
  3. Call `submitLineup` to lock the optimized roster for the start of the day's games.

## Server Technology Stack (Node.js)
To seamlessly reuse the existing Chrome Extension's scraping logic, the server should be built with:
- **Runtime:** `Node.js` (Allows sharing of `src/api` and `src/core` modules).
- **Web Server:** `express` (Exposes the `POST /api/espn/tokens` endpoint for the token bridge).
- **Security Middleware:** `helmet` and `express-rate-limit` (To protect against local sniffing and brute-force).
- **Scheduler:** `node-schedule` (For precise, dynamic cron triggers).
- **Persistent Storage:** Native `fs` writing to a local `state.json` (For lightweight storage of tokens without managing a database server).
- **Process Manager:** `pm2` (To daemonize the application and ensure 24/7 uptime if the Node process crashes).
- **Other:** `dotenv`.
