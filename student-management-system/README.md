# Student Information Management System — Project 1 (Vercel + Render + MongoDB Atlas + MCP agent)

```
User -> Vercel (frontend) -> Render (Express REST API) -> MongoDB Atlas
                    ^
   One AI agent (Claude / Copilot) controls ALL of it through MCP servers
```

| Requirement | How it is done |
|---|---|
| Use Vercel + Render, **not Netlify** | `frontend/` -> Vercel, `backend/` -> Render (Netlify files removed) |
| Claude as a **unified agent for multiple MCP servers** | `.vscode/mcp.json` / `.mcp.json` connect `student-ops` (ours) + official Render, Vercel, GitHub MCP servers; `CLAUDE.md` + `.github/copilot-instructions.md` give the agent its role and rules |
| Update **multiple platforms in one prompt** | `sync_all`, `fix_mongodb_uri`, `platform_status` tools in `ops-mcp/server.py` |
| **MongoDB URI issue** solved | `backend/config/mongoUri.js` (auto-fix + clear errors), `npm run check-db`, and `diagnose_mongodb_uri` / `fix_mongodb_uri` MCP tools |

## Folder map
```
backend/    Express API (Render)        config/mongoUri.js  config/db.js  scripts/check-db.js
frontend/   Static UI (Vercel)          build.js  vercel.json  package.json
ops-mcp/    Unified MCP server (Python) server.py  mongo_uri.py
.vscode/mcp.json   .mcp.json   CLAUDE.md   .github/copilot-instructions.md   render.yaml
```

---
## 1. The MongoDB URI issue — what goes wrong and how it is solved

| Symptom in logs | Real cause | Fix |
|---|---|---|
| `Invalid scheme, expected connection string to start with "mongodb://"` | Value box contains `MONGODB_URI=mongodb+srv://...`, quotes, spaces or a line break | Auto-removed by the app; paste only the string |
| `bad auth : Authentication failed` | Wrong DB-user password, or `<password>` brackets left in, or you used your Atlas *login* | Atlas > Database Access > Edit Password (letters+numbers) |
| `querySrv ECONNREFUSED` | Your network/ISP/college DNS blocks SRV lookups | App retries with Google DNS automatically; else mobile hotspot |
| `Server selection timed out` | Atlas Network Access does not allow Render | Add `0.0.0.0/0` |
| Works locally, fails on Render | Special characters (`@ # / :`) in password | App percent-encodes them automatically |
| Connected but data in wrong DB | No `/studentdb` in the string | App adds it |

Check it any time:
```
cd backend
npm run check-db        # prints what is wrong / what was auto-fixed (password hidden) and tries to connect
```
**Never commit a real password** (`.env.example` must keep `<username>:<password>`). If one was committed, reset it in Atlas.

---
## 2. Deploy

### A. MongoDB Atlas
Create M0 cluster -> Database Access: user + password (letters/numbers) -> Network Access: `0.0.0.0/0` -> copy the Drivers string.

### B. Backend on Render
New + > Web Service > your repo. If the repo has the project inside a folder, **Root Directory = `student-management-system/backend`** (otherwise `backend`).
Build `npm install` · Start `npm start` · Free.
Environment: `MONGODB_URI` (value = ONLY the string), `FRONTEND_URL` = your Vercel URL (add after step C; `*` for the first test).
Check `https://<service>.onrender.com/health` -> `"database":"connected"`.

### C. Frontend on Vercel (not Netlify)
1. vercel.com > Add New > Project > import the same repo.
2. **Root Directory** = `student-management-system/frontend` (or `frontend`). Framework Preset: **Other**. Leave build settings (they come from `vercel.json`).
3. Environment Variables: `API_BASE_URL` = `https://<service>.onrender.com` (no trailing slash, no `/api`).
4. Deploy. At build time `build.js` writes `config.js` from `API_BASE_URL`, so changing the backend later = change the env var + redeploy.
5. Copy your Vercel URL -> Render > Environment > `FRONTEND_URL` -> save (CORS).

---
## 3. The unified agent (Claude / Copilot + MCP)

### Setup (VS Code)
1. `pip install -r ops-mcp/requirements.txt` (Python 3.10+).
2. Open the folder `student-management-system` in VS Code (needs GitHub Copilot Chat, **Agent** mode).
3. Edit `.vscode/mcp.json`: replace the `REPLACE-...` values (Render URL, Vercel URL, `srv-...` id from `render_list_services`, Vercel project name).
4. Create the keys (kept out of the file; VS Code asks for them when the server starts):
   - Render: Account Settings > **API Keys**
   - Vercel: Account Settings > **Tokens**
   - GitHub (optional): fine-grained token for your repo only
5. `Ctrl+Shift+P` > **MCP: List Servers** > start `student-ops` (and the optional `render`, `vercel`, `github`). Vercel asks you to sign in (OAuth).
6. Claude Code users: `.mcp.json` does the same (`export RENDER_API_KEY=... VERCEL_TOKEN=...` first); `CLAUDE.md` is loaded automatically.

### One prompt, many platforms — examples
- *"Backend URL changed to https://new-api.onrender.com and frontend is https://my-app.vercel.app. Update CORS on Render, API URL on Vercel, redeploy both and verify."* -> `sync_all`
- *"Render logs say Invalid scheme. Fix the MongoDB URI and redeploy."* -> `diagnose_mongodb_uri` then `fix_mongodb_uri` (password never shown in chat)
- *"Is everything up? Show last commit too."* -> `platform_status`
- *"Add student ST210 Riya, riya@x.com, IT, year 2, then list IT students and show the latest GitHub commit."* -> several servers in one turn

### Safety
- Tokens come from environment/prompt inputs, never from chat or git. Revoke any token you ever pasted somewhere.
- Use minimum permissions (fine-grained GitHub token, team-scoped Vercel token).
- The agent is told to confirm before deleting data or changing production URLs.
- Not verified against live accounts here: the Vercel redeploy call and the Render env-var call were tested against mock servers only. If one fails, the error text is returned; the same action is also available through the official `render` / `vercel` MCP servers.

---
## 4. Local run
```
cd backend && npm install && cp .env.example .env   # edit .env
npm run check-db && npm start                        # API on :5000
cd ../frontend && npx serve -l 5500 .                # or: python -m http.server 5500
```
Local `frontend/config.js` points to `http://localhost:5000`.
