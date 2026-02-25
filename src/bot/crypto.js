import crypto from 'crypto';

let botSecret = null;

export function initCrypto(secretKey) {
    if (!secretKey || secretKey.length < 32) {
        throw new Error('BOT_SECRET_KEY is missing or too short. Please use a secure 32+ character key.');
    }
    botSecret = String(secretKey);
}

/**
 * Decrypts an AES-256-GCM encrypted payload.
 */
export function decryptPayload(encryptedData) {
    if (!botSecret) throw new Error('Crypto module not initialized with a secret key.');
    if (!encryptedData.salt) throw new Error('Missing salt for key derivation.');

    try {
        const salt = Buffer.from(encryptedData.salt, 'hex');
        const iv = Buffer.from(encryptedData.iv, 'hex');
        const authTag = Buffer.from(encryptedData.authTag, 'hex');
        const ciphertext = Buffer.from(encryptedData.ciphertext, 'hex');

        const keyBuffer = crypto.pbkdf2Sync(botSecret, salt, 300000, 32, 'sha256');

        const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch (err) {
        throw new Error('Decryption failed. Invalid key or corrupted payload.');
    }
}
