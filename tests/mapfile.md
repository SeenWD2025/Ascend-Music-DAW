---
path: tests
owner: A07 (QA/Security Specialist)
status: active
summary: Automated tests for AMG Music Platform - unit, integration, and RLS policy tests. Includes DAW project RLS and API integration tests.
last_updated: 2026-01-15
key_artifacts:
  - setup.ts (test environment setup with Supabase clients)
  - vitest.config.ts (Vitest test runner configuration)
  - SECURITY_CHECKLIST.md (security verification document)
  - helpers/ (test utilities: auth, factories, API helpers, drive helpers)
  - rls/ (RLS policy tests for all tables)
  - integration/ (API endpoint integration tests)
  - unit/ (unit tests for services and middleware)
processes:
  - Run `npm test` from tests/ directory to execute all tests
  - Run `npm run test:rls` for RLS policy tests only
  - Run `npm run test:integration` for API integration tests only
  - Run `npm run test:unit` for unit tests only
  - Run `npm run test:coverage` for coverage report
dependencies:
  - ASCEND_SPRINT_GUIDES.md acceptance criteria per feature
  - Supabase local instance or test database
  - API server running for integration tests
risks:
  - Integration tests require running API and Supabase instances
  - RLS tests require proper test user cleanup
  - Test database should be separate from development
todo:
  - Add E2E tests for critical UI flows
  - Implement rate limiting tests (once rate limiting is added)
  - Add performance/load tests for key endpoints
  - Frontend component tests
tags: [testing, qa, security, sprint-01, sprint-02]
---

## Directory Structure

```
tests/
├── setup.ts                 # Test environment setup
├── vitest.config.ts         # Vitest configuration
├── package.json             # Test dependencies
├── SECURITY_CHECKLIST.md    # Security verification checklist
│
├── helpers/                 # Test utilities
│   ├── index.ts             # Re-exports
│   ├── auth.helper.ts       # User creation, auth token helpers
│   ├── factories.ts         # Test data factories
│   ├── api.helper.ts        # API request helpers
│   └── drive.helper.ts      # Drive connection/file mock helpers (Sprint 02)
│
├── rls/                     # RLS Policy Tests
│   ├── profiles.rls.test.ts                  # profiles table policies
│   ├── service_provider_profiles.rls.test.ts # pro profiles policies
│   ├── service_seeker_profiles.rls.test.ts   # client profiles policies
│   ├── drive_connections.rls.test.ts         # drive_connections policies (Sprint 02)
│   └── drive_files.rls.test.ts               # drive_files policies (Sprint 02)
│
├── integration/             # API Integration Tests
│   ├── auth.test.ts         # GET /auth/me, POST /auth/logout
│   ├── profiles.test.ts     # GET/PUT /profiles/:id
│   ├── pros.test.ts         # POST/GET/PUT /pros
│   ├── clients.test.ts      # POST/GET/PUT /clients
│   ├── admin.test.ts        # POST /admin/seed
│   └── drive.test.ts        # Drive API endpoints (Sprint 02)
│
└── unit/                    # Unit Tests
    ├── profile.service.test.ts   # ProfileService unit tests
    ├── auth.middleware.test.ts   # Auth middleware unit tests
    ├── drive.service.test.ts     # DriveService unit tests (Sprint 02)
    └── token-manager.test.ts     # Token manager unit tests (Sprint 02)
```

## Coverage Targets

| Category | Target | Current |
|----------|--------|---------|
| RLS Policies | 90% | ~88% |
| API Endpoints | 80% | ~78% |
| Services | 70% | ~68% |
| Middleware | 70% | ~65% |

## Running Tests

```bash
# Install dependencies
cd tests && npm install

# Run all tests
npm test

# Run with UI
npm run test:ui

# Run specific test type
npm run test:rls
npm run test:integration
npm run test:unit

# Run with coverage
npm run test:coverage
```

## Environment Requirements

Tests require these environment variables (in `.env.test` or `.env`):

- `SUPABASE_URL` - Supabase instance URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (for admin operations)
- `SUPABASE_ANON_KEY` - Anon key (for RLS tests)
- `API_URL` - API server URL (default: http://localhost:3001)
- `ADMIN_SEED_SECRET` - Secret for admin seed tests

## Sprint 01 Test Coverage

### Auth + Profiles Tests Created:
- ✅ RLS: profiles table (10 tests)
- ✅ RLS: service_provider_profiles (8 tests)
- ✅ RLS: service_seeker_profiles (10 tests)
- ✅ API: auth endpoints (6 tests)
- ✅ API: profiles endpoints (12 tests)
- ✅ API: pros endpoints (10 tests)
- ✅ API: clients endpoints (12 tests)
- ✅ API: admin endpoints (8 tests)
- ✅ Unit: profile service (10 tests)
- ✅ Unit: auth middleware (12 tests)