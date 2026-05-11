//db/turso.js
const { createClient } = require("@libsql/client");

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initializeTables() {
  try {
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL,
        avg_posture_score REAL DEFAULT 0,
        alerts_count INTEGER DEFAULT 0
      )
    `);
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS daily_summary (
        user_id TEXT NOT NULL,
        day TEXT NOT NULL,
        score REAL DEFAULT 0,
        sessions_count INTEGER DEFAULT 0,
        total_duration_seconds INTEGER DEFAULT 0,
        PRIMARY KEY (user_id, day)
      )
    `);
    console.log("✅ Turso tables initialized");
  } catch (e) {
    console.error("❌ Turso table init error:", e.message);
  }
}

// Auto-initialize on load
initializeTables();

module.exports = turso;
