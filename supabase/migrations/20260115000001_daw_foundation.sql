-- Migration: DAW Foundation Schema
-- Created: 2026-01-15
-- Description: Core DAW tables for projects, tracks, clips, plugins, collaborators, and exports

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Project status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'daw_project_status') THEN
    CREATE TYPE public.daw_project_status AS ENUM ('draft', 'active', 'archived');
  END IF;
END$$;

-- Track type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'daw_track_type') THEN
    CREATE TYPE public.daw_track_type AS ENUM ('audio', 'midi', 'bus', 'master');
  END IF;
END$$;

-- Clip type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'daw_clip_type') THEN
    CREATE TYPE public.daw_clip_type AS ENUM ('audio', 'midi');
  END IF;
END$$;

-- Collaborator role enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'daw_collaborator_role') THEN
    CREATE TYPE public.daw_collaborator_role AS ENUM ('viewer', 'editor', 'admin');
  END IF;
END$$;

-- Collaborator status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'daw_collaborator_status') THEN
    CREATE TYPE public.daw_collaborator_status AS ENUM ('pending', 'active', 'revoked');
  END IF;
END$$;

-- Export format enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'daw_export_format') THEN
    CREATE TYPE public.daw_export_format AS ENUM ('wav', 'mp3', 'flac');
  END IF;
END$$;

-- Export status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'daw_export_status') THEN
    CREATE TYPE public.daw_export_status AS ENUM ('queued', 'processing', 'complete', 'failed');
  END IF;
END$$;

-- ============================================================================
-- TABLES
-- ============================================================================

-- -----------------------------------------------------------------------------
-- daw_projects: Main project table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daw_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  bpm INTEGER NOT NULL DEFAULT 120 CHECK (bpm > 0 AND bpm <= 999),
  time_signature TEXT NOT NULL DEFAULT '4/4' CHECK (time_signature ~ '^\d+/\d+$'),
  sample_rate INTEGER NOT NULL DEFAULT 44100 CHECK (sample_rate IN (22050, 44100, 48000, 88200, 96000, 176400, 192000)),
  bit_depth INTEGER NOT NULL DEFAULT 24 CHECK (bit_depth IN (16, 24, 32)),
  status public.daw_project_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.daw_projects IS 'DAW projects containing tracks, clips, and settings';
COMMENT ON COLUMN public.daw_projects.bpm IS 'Beats per minute (tempo)';
COMMENT ON COLUMN public.daw_projects.time_signature IS 'Time signature in format like 4/4, 3/4, 6/8';
COMMENT ON COLUMN public.daw_projects.sample_rate IS 'Audio sample rate in Hz';
COMMENT ON COLUMN public.daw_projects.bit_depth IS 'Audio bit depth (16, 24, or 32 bit)';

-- -----------------------------------------------------------------------------
-- daw_tracks: Audio/MIDI tracks within a project
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daw_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.daw_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.daw_track_type NOT NULL DEFAULT 'audio',
  position INTEGER NOT NULL DEFAULT 0,
  color TEXT CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  volume FLOAT NOT NULL DEFAULT 1.0 CHECK (volume >= 0 AND volume <= 2.0),
  pan FLOAT NOT NULL DEFAULT 0.0 CHECK (pan >= -1.0 AND pan <= 1.0),
  mute BOOLEAN NOT NULL DEFAULT false,
  solo BOOLEAN NOT NULL DEFAULT false,
  armed BOOLEAN NOT NULL DEFAULT false,
  routing JSONB DEFAULT '{"input_source": null, "output_destination": "master"}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.daw_tracks IS 'Tracks within a DAW project (audio, MIDI, bus, master)';
COMMENT ON COLUMN public.daw_tracks.position IS 'Vertical ordering position in the track list';
COMMENT ON COLUMN public.daw_tracks.color IS 'Track color as hex string (e.g., #FF5500)';
COMMENT ON COLUMN public.daw_tracks.volume IS 'Track volume (0.0 to 2.0, where 1.0 is unity gain)';
COMMENT ON COLUMN public.daw_tracks.pan IS 'Stereo pan position (-1.0 left to 1.0 right)';
COMMENT ON COLUMN public.daw_tracks.armed IS 'Whether track is armed for recording';
COMMENT ON COLUMN public.daw_tracks.routing IS 'Input/output routing configuration';

