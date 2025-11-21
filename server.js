const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.post("/data", (req, res) => {
  console.log("📩 Received from ESP32:", req.body);
  res.send("✔️ Data received");
});

app.get("/", (req, res) => {
  res.send("SmartChair server running...");
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// نخزّن اتصال الكاميرا فقط
let cameraSocket = null;

wss.on("connection", (ws) => {
  console.log("🔗 Device connected");

  // أول رسالة لازم تكون من الكاميرا تحتوي نوع الجهاز
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    // الكاميرا ترسل device_id = cam_01
    if (data.device_id === "cam_01") {
      cameraSocket = ws;

      console.log("🎥 Camera Connected!");

      // نرسل للموبايل حالة اتصال الكاميرا
      broadcast({
        type: "camera_status",
        active: true,
      });

      // نبث البيانات القادمة من الكاميرا
      broadcast(data);
      return;
    }

    // أي جهاز آخر (مثل الموبايل) لا مشكلة
  });

  ws.on("close", () => {
    if (ws === cameraSocket) {
      console.log("❌ Camera disconnected");
      cameraSocket = null;

      // نبث للموبايل أن الكاميرا أُغلقت
      broadcast({
        type: "camera_status",
        active: false,
      });
    }
  });
});

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

const PORT = 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://10.10.10.12:${PORT}`);
});
