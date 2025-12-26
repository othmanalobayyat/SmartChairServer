// ==============================
// 📦 IMPORTS
// ==============================
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const http = require("http");
const WebSocket = require("ws");
const mongoose = require("mongoose");

//Gemini routes
const chatRoutes = require("./routes/chatRoutes");

// 🔐 Auth routes
const authRoutes = require("./routes/authRoutes");

// ==============================
// 🗄️ LOCAL DATABASE (OFFLINE)
// ==============================
const connectLocal = require("./connections_local");
const { local } = connectLocal();

let Session = null;
let PressureFrame = null;
let CameraFrame = null;
let PostureEvent = null;
let LocalDailyStats = null;

if (local) {
  Session = local.model("Session", require("./models_local/Session"));
  PressureFrame = local.model(
    "PressureFrame",
    require("./models_local/PressureFrame")
  );
  CameraFrame = local.model(
    "CameraFrame",
    require("./models_local/CameraFrame")
  );
  PostureEvent = local.model(
    "PostureEvent",
    require("./models_local/PostureEvent")
  );
  LocalDailyStats = local.model(
    "LocalDailyStats",
    require("./models_local/LocalDailyStats")
  );
} else {
  console.warn("⚠️ Local DB disabled (Railway or offline)");
}

// ==============================
// 🌐 CONNECT TO MONGODB ATLAS
// ==============================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ==============================
// 🚀 EXPRESS APP INIT
// ==============================
const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use("/chat", chatRoutes);

// Auth routes
app.use("/auth", authRoutes);

// ==============================
// 🗄️ TURSO (CLOUD SQLITE)
// ==============================
const turso = require("./db/turso");

const sessionRoutes = require("./routes/sessionRoutes");
app.use("/api/session", sessionRoutes);

const statsRoutes = require("./routes/statsRoutes");
app.use("/api/stats", statsRoutes);

// ==============================
// 🔧 SERVER ROLE
// ==============================
const SERVER_ROLE = process.env.SERVER_ROLE || "primary";

// Local DB kept for future offline buffering (not used currently)

// ==============================
// 🧪 LOCAL DB STATUS
// ==============================
app.get("/local-db/status", async (req, res) => {
  if (!local) {
    return res.json({ local_db: "disabled" });
  }

  try {
    const collections = await local.db.listCollections().toArray();
    res.json({
      local_db: "connected",
      collections: collections.map((c) => c.name),
    });
  } catch (err) {
    res.status(500).json({
      local_db: "error",
      error: err.message,
    });
  }
});

// ==============================
// 🏠 BASE ENDPOINT
// ==============================
app.get("/", (req, res) => {
  res.send(`SmartChair Server (${SERVER_ROLE})`);
});

// ==============================
// 🧵 WEBSOCKET SERVER
// ==============================
const server = http.createServer(app);
const wss = new WebSocket.Server({
  server
});

let cameraSocket = null;

// Broadcast helper
function broadcast(payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

wss.on("connection", (ws) => {
  console.log("🔌 WebSocket client connected");

  // Send server role immediately
  ws.send(
    JSON.stringify({
      type: "server_role",
      role: SERVER_ROLE,
    })
  );

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      console.warn("⚠️ Invalid JSON received");
      return;
    }

    // =========================
    // 🪑 CHAIR DEVICE
    // =========================
    if (data.device_id === "chair_01") {
      broadcast({
        type: "chair_data",
        pressures: data.pressures || null,
        posture: data.posture || null,
        battery: data.battery || null,
      });
      return;
    }

    // =========================
    // 🎥 CAMERA DEVICE
    // =========================
    if (data.device_id === "cam_01") {
      // Register camera socket once
      if (cameraSocket !== ws) {
        cameraSocket = ws;
        console.log("🎥 Camera registered");
      }

      broadcast({
        type: "camera_status",
        active: true,
      });

      broadcast({
        type: "camera_frame",
        ...data,
      });

      return;
    }
  });

  ws.on("close", () => {
    console.log("❌ WebSocket client disconnected");

    if (ws === cameraSocket) {
      cameraSocket = null;

      broadcast({
        type: "camera_status",
        active: false,
      });

      console.log("🎥 Camera disconnected");
    }
  });
});

// ==============================
// 🌍 START SERVER
// ==============================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 ${SERVER_ROLE.toUpperCase()} server running on port ${PORT}`);
});
