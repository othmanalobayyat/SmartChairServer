const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// استقبال بيانات ESP32
app.post("/data", (req, res) => {
  console.log("📩 Received from ESP32:", req.body);
  res.send("✔️ Data received");
});

// صفحة فحص
app.get("/", (req, res) => {
  res.send("SmartChair server running (WebSocket enabled)");
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// نخزّن اتصال الكاميرا فقط
let cameraSocket = null;

// ====== heartbeat لإبقاء الاتصال حي ======
function heartbeat() {
  this.isAlive = true;
}

// connection
wss.on("connection", (ws) => {
  console.log("🔗 Device connected");
  ws.isAlive = true;
  ws.on("pong", heartbeat);

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    // الكاميرا
    if (data.device_id === "cam_01") {
      cameraSocket = ws;
      console.log("🎥 Camera Connected!");

      broadcast({
        type: "camera_status",
        active: true,
      });

      broadcast(data);
      return;
    }

    // أي جهاز آخر مثل الموبايل
  });

  ws.on("close", () => {
    if (ws === cameraSocket) {
      console.log("❌ Camera disconnected");
      cameraSocket = null;

      broadcast({
        type: "camera_status",
        active: false,
      });
    }
  });
});

// ====== Ping كل 30 ثانية ======
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate(); // إذا ما رد ينقطع
    ws.isAlive = false;
    ws.ping(); // مهم جداً على Railway
  });
}, 30000);

wss.on("close", () => clearInterval(interval));

// broadcast
function broadcast(obj) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// ====== أهم شيء: Railway PORT ======
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
