"""Python port of backend/config/mongoUri.js (same rules, same output)."""
import re
from urllib.parse import quote

DEFAULT_DB = "studentdb"


def redact(uri: str) -> str:
    return re.sub(r"(mongodb(?:\+srv)?://[^:/@]+:)[^@]*@", r"\1****@", str(uri), flags=re.I)


def _looks_encoded(v: str) -> bool:
    return re.search(r"%[0-9A-Fa-f]{2}", v) is not None


def _strip_brackets(v: str) -> str:
    m = re.fullmatch(r"<(.*)>", v)
    return m.group(1) if m else v


def normalize_mongo_uri(raw, db_name: str = DEFAULT_DB):
    """Return (uri, fixes, problems)."""
    fixes, problems = [], []
    if raw is None or str(raw).strip() == "":
        return "", fixes, ["MONGODB_URI is empty or not set."]

    uri = str(raw)
    cleaned = re.sub(r"\s+", "", re.sub("[​-‍﻿]", "", uri))
    if cleaned != uri:
        fixes.append("Removed spaces / line breaks.")
    uri = cleaned

    unq = re.sub(r"^[\"'`]+|[\"'`]+$", "", uri)
    if unq != uri:
        fixes.append("Removed wrapping quotes.")
    uri = unq

    nokey = re.sub(r"^(?:export)?MONGODB_URI=", "", uri, flags=re.I)
    if nokey != uri:
        fixes.append("Removed the 'MONGODB_URI=' prefix from the value.")
    uri = re.sub(r"^[\"'`]+|[\"'`]+$", "", nokey)

    m = re.match(r"^(mongodb(?:\+srv)?)://", uri, flags=re.I)
    if not m:
        problems.append(
            'Connection string must start with "mongodb+srv://" (Atlas) or "mongodb://". '
            "Copy it again from Atlas > Database > Connect > Drivers."
        )
        return uri, fixes, problems
    scheme = m.group(1).lower()
    rest = uri[m.end():]

    at = rest.rfind("@")
    if at == -1:
        problems.append("No credentials found. Expected mongodb+srv://USER:PASSWORD@cluster...")
        return f"{scheme}://{rest}", fixes, problems
    creds, host_and_rest = rest[:at], rest[at + 1:]

    colon = creds.find(":")
    if colon == -1:
        problems.append("Password missing. Expected USER:PASSWORD before the @ sign.")
        return f"{scheme}://{rest}", fixes, problems
    user, pw = creds[:colon], creds[colon + 1:]

    if re.fullmatch(r"<.*>", user) or re.fullmatch(r"<.*>", pw):
        fixes.append("Removed the < > brackets around username/password (they are placeholders, not part of the value).")
        user, pw = _strip_brackets(user), _strip_brackets(pw)
    if pw == "" or re.fullmatch(r"(username|user|password|db_?user|db_?password|your.?password)", pw, flags=re.I):
        problems.append("The password still looks like a placeholder. Use the real database-user password.")

    def enc(v: str, label: str) -> str:
        if v and not _looks_encoded(v) and quote(v, safe="-_.!~*'()") != v:
            fixes.append(f"Percent-encoded special characters in the {label}.")
            return quote(v, safe="-_.!~*'()")
        return v

    user, pw = enc(user, "username"), enc(pw, "password")

    sep = re.search(r"[/?]", host_and_rest)
    host = host_and_rest if not sep else host_and_rest[: sep.start()]
    tail = "" if not sep else host_and_rest[sep.start():]

    if not host:
        problems.append("Cluster host is missing (e.g. cluster0.abcde.mongodb.net).")
    if re.search(r"[<>]", host):
        problems.append("The cluster host still contains < > placeholders.")
    if scheme == "mongodb+srv" and ":" in host:
        problems.append("mongodb+srv:// addresses must not contain a port number.")

    db_path, query = "", ""
    if tail.startswith("/"):
        q = tail.find("?")
        db_path = tail[1:] if q == -1 else tail[1:q]
        query = "" if q == -1 else tail[q:]
    elif tail.startswith("?"):
        query = tail
    if not db_path:
        db_path = db_name
        fixes.append(f'Added the database name "/{db_name}".')
    if not query:
        query = "?retryWrites=true&w=majority"
        fixes.append("Added ?retryWrites=true&w=majority.")

    return f"{scheme}://{user}:{pw}@{host}/{db_path}{query}", fixes, problems
