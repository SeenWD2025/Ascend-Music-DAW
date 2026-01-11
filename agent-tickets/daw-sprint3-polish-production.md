# Sprint 3 Ticket — Polish & Production Readiness

**Feature Name**: DAW Beta Readiness (Onboarding, Templates, Hardening)
**Goal**: Deliver beta-ready DAW with onboarding, templates/settings, production-grade realtime/exports, full observability, and security hardening.
**User Roles**: Pro, Client, Admin/Label Staff

## Acceptance Criteria
- Onboarding flow (welcome → first project → tutorial) shipped; help docs linked.
- Project templates gallery available; user settings (shortcuts/audio I/O/theme) persist.
- Export endpoints rate-limited; health checks live for uptime monitoring.
- Realtime hardened: connection limits (per user/project), authenticated join/leave, reconnection resilience, offline detection, conflict resolution UI.
- Scale plan documented: thresholds for Supabase Realtime vs WS gateway; soak test at 50 concurrent users/project passes; reconnect storm handled.
- RLS audit completed for all DAW tables; negative-case tests pass; penetration checklist executed.
- Mobile degradation: supported/unsupported features explicit; no broken paths.
- Observability: PostHog dashboards; Sentry alerts; BetterStack uptime checks; backup strategy in place.
- Production staging sign-off (beta-ready) achieved.

## Out of Scope
- MIDI, automation curves, stem export, advanced AI mixing.

## UX Surfaces
- Onboarding/tour; templates gallery; settings panel; help overlay; performance optimizations (timeline virtual scrolling where needed).

## API Contract
- `GET/POST/PUT /api/v1/daw/project-templates`
- `GET/PUT /api/v1/daw/user-settings`
- `GET /health` (uptime)
- Rate-limited export endpoints (existing) with 429 behavior defined.

## Supabase Work
- Migration `20260201000001_daw_templates_settings.sql`: `daw_project_templates`, `user_daw_settings`; ensure RLS + indexes.

## Integrations
- WAM: add 5 more plugins (total 10) validated; Drive large-file upload (>100MB) tested; export format options (16/24-bit WAV, MP3 320kbps).

## Telemetry
- PostHog dashboards for DAW metrics; events for onboarding completion, template selection, settings save, reconnect attempts, offline detection.
- Sentry alert rules for high error rate (realtime/export) and WAM failures.
- BetterStack uptime checks for DAW endpoints (health, export, realtime gateway if applicable).

## QA Checklist
- Full regression (unit + integration + E2E) across DAW flows.
- RLS penetration tests on all DAW tables (negative cases).
- Load: 50 concurrent users in same project (soak + reconnect storm); message-rate/latency within thresholds.
- Browser matrix: Chrome/Firefox/Safari/Edge; mobile audit with graceful degradation.
- Accessibility: keyboard navigation + screen reader basics for onboarding/settings.

## Definition of Ready (DoR)
- Templates/settings schema reviewed; rate-limit policy defined (limits + 429 contract).
- Scale thresholds for choosing Supabase Realtime vs WS gateway documented.
- Alerting requirements agreed (PostHog dashboards, Sentry rules, BetterStack checks).
- Staging envs ready with WAM set (10 plugins) and Drive/R2 creds.

## Definition of Done (DoD)
- Migration applied; RLS tests pass for templates/settings.
- Onboarding, templates, settings UI live and persisted; help overlay available.
- Export endpoints rate-limited; health check live; connection limits enforced; auth’d join/leave for realtime.
- Realtime resilience: auto-reconnect, offline detection, conflict resolution UI; soak/reconnect storm tests pass at 50 users/project.
- RLS audit complete with negative-case tests; penetration checklist closed.
- Observability: PostHog dashboards populated; Sentry alerts configured; BetterStack uptime/backup strategy in place.
- Mobile degradation messaging in place; no broken flows on mobile browsers.
- Production staging sign-off achieved.

## Handoffs (Owners per Agent)
- **A02 (Supabase/RLS)**: Migration + RLS for templates/settings; full DAW RLS audit; negative-case tests.
- **A01 (Backend/API)**: Templates/settings endpoints; rate limiting for exports; health check; connection limits + auth’d join/leave semantics.
- **A04 (Realtime)**: Reconnect resilience, offline detection, conflict resolution UI signals; soak/reconnect storm testing; scale plan doc + thresholds.
- **A06 (Frontend)**: Onboarding flow, templates gallery, settings panel, help overlay, performance optimizations (virtual scrolling); mobile degradation messaging.
- **A03 (Integrations)**: Add 5 more WAM plugins (total 10); Drive large-file (>100MB) test; export format options (16/24-bit WAV, MP3 320kbps).
- **A05 (AI/DSP)**: Review audio performance under load; advise on export quality options; ensure plugin set remains performant.
- **A08 (DevOps/Observability)**: PostHog dashboards; Sentry alert rules; BetterStack uptime checks; backup strategy; staging/prod readiness checklist; auto-scaling config on Railway.
- **A07 (QA/Security)**: Regression suite; RLS penetration; load/soak tests; browser + accessibility audits; mobile audit.
- **A00 (Orchestrator)**: Enforce DoR/DoD; schedule beta sign-off; coordinate alerting/backups with stakeholders.
