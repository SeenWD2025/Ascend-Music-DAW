/**
 * DAW Lock Service
 * Manages resource locks for conflict-free collaboration.
 */

import { randomUUID } from 'crypto';
import * as Sentry from '@sentry/node';
import { connectionRegistry } from './realtime.service.js';

// ============================================================================
// Types
// ============================================================================

export type LockResourceType = 'clip' | 'track' | 'plugin' | 'selection';

export interface Lock {
  /** Unique lock identifier */
  lockId: string;
  
  /** Project this lock belongs to */
  projectId: string;
  
  /** Type of resource being locked */
  resourceType: LockResourceType;
  
  /** ID of the locked resource */
  resourceId: string;
  
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
  
  /** Optional reason for the lock */
  reason?: string;
}

export interface LockRequest {
  resourceType: LockResourceType;
  resourceId: string;
  userId: string;
  clientId: string;
  displayName?: string;
  reason?: string;
}

export interface LockResponse {
  granted: boolean;
  lock?: Lock;
  error?: string;
  heldBy?: {
    userId: string;
    clientId: string;
    displayName?: string;
  };
}

export interface LockBroadcast {
  type: 'lock';
  action: 'acquired' | 'released' | 'sync';
  data: {
    locks: Lock[];
    changedLock?: Lock;
    reason?: 'explicit' | 'timeout' | 'disconnect';
  };
}

// ============================================================================
// Lock Service
// ============================================================================

class LockService {
  /** Map of lock key -> Lock. Key format: `${projectId}:${type}:${id}` */
  private locks: Map<string, Lock> = new Map();
  
  /** Map of client ID -> Set of lock keys (for quick cleanup on disconnect) */
  private locksByClient: Map<string, Set<string>> = new Map();
  
  /** Heartbeat interval (5 seconds) */
  readonly HEARTBEAT_INTERVAL_MS = 5_000;
  
  /** Lock timeout without heartbeat (15 seconds) */
  readonly LOCK_TIMEOUT_MS = 15_000;
  
  /** Maximum lock duration (5 minutes) */
  readonly MAX_LOCK_DURATION_MS = 5 * 60 * 1000;
  
