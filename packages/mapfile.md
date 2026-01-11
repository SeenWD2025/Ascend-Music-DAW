# packages - Mapfile

## Overview
- **path**: `packages/`
- **owner**: A00-Orchestrator
- **status**: active
- **summary**: Contains shared packages, backend API, and DAW frontend used by applications in the monorepo.
- **last_updated**: 2026-01-15

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `api/` | Fastify backend API with REST endpoints and WebSocket collaboration |
| `daw/` | React DAW frontend with Tone.js audio engine and transport controls |
| `shared/` | Shared types and utilities for API and web |

## Key Artifacts
- `api/src/index.ts` - Main Fastify application bootstrap
- `api/src/routes/daw/` - DAW REST and WebSocket routes
- `api/src/services/daw/` - Project and realtime collaboration services
- `daw/src/lib/audio/engine.ts` - Tone.js audio engine wrapper
- `daw/src/components/daw/` - DAW UI components (TransportBar, Timeline, DAWShell)
- `shared/src/types/` - Shared TypeScript interfaces

## Tags
`packages` `monorepo` `shared` `api` `fastify` `daw` `tone.js`
