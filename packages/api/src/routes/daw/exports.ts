/**
 * DAW Export REST Routes
 * Thin controller layer - all business logic is in export.service.ts
 * 
 * Routes:
 * - POST   /api/v1/daw/projects/:projectId/export  - Enqueue export job
 * - GET    /api/v1/daw/projects/:projectId/exports - List exports for project
 * - GET    /api/v1/daw/exports/:exportId           - Get export status
 * - DELETE /api/v1/daw/exports/:exportId           - Cancel/delete export
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import * as exportService from '../../services/daw/export.service.js';
import {
  CreateExportSchema,
  ProjectIdParamSchema,
  ExportIdParamSchema,
  ListExportsQuerySchema,
  type CreateExportInput,
  type ProjectIdParam,
  type ExportIdParam,
  type ListExportsQuery,
} from '../../schemas/daw/export.schema.js';
import type { ApiError } from '@amg/shared';

// ============================================================================
// Types
// ============================================================================

interface CreateExportRequest extends FastifyRequest {
  params: ProjectIdParam;
  body: CreateExportInput;
}

interface ListExportsRequest extends FastifyRequest {
  params: ProjectIdParam;
  query: ListExportsQuery;
}

interface GetExportRequest extends FastifyRequest {
  params: ExportIdParam;
}

interface DeleteExportRequest extends FastifyRequest {
  params: ExportIdParam;
}

// ============================================================================
// Error Helpers
// ============================================================================

function createValidationError(message: string, details?: unknown): ApiError {
  return {
    error: {
      code: 'VALIDATION_ERROR',
      message,
      details,
    },
  };
}

function isApiError(response: unknown): response is ApiError {
  return typeof response === 'object' && response !== null && 'error' in response;
}

/**
 * Map error codes to HTTP status codes.
 */
function getStatusCode(errorCode: string): number {
  switch (errorCode) {
    case 'VALIDATION_ERROR':
      return 400;
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'TOO_MANY_EXPORTS':
      return 429;
    default:
      return 500;
  }
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /api/v1/daw/projects/:projectId/export
 * Enqueue a new export job.
 */
async function createExportHandler(
  request: CreateExportRequest,
  reply: FastifyReply
): Promise<void> {
  // Validate params
  const paramsResult = ProjectIdParamSchema.safeParse(request.params);
  if (!paramsResult.success) {
    reply.status(400).send(
      createValidationError('Invalid project ID', paramsResult.error.flatten())
    );
    return;
  }

  // Validate body
  const bodyResult = CreateExportSchema.safeParse(request.body);
  if (!bodyResult.success) {
    reply.status(400).send(
      createValidationError('Invalid export request', bodyResult.error.flatten())
    );
    return;
  }

  const result = await exportService.enqueueExport(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    paramsResult.data.projectId,
    bodyResult.data
  );

  if (isApiError(result)) {
    const statusCode = getStatusCode(result.error.code);
    reply.status(statusCode).send(result);
    return;
  }

  reply.status(201).send(result);
}

/**
 * GET /api/v1/daw/projects/:projectId/exports
 * List exports for a project.
 */
async function listExportsHandler(
  request: ListExportsRequest,
  reply: FastifyReply
): Promise<void> {
  // Validate params
  const paramsResult = ProjectIdParamSchema.safeParse(request.params);
  if (!paramsResult.success) {
    reply.status(400).send(
      createValidationError('Invalid project ID', paramsResult.error.flatten())
    );
    return;
  }

  // Validate query
  const queryResult = ListExportsQuerySchema.safeParse(request.query);
  if (!queryResult.success) {
    reply.status(400).send(
      createValidationError('Invalid query parameters', queryResult.error.flatten())
    );
    return;
  }

  const result = await exportService.listExports(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    paramsResult.data.projectId,
    queryResult.data
  );

  if (isApiError(result)) {
    const statusCode = getStatusCode(result.error.code);
    reply.status(statusCode).send(result);
    return;
  }

  reply.status(200).send(result);
}

/**
 * GET /api/v1/daw/exports/:exportId
 * Get export status by ID.
 */
async function getExportHandler(
  request: GetExportRequest,
  reply: FastifyReply
): Promise<void> {
  // Validate params
  const paramsResult = ExportIdParamSchema.safeParse(request.params);
  if (!paramsResult.success) {
    reply.status(400).send(
      createValidationError('Invalid export ID', paramsResult.error.flatten())
    );
    return;
  }

  const result = await exportService.getExport(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    paramsResult.data.exportId
  );

  if (isApiError(result)) {
    const statusCode = getStatusCode(result.error.code);
    reply.status(statusCode).send(result);
    return;
  }

  reply.status(200).send(result);
}

/**
 * DELETE /api/v1/daw/exports/:exportId
 * Cancel or delete an export.
 */
async function deleteExportHandler(
  request: DeleteExportRequest,
  reply: FastifyReply
): Promise<void> {
  // Validate params
  const paramsResult = ExportIdParamSchema.safeParse(request.params);
  if (!paramsResult.success) {
    reply.status(400).send(
      createValidationError('Invalid export ID', paramsResult.error.flatten())
    );
    return;
  }

  const result = await exportService.deleteExport(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    paramsResult.data.exportId
  );

  if (isApiError(result)) {
    const statusCode = getStatusCode(result.error.code);
    reply.status(statusCode).send(result);
    return;
  }

  reply.status(204).send();
}

// ============================================================================
// Route Registration - Project-scoped routes
// ============================================================================

/**
 * Export routes scoped to a project.
 * Mounted at: /api/v1/daw/projects/:projectId
 * 
 * - POST /export   - Create export job
 * - GET  /exports  - List exports
 */
export async function exportProjectRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', authMiddleware);

  // Enqueue export
  fastify.post('/export', { handler: createExportHandler as any });

  // List exports for project
  fastify.get('/exports', { handler: listExportsHandler as any });
}

// ============================================================================
// Route Registration - Direct export routes
// ============================================================================

/**
 * Export routes for direct access by export ID.
 * Mounted at: /api/v1/daw/exports
 * 
 * - GET    /:exportId - Get export status
 * - DELETE /:exportId - Delete export
 */
export async function exportRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', authMiddleware);

  // Get export by ID
  fastify.get('/:exportId', { handler: getExportHandler as any });

  // Delete export
  fastify.delete('/:exportId', { handler: deleteExportHandler as any });
}

export default exportRoutes;
