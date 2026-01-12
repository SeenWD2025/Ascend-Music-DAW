/**
 * DAW Track Service
 * Business logic for track CRUD operations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiError, ApiResponse } from '@amg/shared';
import type {
  CreateTrackInput,
  UpdateTrackInput,
  ReorderTracksInput,
  TrackResponse,
  TrackListItem,
} from '../../schemas/daw/track.schema.js';

// ============================================================================
// Types
// ============================================================================

export interface TrackServiceDeps {
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

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Lists all tracks for a project.
 */
export async function listTracks(
  deps: TrackServiceDeps,
  projectId: string
): Promise<ApiResponse<TrackListItem[]> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // Verify project access
    const { hasAccess } = await verifyProjectAccess(supabase, projectId, userId);
    if (!hasAccess) {
      return createError('FORBIDDEN', 'You do not have access to this project');
    }

    // TODO: PostHog.capture('daw_tracks_list', {
    //   user_id: userId,
    //   project_id: projectId,
    // });

    const { data: tracks, error } = await supabase
      .from('daw_tracks')
      .select('id, project_id, name, type, position, color, volume, pan, mute, solo, armed')
      .eq('project_id', projectId)
      .order('position', { ascending: true });

    if (error) {
      // TODO: Sentry.captureException(error, {
      //   tags: { operation: 'listTracks' },
      //   extra: { userId, projectId },
      // });

      console.error('[TrackService] listTracks error:', error);
      return createError('DB_ERROR', 'Failed to fetch tracks', error.message);
    }

    return { data: (tracks ?? []) as TrackListItem[] };
  } catch (err) {
    // TODO: Sentry.captureException(err, {
    //   tags: { operation: 'listTracks' },
    // });

    console.error('[TrackService] listTracks exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Gets a single track by ID.
 */
export async function getTrack(
  deps: TrackServiceDeps,
  projectId: string,
  trackId: string
): Promise<ApiResponse<TrackResponse> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // Verify project access
    const { hasAccess } = await verifyProjectAccess(supabase, projectId, userId);
    if (!hasAccess) {
      return createError('FORBIDDEN', 'You do not have access to this project');
    }

    // TODO: PostHog.capture('daw_track_view', {
    //   user_id: userId,
    //   project_id: projectId,
    //   track_id: trackId,
    // });

    const { data: track, error } = await supabase
      .from('daw_tracks')
      .select('*')
      .eq('id', trackId)
      .eq('project_id', projectId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return createError('NOT_FOUND', 'Track not found');
      }

      // TODO: Sentry.captureException(error, {
      //   tags: { operation: 'getTrack' },
      //   extra: { userId, projectId, trackId },
      // });

      console.error('[TrackService] getTrack error:', error);
      return createError('DB_ERROR', 'Failed to fetch track', error.message);
    }

    return { data: track as TrackResponse };
  } catch (err) {
    // TODO: Sentry.captureException(err);
    console.error('[TrackService] getTrack exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Creates a new track in a project.
 */
export async function createTrack(
  deps: TrackServiceDeps,
  projectId: string,
  input: CreateTrackInput
): Promise<ApiResponse<TrackResponse> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // Verify edit access
    const canEdit = await verifyEditAccess(supabase, projectId, userId);
    if (!canEdit) {
      return createError('FORBIDDEN', 'You do not have permission to add tracks to this project');
    }

    // Get next position
    const { data: existingTracks } = await supabase
      .from('daw_tracks')
      .select('position')
      .eq('project_id', projectId)
      .order('position', { ascending: false })
      .limit(1);

    const nextPosition = existingTracks && existingTracks.length > 0
      ? existingTracks[0].position + 1
      : 0;

    // TODO: PostHog.capture('daw_track_create', {
    //   user_id: userId,
    //   project_id: projectId,
    //   track_type: input.type,
    // });

    const { data: track, error } = await supabase
      .from('daw_tracks')
      .insert({
        project_id: projectId,
        name: input.name,
        type: input.type,
        position: nextPosition,
        color: input.color ?? null,
        volume: input.volume,
        pan: input.pan,
        mute: input.mute,
        solo: input.solo,
        armed: input.armed,
      })
      .select()
      .single();

    if (error) {
      // TODO: Sentry.captureException(error, {
      //   tags: { operation: 'createTrack' },
      //   extra: { userId, projectId, input },
      // });

      console.error('[TrackService] createTrack error:', error);
      return createError('DB_ERROR', 'Failed to create track', error.message);
    }

    return { data: track as TrackResponse };
  } catch (err) {
    // TODO: Sentry.captureException(err);
    console.error('[TrackService] createTrack exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Updates an existing track.
 */
export async function updateTrack(
  deps: TrackServiceDeps,
  projectId: string,
  trackId: string,
  input: UpdateTrackInput
): Promise<ApiResponse<TrackResponse> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // Verify edit access
    const canEdit = await verifyEditAccess(supabase, projectId, userId);
    if (!canEdit) {
      return createError('FORBIDDEN', 'You do not have permission to edit this track');
    }

    // TODO: PostHog.capture('daw_track_update', {
    //   user_id: userId,
    //   project_id: projectId,
    //   track_id: trackId,
    //   changed_fields: Object.keys(input),
    // });

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.type !== undefined) updateData.type = input.type;
    if (input.color !== undefined) updateData.color = input.color;
    if (input.volume !== undefined) updateData.volume = input.volume;
    if (input.pan !== undefined) updateData.pan = input.pan;
    if (input.mute !== undefined) updateData.mute = input.mute;
    if (input.solo !== undefined) updateData.solo = input.solo;
    if (input.armed !== undefined) updateData.armed = input.armed;

    // Always update updated_at
    updateData.updated_at = new Date().toISOString();

    const { data: track, error } = await supabase
      .from('daw_tracks')
      .update(updateData)
      .eq('id', trackId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return createError('NOT_FOUND', 'Track not found');
      }

      // TODO: Sentry.captureException(error, {
      //   tags: { operation: 'updateTrack' },
      //   extra: { userId, projectId, trackId, input },
      // });

      console.error('[TrackService] updateTrack error:', error);
      return createError('DB_ERROR', 'Failed to update track', error.message);
    }

    return { data: track as TrackResponse };
  } catch (err) {
    // TODO: Sentry.captureException(err);
    console.error('[TrackService] updateTrack exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Deletes a track.
 */
export async function deleteTrack(
  deps: TrackServiceDeps,
  projectId: string,
  trackId: string
): Promise<ApiResponse<{ deleted: boolean }> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // Verify edit access
    const canEdit = await verifyEditAccess(supabase, projectId, userId);
    if (!canEdit) {
      return createError('FORBIDDEN', 'You do not have permission to delete this track');
    }

    // TODO: PostHog.capture('daw_track_delete', {
    //   user_id: userId,
    //   project_id: projectId,
    //   track_id: trackId,
    // });

    const { error } = await supabase
      .from('daw_tracks')
      .delete()
      .eq('id', trackId)
      .eq('project_id', projectId);

    if (error) {
      // TODO: Sentry.captureException(error, {
      //   tags: { operation: 'deleteTrack' },
      //   extra: { userId, projectId, trackId },
      // });

      console.error('[TrackService] deleteTrack error:', error);
      return createError('DB_ERROR', 'Failed to delete track', error.message);
    }

    return { data: { deleted: true } };
  } catch (err) {
    // TODO: Sentry.captureException(err);
    console.error('[TrackService] deleteTrack exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Reorders tracks within a project.
 * Updates position values based on the order of track IDs provided.
 */
export async function reorderTracks(
  deps: TrackServiceDeps,
  projectId: string,
  input: ReorderTracksInput
): Promise<ApiResponse<TrackListItem[]> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // Verify edit access
    const canEdit = await verifyEditAccess(supabase, projectId, userId);
    if (!canEdit) {
      return createError('FORBIDDEN', 'You do not have permission to reorder tracks in this project');
    }

    // Verify all track IDs belong to this project
    const { data: existingTracks, error: fetchError } = await supabase
      .from('daw_tracks')
      .select('id')
      .eq('project_id', projectId);

    if (fetchError) {
      console.error('[TrackService] reorderTracks fetch error:', fetchError);
      return createError('DB_ERROR', 'Failed to fetch tracks', fetchError.message);
    }

    const existingIds = new Set((existingTracks ?? []).map(t => t.id));
    const invalidIds = input.trackIds.filter(id => !existingIds.has(id));

    if (invalidIds.length > 0) {
      return createError('BAD_REQUEST', 'Some track IDs do not belong to this project', { invalidIds });
    }

    // TODO: PostHog.capture('daw_tracks_reorder', {
    //   user_id: userId,
    //   project_id: projectId,
    //   track_count: input.trackIds.length,
    // });

    // Update positions in a transaction-like manner
    // Note: Supabase doesn't support true transactions via JS client,
    // so we update sequentially. For production, consider an RPC function.
    for (let i = 0; i < input.trackIds.length; i++) {
      const { error: updateError } = await supabase
        .from('daw_tracks')
        .update({ position: i, updated_at: new Date().toISOString() })
        .eq('id', input.trackIds[i])
        .eq('project_id', projectId);

      if (updateError) {
        // TODO: Sentry.captureException(updateError, {
        //   tags: { operation: 'reorderTracks' },
        //   extra: { userId, projectId, trackId: input.trackIds[i], position: i },
        // });

        console.error('[TrackService] reorderTracks update error:', updateError);
        return createError('DB_ERROR', 'Failed to reorder tracks', updateError.message);
      }
    }

    // Fetch and return updated track list
    const { data: tracks, error: listError } = await supabase
      .from('daw_tracks')
      .select('id, project_id, name, type, position, color, volume, pan, mute, solo, armed')
      .eq('project_id', projectId)
      .order('position', { ascending: true });

    if (listError) {
      console.error('[TrackService] reorderTracks list error:', listError);
      return createError('DB_ERROR', 'Failed to fetch reordered tracks', listError.message);
    }

    return { data: (tracks ?? []) as TrackListItem[] };
  } catch (err) {
    // TODO: Sentry.captureException(err);
    console.error('[TrackService] reorderTracks exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

export default {
  listTracks,
  getTrack,
  createTrack,
  updateTrack,
  deleteTrack,
  reorderTracks,
};
