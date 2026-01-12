/**
 * DAW WebSocket Collaboration Routes
 * Handles realtime collaboration via WebSocket at /api/v1/daw/collaborate/:projectId
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import * as Sentry from '@sentry/node';
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
import {
  presenceService,
  type UserPresence,
  type PresenceUpdatePayload,
} from '../../services/daw/presence.service.js';
import {
  lockService,
  type LockResourceType,
} from '../../services/daw/lock.service.js';

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
  displayName: string;
  avatarUrl?: string;
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
    let displayName = user.user_metadata?.display_name || user.email || 'Unknown User';
    const avatarUrl = user.user_metadata?.avatar_url;

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
      displayName,
      avatarUrl,
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

      case 'presence':
        handlePresenceMessage(socketId, connection, data);
        break;

      case 'lock':
        handleLockMessage(socketId, connection, data);
        break;

      case 'sync':
        handleSyncMessage(socketId, connection);
        break;

      default:
        sendError(socketId, 'UNKNOWN_MESSAGE_TYPE', `Unknown message type: ${type}`);
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: 'websocket_message_handler' },
      extra: { socketId },
    });
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

/**
 * Handles presence-related messages.
 */
function handlePresenceMessage(
  socketId: string,
  connection: AuthenticatedConnection,
  data: unknown
): void {
  if (!data || typeof data !== 'object') {
    sendError(socketId, 'INVALID_PAYLOAD', 'Invalid presence payload');
    return;
  }

  const payload = data as Record<string, unknown>;
  const action = payload.action as string;

  switch (action) {
    case 'join': {
      // User joins presence tracking
      presenceService.join(connection.projectId, {
        userId: connection.userId,
        clientId: connection.clientId,
        displayName: connection.displayName,
        avatarUrl: connection.avatarUrl,
      });
      
      // Send current presence state to the joining client
      const client = connectionRegistry.getClient(socketId);
      if (client && client.socket.readyState === 1) {
        const allUsers = presenceService.getAll(connection.projectId);
        const allLocks = lockService.getLocksForProject(connection.projectId);
        
        client.socket.send(JSON.stringify({
          type: 'presence',
          action: 'sync',
          data: { users: allUsers },
        }));
        
        client.socket.send(JSON.stringify({
          type: 'lock',
          action: 'sync',
          data: { locks: allLocks },
        }));
      }
      break;
    }

    case 'leave': {
      presenceService.leave(connection.projectId, connection.clientId, 'explicit');
      break;
    }

    case 'update': {
      const updates: PresenceUpdatePayload = {
        cursorPosition: payload.cursorPosition as number | undefined,
        playheadPosition: payload.playheadPosition as number | undefined,
        selectedTrackId: payload.selectedTrackId as string | undefined,
        selectedClipIds: payload.selectedClipIds as string[] | undefined,
        activity: payload.activity as PresenceUpdatePayload['activity'],
      };
      
      // Remove undefined values
      Object.keys(updates).forEach((key) => {
        if (updates[key as keyof PresenceUpdatePayload] === undefined) {
          delete updates[key as keyof PresenceUpdatePayload];
        }
      });
      
      presenceService.update(connection.projectId, connection.clientId, updates);
      break;
    }

    default:
      sendError(socketId, 'UNKNOWN_PRESENCE_ACTION', `Unknown presence action: ${action}`);
  }
}

/**
 * Handles lock-related messages.
 */
