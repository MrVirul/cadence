# Decisions

One line per non-obvious decision, newest last. Format: `YYYY-MM-DD — decision — why`.

Precedence reminder: where the root `AGENTS.md` (the Cadence brief) and a
Launchbase folder-level `AGENTS.md` disagree, the **root brief wins**.

## Bootstrap (Phase 0)

- 2026-10-11 — Adopted the root `AGENTS.md` as the single source of truth, overriding the Launchbase folder-level `AGENTS.md` files where they differ — the assessment brief states the brief wins over the template.
- 2026-10-11 — Tests are **required**, overriding `api/AGENTS.md` ("Don't need to add tests in MVP iterations, move fast") — brief hard rule #4 requires `uv run pytest` to pass offline, and tenancy/AI (`★★★`) can only be trusted with tests.
- 2026-10-11 — Pinned Python 3.12 (`uv python pin 3.12`) even though `pyproject.toml` allows `>=3.12` and the machine's default is 3.13 — brief §3 names Python 3.12; keeps local runs on the documented interpreter.
- 2026-10-11 — Kept the template's model-level constraint style (root `AGENTS.md` §3): partial indexes / check constraints are declared on the model (`Index(..., postgresql_where=...)`, `CheckConstraint`) so autogenerate sees them; this narrows `api/AGENTS.md`'s "only manual edit is `server_default`" guidance — root wins.
- 2026-10-11 — Kept updating `api/requests.org` on API changes (brief is silent; `api/AGENTS.md` requires it) **in addition to** regenerating the orval client (brief §3) — brief is silent, template rule applies.
- 2026-10-11 — `.env` files are git-ignored for the API; the front ends' `.env.development`/`.env.production` are committed public build config and contain no secrets (verified) — none need a secret.
- 2026-10-11 — Local dev runs a `postgres:16` Docker container (`cadence-postgres`) on port 5432; the host has only Postgres 14 — brief §3 mandates Postgres 16, and pytest already spins `postgres:16` via testcontainers.
- 2026-10-11 — Removed the tracked leftover `admin/.vite/` build cache — dead template artifact (internal/ replaced admin/ in the base repo history); tracked `.vite` deps are not source.

## Product decisions (from the brief, recorded here for the trail)

- 2026-10-11 — Members cannot see teammates' plans (least privilege), even though leads/admins can — reduces leak surface; recorded from brief §5.
- 2026-10-11 — Staff (`/internal`) never see plan, task, or AI prompt text, only metadata and counts — deliberate privacy call; `ai_calls` stores no prompt/response text.
- 2026-10-11 — Cross-org access returns **404**, never 403, and never a distinct message — do not reveal that another org's resource exists.
