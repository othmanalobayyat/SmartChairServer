// models_local/PostureEvent.js
const mongoose = require("mongoose");

const PostureEventSchema = new mongoose.Schema({
  session_id: mongoose.Schema.Types.ObjectId,
  event_type: String,
  posture: String,
  at_time_ms: Number,
  created_at: { type: Date, default: Date.now }
});

PostureEventSchema.index({ session_id: 1 });

module.exports = PostureEventSchema;
