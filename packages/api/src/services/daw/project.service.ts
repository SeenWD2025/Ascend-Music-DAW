/**
 * DAW Project Service
 * Business logic for project CRUD operations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiError, ApiResponse } from '@amg/shared';
import type {
  CreateProjectInput,
  UpdateProjectInput,
  ListProjectsQuery,
  ProjectResponse,
  ProjectListItem,
} from '../../schemas/daw/project.schema.js';

// ============================================================================
// Types
// ============================================================================

export interface ProjectServiceDeps {
  supabase: SupabaseClient;
  userId: string;
}

export interface ProjectListResult {
  projects: ProjectListItem[];
  total: number;
  page: number;
  limit: number;
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
// Service Functions
// ============================================================================

/**
 * Lists projects owned by or shared with the user.
 */
export async function listProjects(
  deps: ProjectServiceDeps,
  query: ListProjectsQuery
): Promise<ApiResponse<ProjectListResult> | ApiError> {
  const { supabase, userId } = deps;
  const { page, limit, status, search, sort_by, sort_order } = query;
  const offset = (page - 1) * limit;

  try {
    // TODO: PostHog.capture('daw_projects_list', {
    //   user_id: userId,
    //   filters: { status, search },
    // });

    // Build the query for user's own projects
    let projectQuery = supabase
      .from('daw_projects')
      .select('*, daw_tracks(count), daw_collaborators(count)', { count: 'exact' })
      .or(`owner_id.eq.${userId},daw_collaborators.user_id.eq.${userId}`)
      .order(sort_by, { ascending: sort_order === 'asc' })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status) {
      projectQuery = projectQuery.eq('status', status);
    }

    if (search) {
      projectQuery = projectQuery.ilike('name', `%${search}%`);
    }

    const { data: projects, error, count } = await projectQuery;

    if (error) {
      // TODO: Sentry.captureException(error, {
      //   tags: { operation: 'listProjects' },
      //   extra: { userId, query },
      // });
      
      console.error('[ProjectService] listProjects error:', error);
      return createError('DB_ERROR', 'Failed to fetch projects', error.message);
    }

    // Transform response - type the project from Supabase
    interface ProjectRow {
      id: string;
      owner_id: string;
      name: string;
      description: string | null;
      bpm: number;
      time_signature: string;
      sample_rate: number;
      bit_depth: number;
      status: string;
      created_at: string;
      updated_at: string;
      daw_tracks?: Array<{ count: number }>;
      daw_collaborators?: Array<{ count: number }>;
    }

    const projectList: ProjectListItem[] = ((projects ?? []) as ProjectRow[]).map((p) => ({
      id: p.id,
      owner_id: p.owner_id,
      name: p.name,
      description: p.description,
      bpm: p.bpm,
      time_signature: p.time_signature,
      sample_rate: p.sample_rate,
      bit_depth: p.bit_depth,
      status: p.status as 'draft' | 'active' | 'archived',
      created_at: p.created_at,
      updated_at: p.updated_at,
      track_count: p.daw_tracks?.[0]?.count ?? 0,
      collaborator_count: p.daw_collaborators?.[0]?.count ?? 0,
    }));

    return {
      data: {
        projects: projectList,
        total: count ?? 0,
        page,
        limit,
      },
      meta: {
        page,
        limit,
        total: count ?? 0,
      },
    };
  } catch (err) {
    // TODO: Sentry.captureException(err, {
    //   tags: { operation: 'listProjects' },
    // });
    
    console.error('[ProjectService] listProjects exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Gets a single project by ID.
 */
export async function getProject(
  deps: ProjectServiceDeps,
  projectId: string
): Promise<ApiResponse<ProjectResponse> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // TODO: PostHog.capture('daw_project_view', {
    //   user_id: userId,
    //   project_id: projectId,
    // });

    const { data: project, error } = await supabase
      .from('daw_projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return createError('NOT_FOUND', 'Project not found');
      }
      
      // TODO: Sentry.captureException(error, {
      //   tags: { operation: 'getProject' },
      //   extra: { userId, projectId },
      // });
      
      console.error('[ProjectService] getProject error:', error);
      return createError('DB_ERROR', 'Failed to fetch project', error.message);
    }

    // RLS should handle access control, but double-check ownership or collaboration
    // This is defense-in-depth
    const hasAccess = project.owner_id === userId || await checkCollaboratorAccess(supabase, projectId, userId);
    
    if (!hasAccess) {
      return createError('FORBIDDEN', 'You do not have access to this project');
    }

    return { data: project as ProjectResponse };
  } catch (err) {
    // TODO: Sentry.captureException(err);
    console.error('[ProjectService] getProject exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Creates a new project.
 */
export async function createProject(
  deps: ProjectServiceDeps,
  input: CreateProjectInput
): Promise<ApiResponse<ProjectResponse> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // TODO: PostHog.capture('daw_project_create', {
    //   user_id: userId,
    //   project_settings: {
    //     bpm: input.bpm,
    //     sample_rate: input.sample_rate,
    //     bit_depth: input.bit_depth,
    //   },
    // });

    const { data: project, error } = await supabase
      .from('daw_projects')
      .insert({
        owner_id: userId,
        name: input.name,
        description: input.description ?? null,
        bpm: input.bpm,
        time_signature: input.time_signature,
        sample_rate: input.sample_rate,
        bit_depth: input.bit_depth,
        status: 'draft',
      })
      .select()
      .single();

    if (error) {
      // TODO: Sentry.captureException(error, {
      //   tags: { operation: 'createProject' },
      //   extra: { userId, input },
      // });
      
      console.error('[ProjectService] createProject error:', error);
      return createError('DB_ERROR', 'Failed to create project', error.message);
    }

    return { data: project as ProjectResponse };
  } catch (err) {
    // TODO: Sentry.captureException(err);
    console.error('[ProjectService] createProject exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Updates an existing project.
 */
export async function updateProject(
  deps: ProjectServiceDeps,
  projectId: string,
  input: UpdateProjectInput
): Promise<ApiResponse<ProjectResponse> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // Check if user can edit this project
    const canEdit = await checkEditAccess(supabase, projectId, userId);
    if (!canEdit) {
      return createError('FORBIDDEN', 'You do not have permission to edit this project');
    }

    // TODO: PostHog.capture('daw_project_update', {
    //   user_id: userId,
    //   project_id: projectId,
    //   changed_fields: Object.keys(input),
    // });

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.bpm !== undefined) updateData.bpm = input.bpm;
    if (input.time_signature !== undefined) updateData.time_signature = input.time_signature;
    if (input.sample_rate !== undefined) updateData.sample_rate = input.sample_rate;
    if (input.bit_depth !== undefined) updateData.bit_depth = input.bit_depth;
    if (input.status !== undefined) updateData.status = input.status;

    // Always update updated_at
    updateData.updated_at = new Date().toISOString();

    const { data: project, error } = await supabase
      .from('daw_projects')
      .update(updateData)
      .eq('id', projectId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return createError('NOT_FOUND', 'Project not found');
      }
      
      // TODO: Sentry.captureException(error, {
      //   tags: { operation: 'updateProject' },
      //   extra: { userId, projectId, input },
      // });
      
      console.error('[ProjectService] updateProject error:', error);
      return createError('DB_ERROR', 'Failed to update project', error.message);
    }

    return { data: project as ProjectResponse };
  } catch (err) {
    // TODO: Sentry.captureException(err);
    console.error('[ProjectService] updateProject exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Deletes a project (soft delete by setting status to archived).
 */
export async function deleteProject(
  deps: ProjectServiceDeps,
  projectId: string
): Promise<ApiResponse<{ deleted: boolean }> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // Only owner can delete
    const { data: project, error: fetchError } = await supabase
      .from('daw_projects')
      .select('owner_id')
      .eq('id', projectId)
      .single();

    if (fetchError || !project) {
      return createError('NOT_FOUND', 'Project not found');
    }

    if (project.owner_id !== userId) {
      return createError('FORBIDDEN', 'Only the project owner can delete it');
    }

    // TODO: PostHog.capture('daw_project_delete', {
    //   user_id: userId,
    //   project_id: projectId,
    // });

    // Soft delete - set status to archived
    const { error } = await supabase
      .from('daw_projects')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', projectId);

    if (error) {
      // TODO: Sentry.captureException(error, {
      //   tags: { operation: 'deleteProject' },
      // });
      
      console.error('[ProjectService] deleteProject error:', error);
      return createError('DB_ERROR', 'Failed to delete project', error.message);
    }

    return { data: { deleted: true } };
  } catch (err) {
    // TODO: Sentry.captureException(err);
    console.error('[ProjectService] deleteProject exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Checks if a user is a collaborator on a project.
 */
async function checkCollaboratorAccess(
  supabase: SupabaseClient,
  projectId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('daw_collaborators')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  return !error && data !== null;
}

/**
 * Checks if a user can edit a project (owner or editor/admin collaborator).
 */
async function checkEditAccess(
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

export default {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
};
