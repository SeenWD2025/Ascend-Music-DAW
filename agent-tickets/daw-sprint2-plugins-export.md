# Sprint 2 Ticket — WAM Plugins & Export Pipeline

**Feature Name**: Plugins + Export
**Goal**: Enable WAM plugin loading/control, effects chain management, and reliable export pipeline (idempotent, concurrency-limited, R2 upload).
**User Roles**: Pro, Client (export consumers), Admin (abuse review)

## Acceptance Criteria
- User can browse/search a “known-good” plugin subset (>=5), add to track, adjust parameters, and reorder effects chain.
- Plugin parameters persist to DB and sync to collaborators; locks prevent simultaneous edits; parameter events throttled/quantized.
- Export job can be submitted, tracked, and completed with download URL; idempotency keys dedupe retries; concurrency limits enforced.
- Export state transitions persisted; R2 upload integrated; status polling endpoint returns accurate state.
- Telemetry: plugin.loaded/added, export.started/completed; Sentry captures WAM load failures.
- Load tests: 10 simultaneous exports stay within queue limits; plugin load failures are graceful (no DAW crash, user-visible error, Sentry capture).

## Out of Scope
- Automation curves, MIDI, stem export, AI mastering UX (beyond hooks).

## UX Surfaces
- Plugin browser UI (search/filter); parameter UI (generic knobs/sliders); effects chain reorder; export dialog (format/quality/stems vs master flag placeholder if deferred).

## API Contract
- `POST /api/v1/daw/projects/:id/plugins` (add), `PUT /api/v1/daw/projects/:id/plugins/:pluginId` (update), `DELETE ...` (remove), `PATCH position` (reorder)
- `POST /api/v1/daw/projects/:id/export` (enqueue, idempotency key)
- `GET /api/v1/daw/exports/:exportId` (status)

## Supabase Work
- Migration `20260125000001_daw_plugins_export.sql`: `daw_plugins`, `daw_exports` tables; RLS inheriting track access; indexes for plugin lookup and export status queries.

## Integrations
- WAM loader with pinned versions from compatibility list; graceful fallback on failure.
- Cloudflare R2 for exports (upload + URL).

## Telemetry
- PostHog: `plugin.loaded`, `plugin.added`, `plugin.param_changed` (throttled), `plugin.reordered`, `export.started`, `export.completed`.
- Sentry: WAM load failures, export pipeline errors.

## QA Checklist
- Unit: plugin state serialization; parameter throttling; export idempotency handling.
- Integration: export pipeline end-to-end (enqueue → render → upload → status); RLS for plugins/exports.
- E2E: add plugin → tweak params → reorder → export → download URL works.
- Performance: export with 10 tracks + 20 plugins; load test 10 simultaneous exports.
- Browser: AudioWorklet support for WAM on Safari/Firefox; failure path is graceful.

## Definition of Ready (DoR)
- Known-good plugin subset selected and version-pinned; CSP/CORS constraints documented.
- Idempotency key strategy agreed (client-provided key contract) + concurrency limit targets set.
- R2 credentials and buckets available in staging.
- Plugin parameter throttle/quantize targets agreed (e.g., 20–30Hz).

## Definition of Done (DoD)
- Migration applied; RLS tests pass for plugins/exports.
- Plugin CRUD + reorder endpoints live with validation; state persisted; realtime sync with locks + throttled params.
- Export enqueue/status endpoints live; idempotency + concurrency limits enforced; state transitions persisted; R2 upload working.
- Telemetry emitting; Sentry capturing WAM load + export errors.
- Load tests for 10 simultaneous exports pass without runaway queue growth; plugin load failures handled gracefully in UI.
- Staging validation complete.

## Handoffs (Owners per Agent)
- **A02 (Supabase/RLS)**: Migration + RLS for plugins/exports; indexes; RLS tests.
- **A01 (Backend/API)**: Plugin CRUD/reorder endpoints; export enqueue/status with idempotency + concurrency limits; state persistence; integration tests.
- **A04 (Realtime)**: Sync plugin params; locks for edit authority; param throttling/quantization strategy; ensure seq/idempotency adherence.
- **A06 (Frontend)**: Plugin browser UI, parameter UI, reorderable chain, graceful load-failure UI; export dialog; wiring to telemetry.
- **A03 (Integrations)**: WAM loader with pinned versions; fallback behavior; R2 upload integration; CSP/CORS validation checklist.
- **A05 (AI/DSP)**: Advise on parameter mapping and load/latency impacts; prep hooks for future AI mastering (no UI yet).
- **A08 (DevOps/Observability)**: Monitor R2 success rate; Sentry for WAM/export; PostHog event verification; performance dashboards for export queue.
- **A07 (QA/Security)**: RLS + integration + E2E + load tests (exports + plugin load failure); browser matrix for AudioWorklet.
- **A00 (Orchestrator)**: Coordinate envs/keys; enforce DoR/DoD; schedule load tests.
