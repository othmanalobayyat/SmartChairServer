const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ==============================
// 🔧 SERVER ROLE
// ==============================
const SERVER_ROLE = process.env.SERVER_ROLE || "primary"; 
// local → primary
// railway → backup

// استقبال بيانات ESP32
app.post("/data", (req, res) => {
  console.log("📩 ESP32:", req.body);
  res.send("OK");
});

app.get("/", (req, res) => {
  res.send(`SmartChair Server (${SERVER_ROLE})`);
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let cameraSocket = null;

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(msg);
    }
  });
}

function heartbeat() {
  this.isAlive = true;
}

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", heartbeat);

  // ⬅️ أول شي نبعت دور السيرفر
  ws.send(
    JSON.stringify({
      type: "server_role",
      role: SERVER_ROLE,
    })
  );

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    // 🎥 كاميرا
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

// Heartbeat
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`🚀 ${SERVER_ROLE.toUpperCase()} server on ${PORT}`)
);
