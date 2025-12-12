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

// 🔥 NEW: import auth routes
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

// 🔥 Enable auth routes → http://localhost:3000/auth/*
app.use("/auth", authRoutes);

// ==============================
// 🧪 LOCAL DB TEST (READ ONLY)
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
// 🔧 SERVER ROLE
// ==============================
const SERVER_ROLE = process.env.SERVER_ROLE || "primary";
// local → primary
// railway → backup

// ==============================
// 📩 ESP32 ENDPOINT
// ==============================
app.post("/data", (req, res) => {
  console.log("📩 ESP32:", req.body);
  res.send("OK");
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

// Send to all connected clients
function broadcast(obj) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

function heartbeat() {
  this.isAlive = true;
}

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", heartbeat);

  // Send server role immediately when a client connects
  ws.send(
    JSON.stringify({
      type: "server_role",
      role: SERVER_ROLE,
    })
  );

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    // 🟢 CHAIR DEVICE
    if (data.device_id === "chair_01") {
      broadcast({
        type: "chair_data",
        pressures: data.pressures || null,
        posture: data.posture || null,
        battery: data.battery || null,
      });

      return;
    }

    // 🎥 Camera: device_id = cam_01
    if (data.device_id === "cam_01") {
      cameraSocket = ws;

      broadcast({
        type: "camera_status",
        active: true,
      });

      broadcast(data);
    }
  });

  ws.on("close", () => {
    if (ws === cameraSocket) {
      cameraSocket = null;
      broadcast({
        type: "camera_status",
        active: false,
      });
    }
  });
});

// ==============================
// ❤️ HEARTBEAT CHECK
// ==============================
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// ==============================
// 🌍 START SERVER
// ==============================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`🚀 ${SERVER_ROLE.toUpperCase()} server on ${PORT}`)
);
