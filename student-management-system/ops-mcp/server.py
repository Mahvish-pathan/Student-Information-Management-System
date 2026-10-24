"""Student Ops MCP server - ONE agent that controls every platform of the project.

  Student API  (CRUD)            Render   (env vars, deploys, logs of state)
  Vercel       (env vars, redeploy)       GitHub  (commits)
  MongoDB URI  (diagnose + fix the value stored on Render, without showing the password)

Secrets come from environment variables (never from chat, never printed):
  RENDER_API_KEY   Render dashboard > Account Settings > API Keys
  VERCEL_TOKEN     Vercel > Account Settings > Tokens
  GITHUB_TOKEN     optional (public repos work without it)
Defaults so you do not have to repeat them in every prompt:
  STUDENT_API_URL, RENDER_SERVICE_ID (srv-...), VERCEL_PROJECT, GITHUB_REPO (owner/name),
  FRONTEND_URL (your Vercel URL), VERCEL_TEAM_ID (only for team accounts)
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request

from mcp.server.fastmcp import FastMCP

from mongo_uri import normalize_mongo_uri, redact

mcp = FastMCP("student-ops")

ENV = os.environ.get
RENDER_API = "https://api.render.com/v1"
VERCEL_API = "https://api.vercel.com"
GITHUB_API = "https://api.github.com"


# --------------------------------------------------------------------------- http
def _http(method, url, headers=None, body=None, timeout=90):
    """Return (ok, data_or_error)."""
    data = json.dumps(body).encode() if body is not None else None
    hdrs = {"Content-Type": "application/json", "Accept": "application/json", "User-Agent": "student-ops-mcp"}
    hdrs.update(headers or {})
    req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            text = res.read().decode() or "{}"
            try:
                return True, json.loads(text)
            except ValueError:
                return True, {"raw": text[:500]}
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read().decode())
            detail = detail.get("message") or detail.get("error") or detail
        except Exception:
            detail = ""
        return False, f"HTTP {e.code} {detail}".strip()
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def _need(name):
    v = ENV(name, "").strip()
    if not v:
        raise ValueError(f"Environment variable {name} is not set in the MCP server config.")
    return v


def _render(method, path, body=None):
    return _http(method, RENDER_API + path, {"Authorization": f"Bearer {_need('RENDER_API_KEY')}"}, body)


def _vercel(method, path, body=None):
    sep = "&" if "?" in path else "?"
    team = f"{sep}teamId={ENV('VERCEL_TEAM_ID')}" if ENV("VERCEL_TEAM_ID") else ""
    return _http(method, VERCEL_API + path + team, {"Authorization": f"Bearer {_need('VERCEL_TOKEN')}"}, body)


def _github(path):
    h = {"Accept": "application/vnd.github+json"}
    if ENV("GITHUB_TOKEN"):
        h["Authorization"] = f"Bearer {ENV('GITHUB_TOKEN')}"
    return _http("GET", GITHUB_API + path, h)


def _clean_url(u: str) -> str:
    u = (u or "").strip().strip("\"'").rstrip("/")
    if not u.lower().startswith(("http://", "https://")):
        raise ValueError(f"Not a valid URL: {u!r} (must start with https://)")
    return u


def _api_base() -> str:
    u = _clean_url(ENV("STUDENT_API_URL", "http://localhost:5000"))
    return u[:-4] if u.lower().endswith("/api") else u


def _service(service_id):
    sid = (service_id or ENV("RENDER_SERVICE_ID", "")).strip()
    if not sid:
        raise ValueError("Pass service_id or set RENDER_SERVICE_ID (looks like srv-xxxxxxxx).")
    return sid


def _project(project):
    p = (project or ENV("VERCEL_PROJECT", "")).strip()
    if not p:
        raise ValueError("Pass project or set VERCEL_PROJECT (the Vercel project name).")
    return p


def _safe(fn):
    """Run a step and always return a dict - one failing platform never hides the others."""
    try:
        return fn()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}


# ---------------------------------------------------------------- student api tools
def _students(method, suffix="", body=None):
    return _http(method, f"{_api_base()}/api/students{suffix}", body=body)


def _record_id(student_id):
    ok, res = _students("GET", "?search=" + urllib.parse.quote(student_id))
    if not ok:
        return None, res
    for s in res:
        if s.get("studentId", "").upper() == student_id.strip().upper():
            return s["_id"], None
    return None, f"No student found with Student ID {student_id}"


@mcp.tool()
def list_students(search: str = "") -> dict:
    """List students from the live API. Optional search by name, ID, email or department."""
    ok, res = _students("GET", "?search=" + urllib.parse.quote(search) if search else "")
    return {"ok": ok, "students" if ok else "error": res}


@mcp.tool()
def add_student(student_id: str, name: str, email: str, department: str, year: int, phone: str = "") -> dict:
    """Add a student (year 1-6, Student ID must be unique)."""
    ok, res = _students("POST", body={"studentId": student_id, "name": name, "email": email,
                                      "department": department, "year": year, "phone": phone})
    return {"ok": ok, "student" if ok else "error": res}


@mcp.tool()
def update_student(student_id: str, name: str | None = None, email: str | None = None,
                   department: str | None = None, year: int | None = None, phone: str | None = None) -> dict:
    """Update a student by Student ID. Only the fields you pass are changed."""
    rid, err = _record_id(student_id)
    if err:
        return {"ok": False, "error": err}
    changes = {k: v for k, v in {"name": name, "email": email, "department": department,
                                 "year": year, "phone": phone}.items() if v is not None}
    if not changes:
        return {"ok": False, "error": "Nothing to update: pass at least one field."}
    ok, res = _students("PUT", f"/{rid}", changes)
    return {"ok": ok, "student" if ok else "error": res}


@mcp.tool()
def delete_student(student_id: str) -> dict:
    """Delete a student by Student ID (cannot be undone)."""
    rid, err = _record_id(student_id)
    if err:
        return {"ok": False, "error": err}
    ok, res = _students("DELETE", f"/{rid}")
    return {"ok": ok, "result" if ok else "error": res}


# --------------------------------------------------------------------- render tools
@mcp.tool()
def render_list_services() -> dict:
    """List Render services (name, id, URL). Use this to find your RENDER_SERVICE_ID."""
    ok, res = _render("GET", "/services?limit=20")
    if not ok:
        return {"ok": False, "error": res}
    out = [{"name": s["service"].get("name"), "id": s["service"].get("id"),
            "type": s["service"].get("type"),
            "url": (s["service"].get("serviceDetails") or {}).get("url"),
            "suspended": s["service"].get("suspended")} for s in res]
    return {"ok": True, "services": out}


@mcp.tool()
def render_set_env(key: str, value: str, service_id: str = "") -> dict:
    """Create/update ONE environment variable on a Render service (does not redeploy by itself)."""
    ok, res = _render("PUT", f"/services/{_service(service_id)}/env-vars/{urllib.parse.quote(key)}", {"value": value})
    return {"ok": ok, "error" if not ok else "key": res if not ok else key}


@mcp.tool()
def render_deploy(service_id: str = "", clear_cache: bool = False) -> dict:
    """Trigger a new deploy on Render."""
    ok, res = _render("POST", f"/services/{_service(service_id)}/deploys",
                      {"clearCache": "clear" if clear_cache else "do_not_clear"})
    return {"ok": ok, "deploy_id" if ok else "error": (res.get("id") if ok else res)}


@mcp.tool()
def render_status(service_id: str = "") -> dict:
    """Latest Render deploy status for a service."""
    ok, res = _render("GET", f"/services/{_service(service_id)}/deploys?limit=1")
    if not ok:
        return {"ok": False, "error": res}
    d = (res[0] or {}).get("deploy", {}) if res else {}
    return {"ok": True, "status": d.get("status"), "commit": (d.get("commit") or {}).get("message"),
            "created": d.get("createdAt"), "finished": d.get("finishedAt")}


# -------------------------------------------------------------------- vercel tools
@mcp.tool()
def vercel_list_projects() -> dict:
    """List Vercel projects (name, id)."""
    ok, res = _vercel("GET", "/v9/projects?limit=20")
    if not ok:
        return {"ok": False, "error": res}
    return {"ok": True, "projects": [{"name": p["name"], "id": p["id"]} for p in res.get("projects", [])]}


@mcp.tool()
def vercel_set_env(key: str, value: str, project: str = "") -> dict:
    """Create/update an environment variable on a Vercel project (all environments). Redeploy to apply."""
    ok, res = _vercel("POST", f"/v10/projects/{urllib.parse.quote(_project(project))}/env?upsert=true",
                      {"key": key, "value": value, "type": "plain",
                       "target": ["production", "preview", "development"]})
    return {"ok": ok, "error" if not ok else "key": res if not ok else key}


@mcp.tool()
def vercel_redeploy(project: str = "") -> dict:
    """Redeploy the latest production deployment of a Vercel project (picks up new env vars)."""
    name = _project(project)
    ok, res = _vercel("GET", f"/v6/deployments?app={urllib.parse.quote(name)}&target=production&limit=1")
    if not ok:
        return {"ok": False, "error": res}
    deps = res.get("deployments", [])
    if not deps:
        return {"ok": False, "error": "No production deployment found. Deploy once from the Vercel dashboard first."}
    ok, res = _vercel("POST", "/v13/deployments?forceNew=1",
                      {"name": name, "deploymentId": deps[0]["uid"], "target": "production"})
    return {"ok": ok, "url" if ok else "error": (res.get("url") if ok else res)}


@mcp.tool()
def vercel_status(project: str = "") -> dict:
    """Latest Vercel deployment state."""
    name = _project(project)
    ok, res = _vercel("GET", f"/v6/deployments?app={urllib.parse.quote(name)}&limit=1")
    if not ok:
        return {"ok": False, "error": res}
    d = (res.get("deployments") or [{}])[0]
    return {"ok": True, "state": d.get("state"), "url": d.get("url"), "target": d.get("target")}


# -------------------------------------------------------------------- github tool
@mcp.tool()
def github_recent_commits(repo: str = "", count: int = 5) -> dict:
    """Recent commits of a GitHub repo (owner/name). Public repos work without a token."""
    r = (repo or ENV("GITHUB_REPO", "")).strip()
    if "/" not in r:
        return {"ok": False, "error": "Pass repo as owner/name or set GITHUB_REPO."}
    ok, res = _github(f"/repos/{r}/commits?per_page={max(1, min(count, 20))}")
    if not ok:
        return {"ok": False, "error": res}
    return {"ok": True, "commits": [{"sha": c["sha"][:7], "date": c["commit"]["author"]["date"],
                                      "message": c["commit"]["message"].split("\n")[0]} for c in res]}


# ------------------------------------------------------------ MongoDB URI doctor
def _render_mongo_value(sid):
    ok, res = _render("GET", f"/services/{sid}/env-vars?limit=100")
    if not ok:
        raise ValueError(res)
    for item in res:
        ev = item.get("envVar", item)
        if ev.get("key") == "MONGODB_URI":
            return ev.get("value")
    return None


@mcp.tool()
def diagnose_mongodb_uri(service_id: str = "") -> dict:
    """Read MONGODB_URI stored on Render, find what is wrong with it and report (password hidden)."""
    raw = _render_mongo_value(_service(service_id))
    if raw is None:
        return {"ok": False, "error": "MONGODB_URI is not set on this Render service. Add it under Environment."}
    uri, fixes, problems = normalize_mongo_uri(raw)
    return {"ok": not problems, "stored_value_length": len(raw), "cleaned_preview": redact(uri),
            "wrong_but_fixable": fixes, "you_must_fix": problems}


@mcp.tool()
def fix_mongodb_uri(service_id: str = "", redeploy: bool = True) -> dict:
    """Clean the MONGODB_URI stored on Render (quotes, prefix, brackets, encoding, db name), save it
    back and redeploy. The password never passes through the chat. Refuses if the problem is a wrong
    password / placeholder (only you can supply that)."""
    sid = _service(service_id)
    raw = _render_mongo_value(sid)
    if raw is None:
        return {"ok": False, "error": "MONGODB_URI is not set on this Render service."}
    uri, fixes, problems = normalize_mongo_uri(raw)
    if problems:
        return {"ok": False, "you_must_fix": problems, "note": "Nothing was changed."}
    if not fixes:
        return {"ok": True, "note": "The stored value is already clean. If the app still fails, run `npm run check-db` "
                                    "(wrong password / Atlas Network Access are not URI-format problems)."}
    ok, res = _render("PUT", f"/services/{sid}/env-vars/MONGODB_URI", {"value": uri})
    if not ok:
        return {"ok": False, "error": res}
    out = {"ok": True, "applied_fixes": fixes, "saved_preview": redact(uri)}
    if redeploy:
        out["deploy"] = render_deploy(sid)
    return out


# ------------------------------------------------- ONE PROMPT -> MANY PLATFORMS
@mcp.tool()
def sync_all(api_url: str = "", frontend_url: str = "", render_service_id: str = "",
             vercel_project: str = "") -> dict:
    """Update every platform in one call:
       1. Render:  FRONTEND_URL = frontend_url (CORS)  -> redeploy backend
       2. Vercel:  API_BASE_URL = api_url              -> redeploy frontend
       3. Verify:  GET api_url/health
    Defaults come from STUDENT_API_URL / FRONTEND_URL / RENDER_SERVICE_ID / VERCEL_PROJECT."""
    report = {}

    def prep():
        a = _clean_url(api_url or ENV("STUDENT_API_URL", ""))
        a = a[:-4] if a.lower().endswith("/api") else a
        f = _clean_url(frontend_url or ENV("FRONTEND_URL", ""))
        return a, f

    try:
        api, front = prep()
    except ValueError as e:
        return {"ok": False, "error": str(e)}

    report["render_cors"] = _safe(lambda: render_set_env("FRONTEND_URL", front, render_service_id))
    report["render_deploy"] = _safe(lambda: render_deploy(render_service_id))
    report["vercel_env"] = _safe(lambda: vercel_set_env("API_BASE_URL", api, vercel_project))
    report["vercel_redeploy"] = _safe(lambda: vercel_redeploy(vercel_project))
    ok, res = _http("GET", f"{api}/health", timeout=90)
    report["api_health"] = {"ok": ok, "response": res}
    report["ok"] = all(v.get("ok") for v in report.values() if isinstance(v, dict))
    report["note"] = "Render may take 1-3 minutes to finish deploying; run platform_status to confirm."
    return report


@mcp.tool()
def platform_status(render_service_id: str = "", vercel_project: str = "", repo: str = "") -> dict:
    """One-shot health overview of the whole stack: API + database, Render, Vercel, latest GitHub commit."""
    ok, health = _http("GET", f"{_api_base()}/health", timeout=90)
    return {
        "api_health": {"ok": ok, "response": health},
        "render": _safe(lambda: render_status(render_service_id)),
        "vercel": _safe(lambda: vercel_status(vercel_project)),
        "github": _safe(lambda: github_recent_commits(repo, 1)),
    }


if __name__ == "__main__":
    mcp.run()
