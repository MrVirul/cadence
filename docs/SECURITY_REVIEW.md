# Cadence Security Review (Appendix B Walkthrough)

This document audits the Cadence API against the Attacker Review Checklist in `AGENTS.md` (Appendix B).

## 1. Appendix B Checklist & Test Proofs

| Check | Where Enforced | Test That Proves It | Verdict |
|---|---|---|---|
| **Org isolation on all resource IDs**: every route with an ID filters by `org_id` in path and body. | `api/app/api/app/org_access.py` (`get_in_org`), all service query filters. | `api/tests/api/app/test_tenancy_matrix.py` (complete matrix over all routes registered in `tenancy_registry.py`). | PASS |
| **Server-controlled fields forbidden**: client cannot supply `role`, `org_id`, `membership_id`, `status`, `is_admin`, `is_active`, `shipped`, `decided_by`. | Pydantic request schemas with `extra="forbid"`; server assigns IDs and status. | `api/tests/api/app/test_org_scoped.py::test_server_controlled_fields_rejected` | PASS |
| **Least privilege roles**: members cannot call admin routes; admins cannot touch owners. | `api/app/api/app/org_access.py` (`require_org_admin`), `api/app/services/memberships.py`. | `api/tests/api/app/test_roles.py::test_member_cannot_access_admin_endpoints`, `test_admin_cannot_touch_owners`. | PASS |
| **Team boundary & approval safety**: leads cannot approve plans for another team; nobody approves their own plan. | `api/app/services/plans.py` (`PlanService.approve`), `api/app/services/teams.py`. | `api/tests/api/app/test_roles.py::test_lead_of_team_a_cannot_approve_team_b_plan`, `test_lead_cannot_approve_own_plan`. | PASS |
| **Invite privilege escalation**: nobody can create an `owner` invite. | `api/app/schemas/invites.py` (`InviteCreateRequest.role`), `api/app/services/invites.py`. | `api/tests/api/app/test_org_scoped.py::test_invite_creation_rejects_owner_role_and_writes_nothing`. | PASS |
| **Audience token separation**: customer token cannot call `/internal`; staff token cannot call `/app/orgs/...`. | `api/app/security.py` (`JWT_AUDIENCE_APP`, `JWT_AUDIENCE_INTERNAL`), `api/app/api/internal/access.py`. | `api/tests/api/internal/test_internal_access.py::test_internal_matrix_access`, `api/tests/api/app/test_tenancy_matrix.py`. | PASS |
| **Suspended organization**: all org routes return `403 org_suspended`; login still works. | `api/app/api/app/org_access.py` (`get_org_context` checks `org.is_suspended`). | `api/tests/api/app/test_org_scoped.py::test_suspended_org_locks_members_and_reinstating_restores`, `test_login_still_works_while_org_suspended`. | PASS |
| **Deactivated user revocation**: deactivated user tokens immediately stop working. | `api/app/api/app/access.py` (`get_current_user` loads `user.is_active` from DB on every call). | `api/tests/api/app/test_auth.py::test_deactivated_user_token_rejected`. | PASS |
| **Invite single-use & expiry**: expired, used, or revoked invites cannot be accepted. | `api/app/services/invites.py` (`accept` verifies expiration, `accepted_at`, `revoked_at`). | `api/tests/api/app/test_org_scoped.py::test_only_valid_invites_are_listed`, `test_invites.py`. | PASS |
| **No cross-org enumeration**: error responses never differentiate between "exists in another org" and "doesn't exist" (404 only). | `api/app/api/app/org_access.py` (`get_in_org` raises `ResourceNotFoundException("Resource not found")`). | `api/tests/api/app/test_tenancy_matrix.py::test_cross_org_resource_id_in_url_yields_404`. | PASS |
| **Staff privacy barrier**: `/internal` endpoints and `ai_calls` table never expose plan/task text or prompt strings. | `api/app/models.py` (`AiCall` schema), `api/app/services/internal.py`. | `api/tests/api/internal/test_internal_access.py::test_internal_privacy_no_plan_or_task_text`. | PASS |
| **AI prompt safety & abuse**: input length validation, local rate limits (per user/min, per org/day), graceful degradation without API key. | `api/app/ai/limits.py`, `api/app/ai/runner.py`, `api/app/ai/schemas.py`. | `api/tests/api/app/test_ai.py::test_plan_review_local_rate_limit`, `test_ai_unavailable_without_key`. | PASS |
| **Concurrency & race conditions**: concurrent last-owner demotions, duplicate signups, double submits. | Row-level locks (`SELECT ... FOR UPDATE`), DB unique constraints (`(membership_id, week_start)`, `(team_id, membership_id)`). | `api/tests/api/app/test_org_scoped.py::test_concurrent_demotions_of_different_owners_leave_one_owner`, `test_two_concurrent_signups_same_email_one_succeeds`. | PASS |

