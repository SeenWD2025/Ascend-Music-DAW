/**
 * DAW Routes Index
 * Registers all DAW-related routes under /api/v1/daw
 */

import type { FastifyInstance } from 'fastify';
import { projectRoutes } from './projects.js';
import { collaborateRoutes } from './collaborate.js';
import { trackRoutes } from './tracks.js';
import { clipRoutes, clipTrackRoutes } from './clips.js';
import { pluginRoutes, pluginTrackRoutes } from './plugins.js';
import { exportRoutes, exportProjectRoutes } from './exports.js';

/**
 * Registers all DAW routes.
 * 
 * Routes:
 * - GET    /api/v1/daw/projects                           - List user's projects
 * - POST   /api/v1/daw/projects                           - Create project
 * - GET    /api/v1/daw/projects/:id                       - Get project details
 * - PUT    /api/v1/daw/projects/:id                       - Update project
 * - DELETE /api/v1/daw/projects/:id                       - Delete (archive) project
 * - WS     /api/v1/daw/collaborate/:projectId             - WebSocket collaboration
 * 
 * Track Routes:
 * - POST   /api/v1/daw/projects/:projectId/tracks         - Create track
 * - GET    /api/v1/daw/projects/:projectId/tracks         - List tracks
 * - GET    /api/v1/daw/projects/:projectId/tracks/:trackId - Get track
 * - PUT    /api/v1/daw/projects/:projectId/tracks/:trackId - Update track
 * - DELETE /api/v1/daw/projects/:projectId/tracks/:trackId - Delete track
 * - PUT    /api/v1/daw/projects/:projectId/tracks/reorder - Reorder tracks
 * 
 * Clip Routes:
 * - POST   /api/v1/daw/tracks/:trackId/clips              - Create clip
 * - GET    /api/v1/daw/tracks/:trackId/clips              - List clips
 * - GET    /api/v1/daw/clips/:clipId                      - Get clip
 * - PUT    /api/v1/daw/clips/:clipId                      - Update clip
 * - PUT    /api/v1/daw/clips/:clipId/move                 - Move clip
 * - DELETE /api/v1/daw/clips/:clipId                      - Delete clip
 * 
 * Plugin Routes:
 * - POST   /api/v1/daw/tracks/:trackId/plugins            - Add plugin to track
 * - GET    /api/v1/daw/tracks/:trackId/plugins            - List plugins on track
 * - PATCH  /api/v1/daw/tracks/:trackId/plugins/reorder    - Reorder effects chain
 * - GET    /api/v1/daw/plugins/:pluginId                  - Get single plugin
 * - PUT    /api/v1/daw/plugins/:pluginId                  - Update plugin
 * - DELETE /api/v1/daw/plugins/:pluginId                  - Remove plugin
 * 
 * Export Routes:
 * - POST   /api/v1/daw/projects/:projectId/export         - Enqueue export job
 * - GET    /api/v1/daw/projects/:projectId/exports        - List exports for project
 * - GET    /api/v1/daw/exports/:exportId                  - Get export status
 * - DELETE /api/v1/daw/exports/:exportId                  - Cancel/delete export
 */
export async function dawRoutes(fastify: FastifyInstance): Promise<void> {
  // Register project CRUD routes
  await fastify.register(projectRoutes, { prefix: '/projects' });
  
  // Register track routes under projects
  await fastify.register(trackRoutes, { prefix: '/projects/:projectId/tracks' });
  
  // Register export routes scoped to projects
  await fastify.register(exportProjectRoutes, { prefix: '/projects/:projectId' });
  
  // Register export routes for direct export access
  await fastify.register(exportRoutes, { prefix: '/exports' });
  
  // Register clip routes scoped to tracks
  await fastify.register(clipTrackRoutes, { prefix: '/tracks/:trackId/clips' });
  
  // Register clip routes for direct clip access
  await fastify.register(clipRoutes, { prefix: '/clips' });
  
  // Register plugin routes scoped to tracks
  await fastify.register(pluginTrackRoutes, { prefix: '/tracks/:trackId/plugins' });
  
  // Register plugin routes for direct plugin access
  await fastify.register(pluginRoutes, { prefix: '/plugins' });
  
  // Register WebSocket collaboration routes
  await fastify.register(collaborateRoutes, { prefix: '/collaborate' });

  // Health check endpoint for DAW module
  fastify.get('/health', async (_request, reply) => {
    reply.status(200).send({
      status: 'ok',
      module: 'daw',
      timestamp: new Date().toISOString(),
    });
  });
}

export default dawRoutes;