function handleLockMessage(
  socketId: string,
  connection: AuthenticatedConnection,
  data: unknown
): void {
  if (!connection.canEdit) {
    sendError(socketId, 'FORBIDDEN', 'You do not have edit permission for this project');
    return;
  }

  if (!data || typeof data !== 'object') {
    sendError(socketId, 'INVALID_PAYLOAD', 'Invalid lock payload');
    return;
  }

  const payload = data as Record<string, unknown>;
  const action = payload.action as string;

  switch (action) {
    case 'acquire': {
      const resourceType = payload.resourceType as LockResourceType;
      const resourceId = payload.resourceId as string;
      const reason = payload.reason as string | undefined;

      if (!resourceType || !resourceId) {
        sendError(socketId, 'INVALID_PAYLOAD', 'resourceType and resourceId are required');
        return;
      }

      const result = lockService.acquire(connection.projectId, {
        resourceType,
        resourceId,
        userId: connection.userId,
        clientId: connection.clientId,
        displayName: connection.displayName,
        reason,
      });

      // Send response to requester
      const client = connectionRegistry.getClient(socketId);
      if (client && client.socket.readyState === 1) {
        client.socket.send(JSON.stringify({
          type: 'lock_response',
          data: {
            action: 'acquire',
            resourceType,
            resourceId,
            granted: result.granted,
            lock: result.lock,
            error: result.error,
            heldBy: result.heldBy,
          },
        }));
      }
      break;
    }

    case 'release': {
      const resourceType = payload.resourceType as LockResourceType;
      const resourceId = payload.resourceId as string;

      if (!resourceType || !resourceId) {
        sendError(socketId, 'INVALID_PAYLOAD', 'resourceType and resourceId are required');
        return;
      }

      const released = lockService.release(
        resourceType,
        resourceId,
        connection.clientId,
        connection.projectId
      );

      // Send response to requester
      const client = connectionRegistry.getClient(socketId);
      if (client && client.socket.readyState === 1) {
        client.socket.send(JSON.stringify({
          type: 'lock_response',
          data: {
            action: 'release',
            resourceType,
            resourceId,
            success: released,
          },
        }));
      }
      break;
    }

    case 'heartbeat': {
      const resourceType = payload.resourceType as LockResourceType;
      const resourceId = payload.resourceId as string;

      if (!resourceType || !resourceId) {
        sendError(socketId, 'INVALID_PAYLOAD', 'resourceType and resourceId are required');
        return;
      }

      const renewed = lockService.heartbeat(resourceType, resourceId, connection.clientId);

      if (!renewed) {
        // Lock expired or not found
        const client = connectionRegistry.getClient(socketId);
        if (client && client.socket.readyState === 1) {
          client.socket.send(JSON.stringify({
            type: 'lock_response',
            data: {
              action: 'heartbeat',
              resourceType,
              resourceId,
              success: false,
              error: 'Lock not found or expired',
            },
          }));
        }
      }
      break;
    }

    default:
      sendError(socketId, 'UNKNOWN_LOCK_ACTION', `Unknown lock action: ${action}`);
  }
}

/**
 * Handles sync request messages.
 */
function handleSyncMessage(
  socketId: string,
  connection: AuthenticatedConnection
): void {
  const client = connectionRegistry.getClient(socketId);
  if (!client || client.socket.readyState !== 1) return;

  // Send current presence state
  const allUsers = presenceService.getAll(connection.projectId);
  client.socket.send(JSON.stringify({
    type: 'presence',
    action: 'sync',
    data: { users: allUsers },
  }));

  // Send current lock state
  const allLocks = lockService.getLocksForProject(connection.projectId);
  client.socket.send(JSON.stringify({
    type: 'lock',
    action: 'sync',
    data: { locks: allLocks },
  }));
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
        
        // Clean up presence
        presenceService.leave(connection.projectId, connection.clientId, 'disconnect');
        
        // Clean up locks held by this client
        lockService.releaseAllForClient(connection.clientId, 'disconnect');
        
        // Unregister from connection registry
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
        
        Sentry.captureException(error, {
          tags: { component: 'websocket' },
          extra: { socketId, projectId: connection.projectId },
        });

        // Clean up presence and locks on error
        presenceService.leave(connection.projectId, connection.clientId, 'disconnect');
        lockService.releaseAllForClient(connection.clientId, 'disconnect');
        
        connectionRegistry.unregisterClient(socketId);
      });
    }
  );
}

export default collaborateRoutes;
