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

    const stored = await new Promise(r => chrome.storage.local.get(['botUrl', 'botSecret', 'leagueId', 'teamId', 'seasonYear'], r));
    if (!stored.botUrl || !stored.botSecret) return;
    if (!stored.leagueId || !stored.teamId || !stored.seasonYear) return;

    try {
        const payload = JSON.stringify({
            swid: swidCookie.value,
            espn_s2: s2Cookie.value,
            leagueId: stored.leagueId,
            teamId: stored.teamId,
            seasonYear: stored.seasonYear
        });

        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.digest('SHA-256', enc.encode(stored.botSecret));
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyMaterial,
            { name: 'AES-GCM' },
            false,
            ['encrypt']
        );

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encryptedBuffer = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            cryptoKey,
            enc.encode(payload)
        );

        const encryptedBytes = new Uint8Array(encryptedBuffer);
        const ciphertext = encryptedBytes.slice(0, -16);
        const authTag = encryptedBytes.slice(-16);

        const securePayload = {
            iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
            ciphertext: Array.from(ciphertext).map(b => b.toString(16).padStart(2, '0')).join(''),
            authTag: Array.from(authTag).map(b => b.toString(16).padStart(2, '0')).join(''),
        };

        const res = await fetch(`${stored.botUrl}/api/espn/tokens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(securePayload)
        });

        if (res.ok) {
            console.log('[SW] Synced tokens to Bot securely');
        } else {
            console.error('[SW] Failed to sync tokens securely', await res.text());
        }
    } catch (err) {
        console.error('[SW] Encryption or network error syncing tokens', err);
    }
}
