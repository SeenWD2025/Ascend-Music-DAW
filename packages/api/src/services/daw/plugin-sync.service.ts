/**
 * Plugin Sync Service
 * Handles plugin parameter synchronization with throttling and coalescing.
 * Implements rate limiting (20-30Hz) to prevent channel flooding.
 */

import { randomUUID } from 'crypto';
import * as Sentry from '@sentry/node';
import {
  connectionRegistry,
  broadcastToProject,
  getNextSequenceNumber,
} from './realtime.service.js';
import { pluginLockService } from './plugin-lock.service.js';
import type { DAWEventEnvelope, PluginParamChangePayload, PluginParamBatchPayload } from '../../schemas/daw/realtime.schema.js';

// ============================================================================
// Types
// ============================================================================

export interface ParamChange {
  paramId: string;
  value: number;
  timestamp: number;
}

export interface CoalescedChange {
  pluginId: string;
  batchId: string;
  params: Record<string, number>;
  timestamp: string;
  changeCount: number;
}

interface ThrottlerState {
  /** Pending parameter changes to coalesce */
  pendingChanges: Map<string, ParamChange>;
  
  /** Last flush timestamp */
  lastFlush: number;
  
  /** Flush timer */
  flushTimer: NodeJS.Timeout | null;
  
  /** Event count in current window */
  eventCount: number;
  
  /** Window start timestamp */
  windowStart: number;
}

export interface PluginEvent {
  type: 'plugin.add' | 'plugin.update' | 'plugin.param_change' | 'plugin.param_batch' | 'plugin.delete' | 'plugin.reorder';
  payload: Record<string, unknown>;
  actorId: string;
  clientId: string;
}

export interface BroadcastResult {
  success: boolean;
  sent?: number;
  failed?: number;
  error?: string;
  seq?: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Target throttle rate: 30Hz (33ms between events) */
const THROTTLE_INTERVAL_MS = 33;

/** Maximum events per second per plugin */
const MAX_EVENTS_PER_SECOND = 30;

/** Rate limit window in milliseconds */
const RATE_LIMIT_WINDOW_MS = 1000;

/** Maximum pending changes before force flush */
const MAX_PENDING_CHANGES = 50;

// ============================================================================
// Plugin Sync Service
// ============================================================================

class PluginSyncService {
  /** Throttler state per plugin */
  private throttlers: Map<string, ThrottlerState> = new Map();
  
  /** Cleanup timer for stale throttlers */
  private cleanupTimer: NodeJS.Timeout | null = null;
  
  /** Throttler idle timeout (5 minutes) */
  private readonly THROTTLER_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

  constructor() {
    this.startCleanup();
  }

  /**
   * Starts the periodic cleanup timer for stale throttlers.
   */
  private startCleanup(): void {
    if (this.cleanupTimer) return;
    
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleThrottlers();
    }, 60_000); // Every minute
    
