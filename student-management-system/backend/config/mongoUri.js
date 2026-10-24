/**
 * MongoDB connection-string helper.
 *
 * Fixes the mistakes that usually break MONGODB_URI on Render / Vercel / local:
 *   - value pasted together with the key        MONGODB_URI=mongodb+srv://...
 *   - wrapping quotes, spaces, line breaks      "mongodb+srv://..."
 *   - Atlas placeholders left in                <username>:<password>
 *   - special characters in the password        p@ss/word#1  ->  p%40ss%2Fword%231
 *   - missing database name                     ...mongodb.net/?retryWrites  ->  .../studentdb?...
 *
 * Pure functions, no dependencies, so they are easy to test.
 */

const DEFAULT_DB = "studentdb";

function redact(uri) {
  return String(uri).replace(/(mongodb(?:\+srv)?:\/\/[^:\/@]+:)[^@]*@/i, "$1****@");
}

function stripBrackets(value) {
  const m = /^<(.*)>$/.exec(value);
  return m ? m[1] : value;
}

function looksEncoded(value) {
  return /%[0-9A-Fa-f]{2}/.test(value);
}

/**
 * @param {string} raw      value as typed / pasted
 * @param {string} [dbName] database name to add when the URI has none
 * @returns {{ uri: string, fixes: string[], problems: string[] }}
 */
function normalizeMongoUri(raw, dbName = DEFAULT_DB) {
  const fixes = [];
  const problems = [];

  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { uri: "", fixes, problems: ["MONGODB_URI is empty or not set."] };
  }

  let uri = String(raw);

  // 1. whitespace, line breaks, zero-width characters
  const trimmed = uri.replace(/[​-‍﻿]/g, "").replace(/\s+/g, "");
  if (trimmed !== uri) fixes.push("Removed spaces / line breaks.");
  uri = trimmed;

  // 2. wrapping quotes
  const unquoted = uri.replace(/^["'`]+|["'`]+$/g, "");
  if (unquoted !== uri) fixes.push("Removed wrapping quotes.");
  uri = unquoted;

  // 3. "MONGODB_URI=" pasted into the value box
  const noKey = uri.replace(/^(?:export)?MONGODB_URI=/i, "");
  if (noKey !== uri) fixes.push("Removed the 'MONGODB_URI=' prefix from the value.");
  uri = noKey.replace(/^["'`]+|["'`]+$/g, "");

  // 4. scheme
  const schemeMatch = /^(mongodb(?:\+srv)?):\/\//i.exec(uri);
  if (!schemeMatch) {
    problems.push(
      'Connection string must start with "mongodb+srv://" (Atlas) or "mongodb://". ' +
        "Copy it again from Atlas > Database > Connect > Drivers."
    );
    return { uri, fixes, problems };
  }
  const scheme = schemeMatch[1].toLowerCase();
  let rest = uri.slice(schemeMatch[0].length);

  // 5. credentials (split on the LAST '@' so passwords containing '@' still work)
  const at = rest.lastIndexOf("@");
  if (at === -1) {
    problems.push("No credentials found. Expected mongodb+srv://USER:PASSWORD@cluster...");
    return { uri: `${scheme}://${rest}`, fixes, problems };
  }
  const creds = rest.slice(0, at);
  let hostAndRest = rest.slice(at + 1);

  const colon = creds.indexOf(":");
  if (colon === -1) {
    problems.push("Password missing. Expected USER:PASSWORD before the @ sign.");
    return { uri: `${scheme}://${rest}`, fixes, problems };
  }
  let user = creds.slice(0, colon);
  let pass = creds.slice(colon + 1);

  if (/^<.*>$/.test(user) || /^<.*>$/.test(pass)) {
    fixes.push("Removed the < > brackets around username/password (they are placeholders, not part of the value).");
    user = stripBrackets(user);
    pass = stripBrackets(pass);
  }
  if (/^(username|user|password|db_?user|db_?password|your.?password)$/i.test(pass) || pass === "") {
    problems.push("The password still looks like a placeholder. Use the real database-user password.");
  }

  // encode special characters unless the value is already percent-encoded
  const encodeIfNeeded = (v, label) => {
    if (v && !looksEncoded(v) && encodeURIComponent(v) !== v) {
      fixes.push(`Percent-encoded special characters in the ${label}.`);
      return encodeURIComponent(v);
    }
    return v;
  };
  user = encodeIfNeeded(user, "username");
  pass = encodeIfNeeded(pass, "password");

  // 6. host / database / options
  const hostEnd = hostAndRest.search(/[\/?]/);
  const host = hostEnd === -1 ? hostAndRest : hostAndRest.slice(0, hostEnd);
  let tail = hostEnd === -1 ? "" : hostAndRest.slice(hostEnd);

  if (!host) problems.push("Cluster host is missing (e.g. cluster0.abcde.mongodb.net).");
  if (/[<>]/.test(host)) problems.push("The cluster host still contains < > placeholders.");
  if (scheme === "mongodb+srv" && host.includes(":")) {
    problems.push("mongodb+srv:// addresses must not contain a port number.");
  }

  let dbPath = "";
  let query = "";
  if (tail.startsWith("/")) {
    const q = tail.indexOf("?");
    dbPath = q === -1 ? tail.slice(1) : tail.slice(1, q);
    query = q === -1 ? "" : tail.slice(q);
  } else if (tail.startsWith("?")) {
    query = tail;
  }
  if (!dbPath) {
    dbPath = dbName;
    fixes.push(`Added the database name "/${dbName}".`);
  }
  if (!query) {
    query = "?retryWrites=true&w=majority";
    fixes.push("Added ?retryWrites=true&w=majority.");
  }

  uri = `${scheme}://${user}:${pass}@${host}/${dbPath}${query}`;
  return { uri, fixes, problems };
}

/** Turn a driver error into a plain-language hint. */
function explainConnectionError(err) {
  const msg = String((err && err.message) || err);
  if (/Invalid scheme/i.test(msg)) {
    return 'The value does not start with "mongodb+srv://". On Render put ONLY the connection string in the Value box (no "MONGODB_URI=", no quotes).';
  }
  if (/bad auth|Authentication failed/i.test(msg)) {
    return "Wrong database username or password. Atlas > Database Access: check the DB user (not your Atlas login) and reset the password to letters + numbers.";
  }
  if (/querySrv|ECONNREFUSED|ENOTFOUND/i.test(msg) && /srv|mongodb\.net/i.test(msg)) {
    return "DNS could not resolve the Atlas SRV record (common on some Wi-Fi/ISP/college networks). The app retries with Google DNS automatically; if it still fails use another network, or the non-SRV mongodb:// string from Atlas.";
  }
  if (/ReplicaSetNoPrimary|Server selection timed out|timed out/i.test(msg)) {
    return "Cannot reach the cluster. Atlas > Network Access: add 0.0.0.0/0 (Render has no fixed IP) and make sure the cluster is not paused.";
  }
  if (/password contains unescaped characters|URI malformed/i.test(msg)) {
    return "Special characters in the password must be percent-encoded. Easiest: set a password with only letters and numbers.";
  }
  return "See the message above. Run `npm run check-db` for a step-by-step diagnosis.";
}

module.exports = { normalizeMongoUri, explainConnectionError, redact, DEFAULT_DB };
