# Sprint 1 Ticket — Core DAW (Tracks/Clips/Mixer + Realtime Collab)

**Feature Name**: Core DAW Editing & Realtime Collaboration
**Goal**: Deliver multi-track timeline editing with clip CRUD, mixer controls, and reliable realtime sync (locks + version checks) across collaborators.
**User Roles**: Pro, Client, Admin (abuse review)

## Acceptance Criteria
- Multiple tracks per project; clips can be added, moved, deleted, and rendered with waveforms.
- Mixer controls (volume/pan/mute/solo) work per track.
- Google Drive upload from DAW + picker import; cached fetches prevent repeated Drive calls on scrub.
- Realtime collaboration: locks + optimistic version checks prevent silent conflicts; deterministic outcomes for simultaneous edits.
- Event fanout coalesces high-frequency `clip.move` bursts; message rate stays within defined budgets in 60s stress run.
- Presence/cursor/playhead sync works across two clients.
- Telemetry fires for track.created, clip.added, project.played; Sentry captures audio buffer errors.
- Staging deploy validated with 2-collaborator smoke test.

## Out of Scope
- Plugins, export, AI mastering, automation curves, MIDI.

## UX Surfaces
- Multi-track timeline; waveform visualization; clip drag/drop with snap; mixer panel; keyboard shortcuts (space, R, etc.).

## API Contract
- `POST /api/v1/daw/projects/:id/tracks`
- `GET/PUT/DELETE /api/v1/daw/projects/:id/tracks/:trackId`
- `POST/PUT/DELETE /api/v1/daw/projects/:id/clips/:clipId`
- WS: clip events (`clip.add`, `clip.move`, `clip.delete`, `transport.play`, `presence.update`) with enforced envelope.

## Supabase Work
- Migration `20260118000001_daw_tracks_clips.sql` (tracks, clips, triggers to bump project.updated_at).
- RLS: collaborators can edit clips; indexes for timeline queries.

## Integrations
- Drive upload from DAW; Drive picker for import; caching strategy for scrub/play; optional format conversion research.

## Telemetry
- PostHog: `track.created`, `clip.added`, `project.played`, `clip.moved` (throttled), `mixer.adjusted`.
- Sentry: audio buffer loading failures; realtime conflict rejects.

## QA Checklist
- Unit: clip positioning math; locking/version-check utilities.
- Integration: track/clip endpoints; RLS positive/negative.
- E2E: create project → add track → upload/import clip → drag on timeline → play.
- Realtime: two-client conflict test (simultaneous move) → deterministic result; idempotent replay on reconnect.
- Performance: timeline rendering with 20+ clips; message-rate budget not exceeded in 60s drag stress.
- Browser: Chrome/Firefox/Safari/Edge.

## Definition of Ready (DoR)
- Realtime envelope v1 locked (from Sprint 0); budgets defined for message rate/payload size.
- Drive caching approach agreed (cache duration, invalidation on clip update).
- Schema migration reviewed; RLS policy text agreed.
- UI interaction specs for drag/snap/mixer approved; keyboard shortcuts defined.
- Env/secrets available in staging for Drive and PostHog/Sentry.

## Definition of Done (DoD)
- Migration applied; RLS tests pass for tracks/clips.
- Track/clip endpoints implemented with validation + integration tests.
- Frontend timeline renders waveforms; drag/drop with snap; mixer controls working.
- Realtime locks + version checks enforced server-side; seq/idempotency validated; backpressure (rate limit + coalescing) in place.
- Presence/cursor/playhead sync functional between two clients.
- Drive upload/import works; cached fetch prevents repeated calls during scrub; Drive stress test passes.
- Telemetry emitting; Sentry capturing buffer/realtime errors.
- Staging smoke test with 2 collaborators passes.

## Handoffs (Owners per Agent)
- **A02 (Supabase/RLS)**: Migration + RLS for tracks/clips; trigger for updated_at; indexes; RLS tests.
- **A01 (Backend/API)**: Track/clip CRUD; server-side sequencing/locking/version checks; backpressure + coalescing; validation schemas; integration tests.
- **A04 (Realtime)**: Presence/cursor/playhead sync; lock/heartbeat handling; deterministic conflict handling; stress test scripts for message-rate budget.
- **A06 (Frontend)**: Timeline UI, waveform rendering, drag/snap, mixer panel, keyboard shortcuts; error UI for conflict rejects; integration with telemetry.
- **A03 (Integrations)**: Drive upload & picker; caching layer for clip fetch; optional format conversion spike.
- **A08 (DevOps/Observability)**: Telemetry wiring, Sentry contexts for realtime failures, performance monitoring for audio latency.
- **A07 (QA/Security)**: RLS tests; two-client conflict scenarios; message-rate stress; browser matrix; Drive fetch stress.
- **A05 (AI/DSP)**: Consult on waveform rendering performance and latency implications (no build scope yet).
- **A00 (Orchestrator)**: Coordinate env access; enforce DoR/DoD gates; schedule staging two-client tests.
