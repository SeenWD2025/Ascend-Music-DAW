/**
 * Plugin Lock Service
 * Manages exclusive locks for plugin parameter editing.
 * Ensures only one user at a time can modify a plugin's parameters.
 */

import { randomUUID } from 'crypto';
import * as Sentry from '@sentry/node';
import { connectionRegistry } from './realtime.service.js';

// ============================================================================
// Types
// ============================================================================

export interface PluginLock {
  /** Unique lock identifier */
  lockId: string;
  
  /** Plugin instance ID being locked */
  pluginId: string;
  
  /** Project this plugin belongs to */
  projectId: string;
  
  /** User who holds the lock */
  holderId: string;
  
  /** Client instance that holds the lock */
  holderClientId: string;
  
  /** Display name of lock holder (for UI) */
  holderDisplayName?: string;
  
  /** When the lock was acquired */
  acquiredAt: Date;
  
  /** When the lock will expire (without heartbeat) */
  expiresAt: Date;
  
  /** Last heartbeat timestamp */
  lastHeartbeat: Date;
}

export interface PluginLockRequest {
  pluginId: string;
  projectId: string;
  userId: string;
  clientId: string;
  displayName?: string;
}

export interface PluginLockResult {
  granted: boolean;
  lock?: PluginLock;
  error?: string;
  heldBy?: {
    userId: string;
    clientId: string;
    displayName?: string;
    acquiredAt: string;
  };
}

export interface PluginLockBroadcast {
  type: 'plugin_lock';
  action: 'acquired' | 'released' | 'sync';
  data: {
    pluginId: string;
    lock?: PluginLock;
    reason?: 'explicit' | 'timeout' | 'disconnect';
  };
}

// ============================================================================
// Plugin Lock Service
// ============================================================================

class PluginLockService {
  /** Map of plugin ID -> PluginLock */
  private locks: Map<string, PluginLock> = new Map();
  
  /** Map of client ID -> Set of plugin IDs (for quick cleanup on disconnect) */
  private locksByClient: Map<string, Set<string>> = new Map();
  
  /** Heartbeat requirement interval (5 seconds) */
  readonly HEARTBEAT_INTERVAL_MS = 5_000;
  
  /** Lock timeout without heartbeat (15 seconds) */
  readonly LOCK_TIMEOUT_MS = 15_000;
  
  /** Maximum lock duration (10 minutes for plugin editing) */
  readonly MAX_LOCK_DURATION_MS = 10 * 60 * 1000;
  
