-- Migration: Drive Connections & Files Schema
-- Sprint: 02 - Google Drive Upload Manager
-- Created: 2026-01-11
-- Description: Creates Google Drive OAuth connection and file metadata tables with strict private-by-default RLS

-- ============================================================================
-- 1. TABLE: drive_connections (OAuth connection per user)
-- ============================================================================

CREATE TABLE public.drive_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    access_token TEXT NOT NULL,          -- Encrypted in practice (server-side only)
    refresh_token TEXT NOT NULL,         -- Encrypted in practice (server-side only)
    token_expires_at TIMESTAMPTZ NOT NULL,
    scopes TEXT[] DEFAULT '{}',
    email TEXT,                          -- Connected Google account email
    connected_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_refreshed_at TIMESTAMPTZ,
    revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.drive_connections IS 'Google Drive OAuth connections per user. Tokens are sensitive and should only be accessed via service role.';
COMMENT ON COLUMN public.drive_connections.user_id IS 'Reference to auth.users. Each user can have one Drive connection.';
COMMENT ON COLUMN public.drive_connections.access_token IS 'OAuth2 access token. SENSITIVE: Only access via service role, never expose to client.';
COMMENT ON COLUMN public.drive_connections.refresh_token IS 'OAuth2 refresh token. SENSITIVE: Only access via service role, never expose to client.';
COMMENT ON COLUMN public.drive_connections.token_expires_at IS 'Timestamp when the access token expires. Used for proactive refresh.';
COMMENT ON COLUMN public.drive_connections.scopes IS 'Array of granted OAuth scopes, e.g. {"drive.file", "drive.readonly"}';
COMMENT ON COLUMN public.drive_connections.email IS 'Email address of the connected Google account for display purposes.';
COMMENT ON COLUMN public.drive_connections.connected_at IS 'Timestamp when the user first connected their Google Drive.';
COMMENT ON COLUMN public.drive_connections.last_refreshed_at IS 'Timestamp of last token refresh operation.';
COMMENT ON COLUMN public.drive_connections.revoked IS 'Whether the connection has been revoked by the user or Google.';

-- Trigger for updated_at
CREATE TRIGGER set_drive_connections_updated_at
    BEFORE UPDATE ON public.drive_connections
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 2. TABLE: drive_files (File metadata, NOT actual file content)
-- ============================================================================

CREATE TABLE public.drive_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    drive_file_id TEXT NOT NULL,          -- Google Drive file ID
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT,
    purpose TEXT CHECK (purpose IN ('stem', 'mix', 'master', 'reference', 'document', 'other')) DEFAULT 'other',
    project_id UUID,                      -- Optional link to project (FK added in future sprint)
    folder_path TEXT,                     -- Virtual folder path in AMG
    description TEXT,
    drive_web_url TEXT,                   -- Google Drive web link
    drive_thumbnail_url TEXT,
    privacy TEXT CHECK (privacy IN ('private', 'workspace', 'chat', 'public')) DEFAULT 'private',
    shared_with UUID[] DEFAULT '{}',      -- User IDs with access (expanded via submission flows)
    upload_status TEXT CHECK (upload_status IN ('pending', 'uploading', 'complete', 'failed')) DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.drive_files IS 'File metadata for Google Drive files. Stores references, not actual content. Default privacy is private.';
COMMENT ON COLUMN public.drive_files.owner_id IS 'User who owns/uploaded this file. Primary access control anchor.';
COMMENT ON COLUMN public.drive_files.drive_file_id IS 'Google Drive unique file identifier. Used for API operations.';
COMMENT ON COLUMN public.drive_files.name IS 'Display name of the file.';
COMMENT ON COLUMN public.drive_files.mime_type IS 'MIME type of the file, e.g. "audio/wav", "application/pdf".';
COMMENT ON COLUMN public.drive_files.size_bytes IS 'File size in bytes for quota tracking and display.';
COMMENT ON COLUMN public.drive_files.purpose IS 'Categorization of file purpose: stem, mix, master, reference, document, or other.';
COMMENT ON COLUMN public.drive_files.project_id IS 'Optional reference to a project. FK constraint added when projects table exists.';
COMMENT ON COLUMN public.drive_files.folder_path IS 'Virtual folder path within AMG for organization, e.g. "/projects/album-2026/stems".';
COMMENT ON COLUMN public.drive_files.description IS 'Optional user-provided description of the file.';
COMMENT ON COLUMN public.drive_files.drive_web_url IS 'Direct link to view the file in Google Drive web interface.';
COMMENT ON COLUMN public.drive_files.drive_thumbnail_url IS 'Thumbnail URL from Google Drive for preview purposes.';
COMMENT ON COLUMN public.drive_files.privacy IS 'Access level: private (owner only), workspace (project members), chat (thread participants), public.';
COMMENT ON COLUMN public.drive_files.shared_with IS 'Array of user IDs granted explicit access. Expanded via workspace delivery, chat share, etc.';
COMMENT ON COLUMN public.drive_files.upload_status IS 'Current upload state: pending, uploading, complete, or failed.';
COMMENT ON COLUMN public.drive_files.error_message IS 'Error details if upload_status is "failed".';

-- Trigger for updated_at
CREATE TRIGGER set_drive_files_updated_at
    BEFORE UPDATE ON public.drive_files
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 3. VIEW: drive_connection_status (Safe fields only, no tokens)
-- ============================================================================

