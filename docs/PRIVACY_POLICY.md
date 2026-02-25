# Privacy Policy

**Effective Date:** January 1, 2024

This Privacy Policy describes how the "ESPN Season Lineup Setup" Chrome Extension ("we," "our," or "the Extension") collects, uses, and protects your information.

## 1. Information We Collect
To provide automated fantasy basketball lineup management, the Extension collects the following authentication cookies from your active session on `fantasy.espn.com`:
- `espn_s2`: Your ESPN active session token.
- `SWID`: Your static unique ESPN account identifier.

## 2. How We Use the Information
The sole purpose of collecting these cookies is to authenticate our 24/7 automated companion server with the ESPN Fantasy API on your behalf.
- This allows our servers to fetch your latest roster, check injury reports, and submit optimal lineups just before game tip-offs without requiring your browser to remain open.
- The cookies are **not** used for tracking, advertising, or compiling personal profiles.

## 3. Data Transmission and Security
All cookie data is handled with strict security measures:
- **AES-256-GCM Encryption:** Before any data leaves your browser, the `espn_s2` and `SWID` cookies are strongly encrypted using an AES-256-GCM cipher with a secret key that you exclusively provide and configure.
- **Secure Transport:** The encrypted payload is transmitted to your configured companion server endpoint exclusively via HTTPS.
- **Prominent Disclosure & Consent:** The Extension explicitly prompts you for consent before initiating any data transmission. No cookies are sent to any server until you manually check the "Privacy Consent" box and save your settings within the extension popup.

## 4. Third-Party Sharing
We do **not** sell, trade, or otherwise transfer your cookies or any personal data to outside parties, data brokers, or advertising networks. Your data is sent *only* to the specific server URL you manually input in the extension's settings.

## 5. Your Consent
By checking the Privacy Consent toggle in the Extension UI, you explicitly consent to the encryption and transmission of your ESPN session tokens to your designated server for the purpose of 24/7 lineup management.

## 6. How to Revoke Consent
You can revoke your consent at any time by:
1. Unchecking the "Privacy Consent" box in the extension popup.
2. Uninstalling the extension.
3. Logging out of `espn.com` directly, which immediately invalidates your active `espn_s2` session cookie on all servers.

## 7. Contact
If you have questions about this privacy policy, please open an issue in the project repository or contact the developer directly.
