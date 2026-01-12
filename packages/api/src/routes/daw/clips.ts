/**
 * DAW Clips REST Routes
 * Thin controller layer - all business logic is in clip.service.ts
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import * as clipService from '../../services/daw/clip.service.js';
import {
  CreateClipSchema,
  UpdateClipSchema,
  MoveClipSchema,
  type CreateClipInput,
  type UpdateClipInput,
  type MoveClipInput,
} from '../../schemas/daw/clip.schema.js';
import type { ApiError } from '@amg/shared';
import { z } from 'zod';

// ============================================================================
// Param Schemas
// ============================================================================

const TrackIdParamSchema = z.object({
  trackId: z.string().uuid('Track ID must be a valid UUID'),
});

const ClipIdParamSchema = z.object({
  clipId: z.string().uuid('Clip ID must be a valid UUID'),
});

type TrackIdParam = z.infer<typeof TrackIdParamSchema>;
type ClipIdParam = z.infer<typeof ClipIdParamSchema>;

// ============================================================================
// Types
// ============================================================================

interface ListClipsRequest extends FastifyRequest {
  params: TrackIdParam;
}

interface CreateClipRequest extends FastifyRequest {
  params: TrackIdParam;
  body: CreateClipInput;
}

interface GetClipRequest extends FastifyRequest {
  params: ClipIdParam;
}

interface UpdateClipRequest extends FastifyRequest {
  params: ClipIdParam;
  body: UpdateClipInput;
}

interface MoveClipRequest extends FastifyRequest {
  params: ClipIdParam;
  body: MoveClipInput;
}

interface DeleteClipRequest extends FastifyRequest {
  params: ClipIdParam;
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

function createNotFoundError(message: string): ApiError {
  return {
    error: {
      code: 'NOT_FOUND',
      message,
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
// Helper Functions
// ============================================================================

/**
 * Looks up the track_id for a given clip.
 * Used when routes only have clipId but service needs trackId.
 */
