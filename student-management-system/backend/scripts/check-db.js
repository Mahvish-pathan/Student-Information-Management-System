/**
 * Diagnose MONGODB_URI problems:   npm run check-db
 * Reads backend/.env (or the real environment), fixes what it can, then tries to connect.
 * The password is never printed.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const { normalizeMongoUri, explainConnectionError, redact } = require("../config/mongoUri");
const { connectDB } = require("../config/db");

(async () => {
  console.log("== MongoDB URI check ==");
  const raw = process.env.MONGODB_URI;
  const { uri, fixes, problems } = normalizeMongoUri(raw);

  console.log(raw ? `Read MONGODB_URI (${String(raw).length} characters)` : "MONGODB_URI is NOT set");
  if (fixes.length) {
    console.log("\nThings that were wrong but are auto-fixed in the app:");
    fixes.forEach((f) => console.log("  - " + f));
    console.log("  (Still, correct the value at the source so it is clean everywhere.)");
  }
  if (problems.length) {
    console.log("\nThings YOU must fix:");
    problems.forEach((p) => console.log("  x " + p));
    process.exit(1);
  }
  console.log("\nCleaned string: " + redact(uri));

  try {
    await connectDB();
    const db = mongoose.connection.db;
    const cols = await db.listCollections().toArray();
    console.log(`\nOK  database "${db.databaseName}" reachable. Collections: ${cols.map((c) => c.name).join(", ") || "(none yet)"}`);
    await mongoose.disconnect();
  } catch (err) {
    console.log("\nFAILED: " + err.message);
    console.log("Why:    " + (err.hint || explainConnectionError(err)));
    process.exit(1);
  }
})();
