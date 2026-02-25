import express from 'express';
import cors from 'cors';
import { createUser, verifyUser, updateTokens } from './db.js';
import { startScheduler } from './scheduler.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors()); // Allow requests from the extension

// ── Middleware ───────────────────────────────────────────────────────────────
/**
 * Express middleware to authenticate bot API requests using Basic Auth.
 * Parses the Authorization header, validates credentials via DB, and attaches `req.userId`.
 */
const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const [username, password] = credentials.split(':');

    try {
        const userId = await verifyUser(username, password);
        if (!userId) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        req.userId = userId;
        next();
    } catch (err) {
        res.status(500).json({ error: 'Authentication error' });
    }
};

// ── Endpoints ────────────────────────────────────────────────────────────────
/**
 * POST /api/auth/register
 * Registers a new user for the local bot database.
 */
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    try {
        await createUser(username, password);
        res.json({ success: true, message: 'User registered successfully' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

/**
 * POST /api/auth/login
 * Validates credentials via `authenticate` middleware. Extension uses this to verify connection.
 */
app.post('/api/auth/login', authenticate, (req, res) => {
    res.json({ success: true, message: 'Authenticated successfully' });
});

/**
 * POST /api/espn/tokens
 * Receives actively captured ESPN session tokens from the Chrome Extension background worker.
 * Updates the user's tokens and league identifiers durably.
 */
app.post('/api/espn/tokens', authenticate, (req, res) => {
    const { swid, espn_s2, leagueId, teamId, seasonYear } = req.body;
    if (!swid || !espn_s2 || !leagueId || !teamId || !seasonYear) {
        return res.status(400).json({ error: 'Missing required ESPN data fields' });
    }

    try {
        updateTokens(req.userId, swid, espn_s2, leagueId, teamId, seasonYear);
        console.log(`[Bot Server] Successfully received and updated ESPN tokens for user ${req.userId}`);
        res.json({ success: true });
    } catch (err) {
        console.error('[Bot Server] Error updating tokens:', err);
        res.status(500).json({ error: 'Failed to update tokens' });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`[Bot Server] Server listening on port ${PORT}`);
    // Start the background schedule after the server boots
    startScheduler();
});
