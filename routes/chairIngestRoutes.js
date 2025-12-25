const express = require("express");
const router = express.Router();

/**
 * ESP32 → HTTP ingest
 */
router.post("/ingest", (req, res) => {
  const data = req.body;

  if (data.device_id !== "chair_01") {
    return res.status(400).json({ error: "Invalid device" });
  }

  // بث البيانات لكل WebSocket clients
  req.app.get("broadcast")({
    type: "chair_data",
    pressures: data.pressures || null,
    posture: data.posture || null,
    battery: data.battery || null,
    ts: Date.now(),
  });

  res.json({ status: "ok" });
});

module.exports = router;
