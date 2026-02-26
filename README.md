# ESPN Season Lineup Setup & 24/7 Bot

A tool that automatically sets your NBA Fantasy Basketball lineup. It operates in two modes:
1. **Chrome Extension (Manual Mode):** Submits optimal starters for **every remaining game day of the season** in one click.
2. **24/7 Bot Server (Automated Mode):** A local Node.js server that runs continuously in the background. It wakes up 5 minutes before the first game of each day and perfectly adjusts your active roster based on the absolute latest injury reports and IR assignments.

The engine uses this priority order for each day:
1. **Healthy + Has game** — always starts
2. **Injured + Has game** — starts if a healthy player can't fill the slot
3. **Healthy + No game** — benched
4. **Injured + No game** — last resort

Tiebreaker within each tier: projected points. "Injured" means **OUT only** — Doubtful/Questionable/Probable players are treated as healthy.

---

## Installation 

### Step 1 — Download the code
1. Go to **[https://github.com/mchen04/ESPN_Season_Lineup_Setup](https://github.com/mchen04/ESPN_Season_Lineup_Setup)**
2. Click the green **`<> Code`** button
3. Click **`Download ZIP`**
4. Once downloaded, **unzip the folder**.

### Step 2 — Load the Extension in Chrome
1. Open Chrome and go to: **`chrome://extensions`**
2. In the **top-right corner**, toggle on **"Developer mode"**.
3. Click **"Load unpacked"** and select the unzipped folder.

---

## Operating Mode 1: Manual Run (Chrome Extension only)

1. **Log in to ESPN** at [espn.com](https://www.espn.com) if you aren't already.
2. Navigate to your **Fantasy Basketball league page** (URL contains `leagueId=XXXXXXXX`).
3. Click the **extension icon** in your Chrome toolbar.
4. Click **"Set Season Lineup"**.
   - Wait for it to finish — a progress bar shows how many days have been submitted.
   - **Keep the popup open** until it says it's done.

*You must re-run this manually if a player returns from injury or you make a roster move.*

---

## Operating Mode 2: 24/7 Automation (Bot Server + Extension)

If you want the bot to manage your lineup continuously without your intervention, you can run the local Bot Server.

### 1. Start the Bot Server
You must have Node.js installed. Open a terminal in the project folder:
1. Copy `.env.example` to a new file named `.env`.
2. Open `.env` and set a secure sequence for `BOT_SECRET_KEY` (e.g., a long random password).
3. Install dependencies and start the server:
```bash
npm install
npm start
```
The server runs on `http://localhost:3000` by default. Note: This terminal must stay open (or you can use a process manager like `pm2`) for the bot to run daily.

### 2. Connect the Extension
Because ESPN logins are highly protected, the bot cannot log itself in. Instead, the Chrome Extension acts as a secure bridge:
1. Open the Chrome Extension popup.
2. Under **"24/7 Bot Synchronizer"**, enter your bot server URL (or leave default `http://localhost:3000`).
3. Enter your assigned `licenseKey` into the "License Key" field and check the consent box. Click **Sync to Premium**.
4. Important: Every time you visit or log in to `fantasy.espn.com`, the extension will securely capture your session cookies and send them to the associated premium bot server, provided consent is granted.

As long as the local Bot Server is running and has received your latest tokens from the extension, it will automatically handle your lineup every day!

---

## Frequently asked questions

**Will it mess up my IR slots?**
No. It reads your current IR assignments and keeps injured players (status = OUT) in IR. It will not move a healthy player to IR or pull an injured player off IR on future days. (The 24/7 Bot *will* dynamically move players in and out of IR just before game time if their status changes that day).

**Does it work for private leagues?**
Yes, as long as you're logged in to ESPN in Chrome. 

**Why does Chrome say the extension is unverified?**
Because it isn't published on the Chrome Web Store. The extension only communicates with ESPN's servers and your local Bot Server.

## Privacy & Security

This tool runs locally on your machine. It securely reads your ESPN login cookies to authenticate API requests and does not send your data to any third-party servers without explicit consent. 
Local traffic between the Chrome Extension and the Bot Server relies on the local network (or HTTPS if configured on a remote server). An explicit privacy consent checkbox is required before the extension will sync any tokens.
