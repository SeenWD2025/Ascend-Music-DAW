# Ascend Multi-Agent Team

These agent profiles are lightweight role prompts used to run sprint-per-feature delivery in parallel.

## Canonical docs
- Dev Source of Truth: `dev-guides_plans/ASCEND_DEV_SOURCE_OF_TRUTH.md`

## Agents
- **A00** Orchestrator: routes work and enforces scope/decisions.
- **A01** Backend (Fastify + workers)
- **A02** Supabase (schema/RLS/realtime)
- **A03** Integrations (Stripe/Connect, Drive OAuth, DMTV, calendar, Zoom)
- **A04** Realtime/Streaming (chat, presence, radio, playlists)
- **A05** AI Systems (AI gateway + agent use cases)
- **A06** Frontend UI (React + Tailwind + shadcn + instrumentation)
- **A07** QA/Security (RLS/privacy/webhook security/regression)
- **A08** DevOps/Observability (Railway + Sentry/PostHog/BetterStack)
- **A09** Product Sprint Writer (tickets + AC/DoR/DoD)

## How to run a feature sprint
1. Ask **A09** to generate tickets for the next feature (or the next 2–3 vertical slices).
2. Give the selected ticket to **A00** and request a routing plan.
3. Run specialist agents in parallel (A01–A08) with the ticket’s handoff section.
4. Reconcile outputs in **A00**:
   - Ensure API ↔ DB ↔ UI contracts match.
   - Ensure RLS + privacy model are enforced.
   - Ensure PostHog/Sentry/BetterStack requirements are included.
5. QA pass with **A07** against acceptance criteria.

## Ticketing conventions
- Prefer vertical slices (DB + API + UI + telemetry) over “all backend then all frontend.”
- Every user-visible feature must include:
  - RLS/authorization notes
  - telemetry (PostHog event names + props)
  - error reporting (Sentry)
  - a small QA checklist