    this.cleanupTimer.unref();
  }

  /**
   * Stops the cleanup timer.
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    // Clear all throttler timers
    for (const throttler of this.throttlers.values()) {
      if (throttler.flushTimer) {
        clearTimeout(throttler.flushTimer);
      }
    }
    this.throttlers.clear();
  }

  /**
   * Cleans up throttlers that haven't been used recently.
   */
  private cleanupStaleThrottlers(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [pluginId, throttler] of this.throttlers.entries()) {
      if (now - throttler.lastFlush > this.THROTTLER_IDLE_TIMEOUT_MS) {
        if (throttler.flushTimer) {
          clearTimeout(throttler.flushTimer);
        }
        this.throttlers.delete(pluginId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[PluginSyncService] Cleaned up ${cleaned} stale throttlers`);
    }
  }

  /**
   * Gets or creates a throttler for a plugin.
   */
  private getThrottler(pluginId: string): ThrottlerState {
    let throttler = this.throttlers.get(pluginId);
    
    if (!throttler) {
      throttler = {
        pendingChanges: new Map(),
        lastFlush: 0,
        flushTimer: null,
        eventCount: 0,
        windowStart: Date.now(),
      };
      this.throttlers.set(pluginId, throttler);
    }
    
    return throttler;
  }

  /**
   * Checks if the rate limit has been exceeded for a plugin.
   */
  checkRateLimit(pluginId: string): boolean {
    const throttler = this.getThrottler(pluginId);
    const now = Date.now();
    
    // Reset window if expired
    if (now - throttler.windowStart >= RATE_LIMIT_WINDOW_MS) {
      throttler.eventCount = 0;
      throttler.windowStart = now;
    }
    
    return throttler.eventCount < MAX_EVENTS_PER_SECOND;
  }

  /**
   * Increments the rate limit counter.
   */
  private incrementRateLimit(pluginId: string): void {
    const throttler = this.getThrottler(pluginId);
    throttler.eventCount++;
  }

  /**
   * Adds a parameter change to the throttle queue.
   * Changes are coalesced within the throttle window (33ms).
   */
  queueParamChange(
    projectId: string,
    pluginId: string,
    paramId: string,
    value: number,
    actorId: string,
    clientId: string
  ): void {
    const throttler = this.getThrottler(pluginId);
    const now = Date.now();
    
    // Store latest value for this param (coalescing)
    throttler.pendingChanges.set(paramId, {
      paramId,
      value,
      timestamp: now,
    });
    
    // Force flush if too many pending changes
    if (throttler.pendingChanges.size >= MAX_PENDING_CHANGES) {
      this.flushChanges(projectId, pluginId, actorId, clientId);
      return;
    }
    
    // Schedule flush if not already scheduled
    if (!throttler.flushTimer) {
      const timeSinceLastFlush = now - throttler.lastFlush;
      const delay = Math.max(0, THROTTLE_INTERVAL_MS - timeSinceLastFlush);
      
      throttler.flushTimer = setTimeout(() => {
        this.flushChanges(projectId, pluginId, actorId, clientId);
      }, delay);
    }
  }

  /**
   * Flushes pending changes as a batch event.
   */
  private flushChanges(
    projectId: string,
    pluginId: string,
    actorId: string,
    clientId: string
  ): void {
    const throttler = this.throttlers.get(pluginId);
    if (!throttler || throttler.pendingChanges.size === 0) return;
    
    // Clear timer
    if (throttler.flushTimer) {
      clearTimeout(throttler.flushTimer);
      throttler.flushTimer = null;
    }
    
    // Check rate limit
    if (!this.checkRateLimit(pluginId)) {
      console.warn(`[PluginSyncService] Rate limit exceeded for plugin ${pluginId}`);
      
      Sentry.addBreadcrumb({
        category: 'plugin_sync',
        message: 'Rate limit exceeded',
        level: 'warning',
        data: { pluginId, pendingChanges: throttler.pendingChanges.size },
      });
      
      // Clear pending to prevent buildup
      throttler.pendingChanges.clear();
      return;
    }
    
    // Build coalesced change
    const coalesced = this.coalesceParamChanges(pluginId, throttler.pendingChanges);
    
    // Clear pending changes
    throttler.pendingChanges.clear();
    throttler.lastFlush = Date.now();
    
    // Increment rate limit
    this.incrementRateLimit(pluginId);
    
    // Create and broadcast event
    const seq = getNextSequenceNumber(projectId);
    const event: DAWEventEnvelope = {
      event_id: randomUUID(),
      project_id: projectId,
      actor_id: actorId,
      client_id: clientId,
      seq,
      sent_at: new Date().toISOString(),
      received_at: new Date().toISOString(),
      type: 'plugin.param_batch',
      version: '1.0',
      payload: {
        plugin_id: coalesced.pluginId,
        batch_id: coalesced.batchId,
        params: coalesced.params,
        timestamp: coalesced.timestamp,
      } as PluginParamBatchPayload,
    };
    
    const { sent, failed } = broadcastToProject(projectId, event, { echoToSender: false });
    
    console.log(
      `[PluginSyncService] Flushed ${coalesced.changeCount} params for ${pluginId}: sent=${sent}, failed=${failed}`
    );
    
    // TODO: PostHog.capture('plugin.param_sync', {
    //   plugin_id: pluginId,
    //   project_id: projectId,
    //   param_count: coalesced.changeCount,
    //   batch_id: coalesced.batchId,
    // });
  }

  /**
   * Coalesces multiple parameter changes into a single batch.
   */
  coalesceParamChanges(
    pluginId: string,
    changes: Map<string, ParamChange>
  ): CoalescedChange {
    const params: Record<string, number> = {};
    let latestTimestamp = 0;
    
    for (const [paramId, change] of changes) {
      params[paramId] = change.value;
      if (change.timestamp > latestTimestamp) {
        latestTimestamp = change.timestamp;
      }
    }
    
    return {
      pluginId,
      batchId: randomUUID(),
      params,
      timestamp: new Date(latestTimestamp).toISOString(),
      changeCount: changes.size,
    };
  }

  /**
   * Validates and broadcasts a plugin event.
   * Checks lock ownership before allowing modifications.
   */
  async broadcastPluginEvent(
    projectId: string,
    event: PluginEvent
  ): Promise<BroadcastResult> {
    const { type, payload, actorId, clientId } = event;
    
    // Extract plugin ID from payload
    const pluginId = payload.plugin_id as string;
    
    // For modification events, validate lock
    if (type !== 'plugin.add' && pluginId) {
      const access = pluginLockService.validateAccess(pluginId, actorId);
      
      if (!access.allowed) {
        Sentry.addBreadcrumb({
          category: 'plugin_sync',
          message: 'Plugin modification blocked - no lock',
          level: 'warning',
          data: { pluginId, actorId, heldBy: access.heldBy },
        });
        
        return {
          success: false,
          error: `Conflict: ${access.error}. Currently held by: ${access.heldBy}`,
        };
      }
    }
    
    // Check rate limit for param changes
    if (type === 'plugin.param_change' && pluginId) {
      if (!this.checkRateLimit(pluginId)) {
        return {
          success: false,
          error: 'Rate limit exceeded. Please slow down.',
        };
      }
      this.incrementRateLimit(pluginId);
    }
    
    // Build event envelope
    const seq = getNextSequenceNumber(projectId);
    const envelope: DAWEventEnvelope = {
      event_id: randomUUID(),
      project_id: projectId,
      actor_id: actorId,
      client_id: clientId,
      seq,
      sent_at: new Date().toISOString(),
      received_at: new Date().toISOString(),
      type,
      version: '1.0',
      payload,
    };
    
    // Broadcast to project
    const { sent, failed } = broadcastToProject(projectId, envelope, { echoToSender: false });
    
    console.log(
      `[PluginSyncService] Event ${type} broadcast: seq=${seq}, sent=${sent}, failed=${failed}`
    );
    
    return {
      success: true,
      sent,
      failed,
      seq,
    };
  }

  /**
   * Handles incoming parameter change with throttling.
   */
  handleParamChange(
    projectId: string,
    pluginId: string,
    payload: PluginParamChangePayload,
    actorId: string,
    clientId: string
  ): { queued: boolean; error?: string } {
    // Validate lock
    const access = pluginLockService.validateAccess(pluginId, actorId);
    if (!access.allowed) {
      return {
        queued: false,
        error: `Conflict: ${access.error}`,
      };
    }
    
    // Queue for throttled broadcast
    this.queueParamChange(
      projectId,
      pluginId,
      payload.param_id,
      payload.value,
      actorId,
      clientId
    );
    
    return { queued: true };
  }

  /**
   * Gets statistics about throttlers.
   */
  getStats(): {
    activeThrottlers: number;
    totalPendingChanges: number;
    throttlerDetails: Array<{
      pluginId: string;
      pendingCount: number;
      eventCount: number;
    }>;
  } {
    let totalPendingChanges = 0;
    const throttlerDetails: Array<{
      pluginId: string;
      pendingCount: number;
      eventCount: number;
    }> = [];
    
    for (const [pluginId, throttler] of this.throttlers) {
      totalPendingChanges += throttler.pendingChanges.size;
      throttlerDetails.push({
        pluginId,
        pendingCount: throttler.pendingChanges.size,
        eventCount: throttler.eventCount,
      });
    }
    
    return {
      activeThrottlers: this.throttlers.size,
      totalPendingChanges,
      throttlerDetails,
    };
  }
}

// Singleton instance
export const pluginSyncService = new PluginSyncService();

export default pluginSyncService;
