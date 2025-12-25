//models_local/LocalDailyStats.js
const mongoose = require("mongoose");

const LocalDailyStatsSchema = new mongoose.Schema({
  user_id: mongoose.Schema.Types.ObjectId,
  date: String,
  sessions_ids: [mongoose.Schema.Types.ObjectId],

  total_sitting_minutes: Number,
  total_bad_posture_minutes: Number,

  avg_attention: Number,
  min_attention: Number,
  max_attention: Number,

  histogram_attention: [Number],

  posture_counts: {
    correct: Number,
    lean_left: Number,
    lean_right: Number,
    slouch: Number
  },

  created_at: { type: Date, default: Date.now }
});

LocalDailyStatsSchema.index({ user_id: 1, date: 1 });

module.exports = LocalDailyStatsSchema;
