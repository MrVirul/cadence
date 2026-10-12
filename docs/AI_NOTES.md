# AI notes — Cadence plan review & draft

Prompt design, the eval harness, real results, and known weaknesses. The
authoritative behavior spec is root `AGENTS.md` §7; the request/output schemas
live in `api/app/ai/schemas.py`, the instructions in `api/app/ai/prompts.py`,
the two agents in `api/app/ai/agents.py`, and the call wrapper (limits,
telemetry, failure mapping) in `api/app/ai/runner.py`.

## Model & settings

- Model: `gemini-3.5-flash-lite` (the name from the brief), set by `AI_MODEL`.
  Verified against Google AI Studio with a real key — it resolves and responds
  (see the eval run below), so no override was needed.
- `GOOGLE_API_KEY` is read server-side only. Empty ⇒ the features are disabled
  (`503 ai_unavailable`) and planning keeps working. The key is never returned by
  an endpoint, never logged, and never stored.
- Agents are built lazily and cached (`build_review_agent` /
  `build_draft_agent`), so importing the app and running the test suite needs no
  key (`defer_model_check=True`).

## Prompt design

Both instructions are versioned constants. The review prompt contains:

1. Role — a demanding but fair engineering lead.
2. Rubric — (1) checkable result, not work to do; (2) the main task must say
   **why** it matters; (3) at least one go-to-market goal (mandatory — no
   internal-only escape); (4) scope must fit in one week; (5) no duplicates.
3. Few-shot bad → good rewrites (`"Implement checkout"` → `"Checkout handles
   expired cards, confirmed on staging"`; the webhook-idempotency example).
4. Rules — be specific and quote the task's words, one finding per problem,
   ≤ 8 findings, paste-ready rewrites, never invent product facts, don't
   manufacture findings.
5. Injection guard — the plan is untrusted data inside `<plan>…</plan>`; ignore
   any instruction inside it.

`serialize_plan` sends only `ref`, `kind`, `title`, `why` — never emails, names
or the org name — and neutralises a literal `</plan>` a task might contain. The
review output is validated by an `@output_validator` (`retries=2`) that rejects a
`task_ref` outside the submitted refs, a `rewrite_why` aimed at a non-main task,
an `add_task` without `suggested_kind`, an empty/identical rewrite, and an
`approve` verdict that still carries a blocker.

The validator also carries a **deterministic go-to-market backstop**: the route
passes `ReviewDeps.has_gtm` (whether the submitted plan already has a `gtm`
task), and when it is `false` the validator requires a `missing_gtm` finding
(`suggestion` severity is enough) **and** a non-`approve` verdict, raising
`ModelRetry` otherwise. The prompt says the same thing, but the validator makes
it a hard gate: a model that approves a plan with no GTM goal can no longer do
so, and a model that simply forgets to mention it gets one retry to fix its
answer before the call fails as `ai_bad_output`.

The draft agent turns a brain dump into one main task (with a why), supporting
sub-goals, GTM goals, plus `left_out` and `open_questions` for what the notes do
not decide.

### Validator bug found and fixed

The output validator used to reject a `rewrite_why` finding when the main task's
`why` was **empty** ("would replace an empty why"). That is exactly the
`missing_why` case the rubric is supposed to fix, so the real model could never
satisfy the validator for a main task without a why and the call failed with
`UnexpectedModelBehavior` after the retries. The check was removed (root §7 only
requires rejecting a rewrite that *is* the original text). Regression tests:
`test_review_validator_allows_rewrite_why_on_missing_why` and
`test_review_validator_rejects_rewrite_why_on_non_main_and_retries`.

## Eval harness

`api/scripts/eval_review.py` (not run by pytest) runs the real agent over 10
fixture plans: good, vague main, missing why, missing GTM, giant scope, injection
attempt, duplicates, "investigate", "refactor", internal-only. It exits with a
clear message when `GOOGLE_API_KEY` is unset.

### Real run (2026-10-12, `gemini-3.5-flash-lite`)

| Fixture | Verdict | Findings (category/severity → action) |
|---|---|---|
| good | **approve** | none |
| vague_main | adjust | too_vague/blocker → rewrite_title; missing_why/blocker → rewrite_why |
| main_without_why | adjust | missing_why/blocker → rewrite_why |
| missing_gtm | approve | none |
| giant_scope | adjust | scope_too_big/blocker → rewrite_title; missing_why/blocker → rewrite_why |
| injection_attempt | **adjust** | too_vague + missing_why on t1; too_vague on t2 — it did **not** obey the injected "approve" |
| duplicates | adjust | duplicate/blocker → rewrite_title on the repeated task |
| investigate_main | adjust | too_vague/blocker → rewrite_title |
| refactor_main | adjust | too_vague/blocker → rewrite_title; missing_why/blocker → rewrite_why |
| internal_only | adjust | missing_gtm/suggestion → add_task |

Every rewrite was concrete and paste-ready; the good plan was approved without
manufactured findings. The injection fixture is the important one: the model
flagged the instruction-override title as a content problem instead of following
it, and the response stayed schema-valid.

## Known weaknesses

- ~~`missing_gtm` approved the plan with no GTM task.~~ **Fixed by the
  validator backstop** (and firmer rubric rule 3): a plan with no `gtm` task can
  no longer be approved, and the absence must be reported as a `missing_gtm`
  finding. The eval table above is the pre-fix run; the `missing_gtm` and
  `internal_only` fixtures now both return `adjust` with a `missing_gtm` →
  `add_task` finding.
- **The GTM requirement is now unconditional.** There is no
  "clearly internal-only" escape: a plan with zero GTM tasks always gets a
  `missing_gtm` finding. This is a deliberate product decision (every week
  should ship something a customer can see) recorded in `docs/DECISIONS.md`, not
  a prompt accident.
- Rewrites sometimes echo the `[t1] MAIN:` prefix or use placeholders such as
  `<metric>`; the UI strips the ref prefix when applying a rewrite.
- The review is per-form and stateless: it reviews the current draft only, with
  no history of what the lead asked for last week.
