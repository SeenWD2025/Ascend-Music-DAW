/**
 * DAW Realtime Collaboration Service
 * Manages WebSocket connections, message broadcasting, and event sequencing.
 */

import type { WebSocket } from 'ws';
import type { DAWEventEnvelope } from '../../schemas/daw/realtime.schema.js';

// ============================================================================
// Types
// ============================================================================

export interface ConnectedClient {
  /** Unique socket identifier */
  socketId: string;
  
  /** WebSocket connection */
  socket: WebSocket;
  
  /** Authenticated user ID */
  userId: string;
  
  /** Project ID they're connected to */
  projectId: string;
  
  /** Client instance ID (per browser tab) */
  clientId: string;
  
  /** Connection timestamp */
  connectedAt: Date;
  
  /** Last activity timestamp */
  lastActivity: Date;
}

export interface ProjectSession {
  /** Project ID */
  projectId: string;
  
  /** Connected clients */
  clients: Map<string, ConnectedClient>;
  
  /** Monotonic sequence counter for this project */
  sequenceNumber: number;
  
  /** Processed event IDs for idempotency (LRU cache behavior) */
  processedEventIds: Set<string>;
  
  /** Maximum number of event IDs to track for idempotency */
  maxEventIdHistory: number;
}

export interface BroadcastOptions {
  /** Exclude specific socket IDs from broadcast */
  exclude?: string[];
  
  /** Only send to specific socket IDs */
  include?: string[];
  
  /** Whether to echo back to sender */
  echoToSender?: boolean;
}

// ============================================================================
// Connection Registry
// ============================================================================

/**
 * Global registry of all active WebSocket connections.
 */
class ConnectionRegistry {
  /** Map of project ID -> ProjectSession */
  private sessions: Map<string, ProjectSession> = new Map();
  
  /** Map of socket ID -> ConnectedClient (for quick lookups) */
  private clientsBySocket: Map<string, ConnectedClient> = new Map();
  
  /** Max event IDs to track per project for idempotency */
  private readonly MAX_EVENT_ID_HISTORY = 10000;

  /**
   * Registers a new client connection.
   */
  registerClient(
    socketId: string,
    socket: WebSocket,
    userId: string,
    projectId: string,
    clientId: string
  ): ConnectedClient {
    // Create or get project session
    let session = this.sessions.get(projectId);
    if (!session) {
      session = {
        projectId,
        clients: new Map(),
        sequenceNumber: 0,
        processedEventIds: new Set(),
        maxEventIdHistory: this.MAX_EVENT_ID_HISTORY,
      };
      this.sessions.set(projectId, session);
      
      // TODO: PostHog.capture('daw_realtime_session_created', {
      //   project_id: projectId,
      // });
    }

    const client: ConnectedClient = {
      socketId,
      socket,
      userId,
      projectId,
      clientId,
      connectedAt: new Date(),
      lastActivity: new Date(),
    };

    session.clients.set(socketId, client);
    this.clientsBySocket.set(socketId, client);

    // TODO: PostHog.capture('daw_realtime_client_connected', {
    //   project_id: projectId,
    //   user_id: userId,
    //   client_id: clientId,
    //   active_clients: session.clients.size,
    // });

    console.log(`[RealtimeService] Client connected: ${socketId} to project ${projectId}`);
    
    return client;
  }

  /**
   * Unregisters a client connection.
   */
  unregisterClient(socketId: string): void {
    const client = this.clientsBySocket.get(socketId);
    if (!client) return;

    const session = this.sessions.get(client.projectId);
    if (session) {
      session.clients.delete(socketId);
      
      // TODO: PostHog.capture('daw_realtime_client_disconnected', {
      //   project_id: client.projectId,
      //   user_id: client.userId,
      //   active_clients: session.clients.size,
      //   session_duration_ms: Date.now() - client.connectedAt.getTime(),
      // });

      // Clean up empty sessions
      if (session.clients.size === 0) {
        this.sessions.delete(client.projectId);
        
        // TODO: PostHog.capture('daw_realtime_session_ended', {
        //   project_id: client.projectId,
        // });
        
        console.log(`[RealtimeService] Session ended for project ${client.projectId}`);
      }
    }

    this.clientsBySocket.delete(socketId);
    console.log(`[RealtimeService] Client disconnected: ${socketId}`);
  }

  /**
   * Gets a client by socket ID.
   */
  getClient(socketId: string): ConnectedClient | undefined {
    return this.clientsBySocket.get(socketId);
  }

  /**
   * Gets a project session.
   */
  getSession(projectId: string): ProjectSession | undefined {
    return this.sessions.get(projectId);
  }

