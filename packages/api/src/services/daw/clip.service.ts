/**
 * DAW Clip Service
 * Business logic for clip CRUD operations.
 * Track access inherits from project membership.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiError, ApiResponse } from '@amg/shared';
import type {
  CreateClipInput,
  UpdateClipInput,
  MoveClipInput,
  ClipResponse,
  ClipListItem,
} from '../../schemas/daw/clip.schema.js';

// ============================================================================
// Types
// ============================================================================

export interface ClipServiceDeps {
  supabase: SupabaseClient;
  userId: string;
}

// ============================================================================
// Error Helpers
// ============================================================================

function createError(code: string, message: string, details?: unknown): ApiError {
  return {
    error: {
      code,
      message,
      details,
    },
  };
}

// ============================================================================
// Access Control Helpers
// ============================================================================

/**
 * Gets the project ID for a track.
 */
async function getProjectIdForTrack(
  supabase: SupabaseClient,
  trackId: string
): Promise<string | null> {
  const { data: track } = await supabase
    .from('daw_tracks')
    .select('project_id')
    .eq('id', trackId)
    .single();

  return track?.project_id ?? null;
}

/**
 * Verifies user has access to a project (owner or active collaborator).
 */
async function verifyProjectAccess(
  supabase: SupabaseClient,
  projectId: string,
  userId: string
): Promise<{ hasAccess: boolean; isOwner: boolean }> {
  // Check if owner
  const { data: project, error } = await supabase
    .from('daw_projects')
    .select('owner_id')
    .eq('id', projectId)
    .single();

  if (error || !project) {
    return { hasAccess: false, isOwner: false };
  }

  if (project.owner_id === userId) {
    return { hasAccess: true, isOwner: true };
  }

  // Check if active collaborator
  const { data: collab } = await supabase
    .from('daw_collaborators')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  return { hasAccess: collab !== null, isOwner: false };
}

/**
 * Verifies user has edit access to a project (owner or editor/admin collaborator).
 */
async function verifyEditAccess(
  supabase: SupabaseClient,
  projectId: string,
  userId: string
): Promise<boolean> {
  // Check if owner
  const { data: project } = await supabase
    .from('daw_projects')
    .select('owner_id')
    .eq('id', projectId)
    .single();

  if (project?.owner_id === userId) {
    return true;
  }

  // Check if editor or admin collaborator
  const { data: collab } = await supabase
    .from('daw_collaborators')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .in('role', ['editor', 'admin'])
    .maybeSingle();

  return collab !== null;
}

/**
 * Verifies track access through project membership.
 */
