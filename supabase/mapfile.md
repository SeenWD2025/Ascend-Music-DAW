---
path: supabase
owner: A02 (Supabase/RLS Specialist)
status: active
summary: Supabase configuration, migrations, and RLS policies for AMG Music Platform. Contains auth/profile foundation, Google Drive integration, DAW foundation schema with collaborative project access control, and Sprint 2 plugin/export enhancements.
last_updated: 2026-01-25
key_artifacts:
  - config.toml: Supabase CLI configuration with auth, storage, and API settings
  - migrations/20260110000001_auth_profiles_roles.sql: Core profile tables (profiles, service_provider_profiles, service_seeker_profiles) with RLS policies
  - migrations/20260110000002_seed_admin.sql: Admin user seeding and promote_to_admin helper function
  - migrations/20260111000001_drive_connections_files.sql: Google Drive OAuth connections and file metadata with private-by-default RLS
  - migrations/20260115000001_daw_foundation.sql: DAW project schema (daw_projects, daw_tracks, daw_clips, daw_plugins, daw_collaborators, daw_exports) with owner/collaborator RLS
  - migrations/20260118000001_daw_cascade_updated_at.sql: Cascade triggers for updated_at propagation (track->project, clip->project, plugin->project)
  - migrations/20260125000001_daw_plugins_export.sql: Sprint 2 - Plugin versioning (wam_version), export idempotency, R2 tracking, and plugin->track cascade
processes:
  - Use Supabase CLI migrations; never apply ad-hoc SQL in prod
  - Run `supabase db push` for local development
  - Run `supabase db reset` to reset local database and apply all migrations
  - Test RLS policies with both owner and non-owner contexts
  - Use drive_connection_status view for client-side connection checks (never expose tokens)
dependencies:
  - dev-guides_plans/ASCEND_DEV_SOURCE_OF_TRUTH.md: Data model patterns and auth requirements
  - Supabase Auth: auth.users table for user identity
risks:
  - Schema drift if migrations are bypassed
  - RLS policy gaps could expose sensitive data (service_seeker_profiles, drive_connections tokens)
  - Admin promotion function requires careful access control
  - Drive tokens must only be accessed via service role
todo:
  - Add migrations for workspaces and tasks (Sprint 03)
  - Add migrations for Stripe Connect tables (Sprint 04)
  - Add migrations for chat and contacts (Sprint 05)
  - Add migrations for playlists and radio (Sprint 06)
  - Add RLS integration tests
  - Add FK constraint from drive_files.project_id to projects table when created
tags: [database, auth, rls, supabase, sprint-01, sprint-02, drive]
---

## Directory Structure

```
supabase/
├── config.toml                    # Supabase CLI configuration
├── mapfile.md                     # This file
└── migrations/
    ├── 20260110000001_auth_profiles_roles.sql       # Core profile schema + RLS
    ├── 20260110000002_seed_admin.sql                # Admin seeding
    ├── 20260111000001_drive_connections_files.sql   # Drive OAuth + file metadata
    ├── 20260115000001_daw_foundation.sql            # DAW core tables + RLS
    ├── 20260118000001_daw_cascade_updated_at.sql    # Cascade triggers
    └── 20260125000001_daw_plugins_export.sql        # Sprint 2 plugin/export enhancements
```

## Tables Created

| Table | Description | RLS |
|-------|-------------|-----|
| `profiles` | 1:1 with auth.users, stores user profile data | Public read, owner write, admin update |
| `service_provider_profiles` | Extended profile for Music Pros | Public read, owner write |
| `service_seeker_profiles` | Extended profile for Clients | Owner/admin read, owner write |
| `drive_connections` | Google Drive OAuth tokens per user | Owner read/delete, no client insert/update |
| `drive_files` | File metadata (not content) | Owner CRUD, shared_with read, admin read |
| `daw_projects` | DAW projects with settings (BPM, sample rate) | Owner all, collaborator read/edit, admin all |
| `daw_tracks` | Audio/MIDI/bus/master tracks | Member read, editor insert/update/delete |
| `daw_clips` | Audio/MIDI clips on tracks | Member read, editor insert/update/delete |
| `daw_plugins` | WAM plugin instances on tracks (with wam_version) | Member read, editor insert/update/delete |
| `daw_collaborators` | Project collaboration with role-based access | Owner manage, self read/update, admin all |
| `daw_exports` | Export jobs with idempotency and R2 tracking | Owner select/delete, member insert, service_role update |

## Views

| View | Description |
|------|-------------|
| `drive_connection_status` | Safe view of drive_connections (no tokens) for client-side status checks |

## Key Functions

| Function | Purpose |
|----------|---------|
| `update_updated_at_column()` | Trigger function to auto-update `updated_at` timestamps |
| `handle_new_user()` | Auto-creates profile when user signs up via Supabase Auth |
| `promote_to_admin(email)` | Securely promotes a user to admin role (superuser only) |
| `has_active_drive_connection(user_id)` | Check if user has active (non-revoked, non-expired) Drive connection |
| `can_access_drive_file(user_id, file_id)` | Check if user can access a specific file based on ownership/sharing/privacy |
| `is_daw_project_owner(project_uuid)` | Check if current user owns the DAW project |
| `is_daw_project_member(project_uuid)` | Check if current user is owner or active collaborator |
| `can_edit_daw_project(project_uuid)` | Check if current user can edit (owner or editor/admin collaborator) |
| `is_daw_export_owner(export_uuid)` | Check if current user owns the export |
| `cascade_plugin_to_track_updated_at()` | Trigger to cascade plugin changes to parent track's updated_at |

## RLS Policy Summary

### profiles
- SELECT: Public (anyone can view profiles for discovery)
- INSERT: `auth.uid() = id` (users can only create their own profile)
- UPDATE: `auth.uid() = id OR role = 'admin'` (owner or admin)
- DELETE: `auth.uid() = id` (owner only)

### service_provider_profiles
- SELECT: Public (pro directory is publicly browsable)
- INSERT/UPDATE/DELETE: `auth.uid() = id` (owner only)

### service_seeker_profiles
- SELECT: `auth.uid() = id OR role = 'admin'` (private, owner or admin only)
- INSERT/UPDATE/DELETE: `auth.uid() = id` (owner only)

### drive_connections (SENSITIVE - tokens)
- SELECT: `auth.uid() = user_id` (owner only - prefer drive_connection_status view)
- INSERT: BLOCKED (service role only)
- UPDATE: BLOCKED (service role only)
- DELETE: `auth.uid() = user_id` (owner can revoke)

### drive_files
- SELECT: `auth.uid() = owner_id OR auth.uid() = ANY(shared_with) OR role = 'admin'`
- INSERT: `auth.uid() = owner_id` (owner only)
- UPDATE: `auth.uid() = owner_id` (owner only)
- DELETE: `auth.uid() = owner_id` (owner only)

## Usage

```bash
# Initialize Supabase locally
supabase init  # (if not already done)

# Start local Supabase
supabase start

# Apply migrations
supabase db push

# Reset database (applies all migrations fresh)
supabase db reset

# Generate types (after schema changes)
supabase gen types typescript --local > frontend/src/types/database.ts
```