  /**
   * Gets all clients for a project.
   */
  getProjectClients(projectId: string): ConnectedClient[] {
    const session = this.sessions.get(projectId);
    return session ? Array.from(session.clients.values()) : [];
  }

  /**
   * Gets the count of connected clients for a project.
   */
  getProjectClientCount(projectId: string): number {
    const session = this.sessions.get(projectId);
    return session?.clients.size ?? 0;
  }

  /**
   * Gets all active project IDs.
   */
  getActiveProjectIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Gets total connected clients across all projects.
   */
  getTotalClientCount(): number {
    return this.clientsBySocket.size;
  }

  /**
   * Updates client activity timestamp.
   */
  updateClientActivity(socketId: string): void {
    const client = this.clientsBySocket.get(socketId);
    if (client) {
      client.lastActivity = new Date();
    }
  }
}

// Singleton instance
export const connectionRegistry = new ConnectionRegistry();

// ============================================================================
// Sequence Number Management
// ============================================================================

/**
 * Gets the next sequence number for a project.
 * Sequence numbers are monotonically increasing per project.
 */
export function getNextSequenceNumber(projectId: string): number {
  const session = connectionRegistry.getSession(projectId);
  if (!session) {
    // Create a temporary session just for sequence tracking
    // This shouldn't happen in normal operation
    console.warn(`[RealtimeService] No session for project ${projectId}, creating one`);
    return 1;
  }
  
  session.sequenceNumber += 1;
  return session.sequenceNumber;
}

/**
 * Gets the current sequence number for a project (without incrementing).
 */
export function getCurrentSequenceNumber(projectId: string): number {
  const session = connectionRegistry.getSession(projectId);
  return session?.sequenceNumber ?? 0;
}

// ============================================================================
// Idempotency Check
// ============================================================================

/**
 * Checks if an event has already been processed (for idempotency).
 * Returns true if the event is a duplicate.
 */
export function isDuplicateEvent(projectId: string, eventId: string): boolean {
  const session = connectionRegistry.getSession(projectId);
  if (!session) return false;
  
  return session.processedEventIds.has(eventId);
}

/**
 * Marks an event as processed.
 */
export function markEventProcessed(projectId: string, eventId: string): void {
  const session = connectionRegistry.getSession(projectId);
  if (!session) return;
  
  // Add to processed set
  session.processedEventIds.add(eventId);
  
  // LRU-style cleanup: if we exceed max, remove oldest entries
  // Note: Set maintains insertion order in JS
  if (session.processedEventIds.size > session.maxEventIdHistory) {
    const iterator = session.processedEventIds.values();
    const toRemove = session.processedEventIds.size - session.maxEventIdHistory;
    for (let i = 0; i < toRemove; i++) {
      const oldest = iterator.next().value;
      if (oldest) {
        session.processedEventIds.delete(oldest);
      }
    }
  }
}

// ============================================================================
// Message Broadcasting
// ============================================================================

/**
 * Broadcasts an event to all clients in a project.
 */
export function broadcastToProject(
  projectId: string,
  event: DAWEventEnvelope,
  options: BroadcastOptions = {}
): { sent: number; failed: number } {
  const { exclude = [], include, echoToSender = false } = options;
  const clients = connectionRegistry.getProjectClients(projectId);
  
  let sent = 0;
  let failed = 0;
  
  const message = JSON.stringify({
    type: 'event',
    data: event,
  });
  
  for (const client of clients) {
    // Skip excluded sockets
    if (exclude.includes(client.socketId)) continue;
    
    // Skip if not in include list (when specified)
    if (include && !include.includes(client.socketId)) continue;
    
    // Skip sender unless echo is enabled
    if (!echoToSender && client.clientId === event.client_id) continue;
    
    try {
      if (client.socket.readyState === 1) { // WebSocket.OPEN
        client.socket.send(message);
        sent++;
      } else {
        failed++;
      }
    } catch (err) {
      // TODO: Sentry.captureException(err, {
      //   tags: { operation: 'broadcast' },
      //   extra: { projectId, socketId: client.socketId },
      // });
      
      console.error(`[RealtimeService] Failed to send to ${client.socketId}:`, err);
      failed++;
    }
  }
  
  return { sent, failed };
}

/**
 * Sends an acknowledgment to a specific client.
 */
export function sendAck(
  socketId: string,
  eventId: string,
  seq: number
): boolean {
  const client = connectionRegistry.getClient(socketId);
  if (!client || client.socket.readyState !== 1) {
    return false;
  }
  
  try {
    client.socket.send(JSON.stringify({
      type: 'ack',
      data: {
        event_id: eventId,
        seq,
        received_at: new Date().toISOString(),
      },
    }));
    return true;
  } catch (err) {
    console.error(`[RealtimeService] Failed to send ack to ${socketId}:`, err);
    return false;
  }
}

