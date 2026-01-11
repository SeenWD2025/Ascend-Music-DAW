/**
 * DAW WebSocket Collaboration Routes
 * Handles realtime collaboration via WebSocket at /api/v1/daw/collaborate/:projectId
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import {
  validateDAWEvent,
  WebSocketMessageSchema,
  type DAWEventEnvelope,
} from '../../schemas/daw/realtime.schema.js';
import {
  connectionRegistry,
  processEvent,
  sendAck,
  sendError,
  sendPong,
} from '../../services/daw/realtime.service.js';

// ============================================================================
// Types
// ============================================================================

interface CollaborateParams {
  projectId: string;
}

interface CollaborateQuerystring {
  token?: string;
  client_id?: string;
}

interface AuthenticatedConnection {
  userId: string;
  projectId: string;
  clientId: string;
  canEdit: boolean;
}

// ============================================================================
// Environment Config
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

// ============================================================================
// Authentication Helper
// ============================================================================

/**
 * Authenticates a WebSocket connection using the provided token.
 */
async function authenticateConnection(
  token: string,
  projectId: string,
  clientId: string
): Promise<AuthenticatedConnection | { error: string }> {
  if (!token) {
    return { error: 'Authentication token required' };
  }

  try {
    // Create Supabase client with user's token
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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

    // Verify token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      // TODO: Sentry.captureMessage('WebSocket auth failed', {
      //   level: 'warning',
      //   extra: { error: authError?.message },
      // });
      return { error: 'Invalid or expired token' };
    }

    // Check if user has access to the project
    const { data: project, error: projectError } = await supabase
      .from('daw_projects')
      .select('id, owner_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return { error: 'Project not found or access denied' };
    }

    // Check if owner or collaborator
    const isOwner = project.owner_id === user.id;
    let canEdit = isOwner;

    if (!isOwner) {
      // Check collaborator status
      const { data: collab } = await supabase
        .from('daw_collaborators')
        .select('role, status')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (!collab) {
        return { error: 'You are not a collaborator on this project' };
      }

      canEdit = collab.role === 'editor' || collab.role === 'admin';
    }

    // TODO: PostHog.capture('daw_realtime_authenticated', {
    //   user_id: user.id,
    //   project_id: projectId,
    //   is_owner: isOwner,
    //   can_edit: canEdit,
    // });

    return {
      userId: user.id,
      projectId,
      clientId: clientId || randomUUID(),
      canEdit,
    };
  } catch (err) {
    // TODO: Sentry.captureException(err, {
    //   tags: { component: 'websocket_auth' },
    // });
    console.error('[CollaborateRoute] Auth error:', err);
    return { error: 'Authentication failed' };
  }
}

// ============================================================================
// Message Handler
// ============================================================================

/**
 * Handles incoming WebSocket messages.
 */
function handleMessage(
  socketId: string,
  connection: AuthenticatedConnection,
  rawMessage: string
): void {
  try {
    const parsed = JSON.parse(rawMessage);
    
    // Validate message structure
    const messageResult = WebSocketMessageSchema.safeParse(parsed);
    if (!messageResult.success) {
      sendError(socketId, 'INVALID_MESSAGE', 'Invalid message format');
      return;
    }

    const { type, data } = messageResult.data;

    switch (type) {
      case 'ping':
        sendPong(socketId);
        break;

      case 'event':
        handleEventMessage(socketId, connection, data);
        break;

      case 'sync':
        // TODO: Implement state sync in Sprint 1
        sendError(socketId, 'NOT_IMPLEMENTED', 'State sync not yet implemented');
        break;

      default:
        sendError(socketId, 'UNKNOWN_MESSAGE_TYPE', `Unknown message type: ${type}`);
    }
  } catch (err) {
    // TODO: Sentry.captureException(err, {
    //   tags: { component: 'websocket_message_handler' },
    //   extra: { socketId },
    // });
    console.error('[CollaborateRoute] Message parse error:', err);
    sendError(socketId, 'PARSE_ERROR', 'Failed to parse message');
  }
}

/**
 * Handles event-type messages (collaboration events).
 */
