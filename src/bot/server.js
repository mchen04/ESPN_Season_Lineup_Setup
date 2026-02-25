import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { updateTokens } from './store.js';
import { startScheduler } from './scheduler.js';

dotenv.config();

const app = express();
app.use(express.json());

// ── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet()); // Sets secure HTTP headers automatically

// Strict CORS: Only allow requests originating from a Chrome Extension
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || origin.startsWith('chrome-extension://')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));

// Rate Limiting: Prevent brute-force spamming of the auth/token endpoints
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);

// ── Crypto Utilities ─────────────────────────────────────────────────────────
const BOT_SECRET_KEY = process.env.BOT_SECRET_KEY;

if (!BOT_SECRET_KEY || BOT_SECRET_KEY.length < 32) {
    console.error('CRITICAL WARNING: BOT_SECRET_KEY is missing or too short in .env file.');
    console.error('Please generate a secure 32+ character key and restart the server.');
    process.exit(1);
}

// Convert string key to exactly 32 bytes for AES-256
const keyBuffer = crypto.createHash('sha256').update(String(BOT_SECRET_KEY)).digest();

/**
 * Decrypts an AES-256-GCM encrypted payload.
 */
function decryptPayload(encryptedData) {
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

// ── Endpoints ────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/verify
 * Allows the extension to ping the server with an encrypted test payload to verify the secret key.
 */
app.post('/api/auth/verify', (req, res) => {
    try {
        const payload = decryptPayload(req.body);
        if (payload && payload.ping === 'pong') {
            return res.json({ success: true, message: 'Authenticated successfully' });
        }
        res.status(401).json({ error: 'Invalid payload content' });
    } catch (err) {
        res.status(401).json({ error: 'Invalid secret key or decryption failed' });
    }
});

/**
 * POST /api/espn/tokens
 * Receives AES-GCM encrypted ESPN session tokens from the Chrome Extension background worker.
 */
app.post('/api/espn/tokens', (req, res) => {
    try {
        const payload = decryptPayload(req.body);

        const { swid, espn_s2, leagueId, teamId, seasonYear } = payload;
        if (!swid || !espn_s2 || !leagueId || !teamId || !seasonYear) {
            return res.status(400).json({ error: 'Missing required ESPN data fields in payload' });
        }

        updateTokens(swid, espn_s2, leagueId, teamId, seasonYear);
        console.log(`[Bot Server] Successfully received and securely decrypted ESPN tokens.`);
        res.json({ success: true });
    } catch (err) {
        console.error('[Bot Server] Token update failed:', err.message);
        res.status(401).json({ error: 'Failed to securely read tokens' });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`[Bot Server] Security hardened server listening on port ${PORT}`);
    // Start the background schedule after the server boots
    startScheduler();
});