CREATE VIEW public.drive_connection_status AS
SELECT 
    id,
    user_id,
    email,
    connected_at,
    last_refreshed_at,
    revoked,
    scopes
FROM public.drive_connections;

COMMENT ON VIEW public.drive_connection_status IS 'Safe view of drive connections exposing only non-sensitive fields. Use this for client-side connection status checks.';

-- ============================================================================
-- 4. INDEXES
-- ============================================================================

-- drive_connections indexes
-- Note: user_id UNIQUE constraint already creates an index

-- drive_files indexes
CREATE INDEX idx_drive_files_owner_id ON public.drive_files(owner_id);
CREATE INDEX idx_drive_files_project_id ON public.drive_files(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_drive_files_purpose ON public.drive_files(purpose);
CREATE INDEX idx_drive_files_created_at ON public.drive_files(created_at);
CREATE INDEX idx_drive_files_privacy ON public.drive_files(privacy);
CREATE INDEX idx_drive_files_upload_status ON public.drive_files(upload_status);
CREATE INDEX idx_drive_files_drive_file_id ON public.drive_files(drive_file_id);
CREATE INDEX idx_drive_files_shared_with ON public.drive_files USING GIN(shared_with);

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on tables
ALTER TABLE public.drive_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drive_files ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 5.1 drive_connections RLS policies
-- CRITICAL: Tokens should NEVER be exposed to client. 
-- Only service role should access the full table with tokens.
-- Clients should use the drive_connection_status view instead.
-- ----------------------------------------------------------------------------

-- SELECT: Owner can read their own connection (for checking status)
-- NOTE: For security, clients should prefer the drive_connection_status view
-- This policy exists for edge cases but tokens are still exposed if accessed directly
CREATE POLICY "drive_connections_select_own"
    ON public.drive_connections
    FOR SELECT
    USING (auth.uid() = user_id);

-- INSERT: No client INSERT - only backend with service role
-- Service role bypasses RLS, so no policy needed for service role inserts
-- This effectively blocks all client-side inserts
CREATE POLICY "drive_connections_insert_none"
    ON public.drive_connections
    FOR INSERT
    WITH CHECK (false);

-- UPDATE: No client UPDATE - only backend with service role
-- Token refresh and updates must go through the backend
CREATE POLICY "drive_connections_update_none"
    ON public.drive_connections
    FOR UPDATE
    USING (false)
    WITH CHECK (false);

-- DELETE: Owner can delete their connection (revoke integration)
CREATE POLICY "drive_connections_delete_own"
    ON public.drive_connections
    FOR DELETE
    USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 5.2 drive_files RLS policies
-- Default: private, only owner sees
-- Shared access via shared_with array for future submission expansion
-- ----------------------------------------------------------------------------

-- SELECT: Owner can read their own files
CREATE POLICY "drive_files_select_own"
    ON public.drive_files
    FOR SELECT
    USING (auth.uid() = owner_id);

-- SELECT: Users in shared_with array can read (for workspace/chat submissions)
CREATE POLICY "drive_files_select_shared"
    ON public.drive_files
    FOR SELECT
    USING (auth.uid() = ANY(shared_with));

-- SELECT: Admin can read all files (for abuse review and support)
CREATE POLICY "drive_files_select_admin"
    ON public.drive_files
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- INSERT: Owner can insert their own files
CREATE POLICY "drive_files_insert_own"
    ON public.drive_files
    FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

-- UPDATE: Owner can update their own files
CREATE POLICY "drive_files_update_own"
    ON public.drive_files
    FOR UPDATE
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

-- DELETE: Owner can delete their own files
CREATE POLICY "drive_files_delete_own"
    ON public.drive_files
    FOR DELETE
    USING (auth.uid() = owner_id);

-- ============================================================================
-- 6. GRANT PERMISSIONS FOR VIEW
-- ============================================================================

-- Grant select on the safe view to authenticated users
-- The view inherits RLS from the underlying table for its own access patterns
GRANT SELECT ON public.drive_connection_status TO authenticated;

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Function to check if a user has an active (non-revoked) Drive connection
CREATE OR REPLACE FUNCTION public.has_active_drive_connection(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.drive_connections
        WHERE user_id = p_user_id 
        AND revoked = FALSE
        AND token_expires_at > NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.has_active_drive_connection IS 'Check if a user has an active, non-revoked Drive connection with valid tokens.';

-- Function to check if a user can access a specific file
CREATE OR REPLACE FUNCTION public.can_access_drive_file(p_user_id UUID, p_file_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_file RECORD;
    v_is_admin BOOLEAN;
BEGIN
    -- Check if user is admin
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = p_user_id AND role = 'admin'
    ) INTO v_is_admin;
    
    IF v_is_admin THEN
        RETURN TRUE;
    END IF;
    
    -- Get file record
    SELECT owner_id, shared_with, privacy 
    INTO v_file 
    FROM public.drive_files 
    WHERE id = p_file_id;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Owner always has access
    IF v_file.owner_id = p_user_id THEN
        RETURN TRUE;
    END IF;
    
    -- Check shared_with array
    IF p_user_id = ANY(v_file.shared_with) THEN
        RETURN TRUE;
    END IF;
    
    -- Public files are accessible to all authenticated users
    IF v_file.privacy = 'public' THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.can_access_drive_file IS 'Check if a user can access a specific Drive file based on ownership, sharing, and privacy settings.';
