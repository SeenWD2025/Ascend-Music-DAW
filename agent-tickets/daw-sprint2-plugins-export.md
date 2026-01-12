# Sprint 2 Ticket — WAM Plugins & Export Pipeline

**Feature Name**: Plugins + Export
**Goal**: Enable WAM plugin loading/control, effects chain management, and reliable export pipeline (idempotent, concurrency-limited, R2 upload).
**User Roles**: Pro, Client (export consumers), Admin (abuse review)
**Status**: ✅ COMPLETE (2026-01-18)

## Sprint 2 Completion Summary

### Delivered Artifacts
| Agent | Deliverable | Status |
|-------|-------------|--------|
| A02 | `20260125000001_daw_plugins_export.sql` - Plugins/exports tables with RLS | ✅ |
| A01 | Plugin CRUD endpoints (add/update/delete/reorder) | ✅ |
| A01 | Export pipeline endpoints (enqueue/status/list/delete) with idempotency | ✅ |
| A01 | R2 service with AWS SDK for Cloudflare R2 integration | ✅ |
| A06 | Plugin browser, parameter UI, effects chain with reordering | ✅ |
| A06 | Plugin store with loading/error states | ✅ |
| A03 | WAM loader with known-good plugins catalog | ✅ |
| A03 | WAM types and registry system | ✅ |
| A04 | Plugin sync service with throttling (30Hz) and coalescing | ✅ |
| A04 | Plugin lock service with heartbeat and conflict handling | ✅ |
| A04 | Plugin realtime schemas in event envelope | ✅ |
| A07 | RLS tests: daw_plugins, daw_exports | ✅ |
| A07 | Integration tests: plugins, exports endpoints | ✅ |
| A07 | Unit tests: plugin-sync, plugin-lock services | ✅ |

### Files Created
**Migration:**
- `supabase/migrations/20260125000001_daw_plugins_export.sql`

**API:**
- `packages/api/src/schemas/daw/plugin.schema.ts`
- `packages/api/src/schemas/daw/export.schema.ts`
- `packages/api/src/services/daw/plugin.service.ts`
- `packages/api/src/services/daw/export.service.ts`
- `packages/api/src/services/daw/plugin-sync.service.ts`
- `packages/api/src/services/daw/plugin-lock.service.ts`
- `packages/api/src/services/r2/r2.service.ts`
- `packages/api/src/routes/daw/plugins.ts`
- `packages/api/src/routes/daw/exports.ts`

**Frontend:**
- `packages/daw/src/components/daw/{PluginBrowser,PluginSlot,PluginParameters,EffectsChain,PluginLoadError}.tsx`
- `packages/daw/src/stores/plugin.store.ts`
- `packages/daw/src/lib/wam/{loader,types,registry}.ts`
- `packages/daw/src/lib/realtime/plugin-sync.ts`

**Tests:**
- `tests/rls/daw_{plugins,exports}.rls.test.ts`
- `tests/integration/daw-{plugins,exports}.test.ts`
- `tests/unit/{plugin-sync,plugin-lock}.test.ts`

---

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
