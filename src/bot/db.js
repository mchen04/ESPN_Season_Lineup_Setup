import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', '..', 'bot.db');

const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS espn_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    swid TEXT,
    espn_s2 TEXT,
    league_id INTEGER,
    team_id INTEGER,
    season_year INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

/**
 * Create a new user in the bot's local database.
 * Also initializes an empty token row for the user.
 * 
 * @param {string} username 
 * @param {string} password 
 * @returns {Promise<number>} The newly created user's ID
 * @throws {Error} If the username already exists
 */
export const createUser = async (username, password) => {
  const hash = await bcrypt.hash(password, 10);
  const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
  try {
    const info = stmt.run(username, hash);
    // Initialize token row
    db.prepare('INSERT INTO espn_tokens (user_id) VALUES (?)').run(info.lastInsertRowid);
    return info.lastInsertRowid;
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error('Username already exists');
    }
    throw err;
  }
};

/**
 * Verify a user's login credentials against the hashed password.
 * 
 * @param {string} username 
 * @param {string} password 
 * @returns {Promise<number|null>} The user's ID if successful, null otherwise
 */
export const verifyUser = async (username, password) => {
  const stmt = db.prepare('SELECT id, password_hash FROM users WHERE username = ?');
  const user = stmt.get(username);
  if (!user) return null;

  const match = await bcrypt.compare(password, user.password_hash);
  return match ? user.id : null;
};

/**
 * Update the ESPN tokens and league context for a specific user.
 * 
 * @param {number} userId 
 * @param {string} swid 
 * @param {string} espnS2 
 * @param {number} leagueId 
 * @param {number} teamId 
 * @param {number} seasonYear 
 */
export const updateTokens = (userId, swid, espnS2, leagueId, teamId, seasonYear) => {
  const stmt = db.prepare(`
    UPDATE espn_tokens 
    SET swid = ?, espn_s2 = ?, league_id = ?, team_id = ?, season_year = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `);
  stmt.run(swid, espnS2, leagueId, teamId, seasonYear, userId);
};

/**
 * Retrieve the current ESPN tokens and league context for a user.
 * 
 * @param {number} userId 
 * @returns {object|undefined} {swid, espn_s2, league_id, team_id, season_year}
 */
export const getTokens = (userId) => {
  const stmt = db.prepare('SELECT swid, espn_s2, league_id, team_id, season_year FROM espn_tokens WHERE user_id = ?');
  return stmt.get(userId);
};

/**
 * Retrieve the very first registered user.
 * (Used by the cron scheduler since this operates essentially in single-user mode).
 * 
 * @returns {object|undefined} {id, username}
 */
export const getFirstUser = () => {
  const stmt = db.prepare('SELECT id, username FROM users LIMIT 1');
  return stmt.get();
};

export default db;
