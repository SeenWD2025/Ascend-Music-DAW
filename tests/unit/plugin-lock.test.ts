/**
 * Unit Tests: Plugin Lock Service
 *
 * Tests the plugin locking service responsible for:
 * - Acquiring exclusive locks on plugins for editing
 * - Preventing concurrent edits by multiple users
 * - Releasing locks when done
 * - Refreshing locks to extend timeout
 * - Auto-releasing expired locks after 15s
 * - Cleaning up locks on disconnect
 *
 * These tests validate the collaborative locking behavior for plugin state editing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// =============================================================================
// Types
// =============================================================================

interface PluginLock {
  pluginId: string;
  holderId: string;
  holderName: string;
  acquiredAt: number;
  expiresAt: number;
}

interface LockResult {
  success: boolean;
  lock?: PluginLock;
  holder?: {
    id: string;
    name: string;
  };
  error?: string;
}

// =============================================================================
// Mock Plugin Lock Service (to be implemented in packages/daw)
// =============================================================================

/**
 * Plugin Lock Service mock implementation for testing.
 * Real implementation would use Redis or Supabase Realtime.
 */
class PluginLockService {
  private static readonly LOCK_TIMEOUT_MS = 15000; // 15 seconds
  private static readonly REFRESH_THRESHOLD_MS = 5000; // Refresh when < 5s remaining

  private locks: Map<string, PluginLock> = new Map();
  private connectionSessions: Map<string, Set<string>> = new Map(); // sessionId -> pluginIds

  constructor() {
    this.reset();
  }

  /**
   * Reset the service state (for testing).
   */
  reset(): void {
    this.locks.clear();
    this.connectionSessions.clear();
  }

  /**
   * Attempt to acquire a lock on a plugin.
   */
  acquireLock(
    pluginId: string,
    userId: string,
    userName: string,
    sessionId: string
  ): LockResult {
    const now = Date.now();
    const existingLock = this.locks.get(pluginId);

    // Check for existing valid lock
    if (existingLock) {
      // Check if lock is expired
      if (existingLock.expiresAt > now) {
        // Lock is held by someone else
        if (existingLock.holderId !== userId) {
          return {
            success: false,
            holder: {
              id: existingLock.holderId,
              name: existingLock.holderName,
            },
            error: 'Plugin is locked by another user',
          };
        }

        // Same user, refresh the lock
        return this.refreshLock(pluginId, userId, sessionId);
      }

      // Lock is expired, remove it
      this.removeLock(pluginId);
    }

    // Create new lock
    const lock: PluginLock = {
      pluginId,
      holderId: userId,
      holderName: userName,
      acquiredAt: now,
      expiresAt: now + PluginLockService.LOCK_TIMEOUT_MS,
    };

    this.locks.set(pluginId, lock);

    // Track session
    if (!this.connectionSessions.has(sessionId)) {
      this.connectionSessions.set(sessionId, new Set());
    }
    this.connectionSessions.get(sessionId)!.add(pluginId);

    return {
      success: true,
      lock,
    };
  }

  /**
   * Release a lock on a plugin.
   */
  releaseLock(pluginId: string, userId: string): LockResult {
    const lock = this.locks.get(pluginId);

    if (!lock) {
      return {
        success: true, // Already unlocked
      };
    }

    if (lock.holderId !== userId) {
      return {
        success: false,
        error: 'Cannot release lock held by another user',
        holder: {
          id: lock.holderId,
          name: lock.holderName,
        },
      };
    }

    this.removeLock(pluginId);

    return {
      success: true,
    };
  }

  /**
   * Refresh a lock to extend its timeout.
   */
  refreshLock(pluginId: string, userId: string, sessionId: string): LockResult {
    const lock = this.locks.get(pluginId);
    const now = Date.now();

    if (!lock) {
      return {
        success: false,
        error: 'No lock to refresh',
      };
    }

    if (lock.holderId !== userId) {
      return {
        success: false,
        error: 'Cannot refresh lock held by another user',
        holder: {
          id: lock.holderId,
          name: lock.holderName,
        },
      };
    }

    // Check if lock is expired
    if (lock.expiresAt <= now) {
      this.removeLock(pluginId);
      return {
        success: false,
        error: 'Lock has expired',
      };
    }

    // Extend the lock
    lock.expiresAt = now + PluginLockService.LOCK_TIMEOUT_MS;
    this.locks.set(pluginId, lock);

    return {
      success: true,
      lock,
    };
  }

