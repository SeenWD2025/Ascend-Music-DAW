---
path: dev-guides_plans
owner: product-eng
status: active
summary: Core business and developer source of truth documents plus sprint plans.
last_updated: 2026-01-11
key_artifacts:
	- ASCEND_DEV_SOURCE_OF_TRUTH.md (stack, architecture, V1 scope, locked decisions)
	- ASCEND_SPRINT_GUIDES.md (twelve-sprint breakdown for V1 vertical slices)
	- ASCEND_DAW_SPRINT_PLAN.md (DAW sprint plan + risk-mitigation workstreams)
	- ASCEND_UI_DESIGN_SYSTEM.md (UI/UX principles, tokens, and layout guides)
	- AscendMG-Pitch-Plan.md (pitch/plan deck content)
	- Ascend MG Shareable.md (external-friendly narrative)
	- ascend_business_outline.md (legacy outline)
	- ascend_developer_guide.md (legacy dev notes)
processes:
	- Sprint-per-feature loop: plan -> build -> test -> QA -> deploy
dependencies:
	- Supabase Auth-only; Drive private-by-default submissions; Fastify TypeScript backend
risks:
	- Keep business and dev SSoT aligned with shipped architecture and data model changes
todo:
	- Add links to migration directories once schema lands
tags: [docs, planning, sprints]
---

Directory notes:
- Canonical references for engineering and product decisions live here.
- Sprint guides should remain the handoff source for A09 ticketization.