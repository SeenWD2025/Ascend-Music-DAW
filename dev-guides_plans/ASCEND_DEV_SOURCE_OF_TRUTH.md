# Ascend Music Group
## Developer Source of Truth

**Division:** Noble Growth Collective  
**Product:** Hybrid Record Label + Music Platform  
**Version:** 2.0  
**Last Updated:** January 10, 2026  

---

## 0. Purpose

This document is the single source of truth for building Ascend Music Group (AMG): a mobile-first web platform with label operations tooling. It consolidates prior dev guides and updates the stack and operational assumptions.

---

## 1. Product Intent (Non-Negotiables)

- **Human-first creation**: real artists, real identity, authenticity signaling.
- **AI as an opt-in creative partner**: tools assist; humans remain authors.
- **Collaboration-driven**: producers, vocalists, engineers, managers can connect and build.
- **Ownership & transparency**: credits, splits, payouts, and reporting are explicit.
- **Label + Platform**: AMG supports both signed artists (label ops) and independent artists (platform).

---

## 2. Current Stack (2026)

### Frontend
- **React (Vite)**
- **TailwindCSS**
- **ShadCN UI**

### Backend
- **Node.js (TypeScript)** with **Fastify** (primary API)
- **Worker service** for long-running jobs (AI, large file operations)
- **REST API** under `/api/v1` (optionally add WebSocket gateway later)

### Database + Auth
- **Supabase Postgres** (primary database)
- **Supabase Auth** (email/password + OAuth providers)
- **Row Level Security (RLS)** as the default authorization boundary

### Payments / Billing
- **Stripe** (donations, checkout, subscriptions)
- Webhooks processed by backend; persisted status mirrored into Supabase

### File Uploads / Storage
- **Google Drive** for user uploads
- **Google OAuth** for Drive access (scopes + refresh tokens)
- **Default privacy model**: files are private to the user unless explicitly submitted/shared for collaboration delivery or platform streaming

### Observability / Monitoring
- **PostHog** (product analytics)
- **Sentry** (frontend + backend errors, performance)
- **BetterStack** (uptime/alerts + log/incident workflow as configured)

### Deployment
- **Railway** (deployments for web/API/workers as applicable)

### AI Integrations
- **OpenAI**
- **Perplexity**
- **Gemini**

---

## 3. System Overview

### High-Level Components
- **Web App** (public site + authenticated dashboards)
- **API** (business logic, integrations, webhooks)
- **Realtime** (Supabase Realtime for presence/typing/updates where appropriate)
- **Supabase** (DB, auth, RLS policies, triggers)
- **AI Gateway** (logical module/service that brokers AI providers)
- **Google Drive Integration** (OAuth + file operations)
- **Stripe Integration** (payments/subscriptions + webhook handling)
- **Stripe Connect** (marketplace payouts to Music Pros with AMG fee)
- **DMTV Integration** (API/webhooks for cross-network sync)
- **Observability** (PostHog + Sentry + BetterStack)

### User Types
- **Public**: browse artists/content.
- **Platform Artists (Independent)**: manage profile, uploads, collabs, monetization.
- **Label Artists (Signed)**: platform artist capabilities + label dashboards (budgets, campaigns, contract artifacts).
- **Collaborators**: create/respond to collab posts.
- **Admins/Moderators**: submissions queue, content moderation, featured artists, system tools.
- **Label Staff (A&R/Marketing/Ops)**: artist development workflows, release planning, budgets.

---

## 4. Data Model (Supabase)

Use Supabase migrations for schema. Prefer UUID PKs, `created_at/updated_at`, and RLS policies on every table.

### Core Tables (Minimum)
- `profiles` (1:1 with `auth.users`)
- `artists`
- `service_provider_profiles` (Music Pros)
- `service_seeker_profiles` (Creators/clients)
- `projects` (tracks, albums, videos)
- `project_assets` (cover art, stems, video, etc.)
- `project_workspaces` (pro/client shared context)
- `project_tasks` (progress tracking)
- `submissions` (artist/collaborator onboarding)
- `collab_posts` + `collab_applications`
- `chat_rooms` + `chat_members` + `chat_messages`
- `contacts` (user-saved contacts)
- `events`
- `playlists` + `playlist_items`
- `featured_playlists`
- `radio_schedule` (AMG Streaming Radio programming)
- `blog_posts`
- `merch_items`

### Monetization / Billing
- `donations` (Stripe payment intent references)
- `subscriptions` (Stripe customer/subscription refs; current state)
- `stripe_connect_accounts` (Music Pros)
- `service_orders` (client-to-pro orders)
- `payouts` (platform ledger; Stripe remains source of truth)

### Label Ops (Signed Artists)
- `label_artists` (contract window, status, owner splits)
- `label_releases` (release calendar, budgets, campaign refs)
- `label_expenses` (optional; budget tracking)

### Google Drive
- `drive_connections` (per-user OAuth linkage metadata)
- `drive_files` (file IDs, ownership, mime, size, purpose, access model)

