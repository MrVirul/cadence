# Cadence — Scope Cuts & Known Limitations

Documented tradeoffs, explicit scope exclusions, and known limits in the Cadence codebase.

## Scope Cuts & Deliberate Tradeoffs

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

## What I Would Fix With Another Day (5 Items)

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
