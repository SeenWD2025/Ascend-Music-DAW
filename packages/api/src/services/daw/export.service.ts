/**
 * DAW Export Service
 * Business logic for export job management.
 * 
 * State machine: pending -> processing -> completed/failed
 * Concurrency limit: Max 3 active exports per user
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/node';
import type { ApiError, ApiResponse } from '@amg/shared';
import type {
  CreateExportInput,
  ExportResponse,
  ExportListItem,
  ListExportsQuery,
  ExportStatus,
  DbExportStatus,
} from '../../schemas/daw/export.schema.js';
import { mapDbStatusToApi, mapApiStatusToDb } from '../../schemas/daw/export.schema.js';

// ============================================================================
// Configuration
// ============================================================================

/** Maximum number of concurrent exports per user */
export const MAX_CONCURRENT_EXPORTS = 3;

/** Active statuses that count toward the concurrent limit */
const ACTIVE_STATUSES: DbExportStatus[] = ['queued', 'processing'];

// ============================================================================
// Types
// ============================================================================

export interface ExportServiceDeps {
  supabase: SupabaseClient;
  userId: string;
}

export interface ExportListResult {
  exports: ExportListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface UpdateExportStatusInput {
  status: ExportStatus;
  r2_url?: string;
  r2_key?: string;
  error_message?: string;
  file_size_bytes?: number;
  duration_seconds?: number;
}

// ============================================================================
// Error Types
// ============================================================================

export class TooManyExportsError extends Error {
  public readonly code = 'TOO_MANY_EXPORTS';
  public readonly statusCode = 429;
  
