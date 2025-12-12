const mongoose = require("mongoose");

function connectLocalDB() {
  let local = null;

  try {
    local = mongoose.createConnection(
      "mongodb://127.0.0.1:27017/smartchair_sessions",
      {
        serverSelectionTimeoutMS: 3000, // مهم
      }
    );

    local.on("connected", () => {
      console.log("🟢 Local MongoDB connected");
    });

    local.on("error", (err) => {
      console.warn("🟡 Local MongoDB unavailable:", err.message);
    });
  } catch (e) {
    console.warn("🟡 Local MongoDB skipped");
    local = null;
  }

  return { local };
}

module.exports = connectLocalDB;
