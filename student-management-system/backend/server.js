require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const studentRoutes = require("./routes/students");
const { connectDB } = require("./config/db");

const app = express();
const PORT = process.env.PORT || 5000;

// ---- CORS: allow only your frontend(s) --------------------------------------
// FRONTEND_URL = comma-separated list. Supports a wildcard sub-domain, e.g.
//   https://my-app.vercel.app,https://*.vercel.app      (production + preview deploys)
// "*" allows everything (testing only).
const allowedOrigins = (process.env.FRONTEND_URL || "*")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

function originAllowed(origin) {
  return allowedOrigins.some((rule) => {
    if (rule === "*") return true;
    if (!rule.includes("*")) return rule === origin;
    const pattern = "^" + rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9-]+") + "$";
    return new RegExp(pattern, "i").test(origin);
  });
}

app.use(
  cors({
    origin(origin, callback) {
      // no Origin header = curl / Postman / server-to-server
      if (!origin || originAllowed(origin)) return callback(null, true);
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
  try {
    await connectDB();
    app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    if (err.hint) console.error("Hint:", err.hint);
    process.exit(1);
  }
}

if (require.main === module) start();

module.exports = app;
