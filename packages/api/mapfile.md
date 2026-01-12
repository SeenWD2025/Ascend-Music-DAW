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
    │       ├── tracks.ts     # Track CRUD endpoints (Sprint 1)
    │       ├── clips.ts      # Clip CRUD endpoints (Sprint 1)
    │       ├── plugins.ts    # Plugin CRUD endpoints (Sprint 2)
    │       ├── exports.ts    # Export pipeline endpoints (Sprint 2)
    │       └── collaborate.ts # WebSocket collaboration
    ├── schemas/
    │   ├── index.ts          # Schema exports
    │   └── daw/
    │       ├── index.ts      # DAW schema exports
    │       ├── project.schema.ts   # Project Zod schemas
    │       ├── track.schema.ts     # Track Zod schemas (Sprint 1)
    │       ├── clip.schema.ts      # Clip Zod schemas (Sprint 1)
    │       ├── plugin.schema.ts    # Plugin Zod schemas (Sprint 2)
    │       ├── export.schema.ts    # Export Zod schemas (Sprint 2)
    │       └── realtime.schema.ts  # Realtime event schemas
    └── services/
        ├── index.ts          # Service exports
        └── daw/
            ├── index.ts          # Service exports
            ├── project.service.ts    # Project CRUD logic
            ├── track.service.ts      # Track CRUD logic (Sprint 1)
            ├── clip.service.ts       # Clip CRUD logic (Sprint 1)
            ├── plugin.service.ts     # Plugin CRUD logic (Sprint 2)
            ├── export.service.ts     # Export pipeline logic (Sprint 2)
            ├── realtime.service.ts   # WebSocket connection registry
            ├── presence.service.ts   # Collaborator presence (Sprint 1)
            ├── lock.service.ts       # Resource locking (Sprint 1)
            ├── plugin-lock.service.ts  # Plugin edit locking (Sprint 2)
            └── plugin-sync.service.ts  # Plugin param sync with throttling (Sprint 2)
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

### Track Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/daw/projects/:projectId/tracks` | List tracks |
| POST | `/api/v1/daw/projects/:projectId/tracks` | Create track |
| GET | `/api/v1/daw/projects/:projectId/tracks/:trackId` | Get track |
| PUT | `/api/v1/daw/projects/:projectId/tracks/:trackId` | Update track |
| DELETE | `/api/v1/daw/projects/:projectId/tracks/:trackId` | Delete track |
| PUT | `/api/v1/daw/projects/:projectId/tracks/reorder` | Reorder tracks |

### Clip Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/daw/tracks/:trackId/clips` | List clips on track |
| POST | `/api/v1/daw/tracks/:trackId/clips` | Create clip |
| GET | `/api/v1/daw/clips/:clipId` | Get clip |
| PUT | `/api/v1/daw/clips/:clipId` | Update clip |
| PUT | `/api/v1/daw/clips/:clipId/move` | Move clip |
| DELETE | `/api/v1/daw/clips/:clipId` | Delete clip |

### Plugin Routes (Sprint 2)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/daw/tracks/:trackId/plugins` | List plugins on track |
| POST | `/api/v1/daw/tracks/:trackId/plugins` | Add plugin to track |
| PATCH | `/api/v1/daw/tracks/:trackId/plugins/reorder` | Reorder effects chain |
| GET | `/api/v1/daw/plugins/:pluginId` | Get plugin |
| PUT | `/api/v1/daw/plugins/:pluginId` | Update plugin |
| DELETE | `/api/v1/daw/plugins/:pluginId` | Remove plugin |

### Export Routes (Sprint 2)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/daw/projects/:projectId/export` | Enqueue export job |
| GET | `/api/v1/daw/projects/:projectId/exports` | List exports for project |
| GET | `/api/v1/daw/exports/:exportId` | Get export status |
| DELETE | `/api/v1/daw/exports/:exportId` | Cancel/delete export |

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
