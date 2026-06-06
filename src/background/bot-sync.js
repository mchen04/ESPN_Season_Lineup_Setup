/**
 * Automated token bridge for the local 24/7 bot.
 * Forwards ESPN session cookies to the bot server whenever they change, but only
 * after the user has explicitly consented and saved a license key.
 */

import { BOT_URL } from '../config.js';
import { getESPNAuthCookies } from '../api/chrome-cookies.js';
import { getStorage } from '../api/chrome-storage.js';

chrome.cookies.onChanged.addListener(async (changeInfo) => {
    const { cookie, removed } = changeInfo;
    if (removed || !cookie.domain.includes('fantasy.espn.com')) return;
    if (cookie.name !== 'espn_s2' && cookie.name !== 'SWID') return;

    syncTokensToBot();
});

/**
 * Main syncing function to bridge local Chrome cookies exactly into the 24/7 Bot Server.
 */
export async function syncTokensToBot() {
    let s2Cookie, swidCookie;
    try {
        ({ s2Cookie, swidCookie } = await getESPNAuthCookies());
    } catch {
        return; // cookie read failed (e.g. permissions) — silent on the background path
    }
    if (!s2Cookie || !swidCookie) return;

    let stored;
    try {
        stored = await getStorage(['licenseKey', 'leagueId', 'teamId', 'seasonYear', 'botConsent']);
    } catch {
        return; // storage read failed — silent on the background path
    }

    // Privacy gate: never sync without explicit consent.
    if (!stored.botConsent) return;
    if (!stored.licenseKey || !stored.leagueId || !stored.teamId || !stored.seasonYear) return;

    try {
        const payload = {
            swid: swidCookie.value,
            espn_s2: s2Cookie.value,
            leagueId: stored.leagueId,
            teamId: stored.teamId,
            seasonYear: stored.seasonYear
        };

        const res = await fetch(`${BOT_URL}/api/espn/tokens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            console.error('[SW] Failed to sync tokens to bot server', await res.text());
        }
    } catch (err) {
        console.error('[SW] Network error syncing tokens', err);
    }
}
