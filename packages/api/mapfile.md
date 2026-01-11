# packages/api/ – DAW Backend API

> Fastify + TypeScript backend for Ascend DAW with REST endpoints and WebSocket collaboration.

## Structure

```
packages/api/
├── package.json              # Package config with Fastify, Supabase, Zod dependencies
├── tsconfig.json             # TypeScript configuration
└── src/
    ├── index.ts              # Main Fastify app bootstrap
    ├── middleware/
    │   ├── index.ts          # Middleware exports
    │   └── auth.middleware.ts # Supabase JWT verification
    ├── routes/
    │   ├── index.ts          # Routes exports
    │   └── daw/
    │       ├── index.ts      # DAW route registration
    │       ├── projects.ts   # Project CRUD endpoints
    │       └── collaborate.ts # WebSocket collaboration
    ├── schemas/
    │   ├── index.ts          # Schema exports
    │   └── daw/
    │       ├── index.ts      # DAW schema exports
    │       ├── project.schema.ts   # Project Zod schemas
    │       └── realtime.schema.ts  # Realtime event schemas
    └── services/
        ├── index.ts          # Service exports
        └── daw/
            ├── index.ts      # DAW service exports
            ├── project.service.ts  # Project business logic
            └── realtime.service.ts # WebSocket management
```

## API Endpoints

### REST Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/daw/projects` | List user's projects |
| POST | `/api/v1/daw/projects` | Create new project |
| GET | `/api/v1/daw/projects/:id` | Get project details |
| PUT | `/api/v1/daw/projects/:id` | Update project |
| DELETE | `/api/v1/daw/projects/:id` | Archive project |
| GET | `/api/v1/daw/health` | DAW module health check |

### WebSocket Routes

| Path | Description |
|------|-------------|
| `WS /api/v1/daw/collaborate/:projectId` | Realtime collaboration |

## Environment Variables

```env
PORT=3001
HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=debug
CORS_ORIGIN=http://localhost:3000
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
```

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Type check
pnpm typecheck
```

## Architecture Notes

- **Thin Controllers**: Route handlers only parse/validate input and call services
- **Business Logic in Services**: All DB operations and logic in service layer
- **Zod Validation**: All inputs validated with Zod schemas
- **Supabase RLS**: Database security via Row Level Security policies
- **WebSocket**: Per-project collaboration with sequence numbering
- **Idempotency**: Event deduplication via event_id tracking
