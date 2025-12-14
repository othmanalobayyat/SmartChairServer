const mongoose = require("mongoose");

const CameraFrameSchema = new mongoose.Schema({
  session_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },

  device_id: String,
  user_id: mongoose.Schema.Types.ObjectId,

  attention_level: Number,
  is_present: Boolean,
  drowsiness: Boolean,

  posture_label: String,
  posture_correct: Boolean,

  working: Boolean,
  working_duration_seconds: Number,

  timestamp: Date,
});

CameraFrameSchema.index({ session_id: 1 });

module.exports = CameraFrameSchema;
