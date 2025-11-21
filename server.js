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
  res.send("SmartChair server is running (WS enabled)");
});

// ===== إنشاء HTTP Server =====
const server = http.createServer(app);

// ===== WebSocket =====
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("🔗 Camera connected");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      console.log("🎥 Camera Data Received:", data);

      // بث البيانات لكل الأجهزة
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });

    } catch (err) {
      console.log("WS Error:", err);
    }
  });

  ws.on("close", () => console.log("❌ Camera disconnected"));
});

// ===== Railway PORT =====
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
