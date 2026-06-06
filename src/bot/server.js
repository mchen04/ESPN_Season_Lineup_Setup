import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import fs from 'fs';
import { startScheduler } from './scheduler.js';
import { STATE_FILE_PATH, serializeState } from './config.js';

dotenv.config();

const app = express();
app.use(express.json());

// ── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet());

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || origin.startsWith('chrome-extension://')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));

// ── Endpoints ────────────────────────────────────────────────────────────────

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' }
});

// Apply rate limiting specifically to ESPN and Auth endpoints
app.use('/api/espn', apiLimiter);
app.use('/api/auth', apiLimiter);

// ── API Endpoints ──────────────────────────────────────────────────────────

/**
 * POST /api/espn/tokens
 * Receives ESPN session tokens from the Chrome extension background worker over local HTTP (loopback, default port 3000).
 */
app.post('/api/espn/tokens', (req, res) => {
    try {
        const { swid, espn_s2, leagueId, teamId, seasonYear } = req.body;

        if (!swid || !espn_s2 || !leagueId || !teamId || !seasonYear) {
            return res.status(400).json({ error: 'Missing required ESPN data fields in payload' });
        }

        const nextState = serializeState({ swid, espn_s2, leagueId, teamId, seasonYear });
        fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(nextState, null, 2), 'utf8');

        console.log(`[Bot Server] Successfully received and stored ESPN tokens.`);
        res.json({ success: true });
    } catch (err) {
        console.error('[Bot Server] Token update failed:', err.message);
        res.status(500).json({ error: 'Failed to save tokens' });
    }
});

/**
 * POST /api/auth/verify
 * Validates a premium license key for the popup before it enables token sync.
 */
app.post('/api/auth/verify', (req, res) => {
    const { licenseKey } = req.body;
    if (!licenseKey) {
        return res.status(400).json({ error: 'Missing license key' });
    }
    // Optional allowlist: when VALID_LICENSE_KEYS is set, only those keys pass.
    // TODO: replace with a real license backend. With no allowlist configured,
    // any non-empty key activates the single-user local bot.
    const allowed = (process.env.VALID_LICENSE_KEYS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (allowed.length && !allowed.includes(licenseKey)) {
        return res.status(403).json({ error: 'Invalid license key' });
    }
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;

// Global error handler — JSON shape matching the rest of the API, real status
// when the error carries one (e.g. malformed-body 400). Registered last.
app.use((err, req, res, next) => {
    console.error("Express Global Error:", err);
    res.status(err.status || 500).json({ error: err.message });
});

// Bind to loopback only: the sole client is the local Chrome extension
// (BOT_URL = http://localhost:3000). This keeps the token endpoints off the LAN.
app.listen(PORT, '127.0.0.1', () => {
    console.log(`[Bot Server] Server started on http://127.0.0.1:${PORT}`);
    startScheduler();
});
