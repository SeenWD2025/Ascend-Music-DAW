/**
 * DAW Realtime WebSocket Client
 * Handles WebSocket connection, presence sync, and lock management.
 */

import * as Sentry from '@sentry/browser';

// ============================================================================
// Types
// ============================================================================

export interface UserPresence {
  userId: string;
  clientId: string;
  displayName: string;
  avatarUrl?: string;
  color: string;
  cursorPosition?: number;
  playheadPosition?: number;
  selectedTrackId?: string;
  selectedClipIds?: string[];
  activity?: 'idle' | 'editing' | 'playing' | 'recording' | 'dragging';
  lastSeen: string;
  joinedAt: string;
}

export interface Lock {
  lockId: string;
  projectId: string;
  resourceType: 'clip' | 'track' | 'plugin' | 'selection';
  resourceId: string;
  holderId: string;
  holderClientId: string;
  holderDisplayName?: string;
  acquiredAt: string;
  expiresAt: string;
  reason?: string;
}

export interface DAWEvent {
  event_id: string;
  project_id: string;
  actor_id: string;
  client_id: string;
  seq: number;
  sent_at: string;
  received_at?: string;
  type: string;
  version: string;
  payload: Record<string, unknown>;
}

export interface WebSocketMessage {
  type: string;
  data?: unknown;
  action?: string;
}

export interface ConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  error?: string;
  reconnectAttempt: number;
}

type PresenceHandler = (users: UserPresence[]) => void;
type LockHandler = (locks: Lock[]) => void;
type EventHandler = (event: DAWEvent) => void;
type ConnectionHandler = (state: ConnectionState) => void;

// ============================================================================
// Constants
// ============================================================================

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000]; // Exponential backoff
const HEARTBEAT_INTERVAL = 5000; // 5 seconds
const CURSOR_THROTTLE_MS = 50; // Max 20 updates/sec

