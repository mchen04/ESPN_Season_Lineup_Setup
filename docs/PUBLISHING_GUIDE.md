# Chrome Web Store Publishing Guide

If you intend to publish this extension to the Google Chrome Web Store, you must carefully justify the requested permissions and provide clear disclosures to pass the review process, especially because the extension securely transmits user session cookies (`espn_s2`).

When submitting your extension in the Google Chrome Developer Dashboard, use the guidelines below to fill out the "Privacy Options" and "Permissions Justification" sections.

## 1. Permissions Justification

Your `manifest.json` requests several sensitive permissions. You must exactly describe *why* they are needed for the core functionality of the extension.

### `cookies`
**Justification:** The extension acts as a secure bridge for a 24/7 automated companion bot. It requires the `cookies` permission to read the `espn_s2` and `SWID` tokens from `fantasy.espn.com`. These tokens are securely transmitted to the user's companion server so the server can authenticate API requests to set the user's fantasy basketball lineups continuously.

### `tabs`
**Justification:** The `tabs` permission is used to identify when the user is actively viewing their ESPN Fantasy Basketball league page. This allows the extension to dynamically extract the `leagueId` from the active tab's URL without requiring manual user input. It is also used to optionally reload the active ESPN tab after the extension successfully completes a manual lineup submission so the user can immediately see the updated UI.

### `storage`
**Justification:** The `storage` permission (`chrome.storage.local`) is required to persistently save the user's local configuration, which includes their companion Server URL, their secret encryption key, and their explicit privacy consent flag.

### Host Permissions (`*://*.espn.com/*` or similar)
**Justification:** The extension must make cross-origin `fetch` requests directly to ESPN's Hidden APIs (e.g., `lm-api-reads.fantasy.espn.com` and `lm-api-writes.fantasy.espn.com`) to evaluate rosters and submit lineups when the user clicks "Set Season Lineup" in the popup UI.

---

## 2. Prominent Disclosure Requirements

As per Chrome Web Store policies in 2024, if you handle personal or sensitive data (like user session cookies), you must present a **Prominent Disclosure** inside the extension's UI.

**Status:** ✅ **Already Implemented.** 
The popup UI features a dedicated consent checkbox that explicitly reads: 
*"Privacy Consent: This extension securely encrypts and sends your ESPN session tokens to our servers to manage your lineups 24/7."*
The extension **will not** transmit the payloads to the background service worker or the external server until this box is checked.

---

## 3. Privacy Policy

You must provide a URL to a valid Privacy Policy on the Chrome Web Store dashboard. 
- You can host the provided `docs/PRIVACY_POLICY.md` on a free service like GitHub Pages or a Notion public link.
- Ensure the URL is accessible without a login.

---

## 4. HTTPS Enforced

You must ensure that any server you host the Node.js companion bot on uses an SSL certificate (HTTPS). 
- The Chrome Extension will throw a visual error if the user attempts to input an `http://` URL (unless it is `localhost` for local testing).
- This is a strict requirement for the Chrome Web Store reviewer.
