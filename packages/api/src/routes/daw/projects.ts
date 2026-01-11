/**
 * DAW Projects REST Routes
 * Thin controller layer - all business logic is in project.service.ts
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import * as projectService from '../../services/daw/project.service.js';
import {
  CreateProjectSchema,
  UpdateProjectSchema,
  ListProjectsQuerySchema,
  ProjectIdParamSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
  type ListProjectsQuery,
  type ProjectIdParam,
} from '../../schemas/daw/project.schema.js';
import type { ApiError } from '@amg/shared';

// ============================================================================
// Types
// ============================================================================

interface ListProjectsRequest extends FastifyRequest {
  query: ListProjectsQuery;
}

interface GetProjectRequest extends FastifyRequest {
  params: ProjectIdParam;
}

interface CreateProjectRequest extends FastifyRequest {
  body: CreateProjectInput;
}

interface UpdateProjectRequest extends FastifyRequest {
  params: ProjectIdParam;
  body: UpdateProjectInput;
}

interface DeleteProjectRequest extends FastifyRequest {
  params: ProjectIdParam;
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

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /api/v1/daw/projects
 * List user's projects with pagination and filtering.
 */
async function listProjectsHandler(
  request: ListProjectsRequest,
  reply: FastifyReply
): Promise<void> {
  // Validate query parameters
  const queryResult = ListProjectsQuerySchema.safeParse(request.query);
  if (!queryResult.success) {
    reply.status(400).send(
      createValidationError('Invalid query parameters', queryResult.error.flatten())
    );
    return;
  }

  const result = await projectService.listProjects(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    queryResult.data
  );

  if (isApiError(result)) {
    const statusCode = result.error.code === 'NOT_FOUND' ? 404 : 500;
    reply.status(statusCode).send(result);
    return;
  }

  reply.status(200).send(result);
}

/**
 * GET /api/v1/daw/projects/:id
 * Get a single project by ID.
 */
async function getProjectHandler(
  request: GetProjectRequest,
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

  const result = await projectService.getProject(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    paramsResult.data.id
  );

  if (isApiError(result)) {
    const statusCode = 
      result.error.code === 'NOT_FOUND' ? 404 :
      result.error.code === 'FORBIDDEN' ? 403 : 500;
    reply.status(statusCode).send(result);
    return;
  }

  reply.status(200).send(result);
}

/**
 * POST /api/v1/daw/projects
 * Create a new project.
 */
async function createProjectHandler(
  request: CreateProjectRequest,
  reply: FastifyReply
): Promise<void> {
  // Validate body
  const bodyResult = CreateProjectSchema.safeParse(request.body);
  if (!bodyResult.success) {
    reply.status(400).send(
      createValidationError('Invalid project data', bodyResult.error.flatten())
    );
    return;
  }

  const result = await projectService.createProject(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    bodyResult.data
  );

  if (isApiError(result)) {
    reply.status(500).send(result);
    return;
  }

  reply.status(201).send(result);
}

/**
 * PUT /api/v1/daw/projects/:id
 * Update an existing project.
 */
async function updateProjectHandler(
  request: UpdateProjectRequest,
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
  const bodyResult = UpdateProjectSchema.safeParse(request.body);
  if (!bodyResult.success) {
    reply.status(400).send(
      createValidationError('Invalid project data', bodyResult.error.flatten())
    );
    return;
  }

  const result = await projectService.updateProject(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    paramsResult.data.id,
    bodyResult.data
  );

  if (isApiError(result)) {
    const statusCode = 
      result.error.code === 'NOT_FOUND' ? 404 :
      result.error.code === 'FORBIDDEN' ? 403 : 500;
    reply.status(statusCode).send(result);
    return;
  }

  reply.status(200).send(result);
}

/**
 * DELETE /api/v1/daw/projects/:id
 * Delete (archive) a project.
 */
async function deleteProjectHandler(
  request: DeleteProjectRequest,
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

  const result = await projectService.deleteProject(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    paramsResult.data.id
  );

  if (isApiError(result)) {
    const statusCode = 
      result.error.code === 'NOT_FOUND' ? 404 :
      result.error.code === 'FORBIDDEN' ? 403 : 500;
    reply.status(statusCode).send(result);
    return;
  }

  reply.status(200).send(result);
}

// ============================================================================
// Route Registration
// ============================================================================

export async function projectRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', authMiddleware);

  // List projects
  fastify.get('/', listProjectsHandler);

  // Get single project
  fastify.get('/:id', getProjectHandler);

  // Create project
  fastify.post('/', createProjectHandler);

  // Update project
  fastify.put('/:id', updateProjectHandler);

  // Delete project
  fastify.delete('/:id', deleteProjectHandler);
}

export default projectRoutes;