-- -----------------------------------------------------------------------------
-- daw_clips: Audio/MIDI clips on tracks
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daw_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES public.daw_tracks(id) ON DELETE CASCADE,
  drive_file_id UUID REFERENCES public.drive_files(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  start_time FLOAT NOT NULL DEFAULT 0.0 CHECK (start_time >= 0),
  duration FLOAT NOT NULL CHECK (duration > 0),
  source_offset_seconds FLOAT NOT NULL DEFAULT 0.0 CHECK (source_offset_seconds >= 0),
  volume FLOAT NOT NULL DEFAULT 1.0 CHECK (volume >= 0 AND volume <= 2.0),
  pan FLOAT NOT NULL DEFAULT 0.0 CHECK (pan >= -1.0 AND pan <= 1.0),
  mute BOOLEAN NOT NULL DEFAULT false,
  clip_type public.daw_clip_type NOT NULL DEFAULT 'audio',
  midi_data JSONB,
  automation_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.daw_clips IS 'Audio or MIDI clips placed on tracks';
COMMENT ON COLUMN public.daw_clips.drive_file_id IS 'Reference to source audio file in drive_files (for audio clips)';
COMMENT ON COLUMN public.daw_clips.start_time IS 'Start position in seconds on the timeline';
COMMENT ON COLUMN public.daw_clips.duration IS 'Visible/audible duration in seconds';
COMMENT ON COLUMN public.daw_clips.source_offset_seconds IS 'Offset into source file in seconds';
COMMENT ON COLUMN public.daw_clips.midi_data IS 'MIDI note/event data for MIDI clips';
COMMENT ON COLUMN public.daw_clips.automation_data IS 'Automation curves for clip parameters';

-- -----------------------------------------------------------------------------
-- daw_plugins: Plugin instances on tracks
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daw_plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES public.daw_tracks(id) ON DELETE CASCADE,
  wam_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  state JSONB DEFAULT '{}'::jsonb,
  bypass BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.daw_plugins IS 'Plugin instances inserted on tracks';
COMMENT ON COLUMN public.daw_plugins.wam_id IS 'Web Audio Module plugin identifier';
COMMENT ON COLUMN public.daw_plugins.position IS 'Position in the plugin chain (insert order)';
COMMENT ON COLUMN public.daw_plugins.state IS 'Plugin parameter state (presets, settings)';
COMMENT ON COLUMN public.daw_plugins.bypass IS 'Whether the plugin is bypassed';

-- -----------------------------------------------------------------------------
-- daw_collaborators: Project collaboration/sharing
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daw_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.daw_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.daw_collaborator_role NOT NULL DEFAULT 'viewer',
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.daw_collaborator_status NOT NULL DEFAULT 'pending',
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

COMMENT ON TABLE public.daw_collaborators IS 'Project collaborators and their access levels';
COMMENT ON COLUMN public.daw_collaborators.role IS 'Access level: viewer (read-only), editor (can modify), admin (full control)';
COMMENT ON COLUMN public.daw_collaborators.status IS 'Invitation status: pending, active, or revoked';
COMMENT ON COLUMN public.daw_collaborators.joined_at IS 'Timestamp when user accepted the invitation';

-- -----------------------------------------------------------------------------
-- daw_exports: Export jobs and results
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daw_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.daw_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  format public.daw_export_format NOT NULL,
  quality_settings JSONB DEFAULT '{}'::jsonb,
  status public.daw_export_status NOT NULL DEFAULT 'queued',
  r2_url TEXT,
  error_message TEXT,
  file_size_bytes BIGINT,
  duration_seconds FLOAT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.daw_exports IS 'Export jobs for rendering projects to audio files';
COMMENT ON COLUMN public.daw_exports.format IS 'Output format: wav, mp3, or flac';
COMMENT ON COLUMN public.daw_exports.quality_settings IS 'Format-specific quality settings (bitrate, etc.)';
COMMENT ON COLUMN public.daw_exports.r2_url IS 'Cloudflare R2 URL of the exported file';
COMMENT ON COLUMN public.daw_exports.error_message IS 'Error message if export failed';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- daw_projects indexes
CREATE INDEX IF NOT EXISTS idx_daw_projects_owner_id ON public.daw_projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_daw_projects_status ON public.daw_projects(status);
CREATE INDEX IF NOT EXISTS idx_daw_projects_created_at ON public.daw_projects(created_at DESC);

-- daw_tracks indexes
CREATE INDEX IF NOT EXISTS idx_daw_tracks_project_id ON public.daw_tracks(project_id);
CREATE INDEX IF NOT EXISTS idx_daw_tracks_project_position ON public.daw_tracks(project_id, position);

-- daw_clips indexes
CREATE INDEX IF NOT EXISTS idx_daw_clips_track_id ON public.daw_clips(track_id);
CREATE INDEX IF NOT EXISTS idx_daw_clips_track_start_time ON public.daw_clips(track_id, start_time);

-- daw_plugins indexes
CREATE INDEX IF NOT EXISTS idx_daw_plugins_track_id ON public.daw_plugins(track_id);
CREATE INDEX IF NOT EXISTS idx_daw_plugins_track_position ON public.daw_plugins(track_id, position);

-- daw_collaborators indexes
CREATE INDEX IF NOT EXISTS idx_daw_collaborators_project_id ON public.daw_collaborators(project_id);
CREATE INDEX IF NOT EXISTS idx_daw_collaborators_user_id ON public.daw_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_daw_collaborators_status ON public.daw_collaborators(status);
CREATE INDEX IF NOT EXISTS idx_daw_collaborators_project_user ON public.daw_collaborators(project_id, user_id);

-- daw_exports indexes
CREATE INDEX IF NOT EXISTS idx_daw_exports_project_id ON public.daw_exports(project_id);
CREATE INDEX IF NOT EXISTS idx_daw_exports_status ON public.daw_exports(status);
CREATE INDEX IF NOT EXISTS idx_daw_exports_user_id ON public.daw_exports(user_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- updated_at triggers for all tables
CREATE TRIGGER set_daw_projects_updated_at
  BEFORE UPDATE ON public.daw_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_daw_tracks_updated_at
  BEFORE UPDATE ON public.daw_tracks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_daw_clips_updated_at
  BEFORE UPDATE ON public.daw_clips
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_daw_plugins_updated_at
  BEFORE UPDATE ON public.daw_plugins
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_daw_collaborators_updated_at
  BEFORE UPDATE ON public.daw_collaborators
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_daw_exports_updated_at
  BEFORE UPDATE ON public.daw_exports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- HELPER FUNCTIONS (must be created after tables exist)
-- ============================================================================

-- Function to check if current user is the owner of a DAW project
CREATE OR REPLACE FUNCTION public.is_daw_project_owner(project_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.daw_projects
    WHERE id = project_uuid
      AND owner_id = auth.uid()
  );
$$;

-- Function to check if current user is owner OR active collaborator of a DAW project
CREATE OR REPLACE FUNCTION public.is_daw_project_member(project_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.daw_projects
    WHERE id = project_uuid
      AND owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.daw_collaborators
    WHERE project_id = project_uuid
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

-- Function to check if current user can edit a DAW project (owner or editor/admin collaborator)
CREATE OR REPLACE FUNCTION public.can_edit_daw_project(project_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.daw_projects
    WHERE id = project_uuid
      AND owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.daw_collaborators
    WHERE project_id = project_uuid
      AND user_id = auth.uid()
      AND status = 'active'
      AND role IN ('editor', 'admin')
  );
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.daw_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daw_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daw_clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daw_plugins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daw_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daw_exports ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- daw_projects RLS Policies
-- -----------------------------------------------------------------------------

-- Owner can do everything with their projects
CREATE POLICY "daw_projects_owner_all"
  ON public.daw_projects
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Collaborators can read projects they're collaborating on
CREATE POLICY "daw_projects_collaborator_select"
  ON public.daw_projects
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.daw_collaborators
      WHERE project_id = daw_projects.id
        AND user_id = auth.uid()
        AND status = 'active'
    )
  );

-- Collaborators with editor/admin role can update projects
CREATE POLICY "daw_projects_collaborator_update"
  ON public.daw_projects
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.daw_collaborators
      WHERE project_id = daw_projects.id
        AND user_id = auth.uid()
        AND status = 'active'
        AND role IN ('editor', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.daw_collaborators
      WHERE project_id = daw_projects.id
        AND user_id = auth.uid()
        AND status = 'active'
        AND role IN ('editor', 'admin')
    )
  );

