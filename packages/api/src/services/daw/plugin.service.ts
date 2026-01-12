/**
 * DAW Plugin Service
 * Business logic for plugin CRUD operations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiError, ApiResponse } from '@amg/shared';
import * as Sentry from '@sentry/node';
import type {
  CreatePluginInput,
  UpdatePluginInput,
  ReorderPluginsInput,
  PluginResponse,
  PluginListItem,
} from '../../schemas/daw/plugin.schema.js';

// ============================================================================
// Types
// ============================================================================

export interface PluginServiceDeps {
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
 * Gets the project ID for a track and verifies it exists.
 */
async function getTrackProjectId(
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
 * Gets the project ID for a plugin (via track) and verifies it exists.
 */
async function getPluginProjectId(
  supabase: SupabaseClient,
  pluginId: string
): Promise<{ projectId: string | null; trackId: string | null }> {
  const { data: plugin } = await supabase
    .from('daw_plugins')
    .select('track_id')
    .eq('id', pluginId)
    .single();

  if (!plugin?.track_id) {
    return { projectId: null, trackId: null };
  }

  const projectId = await getTrackProjectId(supabase, plugin.track_id);
  return { projectId, trackId: plugin.track_id };
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
 * Verifies user has access to a project (owner or active collaborator).
 */
async function verifyProjectAccess(
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

  if (!project) {
    return false;
  }

  if (project.owner_id === userId) {
    return true;
  }

  // Check if active collaborator
  const { data: collab } = await supabase
    .from('daw_collaborators')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  return collab !== null;
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Creates a new plugin on a track.
 */
export async function createPlugin(
  deps: PluginServiceDeps,
  trackId: string,
  input: CreatePluginInput
): Promise<ApiResponse<PluginResponse> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // Get project ID from track
    const projectId = await getTrackProjectId(supabase, trackId);
    if (!projectId) {
      return createError('NOT_FOUND', 'Track not found');
    }

    // Verify edit access
    const canEdit = await verifyEditAccess(supabase, projectId, userId);
    if (!canEdit) {
      return createError('FORBIDDEN', 'You do not have permission to add plugins to this track');
    }

    // Get next position if not specified
    let position = input.position;
    if (position === undefined) {
      const { data: existingPlugins } = await supabase
        .from('daw_plugins')
        .select('position')
        .eq('track_id', trackId)
        .order('position', { ascending: false })
        .limit(1);

      position = existingPlugins && existingPlugins.length > 0
        ? existingPlugins[0].position + 1
        : 0;
    }

    // Create the plugin
    const { data: plugin, error } = await supabase
      .from('daw_plugins')
      .insert({
        track_id: trackId,
        wam_id: input.wam_id,
        name: input.name,
        wam_version: input.wam_version,
        position,
        state: input.state ?? {},
        bypass: input.bypass ?? false,
      })
      .select()
      .single();

    if (error) {
      Sentry.captureException(error, {
        tags: { operation: 'createPlugin' },
        extra: { userId, trackId, projectId, input },
      });

      console.error('[PluginService] createPlugin error:', error);
      return createError('DB_ERROR', 'Failed to create plugin', error.message);
    }

    // TODO: PostHog.capture('plugin.created', {
    //   user_id: userId,
    //   project_id: projectId,
    //   track_id: trackId,
    //   plugin_id: plugin.id,
    //   wam_id: input.wam_id,
    //   wam_version: input.wam_version,
    // });

    return { data: plugin as PluginResponse };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { operation: 'createPlugin' },
      extra: { userId, trackId },
    });

    console.error('[PluginService] createPlugin exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Lists all plugins for a track in position order.
 */
export async function getPlugins(
  deps: PluginServiceDeps,
  trackId: string
): Promise<ApiResponse<PluginListItem[]> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // Get project ID from track
    const projectId = await getTrackProjectId(supabase, trackId);
    if (!projectId) {
      return createError('NOT_FOUND', 'Track not found');
    }

    // Verify project access
    const hasAccess = await verifyProjectAccess(supabase, projectId, userId);
    if (!hasAccess) {
      return createError('FORBIDDEN', 'You do not have access to this track');
    }

    const { data: plugins, error } = await supabase
      .from('daw_plugins')
      .select('id, track_id, wam_id, name, wam_version, position, state, bypass')
      .eq('track_id', trackId)
      .order('position', { ascending: true });

    if (error) {
      Sentry.captureException(error, {
        tags: { operation: 'getPlugins' },
        extra: { userId, trackId },
      });

      console.error('[PluginService] getPlugins error:', error);
      return createError('DB_ERROR', 'Failed to fetch plugins', error.message);
    }

    return { data: (plugins ?? []) as PluginListItem[] };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { operation: 'getPlugins' },
    });

    console.error('[PluginService] getPlugins exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Gets a single plugin by ID.
 */
export async function getPlugin(
  deps: PluginServiceDeps,
  pluginId: string
): Promise<ApiResponse<PluginResponse> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // Get project ID for access check
    const { projectId } = await getPluginProjectId(supabase, pluginId);
    if (!projectId) {
      return createError('NOT_FOUND', 'Plugin not found');
    }

    // Verify project access
    const hasAccess = await verifyProjectAccess(supabase, projectId, userId);
    if (!hasAccess) {
      return createError('FORBIDDEN', 'You do not have access to this plugin');
    }

    const { data: plugin, error } = await supabase
      .from('daw_plugins')
      .select('*')
      .eq('id', pluginId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return createError('NOT_FOUND', 'Plugin not found');
      }

      Sentry.captureException(error, {
        tags: { operation: 'getPlugin' },
        extra: { userId, pluginId },
      });

      console.error('[PluginService] getPlugin error:', error);
      return createError('DB_ERROR', 'Failed to fetch plugin', error.message);
    }

    return { data: plugin as PluginResponse };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { operation: 'getPlugin' },
    });

    console.error('[PluginService] getPlugin exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Updates an existing plugin.
 */
export async function updatePlugin(
  deps: PluginServiceDeps,
  pluginId: string,
  input: UpdatePluginInput
): Promise<ApiResponse<PluginResponse> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // Get project ID for access check
    const { projectId, trackId } = await getPluginProjectId(supabase, pluginId);
    if (!projectId) {
      return createError('NOT_FOUND', 'Plugin not found');
    }

    // Verify edit access
    const canEdit = await verifyEditAccess(supabase, projectId, userId);
    if (!canEdit) {
      return createError('FORBIDDEN', 'You do not have permission to edit this plugin');
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};
    if (input.state !== undefined) updateData.state = input.state;
    if (input.bypass !== undefined) updateData.bypass = input.bypass;
    if (input.position !== undefined) updateData.position = input.position;
    if (input.name !== undefined) updateData.name = input.name;

    // Always update updated_at
    updateData.updated_at = new Date().toISOString();

    const { data: plugin, error } = await supabase
      .from('daw_plugins')
      .update(updateData)
      .eq('id', pluginId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return createError('NOT_FOUND', 'Plugin not found');
      }

      Sentry.captureException(error, {
        tags: { operation: 'updatePlugin' },
        extra: { userId, pluginId, input },
      });

      console.error('[PluginService] updatePlugin error:', error);
      return createError('DB_ERROR', 'Failed to update plugin', error.message);
    }

    // TODO: PostHog.capture('plugin.updated', {
    //   user_id: userId,
    //   project_id: projectId,
    //   track_id: trackId,
    //   plugin_id: pluginId,
    //   changed_fields: Object.keys(input),
    // });

    return { data: plugin as PluginResponse };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { operation: 'updatePlugin' },
    });

    console.error('[PluginService] updatePlugin exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Deletes a plugin from a track.
 */
export async function deletePlugin(
  deps: PluginServiceDeps,
  pluginId: string
): Promise<ApiResponse<{ deleted: boolean }> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // Get project ID for access check
    const { projectId, trackId } = await getPluginProjectId(supabase, pluginId);
    if (!projectId) {
      return createError('NOT_FOUND', 'Plugin not found');
    }

    // Verify edit access
    const canEdit = await verifyEditAccess(supabase, projectId, userId);
    if (!canEdit) {
      return createError('FORBIDDEN', 'You do not have permission to delete this plugin');
    }

    // Get plugin info before delete for telemetry
    const { data: pluginInfo } = await supabase
      .from('daw_plugins')
      .select('wam_id')
      .eq('id', pluginId)
      .single();

    const { error } = await supabase
      .from('daw_plugins')
      .delete()
      .eq('id', pluginId);

    if (error) {
      Sentry.captureException(error, {
        tags: { operation: 'deletePlugin' },
        extra: { userId, pluginId },
      });

      console.error('[PluginService] deletePlugin error:', error);
      return createError('DB_ERROR', 'Failed to delete plugin', error.message);
    }

    // TODO: PostHog.capture('plugin.deleted', {
    //   user_id: userId,
    //   project_id: projectId,
    //   track_id: trackId,
    //   plugin_id: pluginId,
    //   wam_id: pluginInfo?.wam_id,
    // });

    return { data: { deleted: true } };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { operation: 'deletePlugin' },
    });

    console.error('[PluginService] deletePlugin exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Reorders plugins within a track's effect chain.
 * Updates position values based on the order of plugin IDs provided.
 */
export async function reorderPlugins(
  deps: PluginServiceDeps,
  trackId: string,
  input: ReorderPluginsInput
): Promise<ApiResponse<PluginListItem[]> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // Get project ID from track
    const projectId = await getTrackProjectId(supabase, trackId);
    if (!projectId) {
      return createError('NOT_FOUND', 'Track not found');
    }

    // Verify edit access
    const canEdit = await verifyEditAccess(supabase, projectId, userId);
    if (!canEdit) {
      return createError('FORBIDDEN', 'You do not have permission to reorder plugins on this track');
    }

    // Verify all plugin IDs belong to this track
    const { data: existingPlugins, error: fetchError } = await supabase
      .from('daw_plugins')
      .select('id')
      .eq('track_id', trackId);

    if (fetchError) {
      console.error('[PluginService] reorderPlugins fetch error:', fetchError);
      return createError('DB_ERROR', 'Failed to fetch plugins', fetchError.message);
    }

    const existingIds = new Set((existingPlugins ?? []).map(p => p.id));
    const invalidIds = input.pluginOrder.filter(id => !existingIds.has(id));

    if (invalidIds.length > 0) {
      return createError('BAD_REQUEST', 'Some plugin IDs do not belong to this track', { invalidIds });
    }

    // Update positions sequentially
    // Note: Supabase doesn't support true transactions via JS client,
    // so we update sequentially. For production, consider an RPC function.
    for (let i = 0; i < input.pluginOrder.length; i++) {
      const { error: updateError } = await supabase
        .from('daw_plugins')
        .update({ position: i, updated_at: new Date().toISOString() })
        .eq('id', input.pluginOrder[i])
        .eq('track_id', trackId);

      if (updateError) {
        Sentry.captureException(updateError, {
          tags: { operation: 'reorderPlugins' },
          extra: { userId, trackId, pluginId: input.pluginOrder[i], position: i },
        });

        console.error('[PluginService] reorderPlugins update error:', updateError);
        return createError('DB_ERROR', 'Failed to reorder plugins', updateError.message);
      }
    }

    // TODO: PostHog.capture('plugin.reordered', {
    //   user_id: userId,
    //   project_id: projectId,
    //   track_id: trackId,
    //   plugin_count: input.pluginOrder.length,
    // });

    // Fetch and return updated plugin list
    const { data: plugins, error: listError } = await supabase
      .from('daw_plugins')
      .select('id, track_id, wam_id, name, wam_version, position, state, bypass')
      .eq('track_id', trackId)
      .order('position', { ascending: true });

    if (listError) {
      console.error('[PluginService] reorderPlugins list error:', listError);
      return createError('DB_ERROR', 'Failed to fetch reordered plugins', listError.message);
    }

    return { data: (plugins ?? []) as PluginListItem[] };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { operation: 'reorderPlugins' },
    });

    console.error('[PluginService] reorderPlugins exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

export default {
  createPlugin,
  getPlugins,
  getPlugin,
  updatePlugin,
  deletePlugin,
  reorderPlugins,
};
