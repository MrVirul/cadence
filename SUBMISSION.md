# Cadence — Submission

## How to run

### Prerequisites
- **Python 3.12** and [uv](https://docs.astral.sh/uv/)
- **Node.js 24+** (and npm)
- **Docker** (for local Postgres 16 and testcontainers)

### 1. Start Postgres 16
Start a local Postgres 16 container:
```bash
docker run -d --name cadence-postgres \
  -e POSTGRES_USER=chamoda \
  -e POSTGRES_DB=cadence \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -p 5432:5432 \
  postgres:16
```
*(If the container already exists, run `docker start cadence-postgres`.)*

### 2. Environment & Dependencies Setup
#### API
```bash
cd api
uv sync
cp .env.example .env
```
Edit `api/.env`:
- Ensure `SQLALCHEMY_DATABASE_URI=postgresql+asyncpg://chamoda:@localhost:5432/cadence` matches your Postgres connection.
- Set a secret key string, e.g. `SECRET_KEY=cadence_dev_secret_key_1234567890`.
- **Google AI Studio Key**: To use the optional AI reviewer/drafting features, obtain an API key from [Google AI Studio](https://aistudio.google.com/) and set `GOOGLE_API_KEY=your_key_here`.
- **AI Model Note**: The default model is `gemini-3.5-flash-lite` (configurable via `AI_MODEL`). The product functions completely without an API key; AI endpoints gracefully degrade with plain-language notices.

Apply migrations:
```bash
uv run alembic upgrade head
```

Seed demo data:
```bash
uv run manage.py seed-demo
```
*(Use `--reset` to re-seed clean state: `uv run manage.py seed-demo --reset`)*

#### Frontends
In three separate terminals (or sequentially):
```bash
cd app && npm install
cd internal && npm install
cd site && npm install
```

### 3. Start Services
Services run on the following ports:

| Service | Folder | Port | Command | URL |
|---|---|---|---|---|
| API | `api/` | 8000 | `cd api && uv run fastapi dev` | http://localhost:8000 (Docs: `/app/docs`) |
| Customer App | `app/` | 3001 | `cd app && npm run dev -- --port 3001` | http://localhost:3001 |
| Internal Admin | `internal/` | 3002 | `cd internal && npm run dev -- --port 3002` | http://localhost:3002 |
| Marketing Site | `site/` | 3000 | `cd site && npm run dev -- --port 3000` | http://localhost:3000 |

*(Or launch the complete stack at once with `./startup` or `tmuxp load .`)*

### 4. Running Tests
Tests run offline without network access or a real Google API key (via hermetic `testcontainers` Postgres 16 and mocked Pydantic AI models):
```bash
cd api && env -u GOOGLE_API_KEY uv run pytest -q
```

### 5. Demo Logins
All demo users share the password: `cadence-demo-1`

| Role | Email | Password | Organization | Notes |
|---|---|---|---|---|
| **Org Owner** | `owner@northwind.test` | `cadence-demo-1` | Northwind Labs | Can manage members, teams, plans, and org settings |
| **Org Admin** | `admin@northwind.test` | `cadence-demo-1` | Northwind Labs | Can manage teams, invites, and review member plans |
| **Team Lead** | `lead@northwind.test` | `cadence-demo-1` | Northwind Labs | Lead of Platform team; reviews & approves team plans |
| **Member** | `member@northwind.test` | `cadence-demo-1` | Northwind Labs | Engineering author; creates, drafts, and ships weekly plans |
| **Platform Staff** | `staff@cadence.test` | `cadence-demo-1` | Cadence Staff | Access to `/internal` console; no customer plan text visible |
| **Suspended Org User** | `owner@dormant.test` | `cadence-demo-1` | Dormant Co | Suspended org member; receives 403 `org_suspended` view |

---

## The name

- **Name**: Cadence
- **One-line pitch**: Cadence is a weekly planning tool for engineering teams. Each engineer picks one thing to ship by Friday. Leads approve it fast, and an AI reviewer flags vague tasks.
- **Why this name**: Cadence is the steady weekly rhythm of a team that ships; it is short, easy to say and easy to spell.
- **Name check**: TODO(user): write what you searched and found

---

## Key decisions

1. **Tenancy architecture & error contracts**:
   - Every tenant endpoint resolves organization context through `get_org_context(org_id, current_user)`.
   - Clear contract split: `404 not_found` when the caller has **no read access** (cross-org resource, teammate's private plan, unauthorized team), and `403 forbidden` when the caller has **read access but cannot act** (e.g. non-lead trying to approve, non-admin modifying team).
   - Cross-org resource IDs are completely indistinguishable from non-existent rows (`get_in_org` strictly asserts `model.org_id == org_id`), preventing cross-tenant enumeration.

2. **Least-privilege plan visibility**:
   - Engineers can view only their own weekly plans. Teammates cannot read each other's drafts or active plans. Only the designated team lead (or org admins/owners) can inspect team commitments on the Team Week view.

3. **Self-approval safety**:
   - By default, team leads cannot approve their own weekly commitments.
   - Self-approval is permitted exclusively as a fallback when no other eligible approver exists in the organization (such as an owner-operated single-lead team), and is explicitly audited by setting `plan_events.self_approved = true`.

4. **Staff privacy barrier**:
   - Internal staff access (`/internal`) is strictly isolated from customer content. Platform staff see organization counts, suspension controls, audit actions, and aggregated AI performance metrics.
   - Staff **never** see plan titles, task descriptions, or AI prompt text in any database query or API response payload.
   - Telemetry table `ai_calls` records token usage, latency, and status codes, but stores zero prompt or output text.

5. **AI integration design & resilience**:
   - **Typed outputs & validation**: Structured outputs via Pydantic AI schemas (`PlanReview`, `PlanDraft`).
   - **GTM backstop**: The output validator enforces that any plan lacking a go-to-market task must receive a `missing_gtm` finding and cannot receive an approval verdict, preventing hallucinated passes on internal-only scope.
   - **Stateless inline execution**: The AI reviewer evaluates live form state passed directly in the request, not database IDs, eliminating IDOR risks and draft sync delays.
   - **Human-in-the-loop**: AI model output never writes directly to the database; generated suggestions populate forms for user review and explicit saving.
   - **Graceful degradation**: Fully optional. If the API key is missing or upstream times out (504) or rate-limits (429), plans can still be authored, submitted, approved, and closed manually.
   - **Rate limits & abuse guards**: In-memory and DB-backed sliding limits per user per minute and per org per day.
   - **Model**: `gemini-3.5-flash-lite` (verified and evaluated via `api/scripts/eval_review.py`).

---

## Hours

TODO(user): actual hours

---

## What isn't done

### Scope Cuts & Known Limitations

1. **Member removal cascades plans and team memberships**:
   - *Current state*: Removing a member (or deactivating their user) cascades in Postgres and deletes their `plans`, `tasks`, and `team_members` rows, clearing `lead_membership_id` references (`ON DELETE CASCADE` / service cascade).
   - *Tradeoff*: Simplest consistent tenant lifecycle, but historical team metrics for departed team members are not preserved in past weeks.

2. **`/app/me` returns organizations and roles, but not per-org membership IDs**:
   - *Current state*: `GET /app/me` returns `user` details and `memberships: [{org: {...}, role: "..."}]`, omitting the primary key `membership_id`.
   - *Consequence*: To check whether the user is the lead of a given team or has membership in a team, the sidebar and team views fetch team metadata or team week data per team.

3. **No email sending, email verification, or password reset**:
   - *Current state*: Out of scope for this build. Sign-ups are activated immediately (`is_active = True`). Invites generate unique single-use tokens displayed directly in the UI as copyable URLs (`/invite/<token>`).
   - *Tradeoff*: No third-party email provider dependencies (SendGrid/Resend) or SMTP configuration needed.

4. **Lighthouse audits run manually**:
   - *Current state*: Lighthouse audits were run by hand during frontend polish passes rather than automated in CI/pre-commit pipeline.

5. **AI quality evaluated against free tier with fixed test fixtures**:
   - *Current state*: AI prompt validation and agent outputs were evaluated via `api/scripts/eval_review.py` against 10 targeted fixture plans on Google AI Studio's free tier (`gemini-3.5-flash-lite`).
   - *Tradeoff*: No production synthetic dataset or automated online eval suite run continuously. Automated CI test suites run hermetically with offline mocked models (`FunctionModel` with `ALLOW_MODEL_REQUESTS = False`).

6. **No cloud deployment**:
   - *Current state*: Monorepo is packaged for local development and local evaluation (Docker Compose / containerized Postgres 16, Vite dev/build, FastAPI). Production build outputs (`dist/client/`) are verified statically, but live CDN/cloud deployments were not provisioned.

7. **Team history pagination**:
   - *Current state*: Team history list returns a simplified paginated list of past weeks with aggregate shipped rates rather than an interactive time-series dashboard with granular filtering.

8. **Stateless AI reviews**:
   - *Current state*: AI plan reviews inspect the author's live form state in isolation. It does not ingest previous weeks' commitments, carry-over history, or manager feedback threads.

### What I Would Fix With Another Day (5 Items)

1. **Preserve historical plans on member departure**:
   - Introduce soft-deletion or an archive status (`status='archived'`, `Membership.is_active=False`) so departed members' past plans and shipped metrics remain visible in historical team week views.

2. **Enrich `/app/me` payload with tenant membership IDs**:
   - Update `GET /app/me` response schema to include `membership_id` inside each organization membership object, eliminating redundant team membership queries in navigation layouts.

3. **Production transactional email integration**:
   - Add background worker (e.g., Celery/ARQ) for transactional emails: sending invite links, notifying leads when plans are submitted, and notifying authors when plans are approved or sent back.

4. **Historical carry-over & AI trend analysis**:
   - Pass the previous week's uncompleted tasks and carry-over state to the AI reviewer so it can proactively detect chronic scope creep or recurring carry-over tasks across multiple weeks.

5. **End-of-week automated team summary & Slack/webhook notifications**:
   - Generate automated weekly digest summaries (plans shipped vs. missed) published to a team webhook or Slack channel every Friday afternoon.