### Integrations
- `dmtv_sync` (outbound/inbound sync state)
- `zoom_profiles` (optional: stored personal meeting URLs)
- `calendar_connections` (Google Calendar) and/or `calendly_connections` (if used)

---

## 5. AuthN/AuthZ (Supabase Auth + RLS)

### Authentication
- Use **Supabase Auth** as the only identity system.
- Enable **Google OAuth** for sign-in.
- Separately connect **Google Drive** scopes (consent flow) to the signed-in Supabase user.

### Authorization
- RLS is the default guardrail.
- Roles:
  - `public`, `artist`, `label_artist`, `moderator`, `admin`, `label_staff`
- Prefer:
  - RLS policies for row ownership (`user_id = auth.uid()`)
  - join tables for staff access (e.g., `label_staff_assignments` if needed)

### Google/Drive OAuth Notes
- Request minimal scopes required for upload + read.
- Store refresh tokens securely (never ship to client). Backend owns token exchange and Drive API calls.
- File visibility rules:
  - private by default
  - sharing/streaming requires an explicit state change (e.g., submitted to a Pro workspace, shared to a chat room, or published to radio/playlist)

---

## 6. API Design (REST, `/api/v1`)

The API is responsible for:
- business rules that shouldn’t live in the client
- Stripe webhook verification and persistence
- Drive OAuth/token exchange + Drive file operations
- AI provider calls and policy enforcement

### Suggested Endpoint Groups
- `GET/POST /artists`, `GET/PUT /artists/:id`
- `GET/POST /pros`, `GET/PUT /pros/:id` (service provider profiles)
- `GET/POST /clients`, `GET/PUT /clients/:id` (service seeker profiles)
- `GET/POST /projects`, `GET/PUT /projects/:id`
- `GET/POST /workspaces`, `GET/PUT /workspaces/:id` (pro/client projects)
- `GET/POST /workspaces/:id/tasks`
- `POST /submissions`, `GET/PUT /submissions/:id` (admin)
- `GET/POST /collab`, `POST /collab/:id/apply`
- `GET/POST /chats`, `POST /chats/:id/messages`
- `GET/POST /contacts`
- `GET/POST /events`
- `GET/POST /playlists`, `GET/PUT /playlists/:id`, `POST /playlists/:id/items`
- `GET/POST /radio/now`, `GET/POST /radio/schedule` (admin)
- `GET/POST /blog`
- `POST /stripe/checkout`, `POST /stripe/webhook`, `GET /stripe/portal`
- `POST /stripe/connect/onboard`, `GET /stripe/connect/status`
- `POST /orders`, `GET /orders/:id` (client-to-pro payments)
- `GET/POST /drive/connect`, `POST /drive/upload`, `GET /drive/files`
- `POST /drive/submit` (submit file for a workspace/chat/streaming)
- `POST /dmtv/webhook`, `POST /dmtv/publish`
- `POST /calendar/connect`, `GET/POST /calendar/availability`
- `POST /ai/:provider` (via gateway) or `POST /ai` (brokered)

---

## 7. Key Feature Modules (Implementation Notes)

## 7.0 Delivery Process (Agile)

AMG uses an agile, sprint-per-feature loop:

1. **Plan**: define acceptance criteria, data model, API surface, and telemetry.
2. **Build**: implement vertical slice (UI + API + DB/RLS + integrations).
3. **Test**: unit/integration + critical-path E2E.
4. **QA**: role-based UX review (artist/pro/client/admin) + regression.
5. **Debug**: fix defects, tighten observability.
6. **Deploy**: ship to staging then prod via Railway.
7. **Repeat**: next feature.

### Artist Profiles & Portfolios
- Public profile page + dashboard editing.
- Verification badge support (human-verified).

### Upload Manager
- Uploads go to **Google Drive**.
- Persist file metadata to Supabase (`drive_files`) and associate with `projects/project_assets`.
- Default is private-to-owner; sharing happens via explicit submission:
  - **pro/client workspace delivery** (large file transfers)
  - **collab chat** (sharing with room members)
  - **streaming/radio/playlist publishing**

### Collaboration Board + Submissions
- Role-driven submissions (artist/producer/engineer/manager).
- Admin/mod queue with statuses and internal notes.

### Streaming / “Now Playing”
- Serve stream metadata and current artist context.
- Admin tools to set featured/spotlight state.

### Monetization Hub
- Stripe donation flows per artist.
- Subscription tiers (e.g., radio access and ungated features) via Stripe Billing.
- Marketplace payments for Music Pros via **Stripe Connect** with **AMG 8% fee**.

### AI Mastering (Paid)
- Separate processing service or worker-friendly module.
- Queue-based processing; store job status and outputs.
- Stripe gates access to paid processing; preview allowed per policy.

### AI Agent (Core)

