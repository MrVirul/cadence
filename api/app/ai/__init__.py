"""Pydantic AI features: plan review and draft-from-notes (root AGENTS.md §7).

Submodules:

- ``schemas`` — request/output models (used as FastAPI bodies, response models,
  and Pydantic AI ``output_type``).
- ``prompts`` — versioned instruction texts and plan serialization.
- ``agents`` — lazy agent builders with an output validator on the review agent.
- ``limits`` — per-user-per-minute / per-org-per-day counters from ``ai_calls``.
- ``runner`` — the single call wrapper handling limits, telemetry and failure
  mapping for both features.
"""
