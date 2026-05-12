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
  .catch((err) => console.error("❌ MongoDB connection error:", err.message));

// ==============================
// 🚀 EXPRESS APP INIT
// ==============================
const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://192.168.1.29:3000",
      "https://smartchair.posturic.online",
      "https://smartchairserver-production.up.railway.app",
    ],
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
// 📷 CAMERA PAIRING (reverse QR flow)
// ==============================
// Mobile scans QR shown on desktop → POSTs here → desktop polls pair-status
const pendingPairings = new Map(); // camera_id → { user_id, user_name, ts }

app.post("/api/camera/pair", (req, res) => {
  const { camera_id, user_id, user_name } = req.body;
  console.log(`📷 [pair] body received: camera_id=${camera_id} user_id=${user_id} user_name=${user_name}`);
  if (!camera_id || !user_id) {
    console.warn(`📷 [pair] REJECTED — missing field. body=${JSON.stringify(req.body)}`);
    return res.status(400).json({ error: "camera_id and user_id required" });
  }
  pendingPairings.set(camera_id, { user_id, user_name: user_name || "", ts: Date.now() });
  console.log(`📷 [pair] stored OK. pendingPairings size=${pendingPairings.size} keys=[${[...pendingPairings.keys()].join(",")}]`);
  res.json({ ok: true });
});

app.get("/api/camera/pair-status", (req, res) => {
  const { camera_id } = req.query;
  console.log(`📷 [pair-status] poll for camera_id=${camera_id} — pendingPairings size=${pendingPairings.size} keys=[${[...pendingPairings.keys()].join(",")}]`);
  const pairing = pendingPairings.get(camera_id);
  if (!pairing) {
    console.log(`📷 [pair-status] NOT FOUND for camera_id=${camera_id}`);
    return res.json({ pending: false });
  }
  pendingPairings.delete(camera_id); // consume once — desktop retrieves it once
  console.log(`📷 [pair-status] FOUND + consumed. Returning user_id=${pairing.user_id}`);
  res.json({ pending: true, user_id: pairing.user_id, user_name: pairing.user_name });
});

// ==============================
// 🔧 SERVER ROLE
// ==============================
const SERVER_ROLE = process.env.SERVER_ROLE || "primary";

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

let chairSocket = null;
let cameraSocket = null;

// ==============================
// 📤 BROADCAST HELPER
// ==============================
function broadcast(payload) {
  const msg = JSON.stringify(payload);

  let sent = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
      sent++;
    }
  });

  console.log(`📤 Broadcasted ${payload.type} to ${sent} client(s)`);
}

// ==============================
// 🔌 WS CONNECTION
// ==============================
wss.on("connection", (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  console.log(`🔌 WebSocket client connected from ${clientIP}`);

  // ======================
  // ❤️ HEARTBEAT INIT
  // ======================
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  // Initial handshake messages
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
      serverTime: new Date().toISOString(),
    })
  );

  // ======================
  // 📥 MESSAGE HANDLER
  // ======================
  ws.on("message", async (msg) => {
    // console.log("🔥 RAW MESSAGE:", msg.toString()); // disabled in production

    let data;
    try {
      data = JSON.parse(msg.toString());
      console.log(
        `📥 Received from ${clientIP}:`,
        data.device_id || data.type || "unknown"
      );
    } catch (err) {
      console.warn(`⚠️ Invalid JSON from ${clientIP}`);
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

      // FIX 1: Registration message — don't broadcast null chair_data
      if (data.state === "online") {
        broadcast({ type: "chair_connected", timestamp: Date.now() });
        return;
      }

      // FIX 3: Persist pressure frame to local DB
      if (data.state === "active" && data.pressures) {
        try {
          if (typeof PressureFrame !== "undefined" && PressureFrame !== null) {
            await PressureFrame.create({
              t_ms: Date.now(),
              pressures: data.pressures,
              posture_label: data.posture || null,
              raw_loadcell_ok: true,
            });
          }
        } catch (e) {
          // silent — don't crash WebSocket on DB error
        }
      }

      if (data.state === "idle") {
        broadcast({
          type: "chair_idle",
          battery: data.battery != null ? data.battery : null,
          timestamp: Date.now(),
        });
      } else {
        broadcast({
          type: "chair_data",
          pressures: data.pressures || null,
          posture: data.posture || null,
          battery: data.battery != null ? data.battery : null, // FIX 2: 0% won't become null
          state: data.state || "active",
          timestamp: Date.now(),
        });
      }
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

      // Heartbeat sent by desktop when monitoring is paused — register the
      // socket and tell mobile the camera is connected but not monitoring.
      if (data.state === "online") {
        broadcast({ type: "camera_status", active: true, monitoring: false });
        return;
      }

      // Full frame — camera is actively monitoring.
      broadcast({ type: "camera_status", active: true, monitoring: true });

      broadcast({
        type: "camera_frame",
        attention_level: data.attention_level,
        is_present: data.is_present,
        drowsy: data.drowsy ?? data.drowsiness ?? false,
        working_duration_seconds: data.working_duration_seconds,
        posture_label: data.posture_label || null,
        posture_correct: data.posture_correct ?? null,
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
        // Reflect monitoring state to all clients so the mobile knows the
        // camera is still connected even when monitoring is stopped
        if (data.action === "stop") {
          broadcast({ type: "camera_status", active: true, monitoring: false });
        } else if (data.action === "start") {
          broadcast({ type: "camera_status", active: true, monitoring: true });
        }
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

    console.warn(`⚠️ Unknown message from ${clientIP}`, data);
  });

  // ======================
  // ❌ DISCONNECT
  // ======================
  ws.on("close", () => {
    console.log(`❌ WebSocket client disconnected: ${clientIP}`);

    if (ws === chairSocket) {
      chairSocket = null;
      broadcast({ type: "chair_disconnected", timestamp: Date.now() });
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
// ❤️ GLOBAL HEARTBEAT (CLOUDFLARE SAFE)
// ==============================
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log("💀 Terminating dead WebSocket");
      return ws.terminate();
    }

    ws.isAlive = false;
    ws.ping();
  });
}, 25000); // < 30s required by Cloudflare

wss.on("close", () => {
  clearInterval(heartbeatInterval);
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
  console.log("🛑 SIGTERM received, shutting down...");
  clearInterval(heartbeatInterval);
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});
