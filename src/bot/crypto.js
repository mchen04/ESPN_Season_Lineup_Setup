import crypto from 'crypto';

let keyBuffer = null;

export function initCrypto(secretKey) {
    if (!secretKey || secretKey.length < 32) {
        throw new Error('BOT_SECRET_KEY is missing or too short. Please use a secure 32+ character key.');
    }
    // Convert string key to exactly 32 bytes for AES-256
    keyBuffer = crypto.createHash('sha256').update(String(secretKey)).digest();
}

/**
 * Decrypts an AES-256-GCM encrypted payload.
 */
export function decryptPayload(encryptedData) {
    if (!keyBuffer) throw new Error('Crypto module not initialized with a secret key.');

    try {
        const iv = Buffer.from(encryptedData.iv, 'hex');
        const authTag = Buffer.from(encryptedData.authTag, 'hex');
        const ciphertext = Buffer.from(encryptedData.ciphertext, 'hex');

        const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch (err) {
        throw new Error('Decryption failed. Invalid key or corrupted payload.');
    }
}