async function verifyTrackAccess(
  supabase: SupabaseClient,
  trackId: string,
  userId: string
): Promise<{ hasAccess: boolean; canEdit: boolean; projectId: string | null }> {
  const projectId = await getProjectIdForTrack(supabase, trackId);
  if (!projectId) {
    return { hasAccess: false, canEdit: false, projectId: null };
  }

  const { hasAccess } = await verifyProjectAccess(supabase, projectId, userId);
  if (!hasAccess) {
    return { hasAccess: false, canEdit: false, projectId };
  }

  const canEdit = await verifyEditAccess(supabase, projectId, userId);
  return { hasAccess: true, canEdit, projectId };
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Lists all clips for a track.
 */
export async function listClips(
  deps: ClipServiceDeps,
  trackId: string
): Promise<ApiResponse<ClipListItem[]> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // Verify track access through project
    const { hasAccess, projectId } = await verifyTrackAccess(supabase, trackId, userId);
    if (!hasAccess) {
      return createError('FORBIDDEN', 'You do not have access to this track');
    }

    // TODO: PostHog.capture('daw_clips_list', {
    //   user_id: userId,
    //   project_id: projectId,
    //   track_id: trackId,
    // });

    const { data: clips, error } = await supabase
      .from('daw_clips')
      .select('id, track_id, name, start_time, duration, clip_type, drive_file_id, volume, pan, mute')
      .eq('track_id', trackId)
      .order('start_time', { ascending: true });

    if (error) {
      // TODO: Sentry.captureException(error, {
      //   tags: { operation: 'listClips' },
      //   extra: { userId, trackId, projectId },
      // });

      console.error('[ClipService] listClips error:', error);
      return createError('DB_ERROR', 'Failed to fetch clips', error.message);
    }

    return { data: (clips ?? []) as ClipListItem[] };
  } catch (err) {
    // TODO: Sentry.captureException(err, {
    //   tags: { operation: 'listClips' },
    // });

    console.error('[ClipService] listClips exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Gets a single clip by ID.
 */
export async function getClip(
  deps: ClipServiceDeps,
  trackId: string,
  clipId: string
): Promise<ApiResponse<ClipResponse> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // Verify track access through project
    const { hasAccess, projectId } = await verifyTrackAccess(supabase, trackId, userId);
    if (!hasAccess) {
      return createError('FORBIDDEN', 'You do not have access to this track');
    }

    // TODO: PostHog.capture('daw_clip_view', {
    //   user_id: userId,
    //   project_id: projectId,
    //   track_id: trackId,
    //   clip_id: clipId,
    // });

    const { data: clip, error } = await supabase
      .from('daw_clips')
      .select('*')
      .eq('id', clipId)
      .eq('track_id', trackId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return createError('NOT_FOUND', 'Clip not found');
      }

      // TODO: Sentry.captureException(error, {
      //   tags: { operation: 'getClip' },
      //   extra: { userId, trackId, clipId, projectId },
      // });

      console.error('[ClipService] getClip error:', error);
      return createError('DB_ERROR', 'Failed to fetch clip', error.message);
    }

    return { data: clip as ClipResponse };
  } catch (err) {
    // TODO: Sentry.captureException(err);
    console.error('[ClipService] getClip exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Creates a new clip on a track.
 */
export async function createClip(
  deps: ClipServiceDeps,
  trackId: string,
  input: CreateClipInput
): Promise<ApiResponse<ClipResponse> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // Verify edit access through project
    const { hasAccess, canEdit, projectId } = await verifyTrackAccess(supabase, trackId, userId);
    if (!hasAccess) {
      return createError('FORBIDDEN', 'You do not have access to this track');
    }
    if (!canEdit) {
      return createError('FORBIDDEN', 'You do not have permission to add clips to this track');
    }

    // TODO: PostHog.capture('daw_clip_create', {
    //   user_id: userId,
    //   project_id: projectId,
    //   track_id: trackId,
    //   clip_type: input.clip_type,
    // });

    const { data: clip, error } = await supabase
      .from('daw_clips')
      .insert({
        track_id: trackId,
        name: input.name,
        start_time: input.start_time,
        duration: input.duration,
        source_offset_seconds: input.source_offset_seconds,
        clip_type: input.clip_type,
        drive_file_id: input.drive_file_id ?? null,
        volume: input.volume,
        pan: input.pan,
        mute: input.mute,
      })
      .select()
      .single();

    if (error) {
      // TODO: Sentry.captureException(error, {
      //   tags: { operation: 'createClip' },
      //   extra: { userId, trackId, input, projectId },
      // });

      console.error('[ClipService] createClip error:', error);
      return createError('DB_ERROR', 'Failed to create clip', error.message);
    }

    return { data: clip as ClipResponse };
  } catch (err) {
    // TODO: Sentry.captureException(err);
    console.error('[ClipService] createClip exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Updates an existing clip.
 */
export async function updateClip(
  deps: ClipServiceDeps,
  trackId: string,
  clipId: string,
  input: UpdateClipInput
): Promise<ApiResponse<ClipResponse> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // Verify edit access through project
    const { hasAccess, canEdit, projectId } = await verifyTrackAccess(supabase, trackId, userId);
    if (!hasAccess) {
      return createError('FORBIDDEN', 'You do not have access to this track');
    }
    if (!canEdit) {
      return createError('FORBIDDEN', 'You do not have permission to edit this clip');
    }

    // TODO: PostHog.capture('daw_clip_update', {
    //   user_id: userId,
    //   project_id: projectId,
    //   track_id: trackId,
    //   clip_id: clipId,
    //   changed_fields: Object.keys(input),
    // });

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.start_time !== undefined) updateData.start_time = input.start_time;
    if (input.duration !== undefined) updateData.duration = input.duration;
    if (input.source_offset_seconds !== undefined) updateData.source_offset_seconds = input.source_offset_seconds;
    if (input.clip_type !== undefined) updateData.clip_type = input.clip_type;
    if (input.drive_file_id !== undefined) updateData.drive_file_id = input.drive_file_id;
    if (input.volume !== undefined) updateData.volume = input.volume;
    if (input.pan !== undefined) updateData.pan = input.pan;
    if (input.mute !== undefined) updateData.mute = input.mute;

    // Always update updated_at
    updateData.updated_at = new Date().toISOString();

    const { data: clip, error } = await supabase
      .from('daw_clips')
      .update(updateData)
      .eq('id', clipId)
      .eq('track_id', trackId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return createError('NOT_FOUND', 'Clip not found');
      }

      // TODO: Sentry.captureException(error, {
      //   tags: { operation: 'updateClip' },
      //   extra: { userId, trackId, clipId, input, projectId },
      // });

      console.error('[ClipService] updateClip error:', error);
      return createError('DB_ERROR', 'Failed to update clip', error.message);
    }

    return { data: clip as ClipResponse };
  } catch (err) {
    // TODO: Sentry.captureException(err);
    console.error('[ClipService] updateClip exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Moves a clip to a new position and/or track.
 */
export async function moveClip(
  deps: ClipServiceDeps,
  trackId: string,
  clipId: string,
  input: MoveClipInput
): Promise<ApiResponse<ClipResponse> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // Verify edit access on current track
    const { hasAccess, canEdit, projectId } = await verifyTrackAccess(supabase, trackId, userId);
    if (!hasAccess) {
      return createError('FORBIDDEN', 'You do not have access to this track');
    }
    if (!canEdit) {
      return createError('FORBIDDEN', 'You do not have permission to move this clip');
    }

    // If moving to a different track, verify it belongs to the same project
    let targetTrackId = trackId;
    if (input.track_id && input.track_id !== trackId) {
      const targetProjectId = await getProjectIdForTrack(supabase, input.track_id);
      if (targetProjectId !== projectId) {
        return createError('BAD_REQUEST', 'Cannot move clip to a track in a different project');
      }
      targetTrackId = input.track_id;
    }

    // TODO: PostHog.capture('daw_clip_move', {
    //   user_id: userId,
    //   project_id: projectId,
    //   track_id: trackId,
    //   clip_id: clipId,
    //   target_track_id: targetTrackId,
    //   new_start_time: input.start_time,
    // });

    const updateData: Record<string, unknown> = {
      start_time: input.start_time,
      updated_at: new Date().toISOString(),
    };

    if (targetTrackId !== trackId) {
      updateData.track_id = targetTrackId;
    }

    const { data: clip, error } = await supabase
      .from('daw_clips')
      .update(updateData)
      .eq('id', clipId)
      .eq('track_id', trackId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return createError('NOT_FOUND', 'Clip not found');
      }

      // TODO: Sentry.captureException(error, {
      //   tags: { operation: 'moveClip' },
      //   extra: { userId, trackId, clipId, input, projectId },
      // });

      console.error('[ClipService] moveClip error:', error);
      return createError('DB_ERROR', 'Failed to move clip', error.message);
    }

    return { data: clip as ClipResponse };
  } catch (err) {
    // TODO: Sentry.captureException(err);
    console.error('[ClipService] moveClip exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Deletes a clip.
 */
export async function deleteClip(
  deps: ClipServiceDeps,
  trackId: string,
  clipId: string
): Promise<ApiResponse<{ deleted: boolean }> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // Verify edit access through project
    const { hasAccess, canEdit, projectId } = await verifyTrackAccess(supabase, trackId, userId);
    if (!hasAccess) {
      return createError('FORBIDDEN', 'You do not have access to this track');
    }
    if (!canEdit) {
      return createError('FORBIDDEN', 'You do not have permission to delete this clip');
    }

    // TODO: PostHog.capture('daw_clip_delete', {
    //   user_id: userId,
    //   project_id: projectId,
    //   track_id: trackId,
    //   clip_id: clipId,
    // });

    const { error } = await supabase
      .from('daw_clips')
      .delete()
      .eq('id', clipId)
      .eq('track_id', trackId);

    if (error) {
      // TODO: Sentry.captureException(error, {
      //   tags: { operation: 'deleteClip' },
      //   extra: { userId, trackId, clipId, projectId },
      // });

      console.error('[ClipService] deleteClip error:', error);
      return createError('DB_ERROR', 'Failed to delete clip', error.message);
    }

    return { data: { deleted: true } };
  } catch (err) {
    // TODO: Sentry.captureException(err);
    console.error('[ClipService] deleteClip exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
