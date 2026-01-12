/**
 * Plugin Sync Client
 * Frontend client for plugin parameter synchronization with throttling.
 * Handles lock acquisition, parameter changes, and collaboration state.
 */

import * as Sentry from '@sentry/browser';
import { realtimeClient, type DAWEvent, type Lock } from './client';

// ============================================================================
// Types
// ============================================================================

export interface PluginParamChange {
  pluginId: string;
  paramId: string;
  value: number;
  timestamp?: number;
}

export interface PluginParamBatch {
  pluginId: string;
  batchId: string;
  params: Record<string, number>;
  timestamp: string;
}

export interface PluginLockState {
  pluginId: string;
  holderId: string;
  holderDisplayName?: string;
  acquiredAt: string;
  isOwnLock: boolean;
}

export interface PluginEvent {
  type: 'plugin.add' | 'plugin.update' | 'plugin.param_change' | 'plugin.param_batch' | 'plugin.delete' | 'plugin.reorder';
  payload: Record<string, unknown>;
}

type PluginEventHandler = (event: PluginEvent) => void;
type PluginLockHandler = (lock: PluginLockState | null) => void;

// ============================================================================
// Constants
// ============================================================================

/** Throttle interval: 30Hz (33ms between sends) */
const THROTTLE_INTERVAL_MS = 33;

/** Lock heartbeat interval (5 seconds) */
const LOCK_HEARTBEAT_INTERVAL_MS = 5000;

/** Maximum queue size before force send */
const MAX_QUEUE_SIZE = 20;

// ============================================================================
// Plugin Sync Client
// ============================================================================

export class PluginSyncClient {
  /** Pending parameter changes to coalesce */
  private pendingChanges: Map<string, Map<string, PluginParamChange>> = new Map();
  
  /** Flush timers per plugin */
  private flushTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  
  /** Last send timestamps per plugin */
  private lastSendTimes: Map<string, number> = new Map();
  
  /** Current plugin locks */
  private pluginLocks: Map<string, PluginLockState> = new Map();
  
  /** Lock heartbeat timers */
  private lockHeartbeats: Map<string, ReturnType<typeof setInterval>> = new Map();
  
  /** Event handlers */
  private eventHandlers: Set<PluginEventHandler> = new Set();
  
  /** Per-plugin lock handlers */
  private lockHandlers: Map<string, Set<PluginLockHandler>> = new Map();
  
  /** Current user ID */
  private userId: string = '';
  
  /** Unsubscribe from realtime client */
  private unsubscribeEvent: (() => void) | null = null;
  private unsubscribeLock: (() => void) | null = null;

  /**
   * Initializes the plugin sync client.
   */
  initialize(userId: string): void {
    this.userId = userId;
    
    // Subscribe to DAW events
    this.unsubscribeEvent = realtimeClient.onEvent((event: DAWEvent) => {
      this.handleEvent(event);
    });
    
    // Subscribe to lock changes
    this.unsubscribeLock = realtimeClient.onLockChange((locks: Lock[]) => {
      this.handleLockChanges(locks);
    });
  }

  /**
   * Cleans up the plugin sync client.
   */
  destroy(): void {
    // Clear all timers
    for (const timer of this.flushTimers.values()) {
      clearTimeout(timer);
    }
    this.flushTimers.clear();
    
    for (const timer of this.lockHeartbeats.values()) {
      clearInterval(timer);
    }
    this.lockHeartbeats.clear();
    
    // Clear state
    this.pendingChanges.clear();
    this.pluginLocks.clear();
    this.eventHandlers.clear();
    this.lockHandlers.clear();
    
    // Unsubscribe
    this.unsubscribeEvent?.();
    this.unsubscribeLock?.();
  }

  // ==========================================================================
  // Parameter Changes
  // ==========================================================================

  /**
   * Sends a parameter change with throttling (30Hz).
   * Changes are coalesced within the throttle window.
   */
  sendParamChange(pluginId: string, paramId: string, value: number): void {
    // Check if we have lock
    if (!this.hasLock(pluginId)) {
      console.warn(`[PluginSyncClient] Cannot send param change without lock: ${pluginId}`);
      return;
    }
    
    // Get or create pending changes for this plugin
    let pluginChanges = this.pendingChanges.get(pluginId);
    if (!pluginChanges) {
      pluginChanges = new Map();
      this.pendingChanges.set(pluginId, pluginChanges);
    }
    
    // Store latest value (coalescing)
    pluginChanges.set(paramId, {
      pluginId,
      paramId,
      value,
      timestamp: Date.now(),
    });
    
    // Force flush if queue too large
    if (pluginChanges.size >= MAX_QUEUE_SIZE) {
      this.flushParamChanges(pluginId);
      return;
    }
    
    // Schedule throttled flush
    this.scheduleFlush(pluginId);
  }

