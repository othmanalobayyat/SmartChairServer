// models_local/PressureFrame.js
const mongoose = require("mongoose");

const PressureFrameSchema = new mongoose.Schema({
  session_id: mongoose.Schema.Types.ObjectId,
  t_ms: Number,
  pressures: [Number],
  posture_label: String,
  raw_loadcell_ok: Boolean
});

PressureFrameSchema.index({ session_id: 1 });
PressureFrameSchema.index({ session_id: 1, t_ms: 1 });

module.exports = PressureFrameSchema;
