-- Migration: DAW Plugins & Export Enhancements (Sprint 2)
-- Created: 2026-01-25
-- Description: Adds wam_version to plugins, idempotency support and R2 tracking to exports,
--              plus cascade trigger for plugin->track.updated_at

-- ============================================================================
-- SCHEMA ALTERATIONS
-- ============================================================================

-- -----------------------------------------------------------------------------
-- daw_plugins: Add wam_version column for pinned plugin versions
-- -----------------------------------------------------------------------------
ALTER TABLE public.daw_plugins
  ADD COLUMN IF NOT EXISTS wam_version TEXT NOT NULL DEFAULT '1.0.0';

COMMENT ON COLUMN public.daw_plugins.wam_version IS 'Pinned WAM plugin version string for reproducibility';

-- -----------------------------------------------------------------------------
-- daw_exports: Add idempotency, R2 tracking, and timing columns
-- -----------------------------------------------------------------------------

-- Add idempotency_key for client-provided deduplication
ALTER TABLE public.daw_exports
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Add R2 object key for cleanup operations
ALTER TABLE public.daw_exports
  ADD COLUMN IF NOT EXISTS r2_key TEXT;

-- Add processing timestamps
ALTER TABLE public.daw_exports
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE public.daw_exports
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Add expiration timestamp for download links
ALTER TABLE public.daw_exports
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Add owner_id column if not exists (for explicit ownership tracking)
-- Note: foundation uses user_id, but Sprint 2 spec calls for owner_id
-- We'll add owner_id as an alias populated from user_id for new inserts
ALTER TABLE public.daw_exports
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

-- Populate owner_id from user_id for existing rows
UPDATE public.daw_exports
SET owner_id = user_id
WHERE owner_id IS NULL AND user_id IS NOT NULL;

-- Make idempotency_key NOT NULL with a default for existing rows first
UPDATE public.daw_exports
SET idempotency_key = gen_random_uuid()::TEXT
WHERE idempotency_key IS NULL;

-- Now add the NOT NULL constraint
ALTER TABLE public.daw_exports
  ALTER COLUMN idempotency_key SET NOT NULL;

-- Add comments
COMMENT ON COLUMN public.daw_exports.idempotency_key IS 'Client-provided key for export deduplication';
COMMENT ON COLUMN public.daw_exports.r2_key IS 'Cloudflare R2 object key for lifecycle management and cleanup';
COMMENT ON COLUMN public.daw_exports.started_at IS 'Timestamp when export processing began';
COMMENT ON COLUMN public.daw_exports.completed_at IS 'Timestamp when export processing finished';
COMMENT ON COLUMN public.daw_exports.expires_at IS 'Timestamp when the export download link expires';
COMMENT ON COLUMN public.daw_exports.owner_id IS 'User who initiated the export (explicit ownership)';

-- ============================================================================
-- UNIQUE CONSTRAINTS
-- ============================================================================

-- Add unique constraint for idempotency (project_id + idempotency_key)
-- Drop if exists first to make migration idempotent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'daw_exports_project_idempotency_key'
  ) THEN
    ALTER TABLE public.daw_exports
      ADD CONSTRAINT daw_exports_project_idempotency_key
      UNIQUE (project_id, idempotency_key);
  END IF;
END$$;

-- ============================================================================
-- ADDITIONAL INDEXES
-- ============================================================================

-- Index on idempotency_key for fast lookups during deduplication checks
CREATE INDEX IF NOT EXISTS idx_daw_exports_idempotency_key
  ON public.daw_exports(idempotency_key);

-- Index on owner_id for filtering exports by owner
CREATE INDEX IF NOT EXISTS idx_daw_exports_owner_id
  ON public.daw_exports(owner_id);

-- Index on expires_at for cleanup job queries (find expired exports)
CREATE INDEX IF NOT EXISTS idx_daw_exports_expires_at
  ON public.daw_exports(expires_at)
  WHERE expires_at IS NOT NULL;

-- Index on started_at for processing time analysis
CREATE INDEX IF NOT EXISTS idx_daw_exports_started_at
  ON public.daw_exports(started_at)
  WHERE started_at IS NOT NULL;

-- ============================================================================
-- CASCADE TRIGGER: Plugin changes -> Track updated_at
-- ============================================================================

-- Function to cascade updated_at from plugin to parent track
CREATE OR REPLACE FUNCTION public.cascade_plugin_to_track_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update the parent track's updated_at timestamp
  UPDATE public.daw_tracks
  SET updated_at = now()
  WHERE id = COALESCE(NEW.track_id, OLD.track_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.cascade_plugin_to_track_updated_at()
  IS 'Cascades updated_at from daw_plugins to parent daw_tracks on any change';

-- Create the trigger (drop first if exists for idempotency)
DROP TRIGGER IF EXISTS cascade_plugin_to_track_trigger ON public.daw_plugins;

CREATE TRIGGER cascade_plugin_to_track_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.daw_plugins
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_plugin_to_track_updated_at();

-- ============================================================================
-- RLS POLICY UPDATES
-- ============================================================================

-- -----------------------------------------------------------------------------
-- daw_exports: Enhanced RLS for owner_id based access
-- -----------------------------------------------------------------------------

-- Drop existing policies to recreate with enhanced logic
DROP POLICY IF EXISTS "daw_exports_owner_all" ON public.daw_exports;
DROP POLICY IF EXISTS "daw_exports_member_select" ON public.daw_exports;
DROP POLICY IF EXISTS "daw_exports_admin_all" ON public.daw_exports;

-- Export owner can read and delete their exports
-- Note: UPDATE is restricted to service role only (status transitions)
CREATE POLICY "daw_exports_owner_select"
  ON public.daw_exports
  FOR SELECT
  USING (
    owner_id = auth.uid()
    OR user_id = auth.uid()  -- Backward compatibility with user_id
  );

CREATE POLICY "daw_exports_owner_delete"
  ON public.daw_exports
  FOR DELETE
  USING (
    owner_id = auth.uid()
    OR user_id = auth.uid()
  );

-- Project owner or member can create exports
CREATE POLICY "daw_exports_member_insert"
  ON public.daw_exports
  FOR INSERT
  WITH CHECK (
    public.is_daw_project_member(project_id)
    AND (
      owner_id = auth.uid()
      OR user_id = auth.uid()
      OR (owner_id IS NULL AND user_id IS NULL)  -- Allow if setting during insert
    )
  );

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

-- Note: UPDATE operations should be done via service_role (backend)
-- for status transitions (pending -> processing -> completed/failed)
-- No UPDATE policy for authenticated users - this is intentional

-- ============================================================================
-- HELPER FUNCTION: Check export ownership
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_daw_export_owner(export_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.daw_exports
    WHERE id = export_uuid
      AND (owner_id = auth.uid() OR user_id = auth.uid())
  );
$$;

COMMENT ON FUNCTION public.is_daw_export_owner(UUID)
  IS 'Check if current user owns the specified export';

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Grant execute on new function
GRANT EXECUTE ON FUNCTION public.is_daw_export_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cascade_plugin_to_track_updated_at() TO service_role;

-- Ensure service_role can update exports (for status transitions)
GRANT UPDATE ON public.daw_exports TO service_role;
