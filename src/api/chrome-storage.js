/**
 * Thin Promise wrappers over chrome.storage.local so callers can use async/await
 * consistently. Both reject on chrome.runtime.lastError (via chromePromise) so a
 * genuine storage failure surfaces to the caller.
 */
import { chromePromise } from './chrome-utils.js';

export function getStorage(keys) {
  return chromePromise(cb => chrome.storage.local.get(keys, cb));
}

export function setStorage(items) {
  return chromePromise(cb => chrome.storage.local.set(items, cb));
}
