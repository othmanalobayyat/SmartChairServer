// models_local/Session.js
const mongoose = require("mongoose");

const SessionSchema = new mongoose.Schema({
  user_id: mongoose.Schema.Types.ObjectId,
  device_id: String,

  start_time: Date,
  end_time: Date,
  duration_min: Number,

  avg_attention: Number,
  max_attention_drop: Number,
  bad_posture_ratio: Number,

  has_pressure_stream: Boolean,
  has_camera_stream: Boolean,

  created_at: { type: Date, default: Date.now }
});

SessionSchema.index({ user_id: 1 });
SessionSchema.index({ device_id: 1 });
SessionSchema.index({ start_time: 1 });

module.exports = SessionSchema;