async function getTrackIdForClip(
  supabase: FastifyRequest['supabaseClient'],
  clipId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('daw_clips')
    .select('track_id')
    .eq('id', clipId)
    .single();

  return data?.track_id ?? null;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /api/v1/daw/tracks/:trackId/clips
 * List all clips for a track.
 */
async function listClipsHandler(
  request: ListClipsRequest,
  reply: FastifyReply
): Promise<void> {
  const paramsResult = TrackIdParamSchema.safeParse(request.params);
  if (!paramsResult.success) {
    reply.status(400).send(
      createValidationError('Invalid track ID', paramsResult.error.flatten())
    );
    return;
  }

  const result = await clipService.listClips(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    paramsResult.data.trackId
  );

  if (isApiError(result)) {
    reply.status(getStatusCode(result.error.code)).send(result);
    return;
  }

  reply.status(200).send(result);
}

/**
 * POST /api/v1/daw/tracks/:trackId/clips
 * Create a new clip on a track.
 */
async function createClipHandler(
  request: CreateClipRequest,
  reply: FastifyReply
): Promise<void> {
  const paramsResult = TrackIdParamSchema.safeParse(request.params);
  if (!paramsResult.success) {
    reply.status(400).send(
      createValidationError('Invalid track ID', paramsResult.error.flatten())
    );
    return;
  }

  const bodyResult = CreateClipSchema.safeParse(request.body);
  if (!bodyResult.success) {
    reply.status(400).send(
      createValidationError('Invalid clip data', bodyResult.error.flatten())
    );
    return;
  }

  const result = await clipService.createClip(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    paramsResult.data.trackId,
    bodyResult.data
  );

  if (isApiError(result)) {
    reply.status(getStatusCode(result.error.code)).send(result);
    return;
  }

  reply.status(201).send(result);
}

/**
 * GET /api/v1/daw/clips/:clipId
 * Get a single clip by ID.
 */
async function getClipHandler(
  request: GetClipRequest,
  reply: FastifyReply
): Promise<void> {
  const paramsResult = ClipIdParamSchema.safeParse(request.params);
  if (!paramsResult.success) {
    reply.status(400).send(
      createValidationError('Invalid clip ID', paramsResult.error.flatten())
    );
    return;
  }

  // Look up the track_id for this clip
  const trackId = await getTrackIdForClip(
    request.supabaseClient,
    paramsResult.data.clipId
  );

  if (!trackId) {
    reply.status(404).send(createNotFoundError('Clip not found'));
    return;
  }

  const result = await clipService.getClip(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    trackId,
    paramsResult.data.clipId
  );

  if (isApiError(result)) {
    reply.status(getStatusCode(result.error.code)).send(result);
    return;
  }

  reply.status(200).send(result);
}

/**
 * PUT /api/v1/daw/clips/:clipId
 * Update an existing clip.
 */
async function updateClipHandler(
  request: UpdateClipRequest,
  reply: FastifyReply
): Promise<void> {
  const paramsResult = ClipIdParamSchema.safeParse(request.params);
  if (!paramsResult.success) {
    reply.status(400).send(
      createValidationError('Invalid clip ID', paramsResult.error.flatten())
    );
    return;
  }

  const bodyResult = UpdateClipSchema.safeParse(request.body);
  if (!bodyResult.success) {
    reply.status(400).send(
      createValidationError('Invalid clip data', bodyResult.error.flatten())
    );
    return;
  }

  // Look up the track_id for this clip
  const trackId = await getTrackIdForClip(
    request.supabaseClient,
    paramsResult.data.clipId
  );

  if (!trackId) {
    reply.status(404).send(createNotFoundError('Clip not found'));
    return;
  }

  const result = await clipService.updateClip(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    trackId,
    paramsResult.data.clipId,
    bodyResult.data
  );

  if (isApiError(result)) {
    reply.status(getStatusCode(result.error.code)).send(result);
    return;
  }

  reply.status(200).send(result);
}

/**
 * PUT /api/v1/daw/clips/:clipId/move
 * Move a clip to a new position and/or track.
 */
async function moveClipHandler(
  request: MoveClipRequest,
  reply: FastifyReply
): Promise<void> {
  const paramsResult = ClipIdParamSchema.safeParse(request.params);
  if (!paramsResult.success) {
    reply.status(400).send(
      createValidationError('Invalid clip ID', paramsResult.error.flatten())
    );
    return;
  }

  const bodyResult = MoveClipSchema.safeParse(request.body);
  if (!bodyResult.success) {
    reply.status(400).send(
      createValidationError('Invalid move data', bodyResult.error.flatten())
    );
    return;
  }

  // Look up the track_id for this clip
  const trackId = await getTrackIdForClip(
    request.supabaseClient,
    paramsResult.data.clipId
  );

  if (!trackId) {
    reply.status(404).send(createNotFoundError('Clip not found'));
    return;
  }

  const result = await clipService.moveClip(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    trackId,
    paramsResult.data.clipId,
    bodyResult.data
  );

  if (isApiError(result)) {
    reply.status(getStatusCode(result.error.code)).send(result);
    return;
  }

  reply.status(200).send(result);
}

/**
 * DELETE /api/v1/daw/clips/:clipId
 * Delete a clip.
 */
async function deleteClipHandler(
  request: DeleteClipRequest,
  reply: FastifyReply
): Promise<void> {
  const paramsResult = ClipIdParamSchema.safeParse(request.params);
  if (!paramsResult.success) {
    reply.status(400).send(
      createValidationError('Invalid clip ID', paramsResult.error.flatten())
    );
    return;
  }

  // Look up the track_id for this clip
  const trackId = await getTrackIdForClip(
    request.supabaseClient,
    paramsResult.data.clipId
  );

  if (!trackId) {
    reply.status(404).send(createNotFoundError('Clip not found'));
    return;
  }

  const result = await clipService.deleteClip(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    trackId,
    paramsResult.data.clipId
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
 * Registers clip routes under /api/v1/daw/tracks/:trackId/clips
 */
async function clipTrackRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply auth middleware to all routes
  fastify.addHook('preHandler', authMiddleware);

  // CRUD routes scoped to track
  fastify.get('/', listClipsHandler as never);
  fastify.post('/', createClipHandler as never);
}

/**
 * Registers clip routes under /api/v1/daw/clips
 */
async function clipRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply auth middleware to all routes
  fastify.addHook('preHandler', authMiddleware);

  // Routes that operate on clips directly by ID
  fastify.get('/:clipId', getClipHandler as never);
  fastify.put('/:clipId', updateClipHandler as never);
  fastify.put('/:clipId/move', moveClipHandler as never);
  fastify.delete('/:clipId', deleteClipHandler as never);
}

export { clipRoutes, clipTrackRoutes };
export default clipRoutes;
