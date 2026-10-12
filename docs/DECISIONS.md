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
- 2026-10-11 — Self-approval is **blocked when another eligible approver exists** (another lead of that team, or another org owner/admin); if **no** other eligible approver exists the author may approve/send back their own plan and `plan_events.self_approved=true` is recorded — avoids dead-ending a team with a single privileged member; replaces the earlier "409 no approver" plan (do not keep both).
- 2026-10-11 — `plan.team_id` is mutable via `PUT` while `draft`, frozen once `submitted`+.
- 2026-10-11 — Week boundary computed in UTC; Monday check is date-only (`EXTRACT(ISODOW)=1`), enforced by DB CHECK + schema 422.
- 2026-10-11 — `plan_events.actor_membership_id` nullable with `ON DELETE SET NULL`; new events always set it — audit history survives member removal.
- 2026-10-11 — `ai_calls.membership_id` non-null even on failure/`disabled` rows; `staff_actions.target_id` is polymorphic with no FK (append-only audit).
- 2026-10-11 — `/internal/ai-usage` computes `p50` via Postgres `percentile_cont` and `avg` in one grouped query — no N+1.
- 2026-10-11 — Reuse the template's list envelope `{items,total,limit,offset}` with `limit` default 50 / max 100, `offset ≥ 0`.
- 2026-10-11 — Keep `api/requests.org` in sync with every API change, committed alongside the code — `api/AGENTS.md` requires it (brief is silent).
- 2026-10-11 — Use only `is_platform_staff` in new code; org `owner`/`admin` roles are never conflated with the `is_admin` platform-staff column — brief §4.
- 2026-10-11 — Team/lead same-org and "lead must be a team member" are enforced in the service layer (not composite FKs), per brief §4 — simpler and explicitly what the brief asks to test.

## Phase 1 — doc fixes (self-approval, 404/403, team-week, staff access)

