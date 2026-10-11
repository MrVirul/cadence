# Cadence — API

Phase 1 design doc. Source of truth: root `AGENTS.md` §5–§7. **Design only** —
no routers, schemas or code yet.

Two surfaces, mounted as sub-apps in `api/app/main.py`:

- `/app` — customers (audience `app`, cookie `access_token`).
- `/internal` — staff (audience `internal`, cookie `internal_access_token`).

Token audiences are already enforced in `api/app/api/*/access.py`, so a token
minted for one surface is rejected by the other.

---

## Conventions

### Error body

Brief §6 fixes one shape for **all** errors:

```json
{ "detail": "Human-readable message", "code": "snake_case_code" }
```

> **Change from the template.** `api/app/exceptions.py` currently renders the
> FastAPI validation shape `{"detail": [{"type","loc","msg"}]}` with
> UPPER_SNAKE codes. Cadence adopts the brief's `{detail, code}` shape with
> snake_case codes. `APIException.to_response()` will be updated, and the whole
> suite checks the new shape. Existing `/internal` tests are updated in the same
> phase (recorded in `docs/DECISIONS.md`).

Validation errors (Pydantic / `extra="forbid"`) also adhere to this shape:
`422` with `code: "validation_error"` and the field list folded into `detail`.

`429` responses also send `Retry-After: <seconds>`.

### Pagination

List endpoints accept `limit` and `offset` query params and return the
template's page envelope:

```json
{ "items": [...], "total": 123, "limit": 50, "offset": 0 }
```

- `limit`: default `50`, `ge=1`, `le=100`.
- `offset`: default `0`, `ge=0`.
- Ordering is stated per endpoint (most are newest-first).

### Identifiers & validation

- All ids are UUIDs (`UUID4` in schemas); a malformed UUID in a path → `422`.
- Request schemas set `extra="forbid"` and **never** declare `org_id`,
  `membership_id`, `role`, `status`, `is_admin`, `is_active`, `shipped`,
  `decided_by_*`, `plan.status`. Supplying them → `422 validation_error`.

### Access semantics — 404 vs 403

One global rule, applied to every endpoint and rule below:

