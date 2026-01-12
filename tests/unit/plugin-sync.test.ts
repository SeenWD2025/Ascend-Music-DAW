/**
 * Unit Tests: Plugin Sync Service
 *
 * Tests the plugin synchronization service responsible for:
 * - Throttling plugin parameter changes to 30Hz
 * - Coalescing param changes within 33ms windows
 * - Rate limiting to prevent > 30 events/second
 * - Grouping related param changes with batch_id
 *
 * These tests validate the WebSocket/realtime sync behavior for plugin state.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// =============================================================================
// Types
// =============================================================================

interface PluginParamChange {
  pluginId: string;
  paramId: string;
  value: number;
  timestamp: number;
  batchId?: string;
}

interface ThrottledChange {
  pluginId: string;
  params: Record<string, number>;
  batchId: string;
  timestamp: number;
}

// =============================================================================
// Mock Plugin Sync Service (to be implemented in packages/daw)
// =============================================================================

/**
 * Plugin Sync Service mock implementation for testing.
 * Real implementation would use WebSocket connections.
 */
class PluginSyncService {
  private static readonly THROTTLE_INTERVAL_MS = 33; // ~30Hz
  private static readonly MAX_EVENTS_PER_SECOND = 30;
  private static readonly COALESCE_WINDOW_MS = 33;

  private pendingChanges: Map<string, PluginParamChange[]> = new Map();
  private lastEmitTime: Map<string, number> = new Map();
  private eventCount = 0;
  private eventWindowStart = Date.now();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private emittedChanges: ThrottledChange[] = [];

  constructor() {
    this.reset();
  }

  /**
   * Reset the service state (for testing).
   */
  reset(): void {
    this.pendingChanges.clear();
    this.lastEmitTime.clear();
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.emittedChanges = [];
    this.eventCount = 0;
    this.eventWindowStart = Date.now();
  }

  /**
   * Queue a parameter change for sync.
   * Changes are throttled and coalesced before emission.
   */
  queueParamChange(change: PluginParamChange): boolean {
    const now = Date.now();

    // Check rate limit
    if (now - this.eventWindowStart >= 1000) {
      this.eventCount = 0;
      this.eventWindowStart = now;
    }

    if (this.eventCount >= PluginSyncService.MAX_EVENTS_PER_SECOND) {
      return false; // Rate limited
    }

    // Add to pending changes
    const key = change.pluginId;
    if (!this.pendingChanges.has(key)) {
      this.pendingChanges.set(key, []);
    }
    this.pendingChanges.get(key)!.push(change);

    // Schedule throttled emit if not already scheduled
    if (!this.timers.has(key)) {
      const lastEmit = this.lastEmitTime.get(key) || 0;
      const timeSinceLastEmit = now - lastEmit;
      const delay = Math.max(0, PluginSyncService.THROTTLE_INTERVAL_MS - timeSinceLastEmit);

      const timer = setTimeout(() => {
        this.emitCoalescedChanges(key);
      }, delay);

      this.timers.set(key, timer);
    }

    return true;
  }

  /**
   * Emit coalesced changes for a plugin.
   */
  private emitCoalescedChanges(pluginId: string): void {
    const changes = this.pendingChanges.get(pluginId) || [];
    if (changes.length === 0) return;

    // Coalesce: take the latest value for each param
    const params: Record<string, number> = {};
    let batchId = '';

    for (const change of changes) {
      params[change.paramId] = change.value;
      if (change.batchId) {
        batchId = change.batchId;
      }
    }

    // Generate batch ID if not provided
    if (!batchId) {
      batchId = `batch-${pluginId}-${Date.now()}`;
    }

    const throttledChange: ThrottledChange = {
      pluginId,
      params,
      batchId,
      timestamp: Date.now(),
    };

    this.emittedChanges.push(throttledChange);
    this.eventCount++;
    this.lastEmitTime.set(pluginId, Date.now());

    // Clear pending
    this.pendingChanges.delete(pluginId);
    this.timers.delete(pluginId);
  }

  /**
   * Get emitted changes (for testing).
   */
  getEmittedChanges(): ThrottledChange[] {
    return this.emittedChanges;
  }

  /**
   * Force flush all pending changes (for testing).
   */
  flush(): void {
    for (const [pluginId, timer] of this.timers) {
      clearTimeout(timer);
      this.emitCoalescedChanges(pluginId);
    }
  }