-- Admins can access all projects
CREATE POLICY "daw_projects_admin_all"
  ON public.daw_projects
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- daw_tracks RLS Policies (inherit from project access)
-- -----------------------------------------------------------------------------

-- Project members can read tracks
CREATE POLICY "daw_tracks_member_select"
  ON public.daw_tracks
  FOR SELECT
  USING (public.is_daw_project_member(project_id));

-- Project editors can insert tracks
CREATE POLICY "daw_tracks_editor_insert"
  ON public.daw_tracks
  FOR INSERT
  WITH CHECK (public.can_edit_daw_project(project_id));

-- Project editors can update tracks
CREATE POLICY "daw_tracks_editor_update"
  ON public.daw_tracks
  FOR UPDATE
  USING (public.can_edit_daw_project(project_id))
  WITH CHECK (public.can_edit_daw_project(project_id));

-- Project editors can delete tracks
CREATE POLICY "daw_tracks_editor_delete"
  ON public.daw_tracks
  FOR DELETE
  USING (public.can_edit_daw_project(project_id));

-- Admins can access all tracks
CREATE POLICY "daw_tracks_admin_all"
  ON public.daw_tracks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- daw_clips RLS Policies (inherit from track/project access)
-- -----------------------------------------------------------------------------

-- Project members can read clips
CREATE POLICY "daw_clips_member_select"
  ON public.daw_clips
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.daw_tracks t
      WHERE t.id = daw_clips.track_id
        AND public.is_daw_project_member(t.project_id)
    )
  );

