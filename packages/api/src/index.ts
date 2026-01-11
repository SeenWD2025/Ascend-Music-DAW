/**
 * Ascend DAW API - Main Fastify Application
 * 
 * This is the entry point for the Fastify server.
 * Registers plugins, middleware, and routes.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';

import { registerAuthMiddleware } from './middleware/auth.middleware.js';
import { dawRoutes } from './routes/daw/index.js';
import { cleanupStaleConnections, getStats } from './services/daw/realtime.service.js';
import type { ApiError, ApiResponse } from '@amg/shared';

// ============================================================================
// Environment Configuration
// ============================================================================

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV ?? 'development';
const LOG_LEVEL = process.env.LOG_LEVEL ?? (NODE_ENV === 'production' ? 'info' : 'debug');

// CORS configuration
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000';

// ============================================================================
// Fastify Instance
// ============================================================================

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: LOG_LEVEL,
      transport: NODE_ENV === 'development' 
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  return app;
}

// ============================================================================
// Plugin Registration
// ============================================================================

async function registerPlugins(app: FastifyInstance): Promise<void> {
  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: NODE_ENV === 'production',
  });

  // CORS
  await app.register(cors, {
    origin: CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  });

  // WebSocket support
  await app.register(websocket, {
    options: {
      maxPayload: 1024 * 1024, // 1MB max message size
      clientTracking: false,   // We handle our own tracking
    },
  });

  // Auth middleware decorators
  await registerAuthMiddleware(app);
}

// ============================================================================
// Route Registration
// ============================================================================

async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Health check (public)
  app.get('/health', async (_request, reply) => {
    const stats = getStats();
    
    reply.status(200).send({
      status: 'ok',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      realtime: {
        activeProjects: stats.activeProjects,
        totalClients: stats.totalClients,
      },
    });
  });

  // API version info
  app.get('/api', async (_request, reply) => {
    reply.status(200).send({
      name: 'Ascend DAW API',
      version: 'v1',
      documentation: '/api/docs',
    });
  });

  // Register DAW routes under /api/v1/daw
  await app.register(dawRoutes, { prefix: '/api/v1/daw' });
}

// ============================================================================
// Error Handlers
// ============================================================================

function registerErrorHandlers(app: FastifyInstance): void {
  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;
    
    // Log the error
    request.log.error({
      err: error,
      requestId,
      path: request.url,
      method: request.method,
    }, 'Request error');

    // TODO: Sentry.captureException(error, {
    //   tags: { path: request.url, method: request.method },
    //   extra: { requestId },
    // });

    // Determine status code
    const statusCode = error.statusCode ?? 500;

    // Build error response
    const errorResponse: ApiError = {
      error: {
        code: error.code ?? 'INTERNAL_ERROR',
        message: statusCode >= 500 ? 'Internal server error' : error.message,
        requestId,
      },
    };

    // In development, include stack trace
    if (NODE_ENV === 'development' && statusCode >= 500) {
      errorResponse.error.details = error.stack;
    }

    reply.status(statusCode).send(errorResponse);
  });

  // 404 handler
  app.setNotFoundHandler((_request, reply) => {
    const errorResponse: ApiError = {
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found',
      },
    };
    reply.status(404).send(errorResponse);
  });
}

// ============================================================================
// Lifecycle Hooks
// ============================================================================

function registerLifecycleHooks(app: FastifyInstance): void {
  // Cleanup timer for stale WebSocket connections
  let cleanupInterval: NodeJS.Timeout | null = null;

  app.addHook('onReady', async () => {
    // Start periodic cleanup of stale connections (every 60 seconds)
    cleanupInterval = setInterval(() => {
      cleanupStaleConnections(5 * 60 * 1000); // 5 minute idle timeout
    }, 60 * 1000);

    app.log.info('Stale connection cleanup scheduled');
  });

  app.addHook('onClose', async () => {
    // Stop cleanup timer
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }

    app.log.info('Server shutting down gracefully');
  });

  // Request logging hook
  app.addHook('onResponse', (request, reply, done) => {
    // TODO: PostHog.capture('api_request', {
    //   method: request.method,
    //   path: request.url,
    //   status_code: reply.statusCode,
    //   duration_ms: reply.elapsedTime,
    // });
    
    done();
  });
}

// ============================================================================
// Application Bootstrap
// ============================================================================

async function bootstrap(): Promise<void> {
  const app = buildApp();

  try {
    // Register all plugins
    await registerPlugins(app);

    // Register error handlers
    registerErrorHandlers(app);

    // Register routes
    await registerRoutes(app);

    // Register lifecycle hooks
    registerLifecycleHooks(app);

    // Start server
    await app.listen({ port: PORT, host: HOST });

    app.log.info(`🚀 Ascend DAW API running on http://${HOST}:${PORT}`);
    app.log.info(`   Environment: ${NODE_ENV}`);
    app.log.info(`   Health check: http://${HOST}:${PORT}/health`);
    app.log.info(`   DAW API: http://${HOST}:${PORT}/api/v1/daw`);

    // TODO: PostHog.capture('server_started', {
    //   port: PORT,
    //   environment: NODE_ENV,
    // });

  } catch (err) {
    app.log.error(err, 'Failed to start server');
    
    // TODO: Sentry.captureException(err, {
    //   tags: { phase: 'bootstrap' },
    // });
    
    process.exit(1);
  }

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`);
    
    try {
      await app.close();
      app.log.info('Server closed successfully');
      process.exit(0);
    } catch (err) {
      app.log.error(err, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Run if this is the main module
bootstrap();

export { bootstrap };
