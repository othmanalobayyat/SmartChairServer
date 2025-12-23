const express = require("express");
const router = express.Router();
const turso = require("../db/turso");

// GET /api/stats/summary?user_id=...
router.get("/summary", async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    // اليوم الحالي (YYYY-MM-DD)
    const day = new Date().toISOString().slice(0, 10);

    // 1) جلب score اليوم
    const summaryRes = await turso.execute({
      sql: `
        SELECT score
        FROM daily_summary
        WHERE user_id = ? AND day = ?
      `,
      args: [user_id, day],
    });

    const score = summaryRes.rows[0]?.score ?? null;

    // 2) إحصائيات الجلسات لليوم
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

// GET /api/stats/history?user_id=...
router.get("/history", async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

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