-- Project editors can insert clips
CREATE POLICY "daw_clips_editor_insert"
  ON public.daw_clips
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.daw_tracks t
      WHERE t.id = daw_clips.track_id
        AND public.can_edit_daw_project(t.project_id)
    )
  );

-- Project editors can update clips
CREATE POLICY "daw_clips_editor_update"
  ON public.daw_clips
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.daw_tracks t
      WHERE t.id = daw_clips.track_id
        AND public.can_edit_daw_project(t.project_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.daw_tracks t
      WHERE t.id = daw_clips.track_id
        AND public.can_edit_daw_project(t.project_id)
    )
  );

-- Project editors can delete clips
CREATE POLICY "daw_clips_editor_delete"
  ON public.daw_clips
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.daw_tracks t
      WHERE t.id = daw_clips.track_id
        AND public.can_edit_daw_project(t.project_id)
    )
  );

-- Admins can access all clips
CREATE POLICY "daw_clips_admin_all"
  ON public.daw_clips
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- daw_plugins RLS Policies (inherit from track/project access)
-- -----------------------------------------------------------------------------

-- Project members can read plugins
CREATE POLICY "daw_plugins_member_select"
  ON public.daw_plugins
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.daw_tracks t
      WHERE t.id = daw_plugins.track_id
        AND public.is_daw_project_member(t.project_id)
    )
  );

