/**
 * DAW Tracks REST Routes
 * Thin controller layer - all business logic is in track.service.ts
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import * as trackService from '../../services/daw/track.service.js';
import {
  CreateTrackSchema,
  UpdateTrackSchema,
  ReorderTracksSchema,
  type CreateTrackInput,
  type UpdateTrackInput,
  type ReorderTracksInput,
} from '../../schemas/daw/track.schema.js';
import type { ApiError } from '@amg/shared';
import { z } from 'zod';

// ============================================================================
// Param Schemas
// ============================================================================

const ProjectIdParamSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID'),
});

const TrackIdParamSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID'),
  trackId: z.string().uuid('Track ID must be a valid UUID'),
});

type ProjectIdParam = z.infer<typeof ProjectIdParamSchema>;
type TrackIdParam = z.infer<typeof TrackIdParamSchema>;

// ============================================================================
// Types
// ============================================================================

interface ListTracksRequest extends FastifyRequest {
  params: ProjectIdParam;
}

interface GetTrackRequest extends FastifyRequest {
  params: TrackIdParam;
}

interface CreateTrackRequest extends FastifyRequest {
  params: ProjectIdParam;
  body: CreateTrackInput;
}

interface UpdateTrackRequest extends FastifyRequest {
  params: TrackIdParam;
  body: UpdateTrackInput;
}

interface DeleteTrackRequest extends FastifyRequest {
  params: TrackIdParam;
}

interface ReorderTracksRequest extends FastifyRequest {
  params: ProjectIdParam;
  body: ReorderTracksInput;
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

function getStatusCode(errorCode: string): number {
  switch (errorCode) {
    case 'NOT_FOUND':
      return 404;
    case 'FORBIDDEN':
      return 403;
    case 'BAD_REQUEST':
    case 'VALIDATION_ERROR':
      return 400;
    default:
      return 500;
  }
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /api/v1/daw/projects/:projectId/tracks
 * List all tracks for a project.
 */
async function listTracksHandler(
  request: ListTracksRequest,
  reply: FastifyReply
): Promise<void> {
  const paramsResult = ProjectIdParamSchema.safeParse(request.params);
  if (!paramsResult.success) {
    reply.status(400).send(
      createValidationError('Invalid project ID', paramsResult.error.flatten())
    );
    return;
  }

  const result = await trackService.listTracks(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    paramsResult.data.projectId
  );

  if (isApiError(result)) {
    reply.status(getStatusCode(result.error.code)).send(result);
    return;
  }

  reply.status(200).send(result);
}

/**
 * GET /api/v1/daw/projects/:projectId/tracks/:trackId
 * Get a single track by ID.
 */
async function getTrackHandler(
  request: GetTrackRequest,
  reply: FastifyReply
): Promise<void> {
  const paramsResult = TrackIdParamSchema.safeParse(request.params);
  if (!paramsResult.success) {
    reply.status(400).send(
      createValidationError('Invalid parameters', paramsResult.error.flatten())
    );
    return;
  }

  const result = await trackService.getTrack(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    paramsResult.data.projectId,
    paramsResult.data.trackId
  );

  if (isApiError(result)) {
    reply.status(getStatusCode(result.error.code)).send(result);
    return;
  }

  reply.status(200).send(result);
}

/**
 * POST /api/v1/daw/projects/:projectId/tracks
 * Create a new track in a project.
 */
async function createTrackHandler(
  request: CreateTrackRequest,
  reply: FastifyReply
): Promise<void> {
  const paramsResult = ProjectIdParamSchema.safeParse(request.params);
  if (!paramsResult.success) {
    reply.status(400).send(
      createValidationError('Invalid project ID', paramsResult.error.flatten())
    );
    return;
  }

  const bodyResult = CreateTrackSchema.safeParse(request.body);
  if (!bodyResult.success) {
    reply.status(400).send(
      createValidationError('Invalid track data', bodyResult.error.flatten())
    );
    return;
  }

  const result = await trackService.createTrack(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    paramsResult.data.projectId,
    bodyResult.data
  );

  if (isApiError(result)) {
    reply.status(getStatusCode(result.error.code)).send(result);
    return;
  }

  reply.status(201).send(result);
}

/**
 * PUT /api/v1/daw/projects/:projectId/tracks/:trackId
 * Update an existing track.
 */
async function updateTrackHandler(
  request: UpdateTrackRequest,
  reply: FastifyReply
): Promise<void> {
  const paramsResult = TrackIdParamSchema.safeParse(request.params);
  if (!paramsResult.success) {
    reply.status(400).send(
      createValidationError('Invalid parameters', paramsResult.error.flatten())
    );
    return;
  }

  const bodyResult = UpdateTrackSchema.safeParse(request.body);
  if (!bodyResult.success) {
    reply.status(400).send(
      createValidationError('Invalid track data', bodyResult.error.flatten())
    );
    return;
  }

  const result = await trackService.updateTrack(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    paramsResult.data.projectId,
    paramsResult.data.trackId,
    bodyResult.data
  );

  if (isApiError(result)) {
    reply.status(getStatusCode(result.error.code)).send(result);
    return;
  }

  reply.status(200).send(result);
}

/**
 * DELETE /api/v1/daw/projects/:projectId/tracks/:trackId
 * Delete a track.
 */
async function deleteTrackHandler(
  request: DeleteTrackRequest,
  reply: FastifyReply
): Promise<void> {
  const paramsResult = TrackIdParamSchema.safeParse(request.params);
  if (!paramsResult.success) {
    reply.status(400).send(
      createValidationError('Invalid parameters', paramsResult.error.flatten())
    );
    return;
  }

  const result = await trackService.deleteTrack(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    paramsResult.data.projectId,
    paramsResult.data.trackId
  );

  if (isApiError(result)) {
    reply.status(getStatusCode(result.error.code)).send(result);
    return;
  }

  reply.status(200).send(result);
}

/**
 * PUT /api/v1/daw/projects/:projectId/tracks/reorder
 * Reorder tracks within a project.
 */
async function reorderTracksHandler(
  request: ReorderTracksRequest,
  reply: FastifyReply
): Promise<void> {
  const paramsResult = ProjectIdParamSchema.safeParse(request.params);
  if (!paramsResult.success) {
    reply.status(400).send(
      createValidationError('Invalid project ID', paramsResult.error.flatten())
    );
    return;
  }

  const bodyResult = ReorderTracksSchema.safeParse(request.body);
  if (!bodyResult.success) {
    reply.status(400).send(
      createValidationError('Invalid reorder data', bodyResult.error.flatten())
    );
    return;
  }

  const result = await trackService.reorderTracks(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    paramsResult.data.projectId,
    bodyResult.data
  );

  if (isApiError(result)) {
    reply.status(getStatusCode(result.error.code)).send(result);
    return;
  }

  reply.status(200).send(result);
}

// ============================================================================
// Route Registration
// ============================================================================

/**
 * Registers track routes under /api/v1/daw/projects/:projectId/tracks
 */
export async function trackRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply auth middleware to all routes
  fastify.addHook('preHandler', authMiddleware);

  // Reorder must be registered before :trackId to avoid route conflict
  fastify.put('/reorder', reorderTracksHandler as never);

  // CRUD routes
  fastify.get('/', listTracksHandler as never);
  fastify.post('/', createTrackHandler as never);
  fastify.get('/:trackId', getTrackHandler as never);
  fastify.put('/:trackId', updateTrackHandler as never);
  fastify.delete('/:trackId', deleteTrackHandler as never);
}

export default trackRoutes;
