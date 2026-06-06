/**
 * Reads the ESPN auth cookies (espn_s2 + SWID) from the fantasy.espn.com domain.
 * Shared by the popup (interactive auth) and the background token bridge.
 *
 * Rejects on chrome.runtime.lastError so the interactive caller can surface it;
 * the background caller wraps this in try/catch and returns early on any failure.
 *
 * @returns {Promise<{ s2Cookie: object|null, swidCookie: object|null }>}
 */
import { chromePromise } from './chrome-utils.js';

export function getESPNAuthCookies() {
  const get = name => chromePromise(cb => chrome.cookies.get({ url: 'https://fantasy.espn.com', name }, cb));
  return Promise.all([get('espn_s2'), get('SWID')])
    .then(([s2Cookie, swidCookie]) => ({ s2Cookie, swidCookie }));
}