// ============================================================================
// Realtime Client
// ============================================================================

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private projectId: string = '';
  private token: string = '';
  private clientId: string = '';
  private reconnectAttempts: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private cursorThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCursorUpdate: Record<string, unknown> | null = null;
  private isIntentionalClose: boolean = false;
  
  // Lock heartbeat timers
  private lockHeartbeatTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  
  // Event handlers
  private presenceHandlers: Set<PresenceHandler> = new Set();
  private lockHandlers: Set<LockHandler> = new Set();
  private eventHandlers: Set<EventHandler> = new Set();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  
  // Current state
  private connectionState: ConnectionState = {
    isConnected: false,
    isConnecting: false,
    reconnectAttempt: 0,
  };

  /**
   * Gets the current client ID.
   */
  getClientId(): string {
    return this.clientId;
  }

  /**
   * Gets the current connection state.
   */
  getConnectionState(): ConnectionState {
    return { ...this.connectionState };
  }

  /**
   * Generates a unique client ID for this browser tab.
   */
  private generateClientId(): string {
    // Check if we already have one in session storage
    const storedClientId = sessionStorage.getItem('daw_client_id');
    if (storedClientId) return storedClientId;
    
    // Generate new UUID v4
    const clientId = crypto.randomUUID();
    sessionStorage.setItem('daw_client_id', clientId);
    return clientId;
  }

  /**
   * Gets the WebSocket URL for a project.
   */
  private getWebSocketUrl(projectId: string, token: string): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_API_URL?.replace(/^https?:\/\//, '') || window.location.host;
    return `${protocol}//${host}/api/v1/daw/collaborate/${projectId}?token=${encodeURIComponent(token)}&client_id=${this.clientId}`;
  }

  /**
   * Updates and broadcasts connection state.
   */
  private updateConnectionState(updates: Partial<ConnectionState>): void {
    this.connectionState = { ...this.connectionState, ...updates };
    this.connectionHandlers.forEach((handler) => handler(this.connectionState));
  }

  /**
   * Connects to a project's realtime channel.
   */
  connect(projectId: string, token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        if (this.projectId === projectId) {
          resolve();
          return;
        }
        // Disconnect from current project first
        this.disconnect();
      }

      this.projectId = projectId;
      this.token = token;
      this.clientId = this.generateClientId();
      this.isIntentionalClose = false;
      
      this.updateConnectionState({ isConnecting: true, error: undefined });

      const url = this.getWebSocketUrl(projectId, token);
      
      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to create WebSocket';
        Sentry.captureException(err, {
          tags: { component: 'realtime_client' },
          extra: { projectId },
        });
        this.updateConnectionState({ isConnecting: false, error });
        reject(new Error(error));
        return;
      }

      const connectionTimeout = setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          this.ws?.close();
          const error = 'Connection timeout';
          this.updateConnectionState({ isConnecting: false, error });
          reject(new Error(error));
        }
      }, 10000);

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log('[RealtimeClient] Connected to', projectId);
        
        this.reconnectAttempts = 0;
        this.updateConnectionState({
          isConnected: true,
          isConnecting: false,
          reconnectAttempt: 0,
        });
        
        this.startHeartbeat();
        
        // Join presence
        this.send({
          type: 'presence',
          data: { action: 'join' },
        });
        
        resolve();
      };

      this.ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        console.log('[RealtimeClient] Disconnected', event.code, event.reason);
        
        this.cleanup();
        this.updateConnectionState({ isConnected: false, isConnecting: false });
        
        // Attempt reconnect if not intentional
        if (!this.isIntentionalClose && event.code !== 4001) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (event) => {
        console.error('[RealtimeClient] WebSocket error:', event);
        
        Sentry.captureMessage('WebSocket error', {
          level: 'error',
          tags: { component: 'realtime_client' },
          extra: { projectId, readyState: this.ws?.readyState },
        });
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    });
  }

  /**
   * Disconnects from the current project.
   */
  disconnect(): void {
    this.isIntentionalClose = true;
    
    if (this.ws) {
      // Send leave message before closing
      if (this.ws.readyState === WebSocket.OPEN) {
        this.send({
          type: 'presence',
          data: { action: 'leave' },
        });
      }
      
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    this.cleanup();
    this.updateConnectionState({
      isConnected: false,
      isConnecting: false,
      reconnectAttempt: 0,
    });
  }

  /**
   * Cleans up timers and state.
   */
  private cleanup(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.cursorThrottleTimer) {
      clearTimeout(this.cursorThrottleTimer);
      this.cursorThrottleTimer = null;
    }
    
    // Clear all lock heartbeat timers
    for (const timer of this.lockHeartbeatTimers.values()) {
      clearInterval(timer);
    }
    this.lockHeartbeatTimers.clear();
  }

  /**
   * Starts the heartbeat/ping timer.
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Schedules a reconnection attempt with exponential backoff.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempts, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempts++;
    
    console.log(`[RealtimeClient] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.updateConnectionState({
      reconnectAttempt: this.reconnectAttempts,
    });
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      
      if (this.projectId && this.token) {
        this.connect(this.projectId, this.token).catch((err) => {
          console.error('[RealtimeClient] Reconnect failed:', err);
        });
      }
    }, delay);
  }

  /**
   * Sends a message through the WebSocket.
   */
  send(message: WebSocketMessage): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.warn('[RealtimeClient] Cannot send, not connected');
      return;
    }
    
    try {
      this.ws.send(JSON.stringify(message));
    } catch (err) {
      console.error('[RealtimeClient] Send error:', err);
      Sentry.captureException(err, {
        tags: { component: 'realtime_client', operation: 'send' },
      });
    }
  }

  /**
   * Sends a DAW event.
   */
  sendEvent(type: string, payload: Record<string, unknown>): void {
    const event: DAWEvent = {
      event_id: crypto.randomUUID(),
      project_id: this.projectId,
      actor_id: '', // Will be filled by auth on server
      client_id: this.clientId,
      seq: 0, // Server assigns
      sent_at: new Date().toISOString(),
      type,
      version: '1.0',
      payload,
    };
    
    this.send({ type: 'event', data: event });
  }

  /**
   * Handles incoming WebSocket messages.
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as WebSocketMessage;
      
      switch (message.type) {
        case 'pong':
          // Heartbeat response, no action needed
          break;
          
        case 'connected':
          // Initial connection acknowledgment
          console.log('[RealtimeClient] Connection acknowledged:', message.data);
          break;
          
        case 'presence':
          this.handlePresenceMessage(message);
          break;
          
        case 'lock':
          this.handleLockMessage(message);
          break;
          
        case 'lock_response':
          this.handleLockResponse(message);
          break;
          
        case 'event':
          this.handleEventMessage(message);
          break;
          
        case 'ack':
          // Event acknowledged
          console.log('[RealtimeClient] Event acknowledged:', message.data);
          break;
          
        case 'error':
          console.error('[RealtimeClient] Server error:', message.data);
          Sentry.captureMessage('Realtime server error', {
            level: 'warning',
            extra: { error: message.data },
          });
          break;
          
        default:
          console.log('[RealtimeClient] Unknown message type:', message.type);
      }
    } catch (err) {
      console.error('[RealtimeClient] Message parse error:', err);
    }
  }

  /**
   * Handles presence messages.
   */
  private handlePresenceMessage(message: WebSocketMessage): void {
    const data = message.data as { users?: UserPresence[]; action?: string };
    
    if (data?.users) {
      this.presenceHandlers.forEach((handler) => handler(data.users!));
    }
  }

  /**
   * Handles lock messages.
   */
  private handleLockMessage(message: WebSocketMessage): void {
    const data = message.data as { locks?: Lock[]; action?: string };
    
    if (data?.locks) {
      this.lockHandlers.forEach((handler) => handler(data.locks!));
    }
  }

  /**
   * Handles lock operation responses.
   */
  private handleLockResponse(message: WebSocketMessage): void {
    const data = message.data as {
      action: string;
      resourceType: string;
      resourceId: string;
      granted?: boolean;
      success?: boolean;
      lock?: Lock;
      error?: string;
    };
    
    console.log('[RealtimeClient] Lock response:', data);
    
    // If lock was granted, start heartbeat
    if (data.action === 'acquire' && data.granted && data.lock) {
      this.startLockHeartbeat(data.resourceType, data.resourceId);
    }
    
    // If lock was released or failed, stop heartbeat
    if (data.action === 'release' || (data.action === 'heartbeat' && !data.success)) {
      this.stopLockHeartbeat(data.resourceType, data.resourceId);
    }
  }

  /**
   * Handles event messages.
   */
  private handleEventMessage(message: WebSocketMessage): void {
    const event = message.data as DAWEvent;
    
    if (event) {
      this.eventHandlers.forEach((handler) => handler(event));
    }
  }

  // ============================================================================
  // Presence Methods
  // ============================================================================

  /**
   * Updates cursor position with throttling.
   */
  updateCursor(position: number): void {
    this.pendingCursorUpdate = {
      ...this.pendingCursorUpdate,
      cursorPosition: position,
    };
    
    this.sendThrottledCursorUpdate();
  }

  /**
   * Updates playhead position with throttling.
   */
  updatePlayhead(position: number): void {
    this.pendingCursorUpdate = {
      ...this.pendingCursorUpdate,
      playheadPosition: position,
    };
    
    this.sendThrottledCursorUpdate();
  }

  /**
   * Updates selected clips.
   */
  selectClips(clipIds: string[]): void {
    this.send({
      type: 'presence',
      data: {
        action: 'update',
        selectedClipIds: clipIds,
      },
    });
  }

  /**
   * Updates selected track.
   */
  selectTrack(trackId: string | null): void {
    this.send({
      type: 'presence',
      data: {
        action: 'update',
        selectedTrackId: trackId,
      },
    });
  }

  /**
   * Updates activity state.
   */
  updateActivity(activity: 'idle' | 'editing' | 'playing' | 'recording' | 'dragging'): void {
    this.send({
      type: 'presence',
      data: {
        action: 'update',
        activity,
      },
    });
  }

  /**
   * Sends throttled cursor update.
   */
  private sendThrottledCursorUpdate(): void {
    if (this.cursorThrottleTimer) return;
    
    this.cursorThrottleTimer = setTimeout(() => {
      this.cursorThrottleTimer = null;
      
      if (this.pendingCursorUpdate) {
        this.send({
          type: 'presence',
          data: {
            action: 'update',
            ...this.pendingCursorUpdate,
          },
        });
        this.pendingCursorUpdate = null;
      }
    }, CURSOR_THROTTLE_MS);
  }

  // ============================================================================
  // Lock Methods
  // ============================================================================

  /**
   * Acquires a lock on a resource.
   */
  acquireLock(
    resourceType: 'clip' | 'track' | 'plugin' | 'selection',
    resourceId: string,
    reason?: string
  ): void {
    this.send({
      type: 'lock',
      data: {
        action: 'acquire',
        resourceType,
        resourceId,
        reason,
      },
    });
  }

  /**
   * Releases a lock on a resource.
   */
  releaseLock(
    resourceType: 'clip' | 'track' | 'plugin' | 'selection',
    resourceId: string
  ): void {
    this.stopLockHeartbeat(resourceType, resourceId);
    
    this.send({
      type: 'lock',
      data: {
        action: 'release',
        resourceType,
        resourceId,
      },
    });
  }

  /**
   * Starts the heartbeat for a held lock.
   */
  private startLockHeartbeat(resourceType: string, resourceId: string): void {
    const key = `${resourceType}:${resourceId}`;
    
    // Clear existing timer if any
    this.stopLockHeartbeat(resourceType, resourceId);
    
    const timer = setInterval(() => {
      this.send({
        type: 'lock',
        data: {
          action: 'heartbeat',
          resourceType,
          resourceId,
        },
      });
    }, HEARTBEAT_INTERVAL);
    
    this.lockHeartbeatTimers.set(key, timer);
  }

  /**
   * Stops the heartbeat for a lock.
   */
  private stopLockHeartbeat(resourceType: string, resourceId: string): void {
    const key = `${resourceType}:${resourceId}`;
    
    const timer = this.lockHeartbeatTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this.lockHeartbeatTimers.delete(key);
    }
  }

  // ============================================================================
  // Event Subscription Methods
  // ============================================================================

  /**
   * Subscribes to presence updates.
   */
  onPresenceUpdate(handler: PresenceHandler): () => void {
    this.presenceHandlers.add(handler);
    return () => this.presenceHandlers.delete(handler);
  }

  /**
   * Subscribes to lock changes.
   */
  onLockChange(handler: LockHandler): () => void {
    this.lockHandlers.add(handler);
    return () => this.lockHandlers.delete(handler);
  }

  /**
   * Subscribes to DAW events.
   */
  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Subscribes to connection state changes.
   */
  onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }
}

// Singleton instance
export const realtimeClient = new RealtimeClient();

export default realtimeClient;