---

## 2. Exhaustive Database Query Audit (`select`, `update`, `delete`)

All queries in `api/app/services/` and `api/app/api/` were checked to verify tenant scoping:

### A. Customer Surface (`api/app/services/` & `api/app/api/app/`)

1. **`api/app/api/app/access.py`**
   - Line 69: `select(User).where(User.id == user_id)` — Authenticates global user by token subject. User is not org-scoped. **Verdict: PASS**.

2. **`api/app/api/app/org_access.py`**
   - Line 72: `select(Membership, Organization)...where(Membership.org_id == org_id, Membership.user_id == current_user.id)` — Loads caller membership within the targeted org. **Verdict: PASS**.
   - Line 146: `select(model).where(model.id == id_, model.org_id == org_id)` — Standard `get_in_org` tenant boundary checker. **Verdict: PASS**.

3. **`api/app/api/app/routers/auth.py`**
   - Line 79: `select(User).where(User.email == ...)` — User authentication by email. Global user table. **Verdict: PASS**.

4. **`api/app/services/invites.py`**
   - Line 74 & 77: `select(Invite).where(*conditions)` — Filtered by `Invite.org_id == org_id`. **Verdict: PASS**.
   - Line 96: `select(Organization.name, Invite.role)...where(Invite.token == token)` — Public preview of unguessable random token; reveals only target org name. **Verdict: PASS**.
   - Line 110: `update(Invite).where(Invite.id == invite.id, Invite.accepted_at.is_(None))` — Atomic accept of verified invite. **Verdict: PASS**.
   - Line 129: `select(Membership.id).where(Membership.org_id == invite.org_id, Membership.user_id == user.id)` — Scoped to `invite.org_id`. **Verdict: PASS**.

5. **`api/app/services/memberships.py`**
   - Line 25: `select(Membership, Organization).where(Membership.user_id == user_id)` — Loads orgs for the authenticated user (`/app/me`). **Verdict: PASS**.
   - Line 37 & 42: `select(Membership, User).where(Membership.org_id == org_id)` — Scoped to `org_id`. **Verdict: PASS**.
   - Line 90: `delete(target)` — `target` loaded via `get_in_org(Membership, ..., actor.org.id)`. **Verdict: PASS**.
   - Line 100: `select(func.count()).where(Membership.org_id == org_id, Membership.role == "owner")` — Scoped to `org_id`. **Verdict: PASS**.
   - Line 109: `select(Organization.id).where(Organization.id == org_id).with_for_update()` — Row lock on org. **Verdict: PASS**.

6. **`api/app/services/organizations.py`**
   - Line 45: `select(Organization.id).where(Organization.slug == candidate)` — Slug collision check on org creation. **Verdict: PASS**.

