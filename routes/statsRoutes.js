// routes/statsRoutes.js
const express = require("express");
const router = express.Router();
const turso = require("../db/turso");
const auth = require("../middleware/auth"); // نفس middleware المستخدم في AuthRoutes

// ==============================
// GET /api/stats/summary
// ==============================
router.get("/summary", auth, async (req, res) => {
  try {
    const user_id = req.user.id; // 👈 من JWT

    const now = new Date();
    const day =
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0");

    // 1) score اليوم
    const summaryRes = await turso.execute({
      sql: `
        SELECT score
        FROM daily_summary
        WHERE user_id = ? AND day = ?
      `,
      args: [user_id, day],
    });

    const score = summaryRes.rows[0]?.score ?? 0;

    // 2) إحصائيات الجلسات
    const sessionsRes = await turso.execute({
      sql: `
        SELECT
          COUNT(*) AS sessions_count,
          COALESCE(SUM(duration_seconds), 0) AS total_duration_seconds,
          COALESCE(SUM(alerts_count), 0) AS alerts_count
        FROM sessions
        WHERE user_id = ? AND substr(end_time, 1, 10) = ?
      `,
      args: [user_id, day],
    });

    const row = sessionsRes.rows[0] || {
      sessions_count: 0,
      total_duration_seconds: 0,
      alerts_count: 0,
    };

    res.json({
      day,
      score,
      sessions_count: row.sessions_count,
      total_duration_seconds: row.total_duration_seconds,
      alerts_count: row.alerts_count,
    });
  } catch (err) {
    console.error("❌ Stats summary error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// GET /api/stats/history
// ==============================
router.get("/history", auth, async (req, res) => {
  try {
    const user_id = req.user.id; // 👈 من JWT

    const result = await turso.execute({
      sql: `
        SELECT
          day AS date,
          score
        FROM daily_summary
        WHERE user_id = ?
        ORDER BY day DESC
        LIMIT 7
      `,
      args: [user_id],
    });

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Stats history error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
