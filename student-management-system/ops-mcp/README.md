# student-ops MCP server

One MCP server = one agent for the whole stack (Student API, Render, Vercel, GitHub, MongoDB URI doctor).
Uses only the Python standard library besides `mcp`.

    pip install -r requirements.txt

Environment variables (set in `.vscode/mcp.json` or `.mcp.json`): see the top of `server.py`.
Tools: list/add/update/delete_student, render_list_services, render_set_env, render_deploy, render_status,
vercel_list_projects, vercel_set_env, vercel_redeploy, vercel_status, github_recent_commits,
diagnose_mongodb_uri, fix_mongodb_uri, sync_all, platform_status.
