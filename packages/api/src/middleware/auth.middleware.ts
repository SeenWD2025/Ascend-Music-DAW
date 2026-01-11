/**
 * Auth middleware for Fastify routes.
 * Verifies Supabase JWT tokens from Authorization header.
 */

import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { ApiError } from '@amg/shared';

// ============================================================================
// Types
// ============================================================================

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  aud: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthenticatedUser;
    supabaseClient: SupabaseClient;
    supabaseUser: User;
  }
}

// ============================================================================
// Environment Config
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[Auth] SUPABASE_URL or SUPABASE_ANON_KEY not set');
}

// Service client for admin operations
let serviceClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (!serviceClient) {
    if (!SUPABASE_SERVICE_KEY) {
      throw new Error('SUPABASE_SERVICE_KEY not configured');
    }
    serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return serviceClient;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extracts the Bearer token from the Authorization header.
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }
  
  return parts[1];
}

/**
 * Creates an API error response.
 */
function createAuthError(code: string, message: string, requestId?: string): ApiError {
  return {
    error: {
      code,
      message,
      requestId,
    },
  };
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Authentication hook that verifies Supabase JWT tokens.
 * Attaches authenticated user and Supabase client to request.
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const requestId = request.id;

  try {
    const token = extractBearerToken(request.headers.authorization);
    
    if (!token) {
      // TODO: Sentry.captureMessage('Auth: Missing authorization header', { level: 'info' });
      
      reply.status(401).send(
        createAuthError('UNAUTHORIZED', 'Authorization header is required', requestId)
      );
      return;
    }

    // Create a Supabase client with the user's token
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    // Verify the token and get user
    const { data: { user }, error } = await supabaseClient.auth.getUser(token);

    if (error || !user) {
      // TODO: Sentry.captureMessage('Auth: Invalid token', {
      //   level: 'warning',
      //   extra: { error: error?.message },
      // });
      
      // TODO: PostHog.capture('auth_failed', {
      //   reason: error?.message ?? 'invalid_token',
      // });

      reply.status(401).send(
        createAuthError('INVALID_TOKEN', 'Invalid or expired authentication token', requestId)
      );
      return;
    }

    // Attach authenticated user info to request
    request.user = {
      id: user.id,
      email: user.email ?? '',
      role: user.role ?? 'authenticated',
      aud: user.aud,
    };
    request.supabaseClient = supabaseClient;
    request.supabaseUser = user;

    // TODO: PostHog.identify(user.id, { email: user.email });

  } catch (err) {
    // TODO: Sentry.captureException(err, {
    //   tags: { component: 'auth_middleware' },
    // });
    
    request.log.error({ err }, 'Auth middleware error');
    
    reply.status(500).send(
      createAuthError('AUTH_ERROR', 'Authentication failed due to internal error', requestId)
    );
  }
}

/**
 * Optional auth middleware - allows unauthenticated requests but attaches user if token is valid.
 */
export async function optionalAuthMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    const token = extractBearerToken(request.headers.authorization);
    
    if (!token) {
      // No token provided, continue without authentication
      return;
    }

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { data: { user }, error } = await supabaseClient.auth.getUser(token);

    if (!error && user) {
      request.user = {
        id: user.id,
        email: user.email ?? '',
        role: user.role ?? 'authenticated',
        aud: user.aud,
      };
      request.supabaseClient = supabaseClient;
      request.supabaseUser = user;
    }
  } catch (err) {
    request.log.warn({ err }, 'Optional auth middleware error');
  }
}

/**
 * Registers auth middleware as a Fastify plugin.
 */
export async function registerAuthMiddleware(fastify: FastifyInstance): Promise<void> {
  // Add decorators for user properties
  fastify.decorateRequest('user', null);
  fastify.decorateRequest('supabaseClient', null);
  fastify.decorateRequest('supabaseUser', null);
}

export default {
  authMiddleware,
  optionalAuthMiddleware,
  registerAuthMiddleware,
  getServiceClient,
};
