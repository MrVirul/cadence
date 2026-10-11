# Cadence — Data model

Phase 1 design doc. Source of truth: root `AGENTS.md` §3–§5. This is a **design**
document — no models, migrations or code are written yet.

Everything here is meant to be built with the template's existing conventions
(see "Launchbase conventions copied from `users`" below) and migrated with
`uv run alembic revision --autogenerate`, reviewed before commit.

---

## Conventions

- **Primary keys**: same as the `users` table — a single `id` column of type
  `sqlalchemy.types.Uuid` (Postgres `uuid`), `default=uuid.uuid4`, marked
  `sort_order=-1` so it stays first in generated migrations.
- **Timestamps**: all `DateTime(timezone=True)`, stored UTC. `created_at` is
  non-null with a Python-side default `datetime.now(UTC)`. `updated_at` is
  nullable with `onupdate`.
- **No DB enums.** Every `role` / `status` / `kind` / `action` / `feature`
  column is a `String(n)` plus a named `CheckConstraint` listing the allowed
  values. Pydantic schemas use `Literal[...]` for the same values; services
  validate before writing.
- **`org_id` on every tenant-owned table**, denormalized and non-null, so every
  query can filter by it and tests can assert on it. The `organizations` table is
  the tenant itself; `users` and `staff_actions` are global (not tenant-owned).
- **Foreign keys**: explicit `ondelete` behaviour (see each table). All `org_id`
  FKs cascade from `organizations`.
- Naming: `id`, then `org_id`, then the rest. Check constraints named
  `ck_<table>_<column>`, unique constraints `uq_<table>_<cols>`, indexes
  `ix_<table>_<cols>`. Alembic derives most names; explicit names are given for
  the hand-declared partial index.

### Launchbase conventions copied from the `users` resource

The `users` resource is the template for every new resource
(model → schema → service → router → tests):

| Layer | File today | Convention to copy |
|---|---|---|
| Model | `api/app/models.py` | `IdMixin` (UUID PK) + `TimestampMixin`; `Mapped[...]` / `mapped_column(...)`; explicit `String(length)`; `__tablename__` plural; `_utcnow()` helper. |
| Base schema | `api/app/schemas.py` | `Model` base with `ConfigDict(str_strip_whitespace=True, from_attributes=True)`; the `DateTime` annotated serializer that emits `...Z`. |
| Surface schemas | `api/app/api/app/schemas.py`, `api/app/api/internal/schemas.py` | One request/response schema per surface, separate from the model; `UUID4`, `EmailStr` from Pydantic; `is_admin`/`is_active` only on the internal surface. |
| Service | `api/app/services/users.py` | A service class that takes the `AsyncSession` once; `session.flush()` only, **never** `commit()`; raises `ResourceNotFoundException` / `ConflictException`; lowercases email; `_ensure_...` guard helpers. |
| Router | `api/app/api/app/routers/users.py`, `.../internal/routers/users.py` | `APIRouter` with `tags=[...]`; typed response model as the return annotation; **the router commits** once at the end; `status_code=status.HTTP_201_CREATED/204`; `Query(..., ge=, le=)` for pagination. |
| Access | `api/app/api/app/access.py`, `api/app/api/internal/access.py` | `build_http_user_dependency(audience, cookie_name)`; `CurrentUser` / `CurrentInternalUser` annotated deps; staff gate on `is_admin`. |
| Errors | `api/app/exceptions.py` | Custom exceptions that render a JSON body. **Changed for Cadence** — see `docs/API.md` (brief §6 fixes the body shape). |
| Tests | `api/tests/` | `httpx.AsyncClient` + `ASGITransport` against the real ASGI app; `testcontainers` `postgres:16`; `session_factory` for direct DB setup; Faker; no DB mocks. |

---

## Tables

### `users` (existing — extended)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | no | `uuid4()` | PK |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | yes | — | `onupdate=now()` |
| `first_name` | `varchar(100)` | no | — | |
| `last_name` | `varchar(100)` | no | — | |
| `email` | `varchar(254)` | no | — | `UNIQUE`, normalized lowercase |
| `password` | `varchar(128)` | yes | — | Argon2 hash; nullable (invite-only / OAuth-style rows) |
| `is_active` | `boolean` | no | `false` | deactivated users fail login **and** existing tokens |
| `is_admin` | `boolean` | no | `false` | **means platform staff**; keep the column name |

