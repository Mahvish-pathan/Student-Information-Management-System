const dns = require("dns");
const mongoose = require("mongoose");
const { normalizeMongoUri, explainConnectionError, redact } = require("./mongoUri");

const PUBLIC_DNS = ["8.8.8.8", "1.1.1.1"];

function isDnsProblem(err) {
  const msg = String((err && err.message) || err);
  return /querySrv|ENOTFOUND|ECONNREFUSED|EAI_AGAIN/i.test(msg) && /srv|mongodb\.net/i.test(msg);
}

async function tryConnect(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
}

/**
 * Connect to MongoDB Atlas.
 *  - cleans the URI (quotes, prefix, brackets, encoding, db name)
 *  - prints what it fixed (never the password)
 *  - on an SRV DNS failure retries once with public DNS
 */
async function connectDB() {
  const { uri, fixes, problems } = normalizeMongoUri(process.env.MONGODB_URI, process.env.DB_NAME || undefined);

  fixes.forEach((f) => console.log(`[mongo] auto-fixed: ${f}`));
  if (problems.length) {
    problems.forEach((p) => console.error(`[mongo] problem: ${p}`));
    throw new Error(problems[0]);
  }
  console.log(`[mongo] connecting to ${redact(uri)}`);

  if (process.env.MONGODB_DNS_SERVERS) {
    dns.setServers(process.env.MONGODB_DNS_SERVERS.split(",").map((s) => s.trim()));
  }

  try {
    await tryConnect(uri);
  } catch (err) {
    if (isDnsProblem(err) && !process.env.MONGODB_DNS_SERVERS) {
      console.warn("[mongo] SRV DNS lookup failed, retrying with public DNS (8.8.8.8, 1.1.1.1)...");
      dns.setServers(PUBLIC_DNS);
      try {
        await tryConnect(uri);
      } catch (err2) {
        err2.hint = explainConnectionError(err2);
        throw err2;
      }
    } else {
      err.hint = explainConnectionError(err);
      throw err;
    }
  }
  console.log("Connected to MongoDB Atlas");
}

module.exports = { connectDB };
