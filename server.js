const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("SmartChair server running (Railway hosted)...");
});

// إنشاء HTTP Server
const server = http.createServer(app);

// إنشاء WebSocket فوق السيرفر
const wss = new WebSocket.Server({ server, path: "/ws" });

// عند اتصال الكاميرا
wss.on("connection", (ws) => {
  console.log("🔗 Camera connected");

  ws.on("message", (msg) => {
    console.log("🎥 Received:", msg);
  });

  ws.on("close", () => {
    console.log("❌ Camera disconnected");
  });
});

// Railway يعطي PORT عبر المتغيرات:
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
