//Server.js
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

// 🔧 CORS FIX - Allow all origins for local development
app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);

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
// 🔍 NETWORK INFO ENDPOINT
// ==============================
app.get("/network-info", (req, res) => {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        addresses.push({
          interface: name,
          address: iface.address,
        });
      }
    }
  }

  res.json({
    serverRole: SERVER_ROLE,
    port: PORT,
    wsUrl: `ws://${addresses[0]?.address || "localhost"}:${PORT}`,
    localIPs: addresses,
  });
});

// ==============================
// 🧵 WEBSOCKET SERVER
// ==============================
const server = http.createServer(app);
const wss = new WebSocket.Server({
  server,
  // Properly handle WebSocket upgrade
  verifyClient: (info, callback) => {
    console.log(
      `📡 WebSocket connection attempt from: ${info.origin || "unknown"}`
    );
    callback(true); // Accept all connections for local demo
  },
});

let cameraSocket = null;
let chairSocket = null;

// Broadcast helper with error handling
function broadcast(payload) {
  const msg = JSON.stringify(payload);
  let sent = 0;

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(msg);
        sent++;
      } catch (err) {
        console.error("❌ Error broadcasting to client:", err.message);
      }
    }
  });

  // Log broadcast stats for debugging
  if (sent > 0) {
    console.log(`📤 Broadcasted ${payload.type} to ${sent} client(s)`);
  }
}

wss.on("connection", (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  console.log(`🔌 WebSocket client connected from ${clientIP}`);

  // Send server role immediately
  ws.send(
    JSON.stringify({
      type: "server_role",
      role: SERVER_ROLE,
      timestamp: Date.now(),
    })
  );

  // Send connection confirmation
  ws.send(
    JSON.stringify({
      type: "connection_established",
      message: "Connected to SmartChair Server",
      serverTime: new Date().toISOString(),
    })
  );

  // Heartbeat mechanism to detect dead connections
  //ws.isAlive = true;
  //ws.on("pong", () => {
  //  ws.isAlive = true;
  //});

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
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
      // Register camera socket once
      if (cameraSocket !== ws) {
        cameraSocket = ws;
        console.log("🎥 Camera device registered");
      }

      broadcast({
        type: "camera_status",
        active: true,
      });

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

    // =========================
    // ❓ UNKNOWN MESSAGE
    // =========================
    console.warn(`⚠️ Unknown message type from ${clientIP}:`, data);
  });

  ws.on("close", () => {
    console.log(`❌ WebSocket client disconnected: ${clientIP}`);

    if (ws === cameraSocket) {
      cameraSocket = null;

      broadcast({
        type: "camera_status",
        active: false,
      });

      console.log("🎥 Camera device disconnected");
    }

    if (ws === chairSocket) {
      chairSocket = null;
      console.log("🪑 Chair device disconnected");
    }
  });

  ws.on("error", (error) => {
    console.error(`❌ WebSocket error from ${clientIP}:`, error.message);
  });
});

// Ping all clients every 30 seconds to detect dead connections
/*const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log("💀 Terminating dead connection");
      return ws.terminate();
    }

    ws.isAlive = false;
    ws.ping();
  });
}, 30000);*/

/*wss.on("close", () => {
  clearInterval(heartbeatInterval);
});*/

// ==============================
// 🌐 START SERVER
// ==============================
const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("\n" + "=".repeat(60));
  console.log(`🚀 ${SERVER_ROLE.toUpperCase()} SERVER STARTED`);
  console.log("=".repeat(60));
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 Mode: LOCAL NETWORK`);

  // Display all local IP addresses
  const interfaces = os.networkInterfaces();
  console.log("\n📡 Connect devices to:");

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        console.log(`   ws://${iface.address}:${PORT}`);
      }
    }
  }

  console.log("\n📱 Update ESP32 and Python app to use one of these URLs");
  console.log("=".repeat(60) + "\n");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received, closing server...");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});
