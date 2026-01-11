# Ascend Development Instructions

Purpose: enforce production-quality delivery, sprint-style execution, rigorous testing, and disciplined use of documentation, mapfiles, and agents.

## Source of Truth
- Use `dev-guides_plans/ASCEND_DEV_SOURCE_OF_TRUTH.md` for architecture, stack, and locked decisions.
- Use `dev-guides_plans/ASCEND_SPRINT_GUIDES.md` for feature slices and dependencies.
- Keep directory mapfiles current; regenerate `root-mapfile.md` via `node devtools/update-root-mapfile.js` after edits.

## Workflow (Sprint Style)
- Plan per sprint using the relevant section in `ASCEND_SPRINT_GUIDES.md`.
- Create tickets with A09, route via A00, execute with A01–A08 in parallel.
- Deliver vertical slices: DB/RLS + API + UI + telemetry in one increment.
- Update mapfile(s) for touched directories when scope or ownership changes.
- Regenerate `root-mapfile.md` before finishing the sprint.

## Code Standards
- Language: TypeScript for backend/frontend; adhere to Fastify conventions for API.
- Error handling: return typed error responses; map integration errors with context (no secrets).
- Validation: validate inputs at API boundaries; enforce schemas.
- AuthZ: rely on Supabase RLS; avoid bypasses in application code.
- Logging: keep logs structured; exclude PII and secrets.
- Observability: add PostHog events, Sentry spans/contexts, BetterStack uptime/log routing where relevant.

## API Patterns
- Prefix REST endpoints with `/api/v1`.
- Keep controllers thin; push business logic into services.
- Verify all webhooks (Stripe, DMTV, etc.) with signatures; respond idempotently.
- Example (Fastify route + schema):
```ts
app.post('/api/v1/workspaces', {
  schema: {
    body: workspaceCreateSchema,
    response: { 200: workspaceResponseSchema }
  }
}, workspaceController.create);
```

## Supabase & Data
- Use migrations via Supabase CLI; never apply ad-hoc SQL.
- Enforce RLS on every table; test positive and negative access cases.
- Keep `auth.uid()` ownership rules explicit; add admin/label_staff overrides via join tables where needed.

## File Privacy & Drive
- Default all Drive-backed files to private.
- Expand access only through explicit submission flows (workspace delivery, chat share, playlist/radio publish).
- Store tokens server-side; rotate/refresh via backend or worker utilities.

## Payments & Connect
- Enforce AMG 8% fee server-side for marketplace orders.
- Handle Stripe webhooks idempotently; persist state to Supabase.
- Block processing for unpaid states; gate paid AI jobs behind confirmed charges.

## AI Gateway
- Route all LLM calls through the gateway; support OpenAI, Perplexity, Gemini.
- Require opt-in, log requests/responses with consent, and strip secrets.
- Provide provider fallback and rate limits.

## Testing Gates (per sprint)
- Unit tests for services and utilities touched.
- Integration tests for API routes and migrations when data model changes.
- E2E critical path for the sprint’s vertical slice (auth, upload, order, chat, etc.).
- RLS tests: verify owner access and non-owner denial.
- Webhook tests: signature verification and idempotency.

## QA & Security Checks
- Role-based UX review: artist, pro, client, admin/label.
- Verify privacy model (files, chat attachments, submissions) and rate limiting on auth-sensitive endpoints.
- Confirm telemetry fires with correct event names/properties.

## Mapfile Discipline
- Edit the `mapfile.md` inside any directory you meaningfully change.
- Keep fields updated: path, owner, status, summary, last_updated, key_artifacts, processes, dependencies, risks, todo, tags.
- Run `node devtools/update-root-mapfile.js` after mapfile changes to refresh the root registry.

## Agent Orchestration
- A09: generate tickets with AC/DoR/DoD and handoffs.
- A00: route tickets to specialists and reconcile outputs.
- A01–A08: execute per domain (backend, Supabase/RLS, integrations, realtime, AI, frontend, QA/security, DevOps/observability).
- Always include telemetry, RLS, and error reporting in each handoff.

## Example PR Checklist
- [ ] Applied migrations (if schema changes) and included RLS.
- [ ] Added/updated tests (unit/integration/E2E) for the slice.
- [ ] Wired PostHog events and Sentry instrumentation.
- [ ] Updated relevant `mapfile.md` and regenerated `root-mapfile.md`.
- [ ] Included API contract and UI notes in the PR description.
