/**
 * DAW Routes Index
 * Registers all DAW-related routes under /api/v1/daw
 */

import type { FastifyInstance } from 'fastify';
import { projectRoutes } from './projects.js';
import { collaborateRoutes } from './collaborate.js';

/**
 * Registers all DAW routes.
 * 
 * Routes:
 * - GET    /api/v1/daw/projects         - List user's projects
 * - POST   /api/v1/daw/projects         - Create project
 * - GET    /api/v1/daw/projects/:id     - Get project details
 * - PUT    /api/v1/daw/projects/:id     - Update project
 * - DELETE /api/v1/daw/projects/:id     - Delete (archive) project
 * - WS     /api/v1/daw/collaborate/:projectId - WebSocket collaboration
 */
export async function dawRoutes(fastify: FastifyInstance): Promise<void> {
  // Register project CRUD routes
  await fastify.register(projectRoutes, { prefix: '/projects' });
  
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