  /**
   * Get the current event count (for testing rate limiting).
   */
  getEventCount(): number {
    return this.eventCount;
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('Unit: Plugin Sync Service', () => {
  let syncService: PluginSyncService;

  beforeEach(() => {
    syncService = new PluginSyncService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    syncService.reset();
    vi.useRealTimers();
  });

  // ==========================================================================
  // Throttling Tests
  // ==========================================================================
  describe('Throttle limits param changes to 30Hz', () => {
    it('should throttle rapid parameter changes to ~33ms intervals', async () => {
      const pluginId = 'plugin-1';

      // Queue 10 rapid changes
      for (let i = 0; i < 10; i++) {
        syncService.queueParamChange({
          pluginId,
          paramId: 'volume',
          value: i * 0.1,
          timestamp: Date.now(),
        });
        vi.advanceTimersByTime(5); // 5ms between changes
      }

      // After 50ms, first emit should have happened
      vi.advanceTimersByTime(33);
      syncService.flush();

      const emitted = syncService.getEmittedChanges();
      
      // Should coalesce into fewer emissions due to throttling
      expect(emitted.length).toBeGreaterThanOrEqual(1);
      expect(emitted.length).toBeLessThan(10);
    });

    it('should emit at most once per 33ms for the same plugin', async () => {
      const pluginId = 'plugin-2';
      const emitTimes: number[] = [];

      // Queue changes and track when they would emit
      for (let i = 0; i < 5; i++) {
        syncService.queueParamChange({
          pluginId,
          paramId: 'param',
          value: i,
          timestamp: Date.now(),
        });

        // Advance 33ms and flush
        vi.advanceTimersByTime(33);
        syncService.flush();

        const emitted = syncService.getEmittedChanges();
        if (emitted.length > emitTimes.length) {
          emitTimes.push(emitted[emitted.length - 1].timestamp);
        }
      }

      // Check intervals between emissions are at least 33ms
      for (let i = 1; i < emitTimes.length; i++) {
        const interval = emitTimes[i] - emitTimes[i - 1];
        expect(interval).toBeGreaterThanOrEqual(33);
      }
    });
  });

  // ==========================================================================
  // Coalescing Tests
  // ==========================================================================
  describe('Coalesce groups changes within 33ms window', () => {
    it('should coalesce multiple param changes within the same window', () => {
      const pluginId = 'plugin-3';

      // Queue multiple changes for different params within 33ms
      syncService.queueParamChange({
        pluginId,
        paramId: 'volume',
        value: 0.5,
        timestamp: Date.now(),
      });
      vi.advanceTimersByTime(10);

      syncService.queueParamChange({
        pluginId,
        paramId: 'pan',
        value: -0.3,
        timestamp: Date.now(),
      });
      vi.advanceTimersByTime(10);

      syncService.queueParamChange({
        pluginId,
        paramId: 'reverb',
        value: 0.7,
        timestamp: Date.now(),
      });

      // Advance and flush
      vi.advanceTimersByTime(33);
      syncService.flush();

      const emitted = syncService.getEmittedChanges();

      // Should be coalesced into a single emission
      expect(emitted).toHaveLength(1);
      expect(emitted[0].pluginId).toBe(pluginId);
      expect(emitted[0].params).toEqual({
        volume: 0.5,
        pan: -0.3,
        reverb: 0.7,
      });
    });

    it('should use latest value when same param changes multiple times', () => {
      const pluginId = 'plugin-4';

      // Queue multiple changes for the same param
      syncService.queueParamChange({
        pluginId,
        paramId: 'volume',
        value: 0.1,
        timestamp: Date.now(),
      });
      vi.advanceTimersByTime(5);

      syncService.queueParamChange({
        pluginId,
        paramId: 'volume',
        value: 0.5,
        timestamp: Date.now(),
      });
      vi.advanceTimersByTime(5);

      syncService.queueParamChange({
        pluginId,
        paramId: 'volume',
        value: 0.9,
        timestamp: Date.now(),
      });

      // Advance and flush
      vi.advanceTimersByTime(33);
      syncService.flush();

      const emitted = syncService.getEmittedChanges();

      // Should use the latest value (0.9)
      expect(emitted).toHaveLength(1);
      expect(emitted[0].params.volume).toBe(0.9);
    });

    it('should handle changes from multiple plugins independently', () => {
      // Queue changes for plugin-a
      syncService.queueParamChange({
        pluginId: 'plugin-a',
        paramId: 'volume',
        value: 0.5,
        timestamp: Date.now(),
      });

      vi.advanceTimersByTime(10);

      // Queue changes for plugin-b
      syncService.queueParamChange({
        pluginId: 'plugin-b',
        paramId: 'gain',
        value: 0.8,
        timestamp: Date.now(),
      });

      // Advance and flush
      vi.advanceTimersByTime(33);
      syncService.flush();

      const emitted = syncService.getEmittedChanges();

      // Should have separate emissions for each plugin
      expect(emitted).toHaveLength(2);
      expect(emitted.find((e) => e.pluginId === 'plugin-a')?.params.volume).toBe(0.5);
      expect(emitted.find((e) => e.pluginId === 'plugin-b')?.params.gain).toBe(0.8);
    });
  });

  // ==========================================================================
  // Rate Limiting Tests
  // ==========================================================================
  describe('Rate limit rejects when > 30 events/second', () => {
    it('should accept up to 30 events per second', () => {
      const results: boolean[] = [];

      for (let i = 0; i < 30; i++) {
        const result = syncService.queueParamChange({
          pluginId: `plugin-${i}`,
          paramId: 'param',
          value: 0.5,
          timestamp: Date.now(),
        });
        results.push(result);

        // Flush to count the event
        vi.advanceTimersByTime(33);
        syncService.flush();
      }

      // All 30 should be accepted
      expect(results.every((r) => r === true)).toBe(true);
      expect(syncService.getEventCount()).toBe(30);
    });

    it('should reject events when exceeding 30 per second', () => {
      // Fill up the quota
      for (let i = 0; i < 30; i++) {
        syncService.queueParamChange({
          pluginId: `plugin-${i}`,
          paramId: 'param',
          value: 0.5,
          timestamp: Date.now(),
        });
        vi.advanceTimersByTime(33);
        syncService.flush();
      }

      // 31st event should be rejected
      const result = syncService.queueParamChange({
        pluginId: 'plugin-overflow',
        paramId: 'param',
        value: 0.5,
        timestamp: Date.now(),
      });

      expect(result).toBe(false);
    });

    it('should reset rate limit after 1 second window', () => {
      // Fill up the quota
      for (let i = 0; i < 30; i++) {
        syncService.queueParamChange({
          pluginId: `plugin-${i}`,
          paramId: 'param',
          value: 0.5,
          timestamp: Date.now(),
        });
        vi.advanceTimersByTime(33);
        syncService.flush();
      }

      // Advance past the 1-second window
      vi.advanceTimersByTime(1001);

      // Should be able to queue again
      const result = syncService.queueParamChange({
        pluginId: 'plugin-new',
        paramId: 'param',
        value: 0.5,
        timestamp: Date.now(),
      });

      expect(result).toBe(true);
      expect(syncService.getEventCount()).toBe(0); // Reset happened
    });
  });

  // ==========================================================================
  // Batch ID Tests
  // ==========================================================================
  describe('Batch_id groups related param changes', () => {
    it('should preserve batch_id in emitted changes', () => {
      const pluginId = 'plugin-5';
      const batchId = 'user-interaction-123';

      syncService.queueParamChange({
        pluginId,
        paramId: 'volume',
        value: 0.5,
        timestamp: Date.now(),
        batchId,
      });

      syncService.queueParamChange({
        pluginId,
        paramId: 'pan',
        value: 0.3,
        timestamp: Date.now(),
        batchId,
      });

      vi.advanceTimersByTime(33);
      syncService.flush();

      const emitted = syncService.getEmittedChanges();

      expect(emitted).toHaveLength(1);
      expect(emitted[0].batchId).toBe(batchId);
    });

    it('should generate batch_id if not provided', () => {
      const pluginId = 'plugin-6';

      syncService.queueParamChange({
        pluginId,
        paramId: 'volume',
        value: 0.5,
        timestamp: Date.now(),
        // No batchId provided
      });

      vi.advanceTimersByTime(33);
      syncService.flush();

      const emitted = syncService.getEmittedChanges();

      expect(emitted).toHaveLength(1);
      expect(emitted[0].batchId).toBeDefined();
      expect(emitted[0].batchId).toContain('batch-');
      expect(emitted[0].batchId).toContain(pluginId);
    });

    it('should use the last provided batch_id when multiple are given', () => {
      const pluginId = 'plugin-7';

      syncService.queueParamChange({
        pluginId,
        paramId: 'param1',
        value: 0.1,
        timestamp: Date.now(),
        batchId: 'batch-first',
      });

      vi.advanceTimersByTime(10);

      syncService.queueParamChange({
        pluginId,
        paramId: 'param2',
        value: 0.2,
        timestamp: Date.now(),
        batchId: 'batch-second',
      });

      vi.advanceTimersByTime(33);
      syncService.flush();

      const emitted = syncService.getEmittedChanges();

      expect(emitted).toHaveLength(1);
      expect(emitted[0].batchId).toBe('batch-second');
    });
  });
});
