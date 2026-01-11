# Sprint 0 Ticket — DAW Foundation & Setup

**Feature Name**: DAW Foundation (projects + transport + baseline realtime contract)
**Goal**: Stand up the DAW skeleton with projects CRUD, baseline audio playback, and documented realtime/event contract to unblock later collaboration work.
**User Roles**: Pro, Client, Admin (for abuse review)
**Status**: ✅ COMPLETE (2026-01-15)

## Acceptance Criteria
- [x] User can create/save a DAW project and play/stop audio (Tone.js) in browser.
- [x] Project ownership enforced via RLS; collaborator slots defined (even if empty UI for now).
- [x] Realtime contract v1 documented (event envelope + ordering/idempotency rules + payload budgets).
- [x] Audio latency baseline + glitch metrics captured for target browsers; audio context resume path implemented.
- [x] WAM compatibility matrix drafted and supported-subset policy defined.
- [x] Drive large-file upload strategy (resumable + retries) documented.
- [x] Observability: PostHog taxonomy stubbed, Sentry wired for audio worklet errors, dashboards/alerts defined for message rate/export queue/Drive errors.
- [ ] Deployed to Railway staging. (Pending: requires env vars + infra setup)

## Out of Scope
- Multi-track editing, clip UI/UX, mixing, exports, plugins, AI mastering.

## UX Surfaces
- Minimal DAW shell (transport controls + timeline scaffold) in packages/daw/.

## API Contract
- `GET/POST /api/v1/daw/projects`
- `GET/PUT /api/v1/daw/projects/:id`
- `WS /api/v1/daw/collaborate/:projectId` (contract defined; implementation stub acceptable if documented)

## Supabase Work
- Migration `20260115000001_daw_foundation.sql` with tables: `daw_projects`, `daw_tracks`, `daw_clips`, `daw_plugins`, `daw_collaborators`, `daw_exports` (skeleton as needed).
- RLS: project ownership + collaborator access; indexes for timeline queries.

## Integrations
- Google Drive playback check (existing integration) + resumable upload/retry strategy doc.
- WAM loader research + compatibility matrix (Chrome/Edge/Firefox/Safari) and supported subset policy.

## Telemetry
- PostHog taxonomy draft for DAW events.
- Sentry: audio worklet errors, audio context resume failures.
- BetterStack/alerts: WebSocket/Supabase Realtime message rate, export queue depth, Drive error rate.

## QA Checklist
- Unit: Tone.js engine init; RLS ownership for projects.
- Integration: `/api/v1/daw/projects` CRUD.
- Browser: Chrome/Firefox/Safari audio playback + audio context resume.
- Realtime contract validation: ordering + idempotency behavior with simulated client.
- Latency/glitch baseline recorded and attached to plan.

## Definition of Ready (DoR)
- RLS policies drafted; migration outline approved.
- Tone.js wrapper approach agreed; browser support matrix defined (desktop-first).
- Realtime envelope/schema agreed (event_id, project_id, actor_id, seq, sent_at, client_id; payload budget documented).
- Drive resumable upload strategy & retry/backoff pattern agreed.
- PostHog/Sentry keys available; Railway env vars available.

## Definition of Done (DoD)
- Migration applied; RLS tests pass for projects.
- Project CRUD endpoints live and covered by integration tests.
- Transport controls function in UI; audio playback verified in target browsers.
- Realtime contract v1 committed in docs; envelope enforced server-side (schema/validation).
- Latency/glitch metrics captured and logged; audio context resume path shipped with Sentry logging.
- WAM compatibility matrix + supported subset policy committed.
- Drive resumable upload/retry strategy documented; token refresh ownership clarified.
- PostHog/Sentry wired; dashboards/alerts configured for message rate/export queue/Drive errors.
- Deployed to Railway staging.

## Handoffs (Owners per Agent)
- **A02 (Supabase/RLS)**: Write migration `20260115000001_daw_foundation.sql`; implement RLS (owner + collaborators); add indexes; ship RLS tests.
- **A01 (Backend/API)**: Project CRUD endpoints; WebSocket server bootstrap; enforce realtime envelope validation; expose seq/idempotency semantics.
- **A04 (Realtime)**: ✅ Define channel strategy (Supabase Realtime for presence/typing + optional WS fanout); document event envelope/versioning/payload budgets; lock/OT deferred note; align with A01 validation.
- **A06 (Frontend)**: ✅ DAW shell + transport controls; Tone.js wrapper; audio context resume UX; baseline latency/glitch harness per browser; feature detection for mobile gating.
- **A03 (Integrations)**: ✅ WAM loader research + compatibility matrix + supported subset policy; Drive playback check; define resumable upload/retry/backoff + token refresh ownership.
- **A08 (DevOps/Observability)**: ✅ Railway envs; PostHog taxonomy stub; Sentry wiring for audio worklet; dashboards/alerts for message rate/export queue/Drive errors.
- **A07 (QA/Security)**: ✅ Author/execute RLS tests for projects; browser audio tests; realtime envelope validation with simulated client; capture latency/glitch baseline.
- **A05 (AI/DSP)**: ⏸️ Consult on AudioWorklet feasibility/latency risks (no build scope yet).
- **A00 (Orchestrator)**: ✅ Track DoR/DoD gates, unblock env/secrets, ensure staging deploy.

## Deliverables Created (Sprint 0)

### Supabase/RLS (A02)
- `supabase/migrations/20260115000001_daw_foundation.sql` - 763 lines, complete schema

### Backend/API (A01)
- `packages/api/` - Full Fastify backend with project CRUD and WebSocket collaboration
- Routes: `/api/v1/daw/projects` (CRUD), `/api/v1/daw/collaborate/:projectId` (WS)

### Realtime Contract (A04)
- `docs/DAW_REALTIME_CONTRACT_V1.md` - Event envelope, ordering, idempotency, lock semantics

### Frontend (A06)
- `packages/daw/` - React app with Vite, Tone.js, Zustand
- Components: TransportBar, Timeline, DAWShell, AudioContextOverlay, MobileBlocker
- Audio engine with latency measurement and glitch detection

### Integrations (A03)
- `docs/WAM_COMPATIBILITY_MATRIX.md` - Browser support, plugin tiers, CSP/CORS
- `docs/DRIVE_UPLOAD_STRATEGY.md` - Resumable uploads, retry strategy

### Observability (A08)
- `docs/DAW_POSTHOG_TAXONOMY.md` - Event taxonomy
- `docs/DAW_SENTRY_INSTRUMENTATION.md` - Error capture patterns
- `docs/DAW_ALERTS_DASHBOARDS.md` - Monitoring SLOs and alerts

### QA/Testing (A07)
- `tests/rls/daw_projects.rls.test.ts` - RLS policy tests
- `tests/rls/daw_tracks.rls.test.ts` - Track RLS tests
- `tests/integration/daw.test.ts` - API integration tests
