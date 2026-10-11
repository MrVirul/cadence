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

## Phase 1 — data model & API design

- 2026-10-11 — Adopt the brief's error shape `{"detail": str, "code": "snake_case"}` for all errors, replacing the template's `{"detail":[{type,loc,msg}]}` + UPPER_SNAKE codes — brief §6 fixes the shape; `APIException` and existing `/internal` tests updated in Phase 3.
- 2026-10-11 — Adopt the brief's auth paths (`POST /app/auth/login`, `POST /app/auth/signup`, `GET /app/me`) and retire `GET /app/users/self`; keep `POST /app/auth/logout` — brief §6 lists the login/signup/me paths.
- 2026-10-11 — Sign-up accepts optional `name` and splits it on the first space into the non-null `first_name`/`last_name`; absent name derives from the email local-part — the users table has no `name` column.
- 2026-10-11 — Add `created_at` (and `updated_at` on `plans`/`tasks`) where the brief is silent, following the template's `TimestampMixin` — additive, matches the users resource.
- 2026-10-11 — `main.why` required is enforced in the service at create/submit (422), **not** a DB CHECK — a draft must be saveable while incomplete.
- 2026-10-11 — Invite `expires_in_days` optional override, default +7 days, assumed allowed range 1–30.
- 2026-10-11 — A lead's/owner's own plan that has no other eligible approver returns 409 rather than allowing self-approval; seed guarantees each org has ≥2 privileged members — preserves "nobody approves their own plan".
- 2026-10-11 — `plan.team_id` is mutable via `PUT` while `draft`, frozen once `submitted`+.
- 2026-10-11 — Week boundary computed in UTC; Monday check is date-only (`EXTRACT(ISODOW)=1`), enforced by DB CHECK + schema 422.
- 2026-10-11 — `plan_events.actor_membership_id` nullable with `ON DELETE SET NULL`; new events always set it — audit history survives member removal.
- 2026-10-11 — `ai_calls.membership_id` non-null even on failure/`disabled` rows; `staff_actions.target_id` is polymorphic with no FK (append-only audit).
- 2026-10-11 — `/internal/ai-usage` computes `p50` via Postgres `percentile_cont` and `avg` in one grouped query — no N+1.
- 2026-10-11 — Reuse the template's list envelope `{items,total,limit,offset}` with `limit` default 50 / max 100, `offset ≥ 0`.
- 2026-10-11 — Keep `api/requests.org` in sync with every API change, committed alongside the code — `api/AGENTS.md` requires it (brief is silent).
- 2026-10-11 — Use only `is_platform_staff` in new code; org `owner`/`admin` roles are never conflated with the `is_admin` platform-staff column — brief §4.
- 2026-10-11 — Team/lead same-org and "lead must be a team member" are enforced in the service layer (not composite FKs), per brief §4 — simpler and explicitly what the brief asks to test.