  /**
   * Check if a lock is held and by whom.
   */
  getLock(pluginId: string): PluginLock | null {
    const lock = this.locks.get(pluginId);
    const now = Date.now();

    if (!lock) {
      return null;
    }

    // Check if expired
    if (lock.expiresAt <= now) {
      this.removeLock(pluginId);
      return null;
    }

    return lock;
  }

  /**
   * Check for expired locks and remove them.
   */
  cleanupExpiredLocks(): string[] {
    const now = Date.now();
    const expired: string[] = [];

    for (const [pluginId, lock] of this.locks) {
      if (lock.expiresAt <= now) {
        expired.push(pluginId);
        this.removeLock(pluginId);
      }
    }

    return expired;
  }

  /**
   * Handle user disconnect - release all their locks.
   */
  handleDisconnect(sessionId: string): string[] {
    const pluginIds = this.connectionSessions.get(sessionId);
    const released: string[] = [];

    if (pluginIds) {
      for (const pluginId of pluginIds) {
        const lock = this.locks.get(pluginId);
        if (lock) {
          this.removeLock(pluginId);
          released.push(pluginId);
        }
      }
      this.connectionSessions.delete(sessionId);
    }

    return released;
  }

  /**
   * Remove a lock from the store.
   */
  private removeLock(pluginId: string): void {
    this.locks.delete(pluginId);

    // Clean up session tracking
    for (const [, pluginIds] of this.connectionSessions) {
      pluginIds.delete(pluginId);
    }
  }

