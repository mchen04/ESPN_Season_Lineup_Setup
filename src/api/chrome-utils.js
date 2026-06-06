/**
 * Wrap a callback-style Chrome extension API in a Promise, rejecting on
 * chrome.runtime.lastError. `fn` receives the node-style callback to hand to the API.
 *
 * Example: chromePromise(cb => chrome.storage.local.get(keys, cb))
 */
export function chromePromise(fn) {
  return new Promise((resolve, reject) => {
    fn(result => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(result);
    });
  });
}
