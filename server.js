// ==============================
// Server.js – DEMO SAFE VERSION
// ==============================
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const http = require("http");
const WebSocket = require("ws");
const mongoose = require("mongoose");

// ==============================
// EXPRESS
// ==============================
const app = express();
app.use(cors({ origin: "*", credentials: true }));
app.use(bodyParser.json());

// Routes (كما هي)
app.use("/chat", require("./routes/chatRoutes"));
app.use("/auth", require("./routes/authRoutes"));
require("./db/turso");
app.use("/api/session", require("./routes/sessionRoutes"));
app.use("/api/stats", require("./routes/statsRoutes"));

// ==============================
// MONGO
// ==============================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(() => console.warn("⚠️ MongoDB skipped (ok for demo)"));

// ==============================
// HTTP + WS
// ==============================
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let chairSocket = null;

// ==============================
// WS
// ==============================
wss.on("connection", (ws, req) => {
  console.log("🟢 WS connected", req.socket.remoteAddress);

  ws.on("message", (msg) => {
    const raw = msg.toString();
    console.log("📥", raw);

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    if (data.device_id === "chair_01") {
      chairSocket = ws;

      console.log("🪑 STATE:", data.state, "| present:", data.present);

      // broadcast للتطبيق
      wss.clients.forEach((c) => {
        if (c.readyState === WebSocket.OPEN) {
          c.send(
            JSON.stringify({
              type: "chair_state",
              present: data.present,
              state: data.state,
              pressures: data.pressures,
              ts: Date.now(),
            })
          );
        }
      });
    }
  });

  ws.on("close", () => {
    console.log("🔴 WS disconnected");
    if (ws === chairSocket) chairSocket = null;
  });
});

// ==============================
// START
// ==============================
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 SERVER RUNNING ON", PORT);
});
