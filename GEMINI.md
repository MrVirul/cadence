# Cadence: agent rules (short version)

Full spec is in AGENTS.md. Read ONLY the section you need (use grep -n "^## " AGENTS.md, then sed -n).
Backend is DONE and green. Do not change api/ unless a task says so.
Hard rules:

- Never use localStorage-style hacks for auth; use the generated orval client (npm run generate), never hand-written fetch.
- Tenancy and roles are enforced by the API; the UI only hides things cosmetically.
- 404 = no read access, 403 = can read but not act. Show a clear "no access" page for both.
- Staff panel never shows plan or task text.
- Brand: "Cadence", indigo #4F46E5, font Inter. Nothing user-facing may say "Launchbase".
- AI features are optional; show plain-language notices on 503/429/504/502. Never call AI on keystroke.
- Run only the checks for the folder you changed: npm run type-check && npm run build.
- Commit small, no --no-verify. Do not touch .gitignore, RUNNING.md, startup.sh.
  Be concise: no long plans, no summaries between steps.