  /**
   * Get all current locks (for testing/debugging).
   */
  getAllLocks(): Map<string, PluginLock> {
    return new Map(this.locks);
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('Unit: Plugin Lock Service', () => {
  let lockService: PluginLockService;

  beforeEach(() => {
    lockService = new PluginLockService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    lockService.reset();
    vi.useRealTimers();
  });

  // ==========================================================================
  // Acquire Lock Tests
  // ==========================================================================
  describe('Acquire lock', () => {
    it('✓ Acquire lock succeeds for first user', () => {
      const result = lockService.acquireLock(
        'plugin-1',
        'user-a',
        'Alice',
        'session-a'
      );

      expect(result.success).toBe(true);
      expect(result.lock).toBeDefined();
      expect(result.lock?.pluginId).toBe('plugin-1');
      expect(result.lock?.holderId).toBe('user-a');
      expect(result.lock?.holderName).toBe('Alice');
      expect(result.lock?.acquiredAt).toBeDefined();
      expect(result.lock?.expiresAt).toBeGreaterThan(result.lock!.acquiredAt);
    });

    it('✗ Acquire lock fails for second user (returns lock holder)', () => {
      // First user acquires lock
      lockService.acquireLock('plugin-1', 'user-a', 'Alice', 'session-a');

      // Second user tries to acquire the same lock
      const result = lockService.acquireLock(
        'plugin-1',
        'user-b',
        'Bob',
        'session-b'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Plugin is locked by another user');
      expect(result.holder).toBeDefined();
      expect(result.holder?.id).toBe('user-a');
      expect(result.holder?.name).toBe('Alice');
    });

    it('✓ Same user can re-acquire their own lock (refresh)', () => {
      // User acquires lock
      const firstResult = lockService.acquireLock(
        'plugin-1',
        'user-a',
        'Alice',
        'session-a'
      );

      vi.advanceTimersByTime(5000); // Advance 5 seconds

      // Same user acquires again
      const secondResult = lockService.acquireLock(
        'plugin-1',
        'user-a',
        'Alice',
        'session-a'
      );

      expect(secondResult.success).toBe(true);
      expect(secondResult.lock?.expiresAt).toBeGreaterThan(
        firstResult.lock!.expiresAt
      );
    });

    it('✓ Can acquire lock after previous holder releases', () => {
      // First user acquires and releases
      lockService.acquireLock('plugin-1', 'user-a', 'Alice', 'session-a');
      lockService.releaseLock('plugin-1', 'user-a');

      // Second user can now acquire
      const result = lockService.acquireLock(
        'plugin-1',
        'user-b',
        'Bob',
        'session-b'
      );

      expect(result.success).toBe(true);
      expect(result.lock?.holderId).toBe('user-b');
    });
  });

  // ==========================================================================
  // Release Lock Tests
  // ==========================================================================
  describe('Release lock', () => {
    it('✓ Release lock allows new acquisition', () => {
      // Acquire lock
      lockService.acquireLock('plugin-1', 'user-a', 'Alice', 'session-a');

      // Release lock
      const releaseResult = lockService.releaseLock('plugin-1', 'user-a');
      expect(releaseResult.success).toBe(true);

      // Another user can now acquire
      const acquireResult = lockService.acquireLock(
        'plugin-1',
        'user-b',
        'Bob',
        'session-b'
      );
      expect(acquireResult.success).toBe(true);
    });

    it('✓ Release non-existent lock succeeds (idempotent)', () => {
      const result = lockService.releaseLock('plugin-nonexistent', 'user-a');

      expect(result.success).toBe(true);
    });

    it('✗ Cannot release lock held by another user', () => {
      // User A acquires lock
      lockService.acquireLock('plugin-1', 'user-a', 'Alice', 'session-a');

      // User B tries to release
      const result = lockService.releaseLock('plugin-1', 'user-b');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot release lock held by another user');
      expect(result.holder?.id).toBe('user-a');
    });
  });

  // ==========================================================================
  // Refresh Lock Tests
  // ==========================================================================
  describe('Refresh lock', () => {
    it('✓ Refresh lock extends timeout', () => {
      // Acquire lock
      const acquireResult = lockService.acquireLock(
        'plugin-1',
        'user-a',
        'Alice',
        'session-a'
      );
      const originalExpiry = acquireResult.lock!.expiresAt;

      // Advance time but not past expiry
      vi.advanceTimersByTime(10000); // 10 seconds

      // Refresh lock
      const refreshResult = lockService.refreshLock(
        'plugin-1',
        'user-a',
        'session-a'
      );

      expect(refreshResult.success).toBe(true);
      expect(refreshResult.lock?.expiresAt).toBeGreaterThan(originalExpiry);
    });

    it('✗ Cannot refresh lock held by another user', () => {
      // User A acquires lock
      lockService.acquireLock('plugin-1', 'user-a', 'Alice', 'session-a');

      // User B tries to refresh
      const result = lockService.refreshLock('plugin-1', 'user-b', 'session-b');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot refresh lock held by another user');
    });

    it('✗ Cannot refresh expired lock', () => {
      // Acquire lock
      lockService.acquireLock('plugin-1', 'user-a', 'Alice', 'session-a');

      // Advance past expiry (15 seconds)
      vi.advanceTimersByTime(16000);

      // Try to refresh
      const result = lockService.refreshLock('plugin-1', 'user-a', 'session-a');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Lock has expired');
    });

    it('✗ Cannot refresh non-existent lock', () => {
      const result = lockService.refreshLock(
        'plugin-nonexistent',
        'user-a',
        'session-a'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('No lock to refresh');
    });
  });

  // ==========================================================================
  // Expiration Tests
  // ==========================================================================
  describe('Expired lock auto-releases after 15s', () => {
    it('✓ Lock expires after 15 seconds', () => {
      // Acquire lock
      lockService.acquireLock('plugin-1', 'user-a', 'Alice', 'session-a');

      // Lock should exist
      expect(lockService.getLock('plugin-1')).not.toBeNull();

      // Advance past expiry
      vi.advanceTimersByTime(15001);

      // Lock should be expired
      expect(lockService.getLock('plugin-1')).toBeNull();
    });

    it('✓ Expired lock allows new acquisition', () => {
      // User A acquires lock
      lockService.acquireLock('plugin-1', 'user-a', 'Alice', 'session-a');

      // Advance past expiry
      vi.advanceTimersByTime(15001);

      // User B can now acquire
      const result = lockService.acquireLock(
        'plugin-1',
        'user-b',
        'Bob',
        'session-b'
      );

      expect(result.success).toBe(true);
      expect(result.lock?.holderId).toBe('user-b');
    });

    it('✓ Cleanup removes expired locks', () => {
      // Acquire multiple locks
      lockService.acquireLock('plugin-1', 'user-a', 'Alice', 'session-a');
      lockService.acquireLock('plugin-2', 'user-a', 'Alice', 'session-a');

      // Advance past expiry
      vi.advanceTimersByTime(15001);

      // Acquire one more (fresh)
      lockService.acquireLock('plugin-3', 'user-b', 'Bob', 'session-b');

      // Run cleanup
      const expired = lockService.cleanupExpiredLocks();

      expect(expired).toContain('plugin-1');
      expect(expired).toContain('plugin-2');
      expect(expired).not.toContain('plugin-3');

      // Fresh lock should still exist
      expect(lockService.getLock('plugin-3')).not.toBeNull();
    });
  });

  // ==========================================================================
  // Disconnect Cleanup Tests
  // ==========================================================================
  describe('Disconnect triggers lock cleanup', () => {
    it('✓ Disconnect releases all locks for session', () => {
      const sessionId = 'session-a';

      // Acquire multiple locks in the same session
      lockService.acquireLock('plugin-1', 'user-a', 'Alice', sessionId);
      lockService.acquireLock('plugin-2', 'user-a', 'Alice', sessionId);
      lockService.acquireLock('plugin-3', 'user-a', 'Alice', sessionId);

      // Disconnect
      const released = lockService.handleDisconnect(sessionId);

      expect(released).toContain('plugin-1');
      expect(released).toContain('plugin-2');
      expect(released).toContain('plugin-3');

      // All locks should be released
      expect(lockService.getLock('plugin-1')).toBeNull();
      expect(lockService.getLock('plugin-2')).toBeNull();
      expect(lockService.getLock('plugin-3')).toBeNull();
    });

    it('✓ Disconnect does not affect other sessions', () => {
      // Session A acquires locks
      lockService.acquireLock('plugin-1', 'user-a', 'Alice', 'session-a');

      // Session B acquires different lock
      lockService.acquireLock('plugin-2', 'user-b', 'Bob', 'session-b');

      // Disconnect session A
      lockService.handleDisconnect('session-a');

      // Session B lock should still exist
      expect(lockService.getLock('plugin-1')).toBeNull();
      expect(lockService.getLock('plugin-2')).not.toBeNull();
    });

    it('✓ Disconnect with no locks is safe', () => {
      const released = lockService.handleDisconnect('nonexistent-session');

      expect(released).toEqual([]);
    });

    it('✓ After disconnect, locks can be acquired by others', () => {
      // Session A acquires locks
      lockService.acquireLock('plugin-1', 'user-a', 'Alice', 'session-a');

      // Session A disconnects
      lockService.handleDisconnect('session-a');

      // Session B can acquire the same lock
      const result = lockService.acquireLock(
        'plugin-1',
        'user-b',
        'Bob',
        'session-b'
      );

      expect(result.success).toBe(true);
      expect(result.lock?.holderId).toBe('user-b');
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================
  describe('Edge cases', () => {
    it('should handle multiple plugins independently', () => {
      // Different users lock different plugins
      const result1 = lockService.acquireLock(
        'plugin-1',
        'user-a',
        'Alice',
        'session-a'
      );
      const result2 = lockService.acquireLock(
        'plugin-2',
        'user-b',
        'Bob',
        'session-b'
      );
      const result3 = lockService.acquireLock(
        'plugin-3',
        'user-c',
        'Charlie',
        'session-c'
      );

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);

      // Each lock is independent
      expect(lockService.getLock('plugin-1')?.holderId).toBe('user-a');
      expect(lockService.getLock('plugin-2')?.holderId).toBe('user-b');
      expect(lockService.getLock('plugin-3')?.holderId).toBe('user-c');
    });

    it('should handle rapid acquire/release cycles', () => {
      for (let i = 0; i < 100; i++) {
        lockService.acquireLock('plugin-1', 'user-a', 'Alice', 'session-a');
        lockService.releaseLock('plugin-1', 'user-a');
      }

      // Plugin should be unlocked
      expect(lockService.getLock('plugin-1')).toBeNull();

      // Should be acquirable
      const result = lockService.acquireLock(
        'plugin-1',
        'user-b',
        'Bob',
        'session-b'
      );
      expect(result.success).toBe(true);
    });
  });
});
