# Student Information Management System — Three-Tier Cloud Deployment

```
User → Netlify (Frontend) → Render (Express REST API) → MongoDB Atlas (Database)
```

| Tier | Technology | Hosted on | Folder |
|------|-----------|-----------|--------|
| Presentation | HTML, CSS, JavaScript | Netlify | `frontend/` |
| Application | Node.js, Express.js, Mongoose | Render | `backend/` |
| Database | MongoDB (`students` collection) | MongoDB Atlas | — |

The frontend never talks to MongoDB directly; every action is an HTTP call to the Render API.

## REST API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/students` | All students (`?search=term` to filter by name, ID, email, department) |
| GET | `/api/students/:id` | One student |
| POST | `/api/students` | Add a student |
| PUT | `/api/students/:id` | Update a student |
| DELETE | `/api/students/:id` | Delete a student |
| GET | `/health` | Health check (shows DB connection state) |

Student document:

```json
{
  "studentId": "ST101",
  "name": "Rahul Sharma",
  "email": "rahul@example.com",
  "department": "Computer Engineering",
  "year": 3,
  "phone": "9876543210"
}
```

## Step 1 — MongoDB Atlas (Database tier)

1. Create a free account at https://www.mongodb.com/atlas and create a free **M0** cluster.
2. **Database Access** → Add a database user (username + password). Note them down.
3. **Network Access** → Add IP address → `0.0.0.0/0` (Allow access from anywhere). Render's free plan has no fixed IP.
4. **Database** → Connect → Drivers → copy the connection string and add the database name:
   ```
   mongodb+srv://<username>:<password>@<cluster>.mongodb.net/studentdb?retryWrites=true&w=majority
   ```
   If the password has special characters (`@`, `#`, `/`…), URL-encode them.

The `students` collection is created automatically on the first insert.

## Step 2 — Run locally (optional but recommended)

```bash
cd backend
npm install
cp .env.example .env        # then edit .env with your Atlas string
npm start                   # API on http://localhost:5000
```

In another terminal serve the frontend (any static server works):

```bash
cd frontend
npx serve -l 5500 .         # open http://localhost:5500
```

`frontend/config.js` already points to `http://localhost:5000`. Set `FRONTEND_URL=http://localhost:5500` in `backend/.env`.

## Step 3 — Backend on Render (Application tier)

1. Push this whole project to a GitHub repository.
2. On https://render.com → **New +** → **Web Service** → connect the repo.
3. Settings:
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance type:** Free
   (Or use **Blueprint** and select the included `render.yaml`.)
4. **Environment variables:**
   - `MONGODB_URI` = your Atlas connection string
   - `FRONTEND_URL` = your Netlify URL (add this after Step 4; use `*` temporarily if needed)
5. Deploy. Your API URL will look like `https://student-api.onrender.com`.
6. Test it: open `https://<your-service>.onrender.com/health` — it should show `"database":"connected"`.

> Free Render services sleep after ~15 minutes idle; the first request can take 30–60 seconds.

## Step 4 — Frontend on Netlify (Presentation tier)

1. Edit `frontend/config.js` and set:
   ```js
   API_BASE_URL: "https://<your-service>.onrender.com"
   ```
   Commit and push (or just edit before uploading).
2. On https://app.netlify.com → **Add new site**:
   - **Drag & drop:** drag the `frontend` folder onto Netlify, **or**
   - **From Git:** select the repo, **Base directory:** `frontend`, **Build command:** *(empty)*, **Publish directory:** `frontend`.
3. Copy the Netlify URL (e.g. `https://my-students.netlify.app`).
4. Go back to Render → Environment → set `FRONTEND_URL` to that URL (no trailing slash) → save (auto-redeploys).

## Step 5 — Verify the full flow

Open the Netlify URL and check: add a student, see it in the table, search, edit, delete. Then confirm the document in Atlas under **Browse Collections → studentdb → students**.

## Security notes

- Credentials live only in environment variables (`.env` is git-ignored).
- CORS restricts the API to your Netlify origin.
- The API whitelists accepted fields, validates input (Mongoose schema), and escapes search text.
- Atlas access is via a dedicated DB user over TLS (`mongodb+srv`).

## Project structure

```
student-management-system/
├── README.md
├── render.yaml
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── .env.example
│   ├── models/Student.js
│   └── routes/students.js
└── frontend/
    ├── index.html
    ├── style.css
    ├── app.js
    ├── config.js
    └── netlify.toml
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Frontend shows "Cannot reach the server" | Render service may be waking up; also check `API_BASE_URL` in `config.js`. |
| Browser console CORS error | `FRONTEND_URL` on Render must exactly match the Netlify URL (https, no trailing slash). |
| `/health` shows `disconnected` / crash on start | Check `MONGODB_URI`, DB user password, and Atlas Network Access (`0.0.0.0/0`). |
| 409 "Student ID already exists" | `studentId` must be unique. |