  constructor(message = 'Maximum concurrent exports reached') {
    super(message);
    this.name = 'TooManyExportsError';
  }
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
// Database Row Types
// ============================================================================

interface ExportRow {
  id: string;
  project_id: string;
  user_id: string;
  owner_id: string | null;
  idempotency_key: string;
  format: 'wav' | 'mp3' | 'flac';
  quality_settings: Record<string, unknown> | null;
  status: DbExportStatus;
  r2_url: string | null;
  r2_key: string | null;
  error_message: string | null;
  file_size_bytes: number | null;
  duration_seconds: number | null;
  started_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Mappers
// ============================================================================

function mapRowToResponse(row: ExportRow): ExportResponse {
  return {
    id: row.id,
    project_id: row.project_id,
    owner_id: row.owner_id ?? row.user_id,
    idempotency_key: row.idempotency_key,
    format: row.format,
    quality_settings: row.quality_settings as ExportResponse['quality_settings'],
    status: mapDbStatusToApi(row.status),
    r2_url: row.r2_url,
    error_message: row.error_message,
    file_size_bytes: row.file_size_bytes,
    duration_seconds: row.duration_seconds,
    started_at: row.started_at,
    completed_at: row.completed_at,
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapRowToListItem(row: ExportRow): ExportListItem {
  return {
    id: row.id,
    project_id: row.project_id,
    format: row.format,
    status: mapDbStatusToApi(row.status),
    r2_url: row.r2_url,
    file_size_bytes: row.file_size_bytes,
    duration_seconds: row.duration_seconds,
    created_at: row.created_at,
    completed_at: row.completed_at,
  };
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Get the count of active (pending/processing) exports for a user.
 */
async function getActiveExportCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('daw_exports')
    .select('*', { count: 'exact', head: true })
    .or(`owner_id.eq.${userId},user_id.eq.${userId}`)
    .in('status', ACTIVE_STATUSES);

  if (error) {
    Sentry.captureException(error, {
      tags: { operation: 'getActiveExportCount' },
      extra: { userId },
    });
    throw error;
  }

  return count ?? 0;
}

/**
 * Check if user can access the project (owner or collaborator).
 */
async function verifyProjectAccess(
  supabase: SupabaseClient,
  projectId: string,
  userId: string
): Promise<{ hasAccess: boolean; isOwner: boolean }> {
  // Check if user is the project owner
  const { data: project, error: projectError } = await supabase
    .from('daw_projects')
    .select('id, owner_id')
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    return { hasAccess: false, isOwner: false };
  }

  if (project.owner_id === userId) {
    return { hasAccess: true, isOwner: true };
  }

  // Check if user is a collaborator
  const { data: collaborator, error: collabError } = await supabase
    .from('daw_collaborators')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (collabError || !collaborator) {
    return { hasAccess: false, isOwner: false };
  }

  return { hasAccess: true, isOwner: false };
}

/**
 * Enqueue a new export job.
 * 
 * - Checks idempotency: returns existing export if same idempotency_key exists
 * - Enforces concurrency limit: max 3 active exports per user
 * - Emits PostHog event: export.enqueued
 */
export async function enqueueExport(
  deps: ExportServiceDeps,
  projectId: string,
  data: CreateExportInput
): Promise<ApiResponse<ExportResponse> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // 1. Verify project access
    const access = await verifyProjectAccess(supabase, projectId, userId);
    if (!access.hasAccess) {
      return createError('FORBIDDEN', 'You do not have access to this project');
    }

    // 2. Check idempotency - return existing export if key already used
    const { data: existingExport, error: idempotencyError } = await supabase
      .from('daw_exports')
      .select('*')
      .eq('project_id', projectId)
      .eq('idempotency_key', data.idempotency_key)
      .single();

    if (existingExport && !idempotencyError) {
      // Return existing export (idempotent response)
      // TODO: PostHog.capture('export.idempotent_hit', {
      //   user_id: userId,
      //   project_id: projectId,
      //   export_id: existingExport.id,
      // });
      
      return {
        data: mapRowToResponse(existingExport as ExportRow),
      };
    }

    // 3. Check concurrent export limit
    const activeCount = await getActiveExportCount(supabase, userId);
    if (activeCount >= MAX_CONCURRENT_EXPORTS) {
      Sentry.addBreadcrumb({
        category: 'export',
        message: 'Concurrent export limit reached',
        level: 'warning',
        data: { userId, activeCount, limit: MAX_CONCURRENT_EXPORTS },
      });

      // TODO: PostHog.capture('export.limit_exceeded', {
      //   user_id: userId,
      //   active_count: activeCount,
      //   limit: MAX_CONCURRENT_EXPORTS,
      // });

      return createError(
        'TOO_MANY_EXPORTS',
        `Maximum concurrent exports (${MAX_CONCURRENT_EXPORTS}) reached. Please wait for existing exports to complete.`
      );
    }

    // 4. Create the export job
    const insertData = {
      project_id: projectId,
      user_id: userId,
      owner_id: userId,
      idempotency_key: data.idempotency_key,
      format: data.format,
      quality_settings: data.quality ?? {},
      status: 'queued' as const,
    };

    const { data: newExport, error: insertError } = await supabase
      .from('daw_exports')
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      // Handle unique constraint violation (race condition on idempotency_key)
      if (insertError.code === '23505') {
        // Retry fetch for idempotent response
        const { data: raceExport } = await supabase
          .from('daw_exports')
          .select('*')
          .eq('project_id', projectId)
          .eq('idempotency_key', data.idempotency_key)
          .single();

        if (raceExport) {
          return {
            data: mapRowToResponse(raceExport as ExportRow),
          };
        }
      }

      Sentry.captureException(insertError, {
        tags: { operation: 'enqueueExport' },
        extra: { userId, projectId, format: data.format },
      });

      console.error('[ExportService] enqueueExport error:', insertError);
      return createError('DB_ERROR', 'Failed to create export job', insertError.message);
    }

    // TODO: PostHog.capture('export.enqueued', {
    //   user_id: userId,
    //   project_id: projectId,
    //   export_id: newExport.id,
    //   format: data.format,
    //   quality: data.quality,
    // });

    Sentry.addBreadcrumb({
      category: 'export',
      message: 'Export job enqueued',
      level: 'info',
      data: {
        exportId: newExport.id,
        projectId,
        format: data.format,
      },
    });

    return {
      data: mapRowToResponse(newExport as ExportRow),
    };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { operation: 'enqueueExport' },
      extra: { userId, projectId },
    });