- 2026-10-11 — Added `plan_events.self_approved` (`boolean`, not null, default `false`), set `true` only when the author approves/sends back their own plan because no other eligible approver exists — makes the self-approval auditable.
- 2026-10-11 — Each row of `GET /app/orgs/{org_id}/teams/{team_id}/week` now includes a nullable `plan_id` (null when the member has no plan that week) — the team-week table needs to link a row to its plan.
- 2026-10-11 — `DELETE /app/orgs/{org_id}/teams/{team_id}` returns `409 conflict` when the team still has plans (`plans.team_id` is `ON DELETE RESTRICT`) — prevents orphaning plans; the caller reassigns or deletes them first.
- 2026-10-11 — Global error-status rule: `404 not_found` when the caller has **no read access** to the resource (non-member, teammate's plan, team they are not in, other team as a non-lead, cross-org id), `403 forbidden` when they **can read** it but are **not allowed to act** — applied to PUT plan, task tick, team week/history, approve, send-back and close so status codes are consistent and non-disclosing.
- 2026-10-11 — `/internal` access split: a **wrong-audience** token → `401 unauthorized`; a **right-audience** internal token whose user is not `is_admin` → `403 staff_only`; a staff token on `/app/orgs/...` → `404` (staff are not org members) — fixes the intro, the error table, rule 28 and rules 32–35.
- 2026-10-11 — Removed ambiguous "X/Y" status codes from the tenancy rules: rule 14 (cross-org `team_id`) → `404`, rule 25 (admin touches owner) → `403`, rule 33 (staff token on `/app/orgs/...`) → `404`.
- 2026-10-11 — `PUT /app/orgs/{org_id}/plans/{plan_id}` matches tasks by `id` and updates them in place (ids stay stable); new tasks omit `id`; tasks present on the plan but absent from the body are deleted — keeps client-side task references stable across edits.
- 2026-10-11 — Sign-up explicitly sets `is_active=true`; a test asserts a freshly signed-up user can log in immediately — otherwise the template's `is_active=false` default would lock out new accounts.
- 2026-10-11 — Known MVP limit: removing (or deactivating) a member also **deletes that member's plans** (the `memberships` cascade) — simplest consistent behaviour; historical team metrics for departed members are not preserved.
- 2026-10-11 — A plan keeps its `team_id` if the author later leaves that team, and an org owner/admin can always approve it — avoids orphaned/unapprovable plans when team membership changes after submission.
- 2026-10-12 — 422 `validation_error` folds each field into `detail` as `"<field>: <message>"` entries joined by `"; "` (errors without a field keep just their message) — the UI can still show field-scoped errors next to inputs while the body stays a single string per the `{detail, code}` shape.

## Phase 3 — teams

- 2026-10-12 — Creating a team with `lead_membership_id` also adds that membership to the team (`team_members`) in the same request — "the lead must be a member of the team" (brief §4) would otherwise be violated by the create call itself; `PUT .../lead` still requires the membership to already be on the team (`422` otherwise).
- 2026-10-12 — Replacing a team's member set (`PUT .../members`) that drops the current lead **clears** `lead_membership_id` (never `422`) and the team row is locked `SELECT ... FOR UPDATE` first — clearing is the least surprising behaviour, and the lock serializes two concurrent replacements so no dangling lead can survive (API.md rule 40).
- 2026-10-12 — Team write routes answer **404** to an org member who is not on the team and **403** to a member of the team who is not an admin/owner; team reads follow the same read-access split (`GET .../teams/{id}` is 404 for a non-member, 200 for a teammate or admin) — consistent with the global 404-vs-403 rule (no-read-access → 404, can-read-but-cannot-act → 403).
- 2026-10-12 — Added `ValidationException` (422 `validation_error`) for service-level business-rule rejections that are not Pydantic schema errors (e.g. "team lead must be a member") — keeps one error code for all 422s so the UI switches once.
- 2026-10-12 — Test DB schema is dropped and recreated per test (`conftest.test_engine`), not just `create_all` — the Postgres container is session-scoped, so committed rows otherwise persist across tests and Faker's small email space collides on `users_email_key` (a flaky 500 that the larger team suite made likely).

## Phase 3.5 — plans & tasks

- 2026-10-12 — `team_id` not-a-member on plan **create** is read-then-act: an admin/owner (can read the team) gets `403`, a plain member (cannot read the team) gets `404` — one consistent rule instead of a leaked "the team exists" signal.
- 2026-10-12 — A plan **submitted** after its author left the team answers `403` (the author can always read their own plan; "left the team" is an act-level constraint, not a read-level one) — a 404 would wrongly tell the author their plan vanished.
- 2026-10-12 — The `?week=` **filter** on `GET /plans` accepts any valid date (no Monday enforcement); only plan **creation/submission** enforces "Monday within 0–4 weeks ahead" — the filter is a list lookup, not a state transition.
- 2026-10-12 — Task ticking is read-then-act too: a teammate who cannot read the plan gets `404`, a reader who is not the author (e.g. an org owner) gets `403` — matches the global split and the test now asserts both.
- 2026-10-12 — The injected "today" dependency (`get_today`) is overridden on the **mounted `/app` sub-application** in tests (`app.main.app_api`), not the root app — the customer routes live on the sub-app, so parent-app overrides silently no-op (conftest's `get_db` override only worked by accident via the module-global engine swap).
- 2026-10-12 — `decided_by` is modelled as a `PlanPerson` (membership + user) rather than a raw id; `decision_comment` is cleared on **approve** (a fresh approval is not a lingering "sent back" reason) and set to the required comment on **send-back**.

## Phase 3.6 — team week & history

- 2026-10-12 — A member who belongs to two teams files their single weekly plan under exactly one of them (`plans.team_id`); the week view of the *other* team shows that member as `not_started` — the row belongs to the team the plan was filed under, so no plan is counted twice across teams.
- 2026-10-12 — `shipped_rate` is shipped plans ÷ all plans over the **returned page** of past weeks (rounded to 4 dp, `null` when the page has no plans), and a week's `total` counts every plan filed under the team that week whatever its status — unfinished/abandoned plans should count against the rate, not disappear from it.
- 2026-10-12 — Week/history `?week=` must be a Monday (`422 validation_error` otherwise); a teammate who is not the team's lead can read the team but not its week/history, so they get `403 forbidden`, while an org member outside the team gets `404 not_found` — same global read-then-act split as the rest of the teams surface.
- 2026-10-12 — Added a second org-A team to the tenancy-matrix fixture (`week_team_a`) where the shared plain member is *not* the lead, so the week/history registry legs exercise the required teammate = `403` (the original `team_a` has that member as its lead and would return `200`).

## Phase 4 — demo seed

- 2026-10-12 — Set `email_validator.TEST_ENVIRONMENT = not settings.is_production` in `app/config.py`: the demo accounts use the reserved `.test` TLD that the brief names (root §10), and `email-validator` refuses `.test` unless test mode is on, which would have made the demo logins fail the real login route. Production keeps the strict check.
- 2026-10-12 — The seed pins each org's slug to the brief's slug (`northwind`, `bluebird`, `dormant`) right after `OrganizationService.create_with_owner` (which would slugify `Northwind Labs` → `northwind-labs`). Reset and the idempotency check key off those slugs.
- 2026-10-12 — Past weeks are written directly (the API rejects past `week_start`); the current week is built through `PlanService` create/submit/approve/send-back so its tasks, statuses and `plan_events` match every rule. `ai_calls` are written directly (no AI feature yet) and never contain prompt/plan text — metadata only.
- 2026-10-12 — Every active member is placed on a team so they all get six past weeks of plans per the brief; owners/admins are team members too (a team row is not a privilege boundary). A team with no lead (`Bluebird`/`Core`) has its plans self-approved by the author, recorded via `plan_events.self_approved`, which exercises the documented self-approval branch.
- 2026-10-12 — The seed guarantees at least one `error`, one `timeout` and one `rate_limited` `ai_calls` row per active org (rather than leaving the rare states to chance) so the admin usage view always has every state to show.

## Phase 5 — AI backend (plan review & draft)

- 2026-10-12 — The two review/draft agents are reached through one cached accessor each (`build_review_agent()` / `build_draft_agent()`, `lru_cache`) and the routes call those same objects, so tests override the model on the singleton the routes use; `/app` is a mounted sub-app, so FastAPI dependency overrides on the root app would silently no-op — the accessors are the seam instead.
- 2026-10-12 — Tests are hermetic: an autouse `stub_ai` fixture seeds a fake `GOOGLE_API_KEY` and overrides both agents with a deterministic `FunctionModel` returning a valid `PlanReview`/`PlanDraft`, while `pydantic_ai.models.ALLOW_MODEL_REQUESTS` stays `False` — the suite passes with no `.env`, no key and no network. Tests that need the disabled state or a failing model override the key/model locally.
- 2026-10-12 — An **empty plan (`tasks: []`) is validated by the Pydantic schema and rejected with `422 validation_error` before the route body runs, so it writes NO `ai_calls` row and makes no model call** — the table records AI *calls*, and no call happened; the row is not a place to log user validation errors.
- 2026-10-12 — On an unexpected AI failure the runner logs only the feature, org id, status and the exception **class name** (never the message or traceback) — a provider message can echo the request (plan text) or the key, and both are forbidden in logs.
- 2026-10-12 — Local rate limits are counted from `ai_calls` but exclude `status='disabled'` and `error_class='local_limit'` rows — being limited (or the feature being off) must not extend its own lock window.
- 2026-10-12 — The review endpoint takes the caller's **live form state**, not a plan id (no IDOR surface, unsaved edits are reviewable) and both AI endpoints are stateless: the draft never writes a plan or task.
- 2026-10-12 — The review output validator accepts a `rewrite_why` finding on a main task whose `why` is empty (the `missing_why` case); it rejects a rewrite only when it is empty or byte-identical to the original text (root §7). An earlier "would replace an empty why" guard made the common missing-why case unsatisfiable and was removed; regression tests added.
- 2026-10-12 — `api/scripts/eval_review.py` is a manual, non-pytest harness (10 fixtures incl. a prompt-injection attempt); it runs the real model only when `GOOGLE_API_KEY` is set and otherwise exits with a clear message. The real-key run and the model name (`gemini-3.5-flash-lite`, confirmed working) are recorded in `docs/AI_NOTES.md`.
