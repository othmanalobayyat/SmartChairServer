const mongoose = require("mongoose");

function connectLocalDB() {
  const local = mongoose.createConnection(
    "mongodb://127.0.0.1:27017/smartchair_sessions"
  );
  return { local };
}

module.exports = connectLocalDB;