**Model addition (no migration):** a read-only `is_platform_staff` property
(returns `self.is_admin`) — new code refers to `is_platform_staff` / platform
staff only. Sign-up never sets `is_admin`.

Indexes/constraints: `UNIQUE(email)` (existing).

---

### `organizations`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | no | `uuid4()` | PK |
| `name` | `varchar(200)` | no | — | |
| `slug` | `varchar(100)` | no | — | `UNIQUE`; slugified from name, uniqueness suffix on clash |
| `is_suspended` | `boolean` | no | `false` | |
| `suspended_at` | `timestamptz` | yes | — | set on suspend, cleared on reinstate |
| `suspended_reason` | `varchar(500)` | yes | — | required by staff suspend endpoint |
| `created_at` | `timestamptz` | no | `now()` | |
| `last_active_at` | `timestamptz` | yes | — | throttled update on mutating requests (≤ once / 5 min) |

- Constraints: `UNIQUE(slug)`.
- Indexes: `UNIQUE(slug)` covers slug lookups.

---

### `memberships`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | no | `uuid4()` | PK |
| `org_id` | `uuid` | no | — | FK → `organizations.id` `ON DELETE CASCADE` |
| `user_id` | `uuid` | no | — | FK → `users.id` `ON DELETE CASCADE` |
| `role` | `varchar(20)` | no | — | `ck_memberships_role`: `IN ('owner','admin','member')` |
| `created_at` | `timestamptz` | no | `now()` | |

- Constraints: `UNIQUE(org_id, user_id)` — a user is at most once per org.
- Indexes: `ix_memberships_user_id` (drives `/app/me`); the unique constraint's
  leading column covers `org_id`.

---

### `invites`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | no | `uuid4()` | PK |
| `org_id` | `uuid` | no | — | FK → `organizations.id` `ON DELETE CASCADE` |
| `token` | `varchar(64)` | no | — | `secrets.token_urlsafe(32)`; `UNIQUE` |
| `role` | `varchar(20)` | no | — | `ck_invites_role`: `IN ('admin','member')` — never `owner` |
| `created_by_membership_id` | `uuid` | no | — | FK → `memberships.id` `ON DELETE CASCADE` |
| `expires_at` | `timestamptz` | no | `+7 days` | |
| `accepted_by_user_id` | `uuid` | yes | — | FK → `users.id` `ON DELETE SET NULL` |
| `accepted_at` | `timestamptz` | yes | — | single use: non-null ⇒ used |
| `revoked_at` | `timestamptz` | yes | — | non-null ⇒ revoked |
| `created_at` | `timestamptz` | no | `now()` | |

- Constraints: `UNIQUE(token)`.
- Indexes: `ix_invites_org_id`.
- A valid invite is `accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()`.

---

### `teams`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | no | `uuid4()` | PK |
| `org_id` | `uuid` | no | — | FK → `organizations.id` `ON DELETE CASCADE` |
| `name` | `varchar(100)` | no | — | |
| `lead_membership_id` | `uuid` | yes | — | FK → `memberships.id` `ON DELETE SET NULL` |
| `created_at` | `timestamptz` | no | `now()` | |

- Constraints: `UNIQUE(org_id, name)`.
- Indexes: `ix_teams_lead_membership_id`.

---

### `team_members`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | no | `uuid4()` | PK (surrogate; matches `users`) |
| `org_id` | `uuid` | no | — | FK → `organizations.id` `ON DELETE CASCADE` |
| `team_id` | `uuid` | no | — | FK → `teams.id` `ON DELETE CASCADE` |
| `membership_id` | `uuid` | no | — | FK → `memberships.id` `ON DELETE CASCADE` |
| `created_at` | `timestamptz` | no | `now()` | |

- Constraints: `UNIQUE(team_id, membership_id)`.
- Indexes: `ix_team_members_membership_id`.

---