/**
 * Sends an error to a specific client.
 */
export function sendError(
  socketId: string,
  code: string,
  message: string,
  eventId?: string
): boolean {
  const client = connectionRegistry.getClient(socketId);
  if (!client || client.socket.readyState !== 1) {
    return false;
  }
  
  try {
    client.socket.send(JSON.stringify({
      type: 'error',
      data: {
        code,
        message,
        event_id: eventId,
        timestamp: new Date().toISOString(),
      },
    }));
    return true;
  } catch (err) {
    console.error(`[RealtimeService] Failed to send error to ${socketId}:`, err);
    return false;
  }
}

/**
 * Sends a pong response to a ping.
 */
export function sendPong(socketId: string): boolean {
  const client = connectionRegistry.getClient(socketId);
  if (!client || client.socket.readyState !== 1) {
    return false;
  }
  
  try {
    client.socket.send(JSON.stringify({
      type: 'pong',
      data: {
        timestamp: new Date().toISOString(),
      },
    }));
    return true;
  } catch (err) {
    console.error(`[RealtimeService] Failed to send pong to ${socketId}:`, err);
    return false;
  }
}

// ============================================================================
// Event Processing
// ============================================================================

/**
 * Processes an incoming event from a client.
 * Validates, assigns sequence number, checks idempotency, and broadcasts.
 */
export function processEvent(
  socketId: string,
  event: DAWEventEnvelope
): { success: boolean; error?: string; seq?: number } {
  const client = connectionRegistry.getClient(socketId);
  if (!client) {
    return { success: false, error: 'Client not found' };
  }
  
  // Validate project_id matches connected project
  if (event.project_id !== client.projectId) {
    return { success: false, error: 'Project ID mismatch' };
  }
  
  // Validate actor_id matches authenticated user
  if (event.actor_id !== client.userId) {
    return { success: false, error: 'Actor ID mismatch' };
  }
  
  // Check for duplicate event (idempotency)
  if (isDuplicateEvent(client.projectId, event.event_id)) {
    // Duplicate - acknowledge but don't rebroadcast
    const currentSeq = getCurrentSequenceNumber(client.projectId);
    return { success: true, seq: currentSeq };
  }
  
  // Assign server-side fields
  const seq = getNextSequenceNumber(client.projectId);
  const processedEvent: DAWEventEnvelope = {
    ...event,
    seq,
    received_at: new Date().toISOString(),
  };
  
  // Mark event as processed
  markEventProcessed(client.projectId, event.event_id);
  
  // Update client activity
  connectionRegistry.updateClientActivity(socketId);
  
  // Broadcast to all other clients
  const { sent, failed } = broadcastToProject(client.projectId, processedEvent);
  
  // TODO: PostHog.capture('daw_realtime_event_processed', {
  //   project_id: client.projectId,
  //   event_type: event.type,
  //   seq,
  //   clients_sent: sent,
  //   clients_failed: failed,
  // });
  
  console.log(`[RealtimeService] Event ${event.type} processed: seq=${seq}, sent=${sent}, failed=${failed}`);
  
  return { success: true, seq };
}

// ============================================================================
// Cleanup & Maintenance
// ============================================================================

/**
 * Cleans up stale connections (for use with a periodic timer).
 */
export function cleanupStaleConnections(maxIdleMs: number = 5 * 60 * 1000): number {
  let cleaned = 0;
  const now = Date.now();
  
  for (const client of Array.from(connectionRegistry['clientsBySocket'].values())) {
    const idleTime = now - client.lastActivity.getTime();
    if (idleTime > maxIdleMs) {
      try {
        client.socket.close(4000, 'Connection idle timeout');
      } catch {
        // Socket already closed
      }
      connectionRegistry.unregisterClient(client.socketId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[RealtimeService] Cleaned up ${cleaned} stale connections`);
  }
  
  return cleaned;
}

/**
 * Gets service statistics.
 */
export function getStats(): {
  totalClients: number;
  activeProjects: number;
  projectStats: Array<{ projectId: string; clients: number; seq: number }>;
} {
  const projectIds = connectionRegistry.getActiveProjectIds();
  
  return {
    totalClients: connectionRegistry.getTotalClientCount(),
    activeProjects: projectIds.length,
    projectStats: projectIds.map((projectId) => ({
      projectId,
      clients: connectionRegistry.getProjectClientCount(projectId),
      seq: getCurrentSequenceNumber(projectId),
    })),
  };
}

export default {
  connectionRegistry,
  getNextSequenceNumber,
  getCurrentSequenceNumber,
  isDuplicateEvent,
  markEventProcessed,
  broadcastToProject,
  sendAck,
  sendError,
  sendPong,
  processEvent,
  cleanupStaleConnections,
  getStats,
};
