# ESPN Season Lineup Setup

A Chrome extension that automatically sets your NBA Fantasy Basketball lineup for **every remaining game day of the season** in one click.

It uses this priority order for each day:
1. **Healthy + Has game** — always starts
2. **Injured + Has game** — starts if a healthy player can't fill the slot
3. **Healthy + No game** — benched
4. **Injured + No game** — last resort

Tiebreaker within each tier: projected points. "Injured" means **OUT only** — Doubtful/Questionable/Probable players are treated as healthy.

---

## Requirements

- **Google Chrome** (or any Chromium browser like Brave, Edge)
- An **ESPN Fantasy Basketball** account
- A **public or private league** — you must be a member with an active roster

---

## Installation (no coding required)

### Step 1 — Download the extension

1. Go to **[https://github.com/mchen04/ESPN_Season_Lineup_Setup](https://github.com/mchen04/ESPN_Season_Lineup_Setup)**
2. Click the green **`<> Code`** button
3. Click **`Download ZIP`**
4. Once downloaded, **unzip the folder** (double-click the `.zip` file)
   - On Mac: it extracts automatically to the same folder
   - On Windows: right-click → "Extract All"
5. Remember where you saved the unzipped folder — you'll need it in Step 3

### Step 2 — Enable Developer Mode in Chrome

1. Open Chrome and go to: **`chrome://extensions`**
   (paste that directly into the address bar and press Enter)
2. In the **top-right corner**, toggle on **"Developer mode"**

   ![Developer mode toggle in top-right of chrome://extensions](https://i.imgur.com/placeholder-devmode.png)

### Step 3 — Load the extension

1. Click **"Load unpacked"** (appears after enabling Developer mode)
2. A file picker opens — navigate to the unzipped folder you saved in Step 1
3. Select the folder (the one that contains `manifest.json`) and click **Open**
4. The extension appears in your list — you should see **"ESPN Season Lineup Setup"**

### Step 4 — Pin the extension (optional but recommended)

1. Click the **puzzle piece icon** (🧩) in the Chrome toolbar
2. Find **ESPN Season Lineup Setup** and click the **pin icon** next to it
3. The extension icon now appears permanently in your toolbar

---

## How to use it

### Each time you want to set your lineup:

1. **Log in to ESPN** at [espn.com](https://www.espn.com) if you aren't already
2. Navigate to your **Fantasy Basketball league page** — the URL should look like:
   ```
   https://fantasy.espn.com/basketball/league?leagueId=XXXXXXXX
   ```
3. Click the **extension icon** in your Chrome toolbar
4. A popup appears — it will show:
   - Your team name
   - How many game days are left in the season
   - Which players are being assigned to IR slots (if any)
5. Click **"Set Season Lineup"**
6. Wait for it to finish — a progress bar shows how many days have been submitted
   - This takes about 30–60 seconds for a full season
   - **Keep the popup open** until it says it's done
7. When complete, you'll see how many days were submitted and how many were already optimal

That's it — your lineup is set for the rest of the season!

---

## Frequently asked questions

**Do I need to run this every day?**
No — that's the point. Run it once and it sets every remaining day automatically.

**Will it mess up my IR slots?**
No. It reads your current IR assignments and keeps injured players (status = OUT) in IR. It will not move a healthy player to IR or pull an injured player off IR on future days.

**What if I make a trade or pick up a player?**
Re-run the extension after any roster change. Click the extension icon and hit **"Set Season Lineup"** again — it recalculates everything from today forward.

**Does it work for private leagues?**
Yes, as long as you're logged in to ESPN in Chrome. The extension reads your ESPN login cookies directly from the browser.

**Why does Chrome say the extension is unverified?**
Because it isn't published on the Chrome Web Store — you loaded it directly. This is normal for personal tools. The extension only communicates with ESPN's own servers.

**The popup shows an error — what do I do?**
- Make sure you're on your league page (URL contains `leagueId=`)
- Make sure you're logged in to ESPN
- Try refreshing the league page, then click the extension icon again

---

## Updating the extension

When a new version is released on GitHub:

1. Download the new ZIP and unzip it (same as Step 1)
2. Go to `chrome://extensions`
3. Find ESPN Season Lineup Setup and click the **refresh icon** (↺), or
4. Click **"Remove"**, then repeat Step 3 with the new folder

---

## Privacy

This extension runs entirely in your browser. It:
- Reads your ESPN login cookies to authenticate API requests
- Communicates only with ESPN's fantasy API servers
- Does not collect, store, or send your data anywhere else