### `plans`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | no | `uuid4()` | PK |
| `org_id` | `uuid` | no | — | FK → `organizations.id` `ON DELETE CASCADE` |
| `membership_id` | `uuid` | no | — | author. FK → `memberships.id` `ON DELETE CASCADE` |
| `team_id` | `uuid` | no | — | approving team. FK → `teams.id` `ON DELETE RESTRICT` |
| `week_start` | `date` | no | — | must be a Monday. `ck_plans_week_start_monday` |
| `status` | `varchar(20)` | no | `'draft'` | `ck_plans_status`: `IN ('draft','submitted','approved','done')` |
| `submitted_at` | `timestamptz` | yes | — | set on submit, cleared on withdraw |
| `decided_at` | `timestamptz` | yes | — | set on approve / send-back |
| `decided_by_membership_id` | `uuid` | yes | — | FK → `memberships.id` `ON DELETE SET NULL` |
| `decision_comment` | `varchar(1000)` | yes | — | set on send-back (required non-empty) |
| `shipped` | `boolean` | yes | — | null until close; `true`/`false` on close |
| `closed_at` | `timestamptz` | yes | — | set on close |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | yes | — | `onupdate=now()` |

- Constraints: `UNIQUE(membership_id, week_start)` — one plan per member per week.
- Indexes: `ix_plans_org_week (org_id, week_start)`, `ix_plans_team_week (team_id, week_start)`, `ix_plans_status (status)`.

---

### `tasks`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | no | `uuid4()` | PK |
| `org_id` | `uuid` | no | — | FK → `organizations.id` `ON DELETE CASCADE` |
| `plan_id` | `uuid` | no | — | FK → `plans.id` `ON DELETE CASCADE` |
| `kind` | `varchar(20)` | no | — | `ck_tasks_kind`: `IN ('main','sub_goal','gtm')` |
| `title` | `varchar(200)` | no | — | ≤ 200 chars (DB + schema) |
| `why` | `varchar(500)` | yes | — | ≤ 500; **required for `main`** (service, at create/submit) |
| `status` | `varchar(20)` | no | `'todo'` | `ck_tasks_status`: `IN ('todo','done')` |
| `position` | `integer` | no | `0` | ordering within a kind |
| `done_at` | `timestamptz` | yes | — | set/cleared with status |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | yes | — | `onupdate=now()` |

- **Partial unique index — exactly one `main` per plan:**

  ```python
  Index(
      "uq_tasks_one_main_per_plan",
      "plan_id",
      unique=True,
      postgresql_where=text("kind = 'main'"),
  )
  ```

- Indexes: `ix_tasks_plan_position (plan_id, position)`.
- Limits (service-level): ≤ 5 `sub_goal`, ≤ 5 `gtm`; exactly one `main`.

---

### `plan_events` (audit trail + send-back comment history)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | no | `uuid4()` | PK |
| `org_id` | `uuid` | no | — | FK → `organizations.id` `ON DELETE CASCADE` |
| `plan_id` | `uuid` | no | — | FK → `plans.id` `ON DELETE CASCADE` |
| `actor_membership_id` | `uuid` | yes | — | FK → `memberships.id` `ON DELETE SET NULL` (nullable so history survives member removal) |
| `action` | `varchar(20)` | no | — | `ck_plan_events_action`: `IN ('submitted','withdrawn','approved','sent_back','closed')` |
| `comment` | `varchar(1000)` | yes | — | required non-empty for `sent_back` (service) |
| `created_at` | `timestamptz` | no | `now()` | |

- Indexes: `ix_plan_events_plan_created (plan_id, created_at)`.

---

### `ai_calls` (usage/telemetry — never stores prompt or output text)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | no | `uuid4()` | PK |
| `org_id` | `uuid` | no | — | FK → `organizations.id` `ON DELETE CASCADE` |
| `membership_id` | `uuid` | no | — | caller. FK → `memberships.id` `ON DELETE CASCADE` |
| `feature` | `varchar(20)` | no | — | `ck_ai_calls_feature`: `IN ('plan_review','plan_draft')` |
| `model` | `varchar(100)` | yes | — | may be unknown on failure |
| `status` | `varchar(20)` | no | — | `ck_ai_calls_status`: `IN ('success','error','rate_limited','timeout','disabled')` |
| `error_class` | `varchar(30)` | yes | — | `ck_ai_calls_error_class`: null or `IN ('upstream_429','local_limit','bad_output')` |
| `latency_ms` | `integer` | yes | — | |
| `input_tokens` | `integer` | yes | — | from `result.usage()` |
| `output_tokens` | `integer` | yes | — | from `result.usage()` |
| `created_at` | `timestamptz` | no | `now()` | |

