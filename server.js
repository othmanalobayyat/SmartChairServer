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

app.use(cors({ origin: "*", credentials: true }));
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
// 🧵 WEBSOCKET SERVER (FIXED)
// ==============================
const server = http.createServer(app);

// ❗❗❗ أهم سطر
const wss = new WebSocket.Server({ server }); // ← بدون path

let chairSocket = null;

// ==============================
// 📤 BROADCAST
// ==============================
function broadcast(payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(msg);
    }
  });
}

// ==============================
// 🔌 WS CONNECTION
// ==============================
wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log("🟢 WS connected from", ip);

  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  ws.on("message", (msg) => {
    const raw = msg.toString();
    console.log("📥 RAW:", raw);

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      console.warn("❌ Invalid JSON");
      return;
    }

    // ===== CHAIR =====
    if (data.device_id === "chair_01") {
      chairSocket = ws;

      console.log("🪑 Chair state:", data.state);

      broadcast({
        type: "chair_state",
        present: data.present,
        state: data.state,
        pressures: data.pressures,
        timestamp: Date.now(),
      });
    }
  });

  ws.on("close", () => {
    console.log("🔴 WS disconnected", ip);

    if (ws === chairSocket) {
      chairSocket = null;
      broadcast({
        type: "chair_state",
        present: false,
        state: "empty",
        pressures: null,
        timestamp: Date.now(),
      });
    }
  });
});

// ==============================
// ❤️ HEARTBEAT (Cloudflare safe)
// ==============================
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 25000);

// ==============================
// 🌐 START SERVER
// ==============================
const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("=".repeat(60));
  console.log(`🚀 ${SERVER_ROLE.toUpperCase()} SERVER STARTED`);
  console.log(`📍 Port: ${PORT}`);
  console.log("=".repeat(60));
});

// ==============================
// 🛑 GRACEFUL SHUTDOWN
// ==============================
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received");
  server.close(() => process.exit(0));
});
