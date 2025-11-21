const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// اختبار HTTP
app.get("/", (req, res) => {
  res.send("SmartChair server is running (HTTP OK, WS OK)");
});

// ===== إنشاء HTTP Server =====
const server = http.createServer(app);

// ===== WebSocket =====
const wss = new WebSocket.Server({ noServer: true });

// نسمح بالـ upgrade (مطلوب لRailway)
server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws) => {
  console.log("🔗 Camera connected");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      console.log("🎥 Camera Data Received:", data);

      // بث البيانات لكل العملاء
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