- Indexes: `ix_ai_calls_org_created (org_id, created_at)`,
  `ix_ai_calls_membership_created (membership_id, created_at)`,
  `ix_ai_calls_status_created (status, created_at)`.
- **No prompt/response/plan text columns** (deliberate privacy call, §6).

---

### `staff_actions` (back-office audit log)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | no | `uuid4()` | PK |
| `staff_user_id` | `uuid` | no | — | FK → `users.id` `ON DELETE CASCADE` |
| `action` | `varchar(30)` | no | — | `ck_staff_actions_action`: `IN ('org_suspended','org_reinstated','user_deactivated','user_reactivated')` |
| `target_type` | `varchar(20)` | no | — | `ck_staff_actions_target_type`: `IN ('organization','user')` |
| `target_id` | `uuid` | no | — | polymorphic target; **no FK** |
| `reason` | `varchar(500)` | yes | — | |
| `created_at` | `timestamptz` | no | `now()` | |

- Indexes: `ix_staff_actions_created (created_at)`,
  `ix_staff_actions_target (target_type, target_id)`.

---

## Plan state machine

Statuses: `draft`, `submitted`, `approved`, `done`. Enforced in **one** service
module. Any transition not listed below returns **409 `invalid_transition`**.

| From | Action | Who may do it | Validations | To | `plan_events.action` |
|---|---|---|---|---|---|
| `draft` | `submit` | author only | plan has a `team_id`; exactly one `main` task; `main.why` non-empty; week is current or future | `submitted` | `submitted` |
| `submitted` | `withdraw` | author only | — | `draft` | `withdrawn` |
| `submitted` | `approve` | team lead of `plan.team_id`, **or** org `owner`/`admin`; **never the author** | actor ≠ plan author; status is `submitted` | `approved` | `approved` |
| `submitted` | `send_back` | same as `approve` | actor ≠ plan author; `comment` non-empty | `draft` | `sent_back` (`comment` stored) |
| `approved` | `close` | author only | `shipped` is a boolean | `done` | `closed` (`shipped` stored) |
| `draft` \| `approved` | edit content (`PUT /plans/{id}` / task add-remove-reorder) | author only | status is `draft` (content locked in `approved`) | unchanged | — |
| `draft` \| `approved` | tick task (`PATCH /tasks/{id}`) | author only | plan is `draft` or `approved`; task belongs to the plan | unchanged | — |

Side effects:
- `submit` sets `submitted_at`.
- `withdraw` clears `submitted_at`.
- `approve` / `send_back` set `decided_at`, `decided_by_membership_id`; `send_back`
  sets `decision_comment` (and `approve` clears any stale `decision_comment`).
- `close` sets `shipped`, `closed_at`.
- Every state transition writes exactly one `plan_events` row.
- `done` is **read-only** for everyone (author cannot edit or tick).

---

## Invariants and where they are enforced

`DB` = database constraint/index, `SVC` = service layer, `SCHEMA` = Pydantic
request schema. `DB+SVC` means both.

