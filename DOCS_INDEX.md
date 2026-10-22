# Cadence — Markdown Docs Index

What every markdown file in the repo root and `docs/` contains, and when to read it.

---

## Root

### `AGENTS.md` — The build spec (source of truth)
The full assessment brief and build rules for Cadence. Covers product identity (name, pitch, brand tokens, logo), stack conventions, data model summary, tenancy & access rules (the ★★★ item), API surface design, AI integration spec, frontend routes, testing requirements, seed command, the two-day execution plan, git housekeeping, scope-control cuts, and the definition-of-done checklist. Where this file and the Launchbase template's folder-level `AGENTS.md` files disagree, **this file wins**. Read this first in any session.

### `README.md` — Repo orientation
Short entry point: what Cadence is, the monorepo structure (`api/`, `app/`, `internal/`, `site/`), requirements (Python 3.12 + uv, Node 24+, Postgres 16), and pointers to each folder's README. Also mentions the tmuxp dev session.

### `RUNNING.md` — Local development guide
How to get everything running locally: service/port table (API 8000, site 3000, app 3001, internal 3002), prerequisites, starting Postgres 16 in Docker, API setup (uv sync, `.env`), running migrations/seed, and starting each frontend dev server. The practical "make it run" doc.

### `SUBMISSION.md` — Final assessment submission
What gets handed in: full setup-from-scratch instructions, demo login table (member / lead / owner / staff), the name-and-pitch rationale, key decisions (tenancy 404-vs-403, least-privilege plan visibility, staff privacy call, AI failure design), honest hours, and what isn't done (cuts, known issues, next steps).

### `GEMINI.md` — Condensed agent rules
A short-form version of `AGENTS.md` for quick agent context: hard rules only (generated orval client, no hand-written fetch, tenancy is API-enforced, 404/403 semantics, no plan text in staff panel, brand tokens, AI-failure copy, run only the checks for the folder you changed). Points back to `AGENTS.md` for anything missing.

### `interview-prep-cadence.md` — Interview preparation Q&A
Comprehensive interview-oriented walkthrough of the codebase: architecture, multi-tenancy design, data model, hardest weekly-planner logic, AI features and failure handling, auth/authz, testing, plus FastAPI/Postgres/Go/DevOps/Mobile topic sections. Ends with a **DSA section** (§13) mapping state machines, sliding-window rate limits, grouped aggregation, row locks/CAS, and frozenset validators to the actual code.

---

## `docs/`

### `docs/DATA_MODEL.md` — Schema design doc
The Phase 1 design doc for the database: conventions (UUID PKs, UTC timestamps, no DB enums — String + CheckConstraint, `org_id` on every tenant-owned table), a section per table (`users`, `organizations`, `memberships`, `invites`, `teams`, `team_members`, `plans`, `tasks`, `plan_events`, `ai_calls`, `staff_actions`), the plan state machine, invariants and where each is enforced, and migration notes.

### `docs/API.md` — API design doc
The Phase 1 API design: conventions (error body `{"detail", "code"}`, pagination, identifier validation, 404-vs-403 access semantics), every `/app` endpoint grouped by area (auth, orgs, invites, members, teams, plans/tasks, AI), every `/internal` endpoint, the error-code list, endpoints needing extra care, and the **tenancy rules restated as testable statements**.

### `docs/DECISIONS.md` — Decision log
One line per non-obvious decision, chronological (`date — decision — why`), grouped by phase (bootstrap, product, data model, teams, plans, seed, AI, brand). Records conflicts resolved in favor of the brief over the template, and product calls like members-can't-see-teammates'-plans, 404-not-403 for cross-org, and staff-never-see-plan-text. The "why we did it this way" trail.

### `docs/AI_NOTES.md` — AI design & eval notes
Everything about the two AI features: model/settings (`gemini-3.5-flash-lite`, lazy agents, key handling), prompt design (role, rubric, few-shot rewrites, injection guard), a validator bug found and fixed during development, the eval harness (`api/scripts/eval_review.py`, 10 fixture plans), the real-run results against a live key, and known weaknesses.

### `docs/SECURITY_REVIEW.md` — Attacker review (Appendix B)
The security audit against the brief's attacker checklist: a table mapping each check (org isolation, forbidden server-controlled fields, role boundaries, invite escalation, token audiences, suspension, deactivation, single-use invites, no enumeration, staff privacy, AI abuse, concurrency) to its enforcement point, proving test, and verdict; an exhaustive per-query audit of every `select`/`update`/`delete` in the services; and secrets verification.

### `docs/CUTS.md` — Scope cuts & limitations
What was deliberately cut or simplified and why: member-removal cascade deleting history, `/app/me` not returning membership IDs, no email sending/verification/password-reset, manual Lighthouse runs, free-tier AI eval, no cloud deployment, simplified team history pagination. Ends with the five things that would be fixed with another day.

### `docs/DEMO_LOGINS.md` — Demo credentials
The table generated by `uv run manage.py seed-demo`: every demo user (staff, owners, admins, leads, members across Northwind Labs, Bluebird Studio, and Dormant Co), all with password `cadence-demo-1`. Copied into `SUBMISSION.md`.

---

## Folder-level docs (for completeness)

- `api/README.md`, `app/README.md`, `internal/README.md`, `site/README.md` — per-folder setup and workflow.
- `api/AGENTS.md`, `app/AGENTS.md`, `internal/AGENTS.md`, `site/AGENTS.md` — per-folder template rules (yield to root `AGENTS.md` where they conflict).
- `site/DESIGN.md` — the marketing site's design system (typography scale, palette, usage rules).
