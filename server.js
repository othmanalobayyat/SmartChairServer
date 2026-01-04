// Server.js
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

if (!local) {
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
    origin: "*",
    credentials: true,
  })
);
app.use(bodyParser.json());

// Routes
app.use("/chat", chatRoutes);
app.use("/auth", authRoutes);

// TURSO
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
      try {
        client.send(msg);
        sent++;
      } catch (e) {}
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

  // ❤️ heartbeat per-socket
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  // handshake
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

  ws.on("message", (msg) => {
    const raw = msg.toString();
    console.log("🔥 RAW MESSAGE:", raw);

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      console.warn(`⚠️ Invalid JSON from ${clientIP}`);
      return;
    }

    console.log(
      `📥 Received from ${clientIP}:`,
      data.device_id || data.type || "unknown"
    );

    // =========================
    // 🪑 CHAIR DEVICE
    // =========================
    if (data.device_id === "chair_01") {
      if (chairSocket !== ws) {
        chairSocket = ws;
        console.log("🪑 Chair device registered");
      }

      // baseline event
      if (data.event === "baseline_captured") {
        broadcast({
          type: "chair_baseline",
          state: data.state || "baseline_ready",
          baseline_raw: data.baseline_raw || null,
          timestamp: Date.now(),
        });
        return;
      }

      // presence event
      if (data.event === "presence") {
        broadcast({
          type: "chair_presence",
          present: !!data.present,
          state: data.state || (data.present ? "user_present" : "no_user"),
          timestamp: Date.now(),
        });
        return;
      }

      // chair_data event (default)
      // (حتى لو ما بعت event، بنعامله chair_data لمرونة)
      broadcast({
        type: "chair_data",
        pressures: data.pressures || null,
        posture: data.posture || null,
        battery: data.battery || null,
        state: data.state || "unknown",
        lrDiff: typeof data.lrDiff === "number" ? data.lrDiff : null,
        front: typeof data.front === "number" ? data.front : null,
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
          JSON.stringify({ type: "error", message: "Camera not connected" })
        );
      }
      return;
    }

    console.warn(`⚠️ Unknown message from ${clientIP}`, data);
  });

  ws.on("close", () => {
    console.log(`❌ WebSocket client disconnected: ${clientIP}`);

    if (ws === chairSocket) {
      chairSocket = null;
      console.log("🪑 Chair device disconnected");
      broadcast({
        type: "chair_presence",
        present: false,
        state: "chair_disconnected",
        timestamp: Date.now(),
      });
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
// ❤️ GLOBAL HEARTBEAT (Cloudflare safe)
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
}, 25000);

wss.on("close", () => clearInterval(heartbeatInterval));

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
