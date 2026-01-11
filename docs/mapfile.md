---
path: docs
owner: product-eng
status: active
summary: Public-facing and internal documentation for AMG Music Platform. Includes DAW realtime contract, WAM compatibility matrix, Drive upload strategy, and observability specs.
last_updated: 2026-01-15
key_artifacts:
  - OAUTH_SETUP.md: Step-by-step Google OAuth configuration guide for Supabase Auth
  - DAW_REALTIME_CONTRACT_V1.md: Collaboration event envelope, ordering, idempotency rules
  - WAM_COMPATIBILITY_MATRIX.md: Browser support and plugin compatibility for Web Audio Modules
  - DRIVE_UPLOAD_STRATEGY.md: Resumable upload, retry/backoff, token refresh patterns
  - DAW_POSTHOG_TAXONOMY.md: PostHog event taxonomy for DAW features
  - DAW_SENTRY_INSTRUMENTATION.md: Sentry error capture and performance spans
  - DAW_ALERTS_DASHBOARDS.md: Monitoring alerts and SLO definitions
processes:
  - Sync with dev-guides_plans when new docs are published
dependencies:
  - ASCEND_DEV_SOURCE_OF_TRUTH.md for authoritative technical context
  - supabase/config.toml for OAuth provider settings
risks:
  - Doc drift from source-of-truth files
todo:
  - Add architecture diagrams and onboarding docs
  - Add Stripe integration setup guide
  - Add Google Drive integration setup guide
tags: [docs, auth, oauth]
---

Directory notes:
- Use this space for user guides, runbooks, and reference material.
- OAUTH_SETUP.md: Complete guide for configuring Google OAuth with Supabase Auth.