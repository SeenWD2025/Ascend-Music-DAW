# packages/shared - Mapfile

## Overview
- **path**: `packages/shared/`
- **owner**: A01-Backend, A06-Frontend
- **status**: active
- **summary**: Shared TypeScript types, interfaces, and utility functions used by both the API and web applications.
- **last_updated**: 2026-01-10

## Key Artifacts
| File | Purpose |
|------|---------|
| `src/index.ts` | Main export file |
| `src/types/index.ts` | Shared type definitions (UserRole, Profile, ApiResponse, etc.) |
| `src/utils/index.ts` | Utility functions (formatDate, slugify, truncate, etc.) |
| `package.json` | Package configuration |
| `tsconfig.json` | TypeScript configuration |

## Processes
1. **Build**: `npm run build` - compiles to dist/ with type declarations
2. **Typecheck**: `npm run typecheck` - validates types without emitting

## Dependencies
- **Dev**: typescript

## Risks
- Changes to shared types require rebuilding dependent packages
- Breaking changes must be coordinated across API and web

## TODO
- [ ] Add Zod schemas for shared validation
- [ ] Add more type definitions as features are built
- [ ] Add comprehensive utility tests

## Tags
`shared` `types` `utilities` `typescript`