  /**
   * Schedules a flush for pending changes.
   */
  private scheduleFlush(pluginId: string): void {
    // Cancel existing timer
    const existingTimer = this.flushTimers.get(pluginId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    const lastSend = this.lastSendTimes.get(pluginId) ?? 0;
    const timeSinceLastSend = Date.now() - lastSend;
    const delay = Math.max(0, THROTTLE_INTERVAL_MS - timeSinceLastSend);
    
    const timer = setTimeout(() => {
      this.flushTimers.delete(pluginId);
      this.flushParamChanges(pluginId);
    }, delay);
    
    this.flushTimers.set(pluginId, timer);
  }

  /**
   * Flushes pending parameter changes as a batch.
   */
  private flushParamChanges(pluginId: string): void {
    const pluginChanges = this.pendingChanges.get(pluginId);
    if (!pluginChanges || pluginChanges.size === 0) return;
    
    // Build params object
    const params: Record<string, number> = {};
    let latestTimestamp = 0;
    
    for (const [paramId, change] of pluginChanges) {
      params[paramId] = change.value;
      if (change.timestamp && change.timestamp > latestTimestamp) {
        latestTimestamp = change.timestamp;
      }
    }
    
    // Clear pending
    pluginChanges.clear();
    this.lastSendTimes.set(pluginId, Date.now());
    
    // Send batch event
    realtimeClient.sendEvent('plugin.param_batch', {
      plugin_id: pluginId,
      batch_id: crypto.randomUUID(),
      params,
      timestamp: new Date(latestTimestamp || Date.now()).toISOString(),
    });
  }

  // ==========================================================================
  // Lock Management
  // ==========================================================================

  /**
   * Requests a lock for plugin editing.
   * Returns a promise that resolves to true if lock acquired.
   */
  async requestPluginLock(pluginId: string): Promise<boolean> {
    return new Promise((resolve) => {
      // Set up one-time response handler
      const handleResponse = (event: DAWEvent) => {
        if (event.type !== 'lock_response') return;
        
        const data = event.payload as {
          action?: string;
          resourceType?: string;
          resourceId?: string;
          granted?: boolean;
          error?: string;
        };
        
        if (data.resourceType === 'plugin' && data.resourceId === pluginId) {
          // Remove this handler
          this.eventHandlers.delete(handleResponseWrapper);
          
          if (data.granted) {
            // Store lock state
            this.pluginLocks.set(pluginId, {
              pluginId,
              holderId: this.userId,
              acquiredAt: new Date().toISOString(),
              isOwnLock: true,
            });
            
            // Start heartbeat
            this.startLockHeartbeat(pluginId);
            
            // Notify handlers
            this.notifyLockHandlers(pluginId);
            
            resolve(true);
          } else {
            console.warn(`[PluginSyncClient] Lock not granted: ${data.error}`);
            resolve(false);
          }
        }
      };
      
      const handleResponseWrapper = handleResponse as PluginEventHandler;
      this.eventHandlers.add(handleResponseWrapper);
      
      // Request lock through realtime client
      realtimeClient.acquireLock('plugin', pluginId, 'editing');
      
      // Timeout after 5 seconds
      setTimeout(() => {
        this.eventHandlers.delete(handleResponseWrapper);
        resolve(false);
      }, 5000);
    });
  }

  /**
   * Releases a plugin lock.
   */
  releasePluginLock(pluginId: string): void {
    // Stop heartbeat
    this.stopLockHeartbeat(pluginId);
    
    // Remove local lock state
    this.pluginLocks.delete(pluginId);
    
    // Release through realtime client
    realtimeClient.releaseLock('plugin', pluginId);
    
    // Notify handlers
    this.notifyLockHandlers(pluginId);
  }

  /**
   * Checks if the current user has a lock on a plugin.
   */
  hasLock(pluginId: string): boolean {
    const lock = this.pluginLocks.get(pluginId);
    return lock?.isOwnLock ?? false;
  }

  /**
   * Gets the current lock state for a plugin.
   */
  getLockState(pluginId: string): PluginLockState | null {
    return this.pluginLocks.get(pluginId) ?? null;
  }

  /**
   * Starts the heartbeat for a held lock.
   */
  private startLockHeartbeat(pluginId: string): void {
    this.stopLockHeartbeat(pluginId);
    
    const timer = setInterval(() => {
      realtimeClient.send({
        type: 'lock',
        data: {
          action: 'heartbeat',
          resourceType: 'plugin',
          resourceId: pluginId,
        },
      });
    }, LOCK_HEARTBEAT_INTERVAL_MS);
    
    this.lockHeartbeats.set(pluginId, timer);
  }

  /**
   * Stops the heartbeat for a lock.
   */
  private stopLockHeartbeat(pluginId: string): void {
    const timer = this.lockHeartbeats.get(pluginId);
    if (timer) {
      clearInterval(timer);
      this.lockHeartbeats.delete(pluginId);
    }
  }

  /**
   * Notifies lock handlers for a plugin.
   */
  private notifyLockHandlers(pluginId: string): void {
    const handlers = this.lockHandlers.get(pluginId);
    if (!handlers) return;
    
    const state = this.pluginLocks.get(pluginId) ?? null;
    for (const handler of handlers) {
      try {
        handler(state);
      } catch (err) {
        console.error('[PluginSyncClient] Lock handler error:', err);
      }
    }
  }

  // ==========================================================================
  // Event Handling
  // ==========================================================================

  /**
   * Handles incoming DAW events.
   */
  private handleEvent(event: DAWEvent): void {
    // Filter for plugin events
    if (!event.type.startsWith('plugin.')) return;
    
    const pluginEvent: PluginEvent = {
      type: event.type as PluginEvent['type'],
      payload: event.payload,
    };
    
    // Notify handlers
    for (const handler of this.eventHandlers) {
      try {
        handler(pluginEvent);
      } catch (err) {
        console.error('[PluginSyncClient] Event handler error:', err);
        Sentry.captureException(err, {
          tags: { component: 'plugin_sync', operation: 'event_handler' },
        });
      }
    }
  }

  /**
   * Handles lock changes from the server.
   */
  private handleLockChanges(locks: Lock[]): void {
    // Update plugin locks based on server state
    const pluginLocks = locks.filter((l) => l.resourceType === 'plugin');
    
    // Build new lock map
    const newLocks = new Map<string, PluginLockState>();
    
    for (const lock of pluginLocks) {
      newLocks.set(lock.resourceId, {
        pluginId: lock.resourceId,
        holderId: lock.holderId,
        holderDisplayName: lock.holderDisplayName,
        acquiredAt: lock.acquiredAt,
        isOwnLock: lock.holderId === this.userId,
      });
    }
    
    // Find changes
    const changedPlugins = new Set<string>();
    
    // Check for removed or changed locks
    for (const [pluginId, oldLock] of this.pluginLocks) {
      const newLock = newLocks.get(pluginId);
      if (!newLock || newLock.holderId !== oldLock.holderId) {
        changedPlugins.add(pluginId);
      }
    }
    
    // Check for new locks
    for (const pluginId of newLocks.keys()) {
      if (!this.pluginLocks.has(pluginId)) {
        changedPlugins.add(pluginId);
      }
    }
    
    // Update state
    this.pluginLocks = newLocks;
    
    // Notify handlers for changed plugins
    for (const pluginId of changedPlugins) {
      this.notifyLockHandlers(pluginId);
    }
  }

  // ==========================================================================
  // Subscription Methods
  // ==========================================================================

  /**
   * Subscribes to plugin events from collaborators.
   */
  onPluginEvent(handler: PluginEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Subscribes to lock state changes for a specific plugin.
   */
  onPluginLockChange(pluginId: string, handler: PluginLockHandler): () => void {
    let handlers = this.lockHandlers.get(pluginId);
    if (!handlers) {
      handlers = new Set();
      this.lockHandlers.set(pluginId, handlers);
    }
    handlers.add(handler);
    
    // Immediately call with current state
    const currentState = this.pluginLocks.get(pluginId) ?? null;
    handler(currentState);
    
    return () => {
      const h = this.lockHandlers.get(pluginId);
      if (h) {
        h.delete(handler);
        if (h.size === 0) {
          this.lockHandlers.delete(pluginId);
        }
      }
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Gets all current plugin locks.
   */
  getAllLocks(): PluginLockState[] {
    return Array.from(this.pluginLocks.values());
  }

  /**
   * Gets count of pending parameter changes.
   */
  getPendingChangeCount(): number {
    let count = 0;
    for (const changes of this.pendingChanges.values()) {
      count += changes.size;
    }
    return count;
  }
}

// Singleton instance
export const pluginSyncClient = new PluginSyncClient();

export default pluginSyncClient;
