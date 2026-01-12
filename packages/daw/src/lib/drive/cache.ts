/**
 * Audio Buffer Cache
 * LRU (Least Recently Used) cache for decoded AudioBuffers
 * 
 * Optimizes scrub/playback by keeping frequently accessed audio in memory.
 * Uses an LRU eviction strategy when cache reaches max capacity.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
  hitRate: number;
}

export interface CacheEntry {
  buffer: AudioBuffer;
  lastAccessed: number;
  size: number; // Approximate memory size in bytes
}

// ─────────────────────────────────────────────────────────────────────────────
// AudioBufferCache Class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * In-memory cache for decoded audio buffers with LRU eviction
 * 
 * @example
 * ```ts
 * const cache = new AudioBufferCache(50);
 * 
 * // Store a buffer
 * cache.set('file-123', audioBuffer);
 * 
 * // Retrieve a buffer (updates LRU order)
 * const buffer = cache.get('file-123');
 * 
 * // Check cache status
 * console.log(cache.getStats());
 * ```
 */
export class AudioBufferCache {
  private cache: Map<string, CacheEntry>;
  private lruOrder: string[]; // Most recent at end
  private maxSize: number;
  
  // Cache statistics
  private hits: number = 0;
  private misses: number = 0;

  /**
   * Create a new AudioBufferCache
   * @param maxSize - Maximum number of buffers to cache
   */
  constructor(maxSize: number = 50) {
    this.cache = new Map();
    this.lruOrder = [];
    this.maxSize = Math.max(1, maxSize);
  }

  /**
   * Get a buffer from cache
   * Updates LRU order on access
   * 
   * @param driveFileId - Drive file ID key
   * @returns AudioBuffer if cached, undefined otherwise
   */
  get(driveFileId: string): AudioBuffer | undefined {
    const entry = this.cache.get(driveFileId);
    
    if (entry) {
      // Update LRU order - move to end (most recently used)
      this.touchLRU(driveFileId);
      entry.lastAccessed = Date.now();
      this.hits++;
      return entry.buffer;
    }
    
    this.misses++;
    return undefined;
  }

  /**
   * Store a buffer in cache
   * Evicts oldest entries if cache is full
   * 
   * @param driveFileId - Drive file ID key
   * @param buffer - AudioBuffer to cache
   */
  set(driveFileId: string, buffer: AudioBuffer): void {
    // If already cached, just update
    if (this.cache.has(driveFileId)) {
      const entry = this.cache.get(driveFileId)!;
      entry.buffer = buffer;
      entry.lastAccessed = Date.now();
      entry.size = this.estimateBufferSize(buffer);
      this.touchLRU(driveFileId);
      return;
    }

    // Evict if at capacity
    while (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    // Add new entry
    this.cache.set(driveFileId, {
      buffer,
      lastAccessed: Date.now(),
      size: this.estimateBufferSize(buffer),
    });
    this.lruOrder.push(driveFileId);
  }

  /**
   * Check if a buffer is cached
   * Does NOT update LRU order (peek operation)
   * 
   * @param driveFileId - Drive file ID key
   */
  has(driveFileId: string): boolean {
    return this.cache.has(driveFileId);
  }

  /**
   * Evict the oldest (least recently used) entry
   */
  evictOldest(): void {
    if (this.lruOrder.length === 0) {
      return;
    }

    const oldestId = this.lruOrder.shift();
    if (oldestId) {
      this.cache.delete(oldestId);
    }
  }

  /**
   * Remove a specific entry from cache
   * @param driveFileId - Drive file ID to remove
   */
  remove(driveFileId: string): boolean {
    const existed = this.cache.delete(driveFileId);
    if (existed) {
      const index = this.lruOrder.indexOf(driveFileId);
      if (index > -1) {
        this.lruOrder.splice(index, 1);
      }
    }
    return existed;
  }

  /**
   * Clear all cached buffers
   */
  clear(): void {
    this.cache.clear();
    this.lruOrder = [];
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Get total estimated memory usage in bytes
   */
  getMemoryUsage(): number {
    let total = 0;
    for (const entry of this.cache.values()) {
      total += entry.size;
    }
    return total;
  }

  /**
   * Get list of all cached file IDs
   */
  getCachedIds(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Resize the cache
   * Evicts entries if new size is smaller than current cache size
   * 
   * @param newMaxSize - New maximum cache size
   */
  resize(newMaxSize: number): void {
    this.maxSize = Math.max(1, newMaxSize);
    
    // Evict until within new limit
    while (this.cache.size > this.maxSize) {
      this.evictOldest();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Update LRU order - move item to end (most recently used)
   */
  private touchLRU(driveFileId: string): void {
    const index = this.lruOrder.indexOf(driveFileId);
    if (index > -1) {
      this.lruOrder.splice(index, 1);
    }
    this.lruOrder.push(driveFileId);
  }

  /**
   * Estimate AudioBuffer memory size
   * AudioBuffer stores samples as Float32 (4 bytes per sample)
   */
  private estimateBufferSize(buffer: AudioBuffer): number {
    return buffer.numberOfChannels * buffer.length * 4; // 4 bytes per Float32
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Instance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Global audio buffer cache instance
 * Configured for 50 buffers max (~500MB for stereo 44.1kHz 5-min clips)
 */
export const audioCache = new AudioBufferCache(50);