  /** Cleanup interval timer */
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Generates a lock key.
   */
  private getLockKey(projectId: string, resourceType: LockResourceType, resourceId: string): string {
    return `${projectId}:${resourceType}:${resourceId}`;
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
   * Attempts to acquire a lock on a resource.
   */
  acquire(projectId: string, request: LockRequest): LockResponse {
    const lockKey = this.getLockKey(projectId, request.resourceType, request.resourceId);
    
    // Check if already locked
    const existingLock = this.locks.get(lockKey);
    if (existingLock) {
      // Check if same client already holds it
      if (existingLock.holderClientId === request.clientId) {
        // Renew the lock
        existingLock.expiresAt = new Date(Date.now() + this.LOCK_TIMEOUT_MS);
        return { granted: true, lock: existingLock };
      }
      
      // Locked by someone else
      return {
        granted: false,
        error: 'Resource is locked by another user',
        heldBy: {
          userId: existingLock.holderId,
          clientId: existingLock.holderClientId,
          displayName: existingLock.holderDisplayName,
        },
      };
    }
    
    // Create new lock
    const now = new Date();
    const lock: Lock = {
      lockId: randomUUID(),
      projectId,
      resourceType: request.resourceType,
      resourceId: request.resourceId,
      holderId: request.userId,
      holderClientId: request.clientId,
      holderDisplayName: request.displayName,
      acquiredAt: now,
      expiresAt: new Date(now.getTime() + this.LOCK_TIMEOUT_MS),
      reason: request.reason,
    };
    
    this.locks.set(lockKey, lock);
    
    // Track locks by client
    let clientLocks = this.locksByClient.get(request.clientId);
    if (!clientLocks) {
      clientLocks = new Set();
      this.locksByClient.set(request.clientId, clientLocks);
    }
    clientLocks.add(lockKey);
    
    console.log(
      `[LockService] Lock acquired: ${lock.resourceType}:${lock.resourceId} by ${request.clientId}`
    );
    
    // Broadcast lock acquisition
    this.broadcast(projectId, 'acquired', lock);
    
    return { granted: true, lock };
  }

  /**
   * Releases a lock.
   */
  release(
    resourceType: LockResourceType,
    resourceId: string,
    clientId: string,
    projectId?: string
  ): boolean {
    // Find the lock
    for (const [lockKey, lock] of this.locks.entries()) {
      if (
        lock.resourceType === resourceType &&
        lock.resourceId === resourceId &&
        lock.holderClientId === clientId
      ) {
        this.locks.delete(lockKey);
        
        // Remove from client tracking
        const clientLocks = this.locksByClient.get(clientId);
        if (clientLocks) {
          clientLocks.delete(lockKey);
          if (clientLocks.size === 0) {
            this.locksByClient.delete(clientId);
          }
        }
        
        console.log(`[LockService] Lock released: ${resourceType}:${resourceId} by ${clientId}`);
        
        // Broadcast release
        this.broadcast(lock.projectId, 'released', lock, 'explicit');
        
        return true;
      }
    }
    
    return false;
  }

  /**
   * Refreshes a lock's expiration via heartbeat.
   */
  heartbeat(resourceType: LockResourceType, resourceId: string, clientId: string): boolean {
    for (const lock of this.locks.values()) {
      if (
        lock.resourceType === resourceType &&
        lock.resourceId === resourceId &&
        lock.holderClientId === clientId
      ) {
        // Check if lock hasn't exceeded max duration
        const now = Date.now();
        const lockDuration = now - lock.acquiredAt.getTime();
        
        if (lockDuration >= this.MAX_LOCK_DURATION_MS) {
          // Force release - lock has exceeded max duration
          this.release(resourceType, resourceId, clientId);
          return false;
        }
        
        // Extend expiration
        lock.expiresAt = new Date(now + this.LOCK_TIMEOUT_MS);
        return true;
      }
    }
    
    return false;
  }

  /**
   * Checks if a resource is locked.
   */
  isLocked(projectId: string, resourceType: LockResourceType, resourceId: string): Lock | null {
    const lockKey = this.getLockKey(projectId, resourceType, resourceId);
    return this.locks.get(lockKey) ?? null;
  }

  /**
   * Gets all locks for a project.
   */
  getLocksForProject(projectId: string): Lock[] {
    const projectLocks: Lock[] = [];
    
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
  getLocksForClient(clientId: string): Lock[] {
    const locks: Lock[] = [];
    const lockKeys = this.locksByClient.get(clientId);
    
    if (lockKeys) {
      for (const lockKey of lockKeys) {
        const lock = this.locks.get(lockKey);
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
  releaseAllForClient(clientId: string, reason: 'disconnect' | 'timeout' = 'disconnect'): number {
    const lockKeys = this.locksByClient.get(clientId);
    if (!lockKeys || lockKeys.size === 0) return 0;
    
    let released = 0;
    const keysToRelease = Array.from(lockKeys);
    
    for (const lockKey of keysToRelease) {
      const lock = this.locks.get(lockKey);
      if (lock) {
        this.locks.delete(lockKey);
        
        console.log(
          `[LockService] Lock auto-released (${reason}): ${lock.resourceType}:${lock.resourceId}`
        );
        
        // Broadcast release
        this.broadcast(lock.projectId, 'released', lock, reason);
        released++;
      }
    }
    
    this.locksByClient.delete(clientId);
    
    console.log(`[LockService] Released ${released} locks for client ${clientId} (${reason})`);
    
    return released;
  }

  /**
   * Cleans up expired locks.
   */
  cleanupExpired(): number {
    let cleaned = 0;
    const now = Date.now();
    
    for (const [lockKey, lock] of this.locks.entries()) {
      if (now >= lock.expiresAt.getTime()) {
        this.locks.delete(lockKey);
        
        // Remove from client tracking
        const clientLocks = this.locksByClient.get(lock.holderClientId);
        if (clientLocks) {
          clientLocks.delete(lockKey);
          if (clientLocks.size === 0) {
            this.locksByClient.delete(lock.holderClientId);
          }
        }
        
        console.log(
          `[LockService] Lock expired: ${lock.resourceType}:${lock.resourceId} held by ${lock.holderClientId}`
        );
        
        // Broadcast release
        this.broadcast(lock.projectId, 'released', lock, 'timeout');
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[LockService] Cleaned up ${cleaned} expired locks`);
    }
    
    return cleaned;
  }

  /**
   * Broadcasts lock state changes to all clients in a project.
   */
  broadcast(
    projectId: string,
    action: 'acquired' | 'released' | 'sync',
    changedLock?: Lock,
    reason?: 'explicit' | 'timeout' | 'disconnect'
  ): void {
    const clients = connectionRegistry.getProjectClients(projectId);
    if (clients.length === 0) return;
    
    const allLocks = this.getLocksForProject(projectId);
    
    const message: LockBroadcast = {
      type: 'lock',
      action,
      data: {
        locks: allLocks,
        changedLock,
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
          tags: { operation: 'lock_broadcast' },
          extra: { projectId, clientId: client.clientId },
        });
        failed++;
      }
    }
    
    console.log(
      `[LockService] Broadcast ${action} to project ${projectId}: sent=${sent}, failed=${failed}`
    );
  }

  /**
   * Gets service statistics.
   */
  getStats(): {
    totalLocks: number;
    locksByType: Record<LockResourceType, number>;
    locksByProject: Array<{ projectId: string; lockCount: number }>;
  } {
    const locksByType: Record<LockResourceType, number> = {
      clip: 0,
      track: 0,
      plugin: 0,
      selection: 0,
    };
    
    const projectLockCounts = new Map<string, number>();
    
    for (const lock of this.locks.values()) {
      locksByType[lock.resourceType]++;
      
      const count = projectLockCounts.get(lock.projectId) ?? 0;
      projectLockCounts.set(lock.projectId, count + 1);
    }
    
    const locksByProject = Array.from(projectLockCounts.entries()).map(
      ([projectId, lockCount]) => ({ projectId, lockCount })
    );
    
    return {
      totalLocks: this.locks.size,
      locksByType,
      locksByProject,
    };
  }
}

// Singleton instance
export const lockService = new LockService();

export default lockService;
