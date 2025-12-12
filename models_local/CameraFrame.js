const mongoose = require("mongoose");

const CameraFrameSchema = new mongoose.Schema({
  session_id: mongoose.Schema.Types.ObjectId,
  t_ms: Number,

  attention: Number,
  face_detected: Boolean,
  looking_away: Boolean,
  landmarks_quality: Number
});

CameraFrameSchema.index({ session_id: 1 });

module.exports = CameraFrameSchema;
