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

app.use("/api/session", require("./routes/sessionRoutes"));
app.use("/api/stats", require("./routes/statsRoutes"));

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
// 📤 BROADCAST
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

  if (sent > 0) {
    console.log(`📤 Broadcasted ${payload.type} to ${sent} client(s)`);
  }
}

// ==============================
// 🔌 WS CONNECTION
// ==============================
wss.on("connection", (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  console.log(`🔌 WebSocket client connected from ${clientIP}`);

  // Handshake
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

  // =========================
  // 📥 MESSAGE HANDLER
  // =========================
  ws.on("message", (msg) => {
    const raw = msg.toString();
    console.log("🔥 RAW MESSAGE:", raw);

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      console.warn("⚠️ Invalid JSON received");
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

      console.log("🪑 Chair Data:", {
        pressures: data.pressures,
        posture: data.posture,
        battery: data.battery,
      });

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

    console.warn("⚠️ Unknown message:", data);
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
    console.error("❌ WebSocket error:", err.message);
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
  console.log("🛑 SIGTERM received, shutting down...");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});