AI scope includes:
- **Talent management** (artist development workflows, reminders, next-steps)
- **Label A&R / scout** (submission triage, similarity/fit analysis, research)
- **Music production assistance** (opt-in suggestions)
- **Mixing + mastering tools** (job-based processing)
- **Customer support** (knowledgebase + ticket assist)

Implementation notes:
- Route all LLM calls through an **AI Gateway** that supports OpenAI/Perplexity/Gemini.
- Enforce policy: opt-in, attribution, logging (no secrets), and auditability.

### Label Operations
- Label staff dashboards: artist roster, release calendar, budgets, campaign checklist.
- Signed artist views: release planning, assets readiness, reporting.

---

## 7.1 V1 Core Feature Set (Must-Have)

- **Professional Service Provider Profile (Music Pros)**: services, rates, portfolio, availability, intake.
- **Music Creator / Service Seeker Profile (Clients)**: needs, projects, preferences, budgets.
- **Admin (SU) / Dev Profile**: moderation, feature flags, radio programming, DMTV sync tools, system controls.
- **Record Label Profile**: can be combined with admin/label-staff tooling.
- **AI Agent**: talent management, A&R scout, support.
- **AI music tools**: production assist + mixing + mastering (job/queue based).
- **Featured (Spotlight) Playlists**: editorial curation, pinned discovery surfaces.
- **AMG Streaming Radio**: scheduled programming + “Now Playing”.
- **User-created Streaming Playlists**: create/share/save.
- **Large file transfers (Musician ↔ Pro)**: workspace-based sharing with Drive-backed assets.
- **Chat**: rooms + active collab chats + group chats + contacts.
- **Payments for Music Pros**: Stripe Connect + AMG 8% fee + order/payment history.
- **Subscriptions**: radio + ungated features.
- **DMTV integration**: sync videos/radio via API/webhook.
- **Scheduling**: Google Calendar and/or Calendly integration for availability, tours, bookings.
- **Project management dashboard (Pros)**: milestones, tasks, deliverables, client updates.
- **Client progress tracking**: progress view + convenient file portal for mixes/alt versions.
- **Zoom integration**: store/use user’s personal Zoom URL for sessions.
- **NGC venture links**: pages linking out, including **Artist Store** merchandising surface.

---

## 8. Observability

### PostHog (Product Analytics)
- Track critical events (signup, profile completion, upload started/completed, collab created/applied, donation, subscription started/canceled, mastering preview, mastering purchase).

### Sentry (Errors + Performance)
- Frontend + API tracing, release tagging, environment tagging.
- Capture Stripe/Drive/AI integration failures with context (no secrets).

### BetterStack (Monitoring)
- Uptime checks for web + API.
- Alert routing for incidents.
- Log aggregation/alerts if configured.

---

## 9. Deployment (Railway)

### Environments
- `dev` (local + Supabase dev project)
- `staging` (Railway + Supabase staging project)
- `prod` (Railway + Supabase prod project)

### Configuration
- All secrets via Railway environment variables.
- CI/CD should run lint/test and then deploy.

### Migrations
- Use Supabase migrations (via Supabase CLI).
- Never apply ad-hoc production SQL changes outside migrations.

---

## 10. Repo Structure (Recommended)

Keep it simple and aligned with prior guides:

```
frontend/
  components/
  pages/
  styles/
  utils/
backend/
  routes/
  controllers/
  services/
  middlewares/
  integrations/
    supabase/
    stripe/
    google-drive/
    ai/
  workers/
  utils/
docs/
  (architecture + runbooks)
.env.example
```

---

## 11. Security Baselines

- HTTPS everywhere (Railway provides TLS).
- Strict input validation on API.
- Stripe webhook signature verification.
- No OAuth refresh tokens on the client.
- Supabase RLS enabled; policies reviewed per table.
- Rate limiting on auth-sensitive endpoints.

---

## 12. Testing Strategy

- **Frontend**: component/unit tests + key flow integration tests.
- **Backend**: unit tests for services + integration tests for API routes.
- **E2E**: critical paths (signup/login, upload, collab, donation, subscription).

---

## 13. Milestones (Condensed)

### Phase 1
- Profiles + public directory
- Upload manager (Google Drive)
- Submissions portal + admin queue
- Now Playing + featured artists

### Phase 2
- Collaboration board + notifications
- Stripe donations + subscriptions
- Blog + basic CMS
- Admin dashboard expansion

### Phase 3
- Events + livestream page
- Artist dashboards + analytics (PostHog)
- Promo kit tool

### Phase 4
- Ownership tools (optional Web3)
- Advanced label ops tooling
- Advanced AI features (opt-in)

---

## 14. Decisions Locked (V1)

1. **Backend**: Node.js (TypeScript) with Fastify + a worker service for long-running jobs.
2. **File uploads**: private-to-user by default; explicit submission enables collaboration delivery and/or streaming/sharing.
3. **Identity**: Supabase Auth is the only identity system; Google OAuth is used for sign-in and Drive scopes.
4. **AI scope**: talent management, label A&R/scout, mixing, mastering, and customer support.