function handleEventMessage(
  socketId: string,
  connection: AuthenticatedConnection,
  data: unknown
): void {
  // Check if user can send events (needs edit permission for most events)
  if (!connection.canEdit) {
    sendError(socketId, 'FORBIDDEN', 'You do not have edit permission for this project');
    return;
  }

  // Validate event envelope
  const validationResult = validateDAWEvent(data);
  if (!validationResult.success || !validationResult.data) {
    sendError(
      socketId,
      'VALIDATION_ERROR',
      'Invalid event format',
      (data as { event_id?: string })?.event_id
    );
    return;
  }

  const event = validationResult.data;

  // Validate project_id matches
  if (event.project_id !== connection.projectId) {
    sendError(socketId, 'PROJECT_MISMATCH', 'Event project_id does not match connection', event.event_id);
    return;
  }

  // Validate actor_id matches
  if (event.actor_id !== connection.userId) {
    sendError(socketId, 'ACTOR_MISMATCH', 'Event actor_id does not match authenticated user', event.event_id);
    return;
  }

  // Process the event
  const result = processEvent(socketId, event);

  if (!result.success) {
    sendError(socketId, 'PROCESSING_ERROR', result.error ?? 'Failed to process event', event.event_id);
    return;
  }

  // Send acknowledgment
  sendAck(socketId, event.event_id, result.seq!);
}

// ============================================================================
// Route Registration
// ============================================================================

export async function collaborateRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * WebSocket endpoint for realtime collaboration.
   * 
   * Connection URL: ws://host/api/v1/daw/collaborate/:projectId?token=JWT&client_id=UUID
   * 
   * Authentication is done via query parameter since WebSocket doesn't support
   * custom headers in the initial handshake from browsers.
   */
  fastify.get<{
    Params: CollaborateParams;
    Querystring: CollaborateQuerystring;
  }>(
    '/:projectId',
    { websocket: true },
    async (socket: WebSocket, request: FastifyRequest<{
      Params: CollaborateParams;
      Querystring: CollaborateQuerystring;
    }>) => {
      const { projectId } = request.params;
      const { token, client_id } = request.query;
      const socketId = randomUUID();

      console.log(`[CollaborateRoute] New connection attempt for project ${projectId}`);

      // Authenticate the connection
      const authResult = await authenticateConnection(
        token ?? '',
        projectId,
        client_id ?? randomUUID()
      );

      if ('error' in authResult) {
        console.log(`[CollaborateRoute] Auth failed: ${authResult.error}`);
        socket.close(4001, authResult.error);
        return;
      }

      const connection = authResult;

      // Register the client
      connectionRegistry.registerClient(
        socketId,
        socket,
        connection.userId,
        connection.projectId,
        connection.clientId
      );

      // Send welcome message
      socket.send(JSON.stringify({
        type: 'connected',
        data: {
          socket_id: socketId,
          project_id: connection.projectId,
          client_id: connection.clientId,
          can_edit: connection.canEdit,
          timestamp: new Date().toISOString(),
        },
      }));

      // TODO: PostHog.capture('daw_realtime_connected', {
      //   user_id: connection.userId,
      //   project_id: connection.projectId,
      // });

      // Handle incoming messages
      socket.on('message', (rawMessage: Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const message = rawMessage.toString();
          handleMessage(socketId, connection, message);
        } catch (err) {
          console.error('[CollaborateRoute] Message handler error:', err);
        }
      });

      // Handle connection close
      socket.on('close', (code: number, reason: Buffer) => {
        console.log(`[CollaborateRoute] Connection closed: ${socketId} (code: ${code})`);
        connectionRegistry.unregisterClient(socketId);

        // TODO: PostHog.capture('daw_realtime_disconnected', {
        //   user_id: connection.userId,
        //   project_id: connection.projectId,
        //   close_code: code,
        //   reason: reason.toString(),
        // });
      });

      // Handle errors
      socket.on('error', (error: Error) => {
        console.error(`[CollaborateRoute] Socket error for ${socketId}:`, error);
        
        // TODO: Sentry.captureException(error, {
        //   tags: { component: 'websocket' },
        //   extra: { socketId, projectId: connection.projectId },
        // });

        connectionRegistry.unregisterClient(socketId);
      });
    }
  );
}

export default collaborateRoutes;