    console.error('[ExportService] enqueueExport exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Get a single export by ID.
 */
export async function getExport(
  deps: ExportServiceDeps,
  exportId: string
): Promise<ApiResponse<ExportResponse> | ApiError> {
  const { supabase, userId } = deps;

  try {
    const { data: exportData, error } = await supabase
      .from('daw_exports')
      .select('*')
      .eq('id', exportId)
      .single();

    if (error || !exportData) {
      if (error?.code === 'PGRST116') {
        return createError('NOT_FOUND', 'Export not found');
      }

      Sentry.captureException(error, {
        tags: { operation: 'getExport' },
        extra: { userId, exportId },
      });

      console.error('[ExportService] getExport error:', error);
      return createError('DB_ERROR', 'Failed to fetch export', error?.message);
    }

    const row = exportData as ExportRow;

    // Verify ownership
    if (row.owner_id !== userId && row.user_id !== userId) {
      return createError('FORBIDDEN', 'You do not have access to this export');
    }

    return {
      data: mapRowToResponse(row),
    };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { operation: 'getExport' },
      extra: { userId, exportId },
    });

    console.error('[ExportService] getExport exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * List exports for a project.
 */
export async function listExports(
  deps: ExportServiceDeps,
  projectId: string,
  query: ListExportsQuery
): Promise<ApiResponse<ExportListResult> | ApiError> {
  const { supabase, userId } = deps;
  const { page, limit, status } = query;
  const offset = (page - 1) * limit;

  try {
    // Verify project access
    const access = await verifyProjectAccess(supabase, projectId, userId);
    if (!access.hasAccess) {
      return createError('FORBIDDEN', 'You do not have access to this project');
    }

    // Build query
    let exportsQuery = supabase
      .from('daw_exports')
      .select('*', { count: 'exact' })
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by status if provided
    if (status) {
      const dbStatus = mapApiStatusToDb(status);
      exportsQuery = exportsQuery.eq('status', dbStatus);
    }

    const { data: exports, error, count } = await exportsQuery;

    if (error) {
      Sentry.captureException(error, {
        tags: { operation: 'listExports' },
        extra: { userId, projectId, query },
      });

      console.error('[ExportService] listExports error:', error);
      return createError('DB_ERROR', 'Failed to fetch exports', error.message);
    }

    const exportList = ((exports ?? []) as ExportRow[]).map(mapRowToListItem);

    return {
      data: {
        exports: exportList,
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
    Sentry.captureException(err, {
      tags: { operation: 'listExports' },
      extra: { userId, projectId },
    });

    console.error('[ExportService] listExports exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Update export status (for worker use).
 * 
 * This should be called with service_role credentials by the export worker.
 * State transitions:
 * - pending -> processing (export.started)
 * - processing -> completed (export.completed)
 * - processing -> failed (export.failed)
 */
export async function updateExportStatus(
  supabase: SupabaseClient,
  exportId: string,
  input: UpdateExportStatusInput
): Promise<ApiResponse<ExportResponse> | ApiError> {
  try {
    const dbStatus = mapApiStatusToDb(input.status);

    const updateData: Record<string, unknown> = {
      status: dbStatus,
    };

    // Set timestamps based on status transition
    if (input.status === 'processing') {
      updateData.started_at = new Date().toISOString();
    }

    if (input.status === 'completed' || input.status === 'failed') {
      updateData.completed_at = new Date().toISOString();
    }

    // Set optional fields
    if (input.r2_url !== undefined) {
      updateData.r2_url = input.r2_url;
    }

    if (input.r2_key !== undefined) {
      updateData.r2_key = input.r2_key;
    }

    if (input.error_message !== undefined) {
      updateData.error_message = input.error_message;
    }

    if (input.file_size_bytes !== undefined) {
      updateData.file_size_bytes = input.file_size_bytes;
    }

    if (input.duration_seconds !== undefined) {
      updateData.duration_seconds = input.duration_seconds;
    }

    // Set expiration for completed exports (24 hours)
    if (input.status === 'completed') {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);
      updateData.expires_at = expiresAt.toISOString();
    }

    const { data: updatedExport, error } = await supabase
      .from('daw_exports')
      .update(updateData)
      .eq('id', exportId)
      .select()
      .single();

    if (error) {
      Sentry.captureException(error, {
        tags: { operation: 'updateExportStatus' },
        extra: { exportId, status: input.status },
      });

      console.error('[ExportService] updateExportStatus error:', error);
      return createError('DB_ERROR', 'Failed to update export status', error.message);
    }

    if (!updatedExport) {
      return createError('NOT_FOUND', 'Export not found');
    }

    const row = updatedExport as ExportRow;

    // Emit PostHog events based on status
    // TODO: switch (input.status) {
    //   case 'processing':
    //     PostHog.capture('export.started', {
    //       export_id: exportId,
    //       project_id: row.project_id,
    //     });
    //     break;
    //   case 'completed':
    //     PostHog.capture('export.completed', {
    //       export_id: exportId,
    //       project_id: row.project_id,
    //       file_size_bytes: input.file_size_bytes,
    //       duration_seconds: input.duration_seconds,
    //     });
    //     break;
    //   case 'failed':
    //     PostHog.capture('export.failed', {
    //       export_id: exportId,
    //       project_id: row.project_id,
    //       error_message: input.error_message,
    //     });
    //     break;
    // }

    Sentry.addBreadcrumb({
      category: 'export',
      message: `Export status updated to ${input.status}`,
      level: 'info',
      data: { exportId, status: input.status },
    });

    return {
      data: mapRowToResponse(row),
    };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { operation: 'updateExportStatus' },
      extra: { exportId },
    });

    console.error('[ExportService] updateExportStatus exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Delete/cancel an export.
 * 
 * - Only the owner can delete their exports
 * - Pending/processing exports can be cancelled
 * - Completed exports trigger R2 cleanup (TODO: implement cleanup worker)
 */
export async function deleteExport(
  deps: ExportServiceDeps,
  exportId: string
): Promise<ApiResponse<{ deleted: boolean }> | ApiError> {
  const { supabase, userId } = deps;

  try {
    // First, fetch the export to verify ownership and get details for cleanup
    const { data: exportData, error: fetchError } = await supabase
      .from('daw_exports')
      .select('*')
      .eq('id', exportId)
      .single();

    if (fetchError || !exportData) {
      if (fetchError?.code === 'PGRST116') {
        return createError('NOT_FOUND', 'Export not found');
      }

      Sentry.captureException(fetchError, {
        tags: { operation: 'deleteExport' },
        extra: { userId, exportId },
      });

      console.error('[ExportService] deleteExport fetch error:', fetchError);
      return createError('DB_ERROR', 'Failed to fetch export', fetchError?.message);
    }

    const row = exportData as ExportRow;

    // Verify ownership
    if (row.owner_id !== userId && row.user_id !== userId) {
      return createError('FORBIDDEN', 'You do not have access to this export');
    }

    // TODO: If export has R2 file, queue cleanup job
    // if (row.r2_key) {
    //   await queueR2Cleanup(row.r2_key);
    // }

    // Delete the export
    const { error: deleteError } = await supabase
      .from('daw_exports')
      .delete()
      .eq('id', exportId);

    if (deleteError) {
      Sentry.captureException(deleteError, {
        tags: { operation: 'deleteExport' },
        extra: { userId, exportId },
      });

      console.error('[ExportService] deleteExport error:', deleteError);
      return createError('DB_ERROR', 'Failed to delete export', deleteError.message);
    }

    // TODO: PostHog.capture('export.deleted', {
    //   user_id: userId,
    //   export_id: exportId,
    //   project_id: row.project_id,
    //   was_completed: row.status === 'complete',
    // });

    Sentry.addBreadcrumb({
      category: 'export',
      message: 'Export deleted',
      level: 'info',
      data: { exportId, projectId: row.project_id },
    });

    return {
      data: { deleted: true },
    };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { operation: 'deleteExport' },
      extra: { userId, exportId },
    });

    console.error('[ExportService] deleteExport exception:', err);
    return createError('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