  /** Cleanup interval timer */
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanup();
  }

  /**
   * Starts the periodic cleanup timer.
   */
  private startCleanup(): void {
    if (this.cleanupTimer) return;
    
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, this.HEARTBEAT_INTERVAL_MS);
    
    // Don't prevent Node from exiting
    this.cleanupTimer.unref();
  }

  /**
   * Stops the periodic cleanup timer.
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Attempts to acquire a lock on a plugin.
   */
  acquireLock(request: PluginLockRequest): PluginLockResult {
    const { pluginId, projectId, userId, clientId, displayName } = request;
    
    // Check if already locked
    const existingLock = this.locks.get(pluginId);
    if (existingLock) {
      // Check if same client already holds it (renew)
      if (existingLock.holderClientId === clientId) {
        const now = new Date();
        existingLock.expiresAt = new Date(now.getTime() + this.LOCK_TIMEOUT_MS);
        existingLock.lastHeartbeat = now;
        
        console.log(`[PluginLockService] Lock renewed: ${pluginId} by ${clientId}`);
        
        return { granted: true, lock: existingLock };
      }
      
      // Locked by someone else - return 409 Conflict info
      Sentry.addBreadcrumb({
        category: 'plugin_lock',
        message: 'Lock acquisition rejected - held by another user',
        level: 'info',
        data: { pluginId, requesterId: userId, holderId: existingLock.holderId },
      });
      
      return {
        granted: false,
        error: 'Plugin is being edited by another user',
        heldBy: {
          userId: existingLock.holderId,
          clientId: existingLock.holderClientId,
          displayName: existingLock.holderDisplayName,
          acquiredAt: existingLock.acquiredAt.toISOString(),
        },
      };
    }
    
    // Create new lock
    const now = new Date();
    const lock: PluginLock = {
      lockId: randomUUID(),
      pluginId,
      projectId,
      holderId: userId,
      holderClientId: clientId,
      holderDisplayName: displayName,
      acquiredAt: now,
      expiresAt: new Date(now.getTime() + this.LOCK_TIMEOUT_MS),
      lastHeartbeat: now,
    };
    
    this.locks.set(pluginId, lock);
    
    // Track locks by client
    let clientLocks = this.locksByClient.get(clientId);
    if (!clientLocks) {
      clientLocks = new Set();
      this.locksByClient.set(clientId, clientLocks);
    }
    clientLocks.add(pluginId);
    
    console.log(`[PluginLockService] Lock acquired: ${pluginId} by ${clientId}`);
    
    // Broadcast lock acquisition
    this.broadcast(projectId, 'acquired', lock);
    
    // PostHog tracking
    // TODO: PostHog.capture('plugin.lock_acquired', {
    //   plugin_id: pluginId,
    //   project_id: projectId,
    //   user_id: userId,
    // });
    
    return { granted: true, lock };
  }

  /**
   * Releases a lock on a plugin.
   */
  releaseLock(pluginId: string, userId: string, clientId?: string): boolean {
    const lock = this.locks.get(pluginId);
    
    if (!lock) {
      console.log(`[PluginLockService] No lock found for plugin: ${pluginId}`);
      return false;
    }
    
    // Verify ownership
    if (lock.holderId !== userId) {
      console.warn(`[PluginLockService] Release denied: ${userId} doesn't own lock for ${pluginId}`);
      return false;
    }
    
    // If clientId provided, verify it matches
    if (clientId && lock.holderClientId !== clientId) {
      console.warn(`[PluginLockService] Release denied: client mismatch for ${pluginId}`);
      return false;
    }
    
    const projectId = lock.projectId;
    
    // Remove lock
    this.locks.delete(pluginId);
    
    // Remove from client tracking
    const clientLocks = this.locksByClient.get(lock.holderClientId);
    if (clientLocks) {
      clientLocks.delete(pluginId);
      if (clientLocks.size === 0) {
        this.locksByClient.delete(lock.holderClientId);
      }
    }
    
    console.log(`[PluginLockService] Lock released: ${pluginId} by ${lock.holderClientId}`);
    
    // Broadcast release
    this.broadcast(projectId, 'released', lock, 'explicit');
    
    // PostHog tracking
    // TODO: PostHog.capture('plugin.lock_released', {
    //   plugin_id: pluginId,
    //   project_id: projectId,
    //   user_id: userId,
    //   duration_ms: Date.now() - lock.acquiredAt.getTime(),
    // });
    
    return true;
  }

  /**
   * Refreshes a lock's expiration via heartbeat.
   * Returns false if the lock doesn't exist or has exceeded max duration.
   */
  refreshLock(pluginId: string, userId: string, clientId?: string): boolean {
    const lock = this.locks.get(pluginId);
    
    if (!lock) {
      console.log(`[PluginLockService] Heartbeat failed - no lock: ${pluginId}`);
      return false;
    }
    
    // Verify ownership
    if (lock.holderId !== userId) {
      console.warn(`[PluginLockService] Heartbeat denied: ${userId} doesn't own lock for ${pluginId}`);
      return false;
    }
    
    if (clientId && lock.holderClientId !== clientId) {
      console.warn(`[PluginLockService] Heartbeat denied: client mismatch for ${pluginId}`);
      return false;
    }
    
    const now = Date.now();
    const lockDuration = now - lock.acquiredAt.getTime();
    
    // Check if lock has exceeded max duration
    if (lockDuration >= this.MAX_LOCK_DURATION_MS) {
      console.log(`[PluginLockService] Lock expired (max duration): ${pluginId}`);
      this.releaseLock(pluginId, userId);
      return false;
    }
    
    // Extend expiration
    lock.expiresAt = new Date(now + this.LOCK_TIMEOUT_MS);
    lock.lastHeartbeat = new Date(now);
    
    return true;
  }

  /**
   * Checks if a user has lock on a plugin.
   */
  hasLock(pluginId: string, userId: string): boolean {
    const lock = this.locks.get(pluginId);
    return lock?.holderId === userId;
  }

  /**
   * Gets the current lock holder for a plugin.
   */
  getLockHolder(pluginId: string): string | null {
    const lock = this.locks.get(pluginId);
    return lock?.holderId ?? null;
  }

  /**
   * Gets lock info for a plugin.
   */
  getLock(pluginId: string): PluginLock | null {
    return this.locks.get(pluginId) ?? null;
  }

  /**
   * Checks if a plugin is locked.
   */
  isLocked(pluginId: string): boolean {
    return this.locks.has(pluginId);
  }

  /**
   * Gets all locks for a project.
   */
  getLocksForProject(projectId: string): PluginLock[] {
    const projectLocks: PluginLock[] = [];
    
    for (const lock of this.locks.values()) {
      if (lock.projectId === projectId) {
        projectLocks.push(lock);
      }
    }
    
    return projectLocks;
  }

  /**
   * Gets all locks held by a client.
   */
  getLocksForClient(clientId: string): PluginLock[] {
    const locks: PluginLock[] = [];
    const pluginIds = this.locksByClient.get(clientId);
    
    if (pluginIds) {
      for (const pluginId of pluginIds) {
        const lock = this.locks.get(pluginId);
        if (lock) {
          locks.push(lock);
        }
      }
    }
    
    return locks;
  }

  /**
   * Releases all locks held by a client (on disconnect).
   */
  releaseAllForClient(
    clientId: string,
    reason: 'disconnect' | 'timeout' = 'disconnect'
  ): number {
    const pluginIds = this.locksByClient.get(clientId);
    if (!pluginIds || pluginIds.size === 0) return 0;
    
    let released = 0;
    const idsToRelease = Array.from(pluginIds);
    
    for (const pluginId of idsToRelease) {
      const lock = this.locks.get(pluginId);
      if (lock) {
        this.locks.delete(pluginId);
        
        console.log(
          `[PluginLockService] Lock auto-released (${reason}): ${pluginId}`
        );
        
        // Broadcast release
        this.broadcast(lock.projectId, 'released', lock, reason);
        released++;
      }
    }
    
    this.locksByClient.delete(clientId);
    
    console.log(`[PluginLockService] Released ${released} locks for client ${clientId} (${reason})`);
    
    return released;
  }

  /**
   * Cleans up expired locks.
   */
  cleanupExpired(): number {
    let cleaned = 0;
    const now = Date.now();
    
    for (const [pluginId, lock] of this.locks.entries()) {
      if (now >= lock.expiresAt.getTime()) {
        this.locks.delete(pluginId);
        
        // Remove from client tracking
        const clientLocks = this.locksByClient.get(lock.holderClientId);
        if (clientLocks) {
          clientLocks.delete(pluginId);
          if (clientLocks.size === 0) {
            this.locksByClient.delete(lock.holderClientId);
          }
        }
        
        console.log(
          `[PluginLockService] Lock expired: ${pluginId} held by ${lock.holderClientId}`
        );
        
        Sentry.addBreadcrumb({
          category: 'plugin_lock',
          message: 'Plugin lock expired',
          level: 'info',
          data: { pluginId, holderId: lock.holderId },
        });
        
        // Broadcast release
        this.broadcast(lock.projectId, 'released', lock, 'timeout');
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[PluginLockService] Cleaned up ${cleaned} expired locks`);
    }
    
    return cleaned;
  }

  /**
   * Broadcasts lock state changes to all clients in a project.
   */
  private broadcast(
    projectId: string,
    action: 'acquired' | 'released' | 'sync',
    lock: PluginLock,
    reason?: 'explicit' | 'timeout' | 'disconnect'
  ): void {
    const clients = connectionRegistry.getProjectClients(projectId);
    if (clients.length === 0) return;
    
    const message: PluginLockBroadcast = {
      type: 'plugin_lock',
      action,
      data: {
        pluginId: lock.pluginId,
        lock: action !== 'released' ? lock : undefined,
        reason,
      },
    };
    
    const messageStr = JSON.stringify(message);
    let sent = 0;
    let failed = 0;
    
    for (const client of clients) {
      try {
        if (client.socket.readyState === 1) { // WebSocket.OPEN
          client.socket.send(messageStr);
          sent++;
        } else {
          failed++;
        }
      } catch (err) {
        Sentry.captureException(err, {
          tags: { operation: 'plugin_lock_broadcast' },
          extra: { projectId, clientId: client.clientId },
        });
        failed++;
      }
    }
    
    console.log(
      `[PluginLockService] Broadcast ${action} to project ${projectId}: sent=${sent}, failed=${failed}`
    );
  }

  /**
   * Validates that a user can modify a plugin (has lock).
   * Returns an error response for 409 Conflict if locked by another user.
   */
  validateAccess(
    pluginId: string,
    userId: string
  ): { allowed: boolean; error?: string; heldBy?: string } {
    const lock = this.locks.get(pluginId);
    
    // No lock = allowed (though we recommend acquiring lock first)
    if (!lock) {
      return { allowed: true };
    }
    
    // User holds the lock
    if (lock.holderId === userId) {
      return { allowed: true };
    }
    
    // Locked by another user
    return {
      allowed: false,
      error: 'Plugin is locked by another user',
      heldBy: lock.holderDisplayName || lock.holderId,
    };
  }

  /**
   * Gets service statistics.
   */
  getStats(): {
    totalLocks: number;
    locksByProject: Array<{ projectId: string; lockCount: number }>;
    oldestLock?: { pluginId: string; durationMs: number };
  } {
    const projectLockCounts = new Map<string, number>();
    let oldestLock: { pluginId: string; durationMs: number } | undefined;
    const now = Date.now();
    
    for (const lock of this.locks.values()) {
      const count = projectLockCounts.get(lock.projectId) ?? 0;
      projectLockCounts.set(lock.projectId, count + 1);
      
      const duration = now - lock.acquiredAt.getTime();
      if (!oldestLock || duration > oldestLock.durationMs) {
        oldestLock = { pluginId: lock.pluginId, durationMs: duration };
      }
    }
    
    return {
      totalLocks: this.locks.size,
      locksByProject: Array.from(projectLockCounts.entries()).map(
        ([projectId, lockCount]) => ({ projectId, lockCount })
      ),
      oldestLock,
    };
  }
}

// Singleton instance
export const pluginLockService = new PluginLockService();

export default pluginLockService;
