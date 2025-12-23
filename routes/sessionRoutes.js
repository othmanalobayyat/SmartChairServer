const express = require("express");
const router = express.Router();
const turso = require("../db/turso");
const auth = require("../middleware/auth");

// ==============================
// POST /api/session/end
// ==============================
// ينهي جلسة، يخزنها، ويحدّث daily_summary تلقائياً
router.post("/end", auth, async (req, res) => {
  try {
    // 👤 user_id من التوكن (JWT)
    const user_id = req.user.id;

    const {
      start_time,
      end_time,
      duration_seconds,
      avg_posture_score,
      alerts_count,
    } = req.body;

    // ✅ Validation
    if (!start_time || !end_time || typeof duration_seconds !== "number") {
      return res.status(400).json({
        error: "Missing or invalid required fields",
      });
    }

    // =========================
    // 1) تخزين الجلسة
    // =========================
    await turso.execute({
      sql: `
        INSERT INTO sessions
        (user_id, start_time, end_time, duration_seconds, avg_posture_score, alerts_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [
        user_id,
        start_time,
        end_time,
        duration_seconds,
        avg_posture_score ?? 0,
        alerts_count ?? 0,
      ],
    });

    // =========================
    // 2) استخراج اليوم (YYYY-MM-DD)
    // =========================
    const day = end_time.slice(0, 10);

    // =========================
    // 3) حساب متوسط posture لليوم
    // =========================
    const avgResult = await turso.execute({
      sql: `
        SELECT ROUND(AVG(avg_posture_score)) AS score
        FROM sessions
        WHERE user_id = ?
          AND substr(end_time, 1, 10) = ?
      `,
      args: [user_id, day],
    });

    const dailyScore = avgResult.rows[0]?.score ?? 0;

    // =========================
    // 4) Upsert في daily_summary
    // =========================
    await turso.execute({
      sql: `
        INSERT INTO daily_summary (user_id, day, score)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, day)
        DO UPDATE SET score = excluded.score
      `,
      args: [user_id, day, dailyScore],
    });

    res.json({
      ok: true,
      day,
      score: dailyScore,
    });
  } catch (err) {
    console.error("❌ Session end error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// GET /api/session/list
// ==============================
// يرجّع جلسات اليوم للمستخدم الحالي
router.get("/list", auth, async (req, res) => {
  try {
    // 👤 user_id من التوكن
    const user_id = req.user.id;

    const day = new Date().toISOString().slice(0, 10);

    const result = await turso.execute({
      sql: `
        SELECT
          start_time,
          end_time,
          duration_seconds,
          avg_posture_score,
          alerts_count
        FROM sessions
        WHERE user_id = ?
          AND substr(end_time, 1, 10) = ?
        ORDER BY end_time DESC
      `,
      args: [user_id, day],
    });

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Sessions list error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