7. **`api/app/services/plans.py`**
   - Line 100: `select(Team.id).where(Team.id == team_id, Team.org_id == org_id)` — Scoped to `org_id`. **Verdict: PASS**.
   - Line 111: `select(TeamMember.id).where(..., TeamMember.org_id == org_id)` — Scoped to `org_id`. **Verdict: PASS**.
   - Line 122: `select(Membership, User).where(Membership.id == plan.membership_id, Membership.org_id == plan.org_id)` — Scoped to `plan.org_id`. **Verdict: PASS**.
   - Line 134: `select(Task).where(Task.plan_id == plan_id, Task.org_id == plan.org_id)` — Scoped to `plan.org_id`. **Verdict: PASS**.
   - Line 142: `select(PlanEvent).where(PlanEvent.plan_id == plan_id, PlanEvent.org_id == plan.org_id)` — Scoped to `plan.org_id`. **Verdict: PASS**.
   - Line 176 & 190 & 197: `select(Plan)...where(*conditions)` — Enforces `Plan.org_id == ctx.org.id` and least-privilege visibility (author or team lead/admin). **Verdict: PASS**.
   - Line 232: `select(Plan.id).where(Plan.membership_id == ctx.membership.id, Plan.week_start == week_start, Plan.org_id == ctx.org.id)` — Scoped to `ctx.org.id`. **Verdict: PASS**.
   - Line 301: `delete(task)` — `task` loaded via `get_in_org(Task, task_id, ctx.org.id)`. **Verdict: PASS**.
   - Line 446: `select(Team.lead_membership_id).where(Team.id == plan.team_id)` — `plan` pre-validated via `get_in_org`. **Verdict: PASS**.
   - Line 451: `select(Membership.id).where(Membership.org_id == plan.org_id, Membership.role.in_(["owner", "admin"]))` — Scoped to `plan.org_id`. **Verdict: PASS**.
   - Line 461: `select(Task).where(Task.plan_id == plan_id, Task.kind == "main")` — `plan_id` pre-validated via `get_in_org`. **Verdict: PASS**.

8. **`api/app/services/teams.py`**
   - Lines 45, 51, 55: `select(Team)...where(*conditions)` — Filtered by `Team.org_id == ctx.org.id`. **Verdict: PASS**.
   - Line 77: `select(Membership, User)...where(TeamMember.org_id == ctx.org.id)` — Scoped to `ctx.org.id`. **Verdict: PASS**.
   - Lines 151, 154: `select(Plan)...where(*conditions)` — Scoped to `Plan.org_id == ctx.org.id` and `Plan.team_id == team.id`. **Verdict: PASS**.
   - Line 202: `select(Membership, User, Plan)...where(TeamMember.org_id == ctx.org.id)` — Scoped to `ctx.org.id`. **Verdict: PASS**.
   - Line 305 & 311: `select(Plan)...where(Plan.team_id == team.id)` and `delete(team)` — `team` pre-validated via `get_in_org(Team, team_id, ctx.org.id)`. **Verdict: PASS**.
   - Line 335: `delete(TeamMember).where(TeamMember.team_id == team.id)` — `team` pre-validated via `get_in_org(Team, team_id, ctx.org.id)`. **Verdict: PASS**.
   - Line 371 & 380: `select(TeamMember)...where(TeamMember.org_id == ctx.org.id)` — Scoped to `ctx.org.id`. **Verdict: PASS**.
   - Line 390: `select(Team.id).where(Team.org_id == org_id, Team.name == name)` — Scoped to `org_id`. **Verdict: PASS**.

9. **`api/app/services/users.py`**
   - Lines 25, 98, 104: Queries on global `User` table for auth & user profiles. **Verdict: PASS**.

### B. Internal Staff Surface (`api/app/services/internal.py`)

All internal endpoints are staff-only (`require_platform_staff`) and return platform administration aggregates (counts, suspension flags, user statuses, and anonymized AI usage). As verified in privacy tests, zero plan text, task titles, or AI prompt texts are fetched or returned. **Verdict: PASS**.

---

## 3. Secrets Verification

- `git log -p --all | grep -E "AIza|GOOGLE_API_KEY=.+"` prints no active API keys.
- `api/.env` is git-ignored and untracked.
- `api/.env.example` has an empty `GOOGLE_API_KEY=`.
- No API keys appear in client response bodies, logs, or built frontend bundles (`app/dist`, `internal/dist`, `site/dist`).