-- Project editors can insert plugins
CREATE POLICY "daw_plugins_editor_insert"
  ON public.daw_plugins
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.daw_tracks t
      WHERE t.id = daw_plugins.track_id
        AND public.can_edit_daw_project(t.project_id)
    )
  );

-- Project editors can update plugins
CREATE POLICY "daw_plugins_editor_update"
  ON public.daw_plugins
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.daw_tracks t
      WHERE t.id = daw_plugins.track_id
        AND public.can_edit_daw_project(t.project_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.daw_tracks t
      WHERE t.id = daw_plugins.track_id
        AND public.can_edit_daw_project(t.project_id)
    )
  );

-- Project editors can delete plugins
CREATE POLICY "daw_plugins_editor_delete"
  ON public.daw_plugins
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.daw_tracks t
      WHERE t.id = daw_plugins.track_id
        AND public.can_edit_daw_project(t.project_id)
    )
  );

-- Admins can access all plugins
CREATE POLICY "daw_plugins_admin_all"
  ON public.daw_plugins
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- daw_collaborators RLS Policies
-- -----------------------------------------------------------------------------

-- Project owners can manage collaborators
CREATE POLICY "daw_collaborators_owner_all"
  ON public.daw_collaborators
  FOR ALL
  USING (public.is_daw_project_owner(project_id))
  WITH CHECK (public.is_daw_project_owner(project_id));

-- Users can read their own collaboration records
CREATE POLICY "daw_collaborators_self_select"
  ON public.daw_collaborators
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can update their own collaboration records (e.g., accept invitation)
CREATE POLICY "daw_collaborators_self_update"
  ON public.daw_collaborators
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Project admin collaborators can manage other collaborators
CREATE POLICY "daw_collaborators_admin_collab_all"
  ON public.daw_collaborators
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.daw_collaborators c
      WHERE c.project_id = daw_collaborators.project_id
        AND c.user_id = auth.uid()
        AND c.status = 'active'
        AND c.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.daw_collaborators c
      WHERE c.project_id = daw_collaborators.project_id
        AND c.user_id = auth.uid()
        AND c.status = 'active'
        AND c.role = 'admin'
    )
  );

-- System admins can access all collaborator records
CREATE POLICY "daw_collaborators_admin_all"
  ON public.daw_collaborators
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- daw_exports RLS Policies
-- -----------------------------------------------------------------------------

-- Users can manage their own exports
CREATE POLICY "daw_exports_owner_all"
  ON public.daw_exports
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Project members can read exports
CREATE POLICY "daw_exports_member_select"
  ON public.daw_exports
  FOR SELECT
  USING (public.is_daw_project_member(project_id));

-- System admins can access all exports
CREATE POLICY "daw_exports_admin_all"
  ON public.daw_exports
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  );

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Grant usage on types to authenticated users
GRANT USAGE ON TYPE public.daw_project_status TO authenticated;
GRANT USAGE ON TYPE public.daw_track_type TO authenticated;
GRANT USAGE ON TYPE public.daw_clip_type TO authenticated;
GRANT USAGE ON TYPE public.daw_collaborator_role TO authenticated;
GRANT USAGE ON TYPE public.daw_collaborator_status TO authenticated;
GRANT USAGE ON TYPE public.daw_export_format TO authenticated;
GRANT USAGE ON TYPE public.daw_export_status TO authenticated;

-- Grant table access to authenticated users (RLS will filter)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daw_projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daw_tracks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daw_clips TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daw_plugins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daw_collaborators TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daw_exports TO authenticated;

-- Grant function execution to authenticated users
GRANT EXECUTE ON FUNCTION public.is_daw_project_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_daw_project_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_daw_project(UUID) TO authenticated;

-- Service role has full access (for backend operations)
GRANT ALL ON public.daw_projects TO service_role;
GRANT ALL ON public.daw_tracks TO service_role;
GRANT ALL ON public.daw_clips TO service_role;
GRANT ALL ON public.daw_plugins TO service_role;
GRANT ALL ON public.daw_collaborators TO service_role;
GRANT ALL ON public.daw_exports TO service_role;
