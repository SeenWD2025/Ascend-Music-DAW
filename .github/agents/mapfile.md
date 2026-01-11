---
path: .github/agents
owner: platform-eng
status: active
summary: Agent prompt roster for parallel development workflows.
last_updated: 2026-01-10
key_artifacts:
  - README.md (usage guide for agent roster)
  - A00-ascend-orchestrator.agent.md (routing and scope enforcement)
  - A01-backend-fastify.agent.md through A08-devops-observability.agent.md (specialist agents)
  - A09-product-sprint-writer.agent.md (ticketization and AC/DoR/DoD)
processes:
  - Use A09 to produce tickets; A00 to route; A01-A08 to execute in parallel
dependencies:
  - ASCEND_DEV_SOURCE_OF_TRUTH.md and ASCEND_SPRINT_GUIDES.md for canonical scope
risks:
  - Keep agent prompts in sync with decisions and sprint guides
todo:
  - Add agent-run instructions if new tools are introduced
tags: [agents, automation]
---

Directory notes:
- This folder defines the multi-agent team prompts; update when scope or tooling changes.
