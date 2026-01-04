// Server.js
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
const os = require("os");

// Routes
const chatRoutes = require("./routes/chatRoutes");
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

app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);

app.use(bodyParser.json());

// Routes
app.use("/chat", chatRoutes);
app.use("/auth", authRoutes);

// ==============================
// 🗄️ TURSO (CLOUD SQLITE)
// ==============================
require("./db/turso");

const sessionRoutes = require("./routes/sessionRoutes");
const statsRoutes = require("./routes/statsRoutes");

app.use("/api/session", sessionRoutes);
app.use("/api/stats", statsRoutes);

// ==============================
// 🔧 SERVER ROLE
// ==============================
const SERVER_ROLE = process.env.SERVER_ROLE || "primary";

// ==============================
// 🧪 LOCAL DB STATUS
// ==============================
app.get("/local-db/status", async (req, res) => {
  if (!local) return res.json({ local_db: "disabled" });

  try {
    const collections = await local.db.listCollections().toArray();
    res.json({
      local_db: "connected",
      collections: collections.map((c) => c.name),
    });
  } catch (err) {
    res.status(500).json({ local_db: "error", error: err.message });
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
const wss = new WebSocket.Server({ server });

let cameraSocket = null;
let chairSocket = null;

// ==============================
// 📤 BROADCAST HELPER
// ==============================
function broadcast(payload) {
  const msg = JSON.stringify(payload);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });

  console.log(`📤 Broadcasted ${payload.type}`);
}

// ==============================
// 🔌 WS CONNECTION
// ==============================
wss.on("connection", (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  console.log(`🔌 WebSocket client connected from ${clientIP}`);

  // Initial messages
  ws.send(
    JSON.stringify({
      type: "server_role",
      role: SERVER_ROLE,
      timestamp: Date.now(),
    })
  );

  ws.send(
    JSON.stringify({
      type: "connection_established",
      message: "Connected to SmartChair Server",
      serverTime: new Date().toISOString(),
    })
  );

  // =========================
  // 📥 MESSAGE HANDLER
  // =========================
  ws.on("message", (msg) => {
    console.log("🔥 RAW MESSAGE:", msg.toString());

    let data;
    try {
      data = JSON.parse(msg.toString());
      console.log(
        `📥 Received from ${clientIP}:`,
        data.device_id || data.type || "unknown"
      );
    } catch (e) {
      console.warn(`⚠️ Invalid JSON received from ${clientIP}`);
      return;
    }

    // =========================
    // 🪑 CHAIR DEVICE
    // =========================
    if (data.device_id === "chair_01") {
      if (chairSocket !== ws) {
        chairSocket = ws;
        console.log("🪑 Chair device registered");
      }

      broadcast({
        type: "chair_data",
        pressures: data.pressures || null,
        posture: data.posture || null,
        battery: data.battery || null,
        state: data.state || "unknown",
        timestamp: Date.now(),
      });
      return;
    }

    // =========================
    // 🎥 CAMERA DEVICE
    // =========================
    if (data.device_id === "cam_01") {
      if (cameraSocket !== ws) {
        cameraSocket = ws;
        console.log("🎥 Camera device registered");
      }

      broadcast({ type: "camera_status", active: true });

      broadcast({
        type: "camera_frame",
        attention_level: data.attention_level,
        is_present: data.is_present,
        drowsy: data.drowsy,
        working_duration_seconds: data.working_duration_seconds,
        timestamp: Date.now(),
      });
      return;
    }

    // =========================
    // 📱 MOBILE APP CONTROL
    // =========================
    if (data.type === "camera_control") {
      if (cameraSocket && cameraSocket.readyState === WebSocket.OPEN) {
        cameraSocket.send(JSON.stringify(data));
        console.log(`📷 Camera control: ${data.action}`);
      } else {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Camera not connected",
          })
        );
      }
      return;
    }

    console.warn(`⚠️ Unknown message type from ${clientIP}`, data);
  });

  // =========================
  // ❌ DISCONNECT
  // =========================
  ws.on("close", () => {
    console.log(`❌ WebSocket client disconnected: ${clientIP}`);

    if (ws === chairSocket) {
      chairSocket = null;
      console.log("🪑 Chair device disconnected");
    }

    if (ws === cameraSocket) {
      cameraSocket = null;
      broadcast({ type: "camera_status", active: false });
      console.log("🎥 Camera device disconnected");
    }
  });

  ws.on("error", (err) => {
    console.error(`❌ WebSocket error from ${clientIP}:`, err.message);
  });
});

// ==============================
// 🌐 START SERVER
// ==============================
const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("\n" + "=".repeat(60));
  console.log(`🚀 ${SERVER_ROLE.toUpperCase()} SERVER STARTED`);
  console.log(`📍 Port: ${PORT}`);
  console.log("=".repeat(60) + "\n");
});

// ==============================
// 🛑 GRACEFUL SHUTDOWN
// ==============================
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received, closing server...");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});