| # | Invariant | Enforced by |
|---|---|---|
| 1 | Primary keys are UUIDs generated in the app | DB (column) + SVC (default) |
| 2 | Every tenant-owned table has non-null `org_id` | DB |
| 3 | Every org-owned query is filtered by `org_id` (`get_in_org`) | SVC (tested) |
| 4 | `memberships (org_id, user_id)` unique | DB + SVC (409) |
| 5 | Every org always has ≥ 1 `owner` | SVC (row-locked check; can't be a plain constraint) |
| 6 | Only an owner can promote/demote/remove owners; admin may only change `member`↔`admin` | SVC |
| 7 | Cannot remove/demote the last owner | SVC (row lock) + DB uniqueness as backstop |
| 8 | Membership `role ∈ {owner,admin,member}` | DB (`ck_memberships_role`) + SVC + SCHEMA |
| 9 | Invite `role ∈ {admin,member}` (never `owner`) | DB + SVC + SCHEMA |
| 10 | Invite token unique & unguessable | DB + SVC |
| 11 | Invite is single-use (valid only when not accepted/revoked/expired) | SVC (conditional update) + DB |
| 12 | `teams (org_id, name)` unique | DB + SVC (409) |
| 13 | Team lead must be a member of that team | SVC (tested) |
| 14 | Team, membership and lead all belong to the same org | SVC (tested) |
| 15 | Removing the lead clears `teams.lead_membership_id` | SVC (`ON DELETE SET NULL` + SVC) |
| 16 | `team_members (team_id, membership_id)` unique | DB |
| 17 | One plan per member per week: `plans (membership_id, week_start)` unique | DB + SVC (409) |
| 18 | `plans.team_id` is a team the author belongs to | SVC |
| 19 | `plans.week_start` is a Monday | DB (`ck_plans_week_start_monday`) + SCHEMA/SVC (422) |
| 20 | Plan creation only for current week … +4 weeks, never past | SVC (depends on today; not a DB constraint) |
| 21 | `plans.status ∈ {draft,submitted,approved,done}` | DB + SVC + SCHEMA |
| 22 | Only the author edits content, and only in `draft` | SVC |
| 23 | Submit requires a team, exactly one `main`, and a non-empty `main.why` | SVC (422) |
| 24 | `tasks (plan_id) WHERE kind='main'` is unique | DB (partial index) + SVC |
| 25 | `tasks.kind ∈ {main,sub_goal,gtm}`, `tasks.status ∈ {todo,done}` | DB + SVC + SCHEMA |
| 26 | `task.title ≤ 200`, `task.why ≤ 500` | DB (`varchar`) + SCHEMA |
| 27 | ≤ 5 `sub_goal` and ≤ 5 `gtm` tasks per plan | SVC |
| 28 | Nobody approves/sends back their own plan | SVC |
| 29 | `send_back` requires a non-empty comment | SVC + SCHEMA |
| 30 | `close` records a boolean `shipped`; `done` is read-only after | SVC + SCHEMA |
| 31 | Every state transition writes a `plan_events` row | SVC |
| 32 | Invalid transition ⇒ 409 | SVC |
| 33 | `plan_events.action` in the allowed set | DB + SVC |
| 34 | `ai_calls.status`/`feature`/`error_class` in the allowed sets | DB + SVC |
| 35 | `staff_actions.action`/`target_type` in the allowed sets | DB + SVC |
| 36 | Client can never set `org_id`, `membership_id`, `role`, `status`, `is_admin`, `is_active`, `shipped`, `decided_by`, `plan.status` via a body | SCHEMA (`extra="forbid"` + fields not declared) + SVC |
| 37 | Customer/app tokens are scoped to `/app`, staff/internal tokens to `/internal` | SVC (JWT audience, existing) |
| 38 | Deactivated user (`is_active=false`) fails login **and** existing tokens | SVC on every request (must check DB, not just token) |
| 39 | Suspended org ⇒ 403 `org_suspended` on every org route | SVC (`get_org_context`) |
| 40 | Cross-org ids (path **or** body) ⇒ 404, never 403, identical body | SVC |
| 41 | `week_start` input parsed as a date; non-Monday / malformed ⇒ 422 | SCHEMA |
| 42 | AI output never written straight to the DB (returns to a form) | SVC (endpoints don't write) |

Race safety (see `docs/API.md` → testable statements): last-owner demotion,
double invite-accept and double submit are all made safe by row locks or
conditional `UPDATE ... WHERE <expected state> RETURNING`, tested with
concurrent transactions.

---

## Migration notes

- One autogenerated revision creates all tables above (`alembic revision
  --autogenerate -m "Add Cadence domain tables"`), reviewed before commit.
- The partial unique index and all `CheckConstraint`s are declared **on the
  model** so autogenerate emits them (root `AGENTS.md` §3).
- Postgres cannot express "at least one owner", "lead is a team member",
  "same org", or "≤ 5 sub-goals" declaratively without triggers; those stay in
  the service layer and are covered by tests.
- Server defaults: add `server_default` where a column is non-null and existing
  rows would otherwise fail (per `api/AGENTS.md`).
