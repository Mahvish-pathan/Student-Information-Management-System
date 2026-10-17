const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const studentRoutes = require("./routes/students");

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

// ---- CORS: only allow the Netlify frontend (comma-separated list supported) ----
const allowedOrigins = (process.env.FRONTEND_URL || "*")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // allow tools like curl/Postman (no origin) and whitelisted origins
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

app.use(express.json());

// ---- Routes ----
app.get("/", (req, res) => {
  res.json({
    service: "Student Information Management API",
    status: "running",
    endpoints: "/api/students",
  });
});

app.get("/health", (req, res) => {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  res.json({ status: "ok", database: states[mongoose.connection.readyState] });
});

app.use("/api/students", studentRoutes);

// ---- 404 + error handlers ----
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} not found` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err.message);
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ message: err.message });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Invalid JSON body" });
  }
  res.status(500).json({ message: "Internal server error" });
});

// ---- Start ----
async function start() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI is not set. Add it to .env or the Render environment variables.");
    process.exit(1);
  }
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB Atlas");
    app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }
}

if (require.main === module) start();

module.exports = app;
