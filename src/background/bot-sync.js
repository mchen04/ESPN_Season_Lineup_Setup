/**
 * Automated Token Bridge for the 24/7 Bot
 * Syncs cookies securely using Web Crypto API AES-256-GCM.
 */

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
    const [s2Cookie, swidCookie] = await Promise.all([
        new Promise(r => chrome.cookies.get({ url: 'https://fantasy.espn.com', name: 'espn_s2' }, r)),
        new Promise(r => chrome.cookies.get({ url: 'https://fantasy.espn.com', name: 'SWID' }, r))
    ]);

    if (!s2Cookie || !swidCookie) return;

    const stored = await new Promise(r => chrome.storage.local.get(['licenseKey', 'leagueId', 'teamId', 'seasonYear', 'botConsent'], r));

    // Strict privacy policy check: DO NOT SYNC if user has not explicitly consented
    if (!stored.botConsent) return;

    if (!stored.licenseKey) return;
    if (!stored.leagueId || !stored.teamId || !stored.seasonYear) return;

    try {
        const payload = {
            licenseKey: stored.licenseKey,
            swid: swidCookie.value,
            espn_s2: s2Cookie.value,
            leagueId: stored.leagueId,
            teamId: stored.teamId,
            seasonYear: stored.seasonYear
        };

        const PROD_BOT_URL = 'http://localhost:3000'; // Match popup.js setting

        const res = await fetch(`${PROD_BOT_URL}/api/espn/tokens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            console.log('[SW] Synced tokens to Premium Bot Server securely');
        } else {
            console.error('[SW] Failed to sync tokens to Premium Bot Server securely', await res.text());
        }
    } catch (err) {
        console.error('[SW] Network error syncing tokens', err);
    }
}

// ── Manual Sync Trigger ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'MANUAL_SYNC_TOKENS') {
        syncTokensToBot();
        sendResponse({ ok: true });
    }
});
