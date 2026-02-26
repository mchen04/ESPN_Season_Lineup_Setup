import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { startScheduler } from './scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE_PATH = path.resolve(__dirname, '../../state.json');

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

// ── API Endpoints ──────────────────────────────────────────────────────────

/**
 * POST /api/espn/tokens
 * Receives ESPN session tokens via strictly HTTPS from the Chrome Extension background worker.
 */
app.post('/api/espn/tokens', (req, res) => {
    try {
        const { swid, espn_s2, leagueId, teamId, seasonYear } = req.body;

        if (!swid || !espn_s2 || !leagueId || !teamId || !seasonYear) {
            return res.status(400).json({ error: 'Missing required ESPN data fields in payload' });
        }

        const nextState = {
            swid,
            espn_s2,
            league_id: leagueId,
            team_id: teamId,
            season_year: seasonYear,
            updated_at: new Date().toISOString()
        };

        fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(nextState, null, 2), 'utf8');

        console.log(`[Bot Server] Successfully received and stored ESPN tokens.`);
        res.json({ success: true });
    } catch (err) {
        console.error('[Bot Server] Token update failed:', err.message);
        res.status(500).json({ error: 'Failed to save tokens' });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`[Bot Server] Server started on port ${PORT}`);
    startScheduler();
});

app.use((err, req, res, next) => {
    console.error("Express Global Error:", err);
    res.status(500).send("Error: " + err.message);
});
