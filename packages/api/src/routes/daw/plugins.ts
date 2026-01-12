/**
 * DAW Plugins REST Routes
 * Thin controller layer - all business logic is in plugin.service.ts
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import * as pluginService from '../../services/daw/plugin.service.js';
import {
  PluginIdParamSchema,
  TrackIdParamSchema,
  CreatePluginSchema,
  UpdatePluginSchema,
  ReorderPluginsSchema,
  type PluginIdParam,
  type TrackIdParam,
  type CreatePluginInput,
  type UpdatePluginInput,
  type ReorderPluginsInput,
} from '../../schemas/daw/plugin.schema.js';
import type { ApiError } from '@amg/shared';

// ============================================================================
// Types
// ============================================================================

interface ListPluginsRequest extends FastifyRequest {
  params: TrackIdParam;
}

interface GetPluginRequest extends FastifyRequest {
  params: PluginIdParam;
}

interface CreatePluginRequest extends FastifyRequest {
  params: TrackIdParam;
  body: CreatePluginInput;
}

interface UpdatePluginRequest extends FastifyRequest {
  params: PluginIdParam;
  body: UpdatePluginInput;
}

interface DeletePluginRequest extends FastifyRequest {
  params: PluginIdParam;
}

interface ReorderPluginsRequest extends FastifyRequest {
  params: TrackIdParam;
  body: ReorderPluginsInput;
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
 * POST /api/v1/daw/tracks/:trackId/plugins
 * Add a plugin to a track.
 */
async function createPluginHandler(
  request: CreatePluginRequest,
  reply: FastifyReply
): Promise<void> {
  const paramsResult = TrackIdParamSchema.safeParse(request.params);
  if (!paramsResult.success) {
    reply.status(400).send(
      createValidationError('Invalid track ID', paramsResult.error.flatten())
    );
    return;
  }

  const bodyResult = CreatePluginSchema.safeParse(request.body);
  if (!bodyResult.success) {
    reply.status(400).send(
      createValidationError('Invalid plugin data', bodyResult.error.flatten())
    );
    return;
  }

  const result = await pluginService.createPlugin(
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
 * GET /api/v1/daw/tracks/:trackId/plugins
 * List all plugins on a track.
 */
async function listPluginsHandler(
  request: ListPluginsRequest,
  reply: FastifyReply
): Promise<void> {
  const paramsResult = TrackIdParamSchema.safeParse(request.params);
  if (!paramsResult.success) {
    reply.status(400).send(
      createValidationError('Invalid track ID', paramsResult.error.flatten())
    );
    return;
  }

  const result = await pluginService.getPlugins(
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
 * GET /api/v1/daw/plugins/:pluginId
 * Get a single plugin by ID.
 */
async function getPluginHandler(
  request: GetPluginRequest,
  reply: FastifyReply
): Promise<void> {
  const paramsResult = PluginIdParamSchema.safeParse(request.params);
  if (!paramsResult.success) {
    reply.status(400).send(
      createValidationError('Invalid plugin ID', paramsResult.error.flatten())
    );
    return;
  }

  const result = await pluginService.getPlugin(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    paramsResult.data.pluginId
  );

  if (isApiError(result)) {
    reply.status(getStatusCode(result.error.code)).send(result);
    return;
  }

  reply.status(200).send(result);
}

/**
 * PUT /api/v1/daw/plugins/:pluginId
 * Update an existing plugin.
 */
async function updatePluginHandler(
  request: UpdatePluginRequest,
  reply: FastifyReply
): Promise<void> {
  const paramsResult = PluginIdParamSchema.safeParse(request.params);
  if (!paramsResult.success) {
    reply.status(400).send(
      createValidationError('Invalid plugin ID', paramsResult.error.flatten())
    );
    return;
  }

  const bodyResult = UpdatePluginSchema.safeParse(request.body);
  if (!bodyResult.success) {
    reply.status(400).send(
      createValidationError('Invalid plugin data', bodyResult.error.flatten())
    );
    return;
  }

  const result = await pluginService.updatePlugin(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    paramsResult.data.pluginId,
    bodyResult.data
  );

  if (isApiError(result)) {
    reply.status(getStatusCode(result.error.code)).send(result);
    return;
  }

  reply.status(200).send(result);
}

/**
 * DELETE /api/v1/daw/plugins/:pluginId
 * Remove a plugin from a track.
 */
async function deletePluginHandler(
  request: DeletePluginRequest,
  reply: FastifyReply
): Promise<void> {
  const paramsResult = PluginIdParamSchema.safeParse(request.params);
  if (!paramsResult.success) {
    reply.status(400).send(
      createValidationError('Invalid plugin ID', paramsResult.error.flatten())
    );
    return;
  }

  const result = await pluginService.deletePlugin(
    {
      supabase: request.supabaseClient,
      userId: request.user.id,
    },
    paramsResult.data.pluginId
  );

  if (isApiError(result)) {
    reply.status(getStatusCode(result.error.code)).send(result);
    return;
  }

  reply.status(204).send();
}

/**
 * PATCH /api/v1/daw/tracks/:trackId/plugins/reorder
 * Reorder the effects chain on a track.
 */
async function reorderPluginsHandler(
  request: ReorderPluginsRequest,
  reply: FastifyReply
): Promise<void> {
  const paramsResult = TrackIdParamSchema.safeParse(request.params);
  if (!paramsResult.success) {
    reply.status(400).send(
      createValidationError('Invalid track ID', paramsResult.error.flatten())
    );
    return;
  }

  const bodyResult = ReorderPluginsSchema.safeParse(request.body);
  if (!bodyResult.success) {
    reply.status(400).send(
      createValidationError('Invalid reorder data', bodyResult.error.flatten())
    );
    return;
  }

  const result = await pluginService.reorderPlugins(
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

  reply.status(200).send(result);
}

// ============================================================================
// Route Registration
// ============================================================================

/**
 * Registers plugin routes scoped to tracks: /api/v1/daw/tracks/:trackId/plugins
 * - POST   /                - Create plugin on track
 * - GET    /                - List plugins on track
 * - PATCH  /reorder         - Reorder effects chain
 */
export async function pluginTrackRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply auth middleware to all routes
  fastify.addHook('preHandler', authMiddleware);

  // Reorder must be registered before any param routes to avoid conflict
  fastify.patch('/reorder', reorderPluginsHandler as never);

  // CRUD routes
  fastify.get('/', listPluginsHandler as never);
  fastify.post('/', createPluginHandler as never);
}

/**
 * Registers plugin routes for direct plugin access: /api/v1/daw/plugins
 * - GET    /:pluginId       - Get single plugin
 * - PUT    /:pluginId       - Update plugin
 * - DELETE /:pluginId       - Delete plugin
 */
export async function pluginRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply auth middleware to all routes
  fastify.addHook('preHandler', authMiddleware);

  fastify.get('/:pluginId', getPluginHandler as never);
  fastify.put('/:pluginId', updatePluginHandler as never);
  fastify.delete('/:pluginId', deletePluginHandler as never);
}

export default {
  pluginTrackRoutes,
  pluginRoutes,
};