- **`404 not_found`** when the caller has **no read access** to the resource: a
  non-member of the org, a member whose visibility does not include it (a
  teammate's plan, or a team they are not in), a lead looking at a team they do
  not lead, or any cross-org id. The body is identical to a genuinely missing
  row, so nothing is disclosed.
- **`403 forbidden`** when the caller **can read** the resource but is **not
  allowed to act** on it (e.g. a `member` calling an admin-only action, or a
  reader attempting a state transition their role does not permit).

In short: a failure that would reveal a resource the caller cannot see is `404`;
a failure on a resource the caller can already see is `403`.

---

## `/app` endpoints

### Auth & session

| Method | Path | Who | Request | Response | Status | Error codes |
|---|---|---|---|---|---|---|
| POST | `/app/auth/signup` | public | `{email, password, name?, org_name? \| invite_token?}` — **exactly one** of `org_name` / `invite_token` | `{access_token, user, membership:{org_id, org_name, role}}` | 201 | 409 `conflict` (email taken), 422 `validation_error` (not exactly one / weak password / bad body), 404 `invite_invalid` |
| POST | `/app/auth/login` | public | `{email, password}` | `{access_token}` | 200 | 401 `unauthorized` (generic), 422 `validation_error` |
| POST | `/app/auth/logout` | authenticated | — | `{message}` | 200 | 401 `unauthorized` |
| GET | `/app/me` | authenticated | — | `{user, memberships:[{org:{id,name,slug}, role}]}` | 200 | 401 `unauthorized` |

Notes:
- Password min length **10**; email normalized to lowercase; duplicate email → `409`.
- Generic `401` on bad login (no user enumeration).
- Deactivated user (`is_active=false`) → `401` on login and on every
  authenticated route, even with a previously valid token.
- Sign-up always creates `is_admin=false`. `is_admin:true` in the body → `422`.

### Orgs & invites

| Method | Path | Who | Request | Response | Status | Error codes |
|---|---|---|---|---|---|---|
| POST | `/app/orgs` | authenticated | `{name}` | `org` | 201 | 422 `validation_error`, 409 `conflict` (slug) |
| GET | `/app/invites/{token}` | public | — | `{org_name, role}` | 200 | 404 `invite_invalid` (invalid/expired/used/revoked) |
| POST | `/app/invites/{token}/accept` | authenticated | — | `{membership:{org_id, role}}` | 201 | 404 `invite_invalid`, 409 `conflict` (already a member) |

### Org settings, members & invites (org-scoped)

All routes below are `/app/orgs/{org_id}/...` and go through `get_org_context`
(non-member → **404**; suspended org → **403** `org_suspended`).

| Method | Path | Who | Request | Response | Status | Error codes |
|---|---|---|---|---|---|---|
| GET | `/app/orgs/{org_id}` | member | — | `org` | 200 | 404 `not_found` |
| PATCH | `/app/orgs/{org_id}` | admin, owner | `{name?}` | `org` | 200 | 403 `forbidden`, 422 |
| GET | `/app/orgs/{org_id}/members` | admin, owner | `?limit&offset` | page of `{membership_id, user:{id,name,email}, role, created_at}` | 200 | 403 `forbidden` |
| PATCH | `/app/orgs/{org_id}/members/{membership_id}` | admin*, owner | `{role}` | `membership` | 200 | 403 `forbidden`, 409 `last_owner`, 404 `not_found`, 422 |
| DELETE | `/app/orgs/{org_id}/members/{membership_id}` | admin*, owner | — | — | 204 | 403 `forbidden`, 409 `last_owner`, 404 `not_found` |
| POST | `/app/orgs/{org_id}/invites` | admin, owner | `{role, expires_in_days?}` (`role ∈ {admin,member}`) | `{id, token, role, expires_at, url}` | 201 | 403 `forbidden`, 422 `validation_error` (role `owner` rejected) |
| GET | `/app/orgs/{org_id}/invites` | admin, owner | `?limit&offset` | page of invites (no plaintext secret beyond token) | 200 | 403 `forbidden` |
| DELETE | `/app/orgs/{org_id}/invites/{invite_id}` | admin, owner | — | — | 204 | 403 `forbidden`, 404 `not_found` |

\* An `admin` may only assign `member`↔`admin`. Touching an `owner`
(promote, demote or remove) requires an `owner`; and the last owner can never be
demoted or removed (`409 last_owner`).

### Teams

| Method | Path | Who | Request | Response | Status | Error codes |
|---|---|---|---|---|---|---|
| GET | `/app/orgs/{org_id}/teams` | member (admin/owner: all teams; others: teams they belong to) | `?limit&offset` | page of `{id, name, lead_membership_id, member_count}` | 200 | 404 `not_found` |
| POST | `/app/orgs/{org_id}/teams` | admin, owner | `{name, lead_membership_id?}` | `team` | 201 | 403 `forbidden`, 409 `conflict` (name), 422 |
| GET | `/app/orgs/{org_id}/teams/{team_id}` | team member, admin, owner | — | `team` + `members[]` | 200 | 404 `not_found` (non-member) |
| PATCH | `/app/orgs/{org_id}/teams/{team_id}` | admin, owner | `{name?}` | `team` | 200 | 403 `forbidden`, 409 `conflict`, 404 `not_found` |
| DELETE | `/app/orgs/{org_id}/teams/{team_id}` | admin, owner | — | — | 204 | 403 `forbidden`, 404 `not_found`, 409 `conflict` (team still has plans) |
| PUT | `/app/orgs/{org_id}/teams/{team_id}/members` | admin, owner | `{membership_ids:[...]}` | `team` + `members[]` | 200 | 403 `forbidden`, 404 `not_found` (any id outside org/team), 422 |
| PUT | `/app/orgs/{org_id}/teams/{team_id}/lead` | admin, owner | `{membership_id}` | `team` | 200 | 403 `forbidden`, 404 `not_found`, 422 `validation_error` (lead not a team member) |

### Plans & tasks

| Method | Path | Who | Request | Response | Status | Error codes |
|---|---|---|---|---|---|---|
| GET | `/app/orgs/{org_id}/plans` | member (own only); lead (own team); admin/owner (all) | `?week=YYYY-MM-DD&mine=true&limit&offset` | page of `plan` | 200 | 404 `not_found`, 422 `validation_error` (bad date) |
| POST | `/app/orgs/{org_id}/plans` | member (creates **own** draft) | `{week_start, team_id, tasks:[{kind, title, why?, position?}]}` | `plan` | 201 | 403 `forbidden` (team not author's), 409 `conflict` (plan already exists for week), 422 `validation_error` (not Monday, past week, >4 weeks ahead, limits) |
| GET | `/app/orgs/{org_id}/plans/{plan_id}` | author; lead of `plan.team_id`; admin/owner | — | `plan` + `tasks[]` + `events[]` | 200 | 404 `not_found` |
| PUT | `/app/orgs/{org_id}/plans/{plan_id}` | author, `draft` only | `{tasks:[{id?, kind, title, why?, position?}], team_id?}` | `plan` | 200 | 404 `not_found` (no read access), 403 `forbidden` (can read, not the author), 409 `invalid_transition` (not draft), 422 |
| PATCH | `/app/orgs/{org_id}/tasks/{task_id}` | author, plan `draft` or `approved` | `{status}` | `task` | 200 | 404 `not_found` (no read access), 403 `forbidden` (can read, not the author), 409 `invalid_transition` |
| POST | `/app/orgs/{org_id}/plans/{plan_id}/submit` | author | — | `plan` | 200 | 404 `not_found` (no read access), 403 `forbidden` (can read, not the author), 409 `invalid_transition`, 422 `validation_error` (no team / missing main / main without why) |
| POST | `/app/orgs/{org_id}/plans/{plan_id}/withdraw` | author | — | `plan` | 200 | 404 `not_found` (no read access), 403 `forbidden` (can read, not the author), 409 `invalid_transition` |
| POST | `/app/orgs/{org_id}/plans/{plan_id}/approve` | lead of team, admin, owner; the author only when **no other eligible approver exists** (blocked when one does) | — | `plan` | 200 | 404 `not_found` (no read access), 403 `forbidden` (can read but not eligible, incl. self-approval when another approver exists), 409 `invalid_transition` |
| POST | `/app/orgs/{org_id}/plans/{plan_id}/send-back` | same as `approve` | `{comment}` (non-empty) | `plan` | 200 | 404 `not_found` (no read access), 403 `forbidden` (can read but not eligible), 409 `invalid_transition`, 422 `validation_error` |
| POST | `/app/orgs/{org_id}/plans/{plan_id}/close` | author, from `approved` | `{shipped: bool}` | `plan` | 200 | 404 `not_found` (no read access), 403 `forbidden` (can read, not the author), 409 `invalid_transition`, 422 |
| GET | `/app/orgs/{org_id}/teams/{team_id}/week` | lead of team, admin, owner | `?week=YYYY-MM-DD` | `{week_start, rows:[{membership_id, plan_id (nullable), user, status, tasks_done, tasks_total, shipped}]}` | 200 | 404 `not_found` (no read access) |
| GET | `/app/orgs/{org_id}/teams/{team_id}/history` | lead of team, admin, owner | `?limit&offset` | `{items:[{week_start, shipped_count, total}], shipped_rate}` | 200 | 404 `not_found` (no read access) |

`plan` response shape: `{id, week_start, status, team_id, author:{membership_id,
user}, submitted_at, decided_at, decided_by, decision_comment, shipped,
closed_at, created_at, updated_at}`.

**`PUT /plans/{plan_id}` task diffing.** Existing tasks are matched by `id` and
updated in place, so their ids stay stable across edits. New tasks are sent
without an `id` (the server assigns one). Tasks that exist on the plan but are
absent from the body are deleted. This keeps client-side state and task
references stable.

### AI (org-scoped, stateless)

| Method | Path | Who | Request | Response | Status | Error codes |
|---|---|---|---|---|---|---|
| POST | `/app/orgs/{org_id}/ai/plan-review` | member | `{week_start, tasks:[{ref, kind, title, why?}]}` (1–12 tasks, `extra="forbid"`) | `PlanReview` output (`verdict`, `summary`, `findings[]`) | 200 | 403 `forbidden`, 422 `validation_error` (0 tasks → **no model call**), 429 `ai_rate_limited`, 503 `ai_unavailable`, 502 `ai_bad_output` / `ai_error`, 504 `ai_timeout` |
| POST | `/app/orgs/{org_id}/ai/plan-draft` | member | `{notes: str ≤4000, week_start}` | `PlanDraft` (`main`, `sub_goals[]`, `gtm_goals[]`, `left_out[]`, `open_questions[]`) | 200 | 403 `forbidden`, 422, 429 `ai_rate_limited`, 503 `ai_unavailable`, 502 `ai_bad_output` / `ai_error`, 504 `ai_timeout` |

Both endpoints are **stateless and never write to the DB** (the draft does not
persist a plan; the review takes the caller's live form state, so there is no
IDOR surface). Every attempt — success or failure — writes one `ai_calls` row in
its own short session **before** the HTTP error is raised.

---

## `/internal` endpoints (staff only)

Every route requires an internal-audience token **and** `is_admin` (platform
staff). A **wrong-audience** token (e.g. a customer `/app` token) → `401
unauthorized`; a **right-audience** token whose user is **not** `is_admin` →
`403 staff_only`. A staff token on `/app/orgs/...` is rejected because staff are
not org members (`404 not_found`).

| Method | Path | Who | Request | Response | Status | Error codes |
|---|---|---|---|---|---|---|
| GET | `/internal/orgs` | staff | `?q&limit&offset` | page of `{id, name, slug, member_count, team_count, plan_count, last_active_at, is_suspended}` | 200 | 403 `staff_only` |
| GET | `/internal/orgs/{id}` | staff | — | org counts + `members:[{email, role}]` — **no plan/task text** | 200 | 404 `not_found` |
| POST | `/internal/orgs/{id}/suspend` | staff | `{reason}` | `org` | 200 | 404 `not_found`, 422 |
| POST | `/internal/orgs/{id}/reinstate` | staff | — | `org` | 200 | 404 `not_found` |
| GET | `/internal/users` | staff | `?q&limit&offset` | page of users (`id, email, name, is_active, orgs:[{id, role}]`) | 200 | 403 `staff_only` |
| GET | `/internal/users/{id}` | staff | — | user + `orgs:[{id, role}]` | 200 | 404 `not_found` |
| POST | `/internal/users/{id}/deactivate` | staff (not self, not other staff) | `{reason}` | user | 200 | 403 `forbidden`, 404 `not_found`, 422 |
| POST | `/internal/users/{id}/reactivate` | staff | — | user | 200 | 404 `not_found` |
| GET | `/internal/ai-usage` | staff | `?from&to&limit&offset` | page per org: `{org_id, calls, failures, rate_limited, p50_latency_ms, avg_latency_ms, input_tokens, output_tokens}` | 200 | 422 `validation_error` |
| GET | `/internal/ai-usage/{org_id}/daily` | staff | `?from&to` | `{days:[{date, calls, failures, rate_limited}]}` | 200 | 404 `not_found` |
| GET | `/internal/audit-log` | staff | `?limit&offset` | page of `staff_actions` | 200 | 403 `staff_only` |

Retained template endpoints: `GET /internal/health`, `POST /internal/auth`,
`POST /internal/logout`, `GET /internal/users/self`. All internal responses
across existing and new routes must contain **no plan, task or AI text**.

---

## Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `unauthorized` | 401 | Missing/invalid/expired credentials, or deactivated user. |
| `invalid_token` | 401 | Token signature/audience/format invalid. |
| `credentials_required` | 401 | No cookie or `Access-Token` header supplied. |
| `forbidden` | 403 | Authenticated but not permitted (role/lead/ownership). |
| `staff_only` | 403 | `/internal` route called with a valid internal-audience token by a user who is not `is_admin`. (A wrong-audience token gets `401 unauthorized`.) |
| `org_suspended` | 403 | Org is suspended; contact support. |
| `not_found` | 404 | Resource does not exist **in this org** (also used for cross-org ids). |
| `invite_invalid` | 404 | Invite invalid, expired, used or revoked. |
| `conflict` | 409 | Uniqueness clash (email, slug, team name, membership, one-plan-per-week, already a member). |
| `invalid_transition` | 409 | Plan state machine rejects the action. |
| `last_owner` | 409 | Would remove/demote the last owner of an org. |
| `validation_error` | 422 | Pydantic/schema rejection, including `extra="forbid"` and business rules (not Monday, task limits, empty comment, owner invite). |
| `ai_rate_limited` | 429 | Local or upstream rate limit. Sends `Retry-After`. |
| `ai_bad_output` | 502 | Model output invalid after retries (`error_class="bad_output"`). |
| `ai_error` | 502 | Any other AI failure; provider messages never leaked. |
| `ai_unavailable` | 503 | No API key configured (AI disabled); planning still works. |
| `ai_timeout` | 504 | AI call exceeded `ai_timeout_seconds`. |
| `internal_error` | 500 | Unexpected server error. |
| `database_error` | 500 | DB failure (kept from template). |

Cross-org ids deliberately return the **same** `not_found` body as a genuinely
missing row, so responses never reveal that another org's resource exists.

---

## Endpoints that need extra care

- **`POST /app/auth/signup` — exactly one of `org_name` | `invite_token`.**
  A schema-level model validator enforces "exactly one" (both or neither → `422`).
  `is_admin` must be rejected, not silently accepted. Sign-up sets `is_active=true`
  so the new account can log in immediately. Signing up with an `invite_token`
  must only ever create a `member`/`admin` membership — never `owner` — and must
  consume the invite atomically.
- **`POST /app/invites/{token}/accept`.** Double-accept is a race: use a
  conditional `UPDATE invites SET accepted_by_user_id=..., accepted_at=now()
  WHERE token=... AND accepted_at IS NULL AND revoked_at IS NULL AND
  expires_at > now() RETURNING *`, then create the membership; 0 rows updated →
  `404 invite_invalid`. "Already a member" → `409 conflict`.
- **Role changes** (`PATCH/DELETE .../members/{id}`). Must serialize concurrent
  changes in the same org (lock the org row) so two admins cannot both demote
  the last owner; admin cannot touch owners; owner cannot remove the last owner;
  lead/role values are server-decided, never taken from the body.
- **AI endpoints.** Length limits (`tasks` 1–12, `title ≤200`, `why ≤500`,
  `notes ≤4000`); empty plan → `422` **without** a model call; prompt injection
  is contained (plan text is wrapped in `<plan>…</plan>` and treated as untrusted
  data); local per-user/per-minute and per-org/per-day limits are counted from
  `ai_calls`; every failure writes an `ai_calls` row in a separate committed
  session; no plan/prompt text is ever stored.

---

## Tenancy rules as testable statements

One sentence each; each maps to a pytest assertion.

### `get_org_context` & org scoping

1. A user with a membership in an org can call that org's `/app/orgs/{org_id}/...` routes; a user with no membership gets `404`.
2. For every route registered under `/app/orgs/{org_id}/...`, a non-member of `org_id` receives `404` (never `403`, and the body is identical to a nonexistent org).
3. A route-coverage test iterates `app.routes`, and fails if any `/app/orgs/{org_id}/...` route is missing from the tenancy-matrix registry.
4. `GET /app/orgs/{A}` where A is another org's id but the caller has no membership returns `404`.

### Suspended org

5. While an org is suspended, any member calling any `/app/orgs/{org_id}/...` route gets `403` with `code="org_suspended"`.
6. After `POST /internal/orgs/{id}/reinstate`, the same member's next call returns `200` (access restored instantly).
7. Logging in is still allowed while the caller's org is suspended (only org routes are blocked).

### Deactivated user

8. `POST /app/auth/login` for an `is_active=false` user returns `401` with the same generic body as a wrong password.
9. A token minted before deactivation stops working: after setting `is_active=false`, any authenticated route returns `401`.

### Cross-org ids — in the path

10. A user from Org B calling `GET /app/orgs/{A}/plans` gets `404`.
11. A user from Org B calling `POST /app/orgs/{A}/teams` gets `404`.
12. A user from Org B calling `GET /app/orgs/{B}/plans/{plan_id_of_A}` gets `404`.
13. A user from Org B calling `PATCH /app/orgs/{B}/tasks/{task_id_of_A}` gets `404`.

### Cross-org ids — in the body

14. Creating a plan in Org B with `team_id` belonging to Org A gets `404` and writes no plan.
15. `PUT /app/orgs/{B}/teams/{team_id_of_B}/members` with a `membership_id` from Org A gets `404` and changes nothing.
16. `PUT /app/orgs/{B}/teams/{team_id_of_B}/lead` with a `membership_id` from Org A gets `404`.
17. A request body containing `org_id`, `membership_id`, `role`, `status`, `is_admin`, `is_active`, `shipped` or `decided_by_membership_id` is rejected with `422` (extra fields forbidden).

### Roles (permission matrix)

18. A `member` calling `POST /app/orgs/{org}/invites` gets `403`.
19. A `member` calling `PATCH /app/orgs/{org}/members/{id}` gets `403`.
20. A `member` calling `POST /app/orgs/{org}/teams` gets `403`.
21. A `member` calling `GET /app/orgs/{org}/plans/{teammate_plan_id}` gets `404` (members cannot see teammates' plans).
22. A team lead calling `GET /app/orgs/{org}/teams/{own_team}/week` gets `200`; the same lead on another team's week gets `404`.
23. A team lead can approve a plan in their own team (`200`) but a plan in another team returns `404`.
24. An `admin` can read every plan in the org; an `owner` likewise.
25. An `admin` changing an `owner`'s role or removing an `owner` gets `403` and the owner is unchanged.
26. An `admin` can change a `member`↔`admin` role.
27. Demoting or removing an org's **last owner** gets `409` with `code="last_owner"` and the membership is unchanged.
28. An org `owner`/`admin` who is not platform staff cannot use `/internal/*`: with an `/app` token → `401 unauthorized` (wrong audience); even with a valid internal-audience token → `403 staff_only`.

### Self-approval

29. A team lead who authored a `submitted` plan is blocked from `approve`/`send-back` (`403 forbidden`) when another eligible approver exists (another lead of that team, or another org owner/admin).
30. When **no** other eligible approver exists, the author may `approve`/`send-back` their own plan (`200`), and the written `plan_events` row has `self_approved=true`.
31. When a non-author eligible approver acts, the request returns `200` and the written `plan_events` row has `self_approved=false` and `actor_membership_id` = the approver.

### Customer token vs staff token

32. A valid `/app` (customer) token used on `GET /internal/orgs` gets `401 unauthorized` (wrong audience).
33. A valid `/internal` (staff) token used on `GET /app/orgs/{org_id}` gets `404` (staff are not org members, so they have no read access).
34. A right-audience `/internal` token whose user is not `is_admin` gets `403` with `code="staff_only"`.
35. A staff user is not an org member, so `/app/orgs/{org_id}` returns `404` regardless of the token audience.

### Race cases

36. Two concurrent requests demoting the org's last owner: exactly one succeeds and the other gets `409 last_owner`; the org still has ≥ 1 owner.
37. Two concurrent `POST /app/invites/{token}/accept` for the same invite: exactly one returns success, the other `404 invite_invalid`, and only one membership is created.
38. Two concurrent `POST /app/orgs/{org}/plans/{id}/submit`: exactly one returns `200`, the other `409 invalid_transition`, and exactly one `submitted` `plan_events` row exists.
39. Two concurrent `POST /app/orgs/{org}/plans` with the same `(membership_id, week_start)`: exactly one returns `201`, the other `409 conflict` (DB unique constraint).
40. Two concurrent `PUT /teams/{id}/members` replacing the set do not leave a dangling lead; if the lead is removed the request either clears `lead_membership_id` or returns `422`.

### Invites

41. `GET`/`accept` of an invite that is expired, already accepted or revoked returns `404 invite_invalid`.
42. Creating an invite with `role="owner"` returns `422` and no invite row is written.

### Internal surface

43. A suspension (`POST /internal/orgs/{id}/suspend`) writes exactly one `staff_actions` row with the acting `staff_user_id` and reason.
44. Staff cannot deactivate themselves or another staff user (`403`).
45. The serialized JSON of every `/internal` response contains no plan text, task title/why, or AI prompt/response text.
46. `/internal/ai-usage` counts match the `ai_calls` rows for the org (calls, failures, rate_limited, tokens) computed with grouped aggregates.

### Sign-up

47. A successful `POST /app/auth/signup` sets the new user `is_active=true`, and the account can log in immediately afterwards.

---

## Open questions / assumptions

1. **Error body shape & code case.** Brief §6 mandates `{detail, code}` with snake_case codes; the template currently emits `{"detail":[{type,loc,msg}]}` with UPPER codes. **Assumption:** adopt the brief; update `APIException` and existing `/internal` tests.
2. **Auth paths.** Brief uses `/app/auth/login` and `/app/me`; the template has `POST /app/auth`, `POST /app/logout`, `GET /app/users/self`. **Assumption:** adopt the brief's paths and retire `GET /app/users/self` (replaced by `/app/me`); keep `POST /app/auth/logout` for the app surface.
3. **`name` on sign-up vs `first_name`/`last_name`.** The `users` table has non-null `first_name`/`last_name` but the brief's sign-up takes `name?`. **Assumption:** split `name` on the first space into first/last; if absent, derive from the email local-part. Both columns stay non-null.
4. **Timestamps the brief omits.** The brief lists no `created_at` for `invites`, `team_members`, `tasks`, or `updated_at` for most tables. **Assumption:** add `created_at` (and `updated_at` on `plans`/`tasks`) following the template's `TimestampMixin`, purely additive.
5. **`main.why` enforcement.** `why` is nullable (draft can be saved incomplete) but required for `main` at submit. **Assumption:** enforce in the service at create/submit and return `422`; no hard DB constraint so an incomplete draft is saveable.
6. **Invite expiry.** Default `+7 days`; `expires_in_days` is an optional admin override. Assumed allowed range 1–30 days.
7. **Plans with no possible approver.** A lead's own plan is normally approved by another lead/owner/admin. If no other eligible approver exists, the author may approve their own plan. **Assumption:** allow self-approval and record `plan_events.self_approved=true`; when another eligible approver exists, self-approval is blocked (`403`). (Replaces the earlier "409 no approver" behaviour.)
8. **`team_id` immutability.** **Assumption:** `team_id` may be changed via `PUT /plans/{id}` while in `draft`, and is frozen once `submitted`+.
9. **`week_start` timezone.** **Assumption:** the week boundary is computed in the API's configured timezone (UTC), and Monday validation is date-only (`EXTRACT(ISODOW)=1`).
10. **`plan_events.actor_membership_id` nullability.** **Assumption:** nullable with `ON DELETE SET NULL` so audit history survives a member being removed; new events always set it.
11. **`ai_calls.membership_id`.** **Assumption:** non-null even for `disabled`/failure rows (the caller always exists at call time).
12. **`staff_actions.target_id`.** Polymorphic, **no** FK. Assumption: acceptable because staff actions are append-only audit rows.
13. **`ai-usage` percentiles.** The brief asks for "p50/avg latency". **Assumption:** compute `p50` with Postgres `percentile_cont` and `avg` in one grouped query (no N+1).
14. **Pagination envelope.** **Assumption:** reuse the template's `{items,total,limit,offset}` with `limit` default 50 / max 100.
15. **`requests.org`.** Per `api/AGENTS.md`, keep `api/requests.org` in sync with every API change, in the same commit as the code.
16. **Owner-means-owner.** The brief's `owner`/`admin` are **org** roles; `users.is_admin` is **platform staff**. New code uses `is_platform_staff` and never conflates the two.
