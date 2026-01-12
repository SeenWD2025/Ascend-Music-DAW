/**
 * Audio Fetcher with Caching
 * Fetches audio from Google Drive with local buffer caching for scrub/playback
 * 
 * @see docs/DRIVE_UPLOAD_STRATEGY.md
 */

import * as Sentry from '@sentry/browser';
import { audioCache, type CacheStats } from './cache';
import { decodeAudioBuffer } from '../audio/waveform';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FetchOptions {
  /** Force refresh, bypassing cache */
  forceRefresh?: boolean;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Priority hint for fetch scheduling */
  priority?: 'high' | 'normal' | 'low';
}

export interface PrefetchResult {
  driveFileId: string;
  success: boolean;
  error?: string;
}

interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = '/api/v1';

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 8000,
  backoffMultiplier: 2,
};

// Track in-flight requests to prevent duplicate fetches
const pendingFetches = new Map<string, Promise<AudioBuffer>>();

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate exponential backoff delay
 */
function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(baseDelay, config.maxDelayMs);
  // Add jitter (0-10%)
  const jitter = cappedDelay * 0.1 * Math.random();
  return Math.floor(cappedDelay + jitter);
}

/**
 * Sleep for given milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if status code is retryable
 */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 500 ||
         status === 502 || status === 503 || status === 504;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch audio buffer, using cache if available
 * 
 * @param driveFileId - Google Drive file ID
 * @param options - Fetch options
 * @returns Decoded AudioBuffer
 * 
 * @example
 * ```ts
 * const buffer = await fetchAudioBuffer('abc123');
 * // Play or analyze buffer...
 * ```
 */
export async function fetchAudioBuffer(
  driveFileId: string,
  options: FetchOptions = {}
): Promise<AudioBuffer> {
  const { forceRefresh = false, signal } = options;
  
  // Check cache first (unless forcing refresh)
  if (!forceRefresh) {
    const cached = audioCache.get(driveFileId);
    if (cached) {
      return cached;
    }
  }

  // Check for pending fetch to prevent duplicate requests
  const pending = pendingFetches.get(driveFileId);
  if (pending && !forceRefresh) {
    return pending;
  }

  // Create fetch promise
  const fetchPromise = performFetch(driveFileId, signal);
  pendingFetches.set(driveFileId, fetchPromise);

  try {
    const buffer = await fetchPromise;
    
    // Cache the result
    audioCache.set(driveFileId, buffer);
    
    return buffer;
  } finally {
    // Remove from pending regardless of success/failure
    pendingFetches.delete(driveFileId);
  }
}

/**
 * Perform the actual fetch with retry logic
 */
async function performFetch(
  driveFileId: string,
  signal?: AbortSignal,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<AudioBuffer> {
  const span = Sentry.startSpan({ name: 'drive.fetch.audio', op: 'http.client' });
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < config.maxRetries) {
    try {
      // Check if aborted
      if (signal?.aborted) {
        throw new DOMException('Fetch aborted', 'AbortError');
      }

      // Fetch audio file from backend proxy
      const response = await fetch(`${API_BASE}/drive/files/${driveFileId}/content`, {
        method: 'GET',
        credentials: 'include',
        signal,
      });

      if (!response.ok) {
        if (isRetryableStatus(response.status)) {
          throw new Error(`Fetch failed: ${response.status}`);
        }
        
        // Non-retryable error
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to fetch audio: ${response.status}`);
      }

      // Get audio data as ArrayBuffer
      const arrayBuffer = await response.arrayBuffer();

      // Decode to AudioBuffer
      const audioBuffer = await decodeAudioBuffer(arrayBuffer);
      
      span?.setStatus({ code: 1, message: 'ok' });
      span?.end();
      
      return audioBuffer;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry abort errors
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }

      attempt++;
      
      if (attempt >= config.maxRetries) {
        break;
      }

      const delay = calculateBackoffDelay(attempt, config);
      console.warn(`[Fetcher] Retry ${attempt}/${config.maxRetries} for ${driveFileId} in ${delay}ms`);
      await sleep(delay);
    }
  }

  // All retries failed
  span?.setStatus({ code: 2, message: 'error' });
  span?.end();
  
  Sentry.captureException(lastError, {
    tags: { component: 'drive_fetcher', operation: 'fetch' },
    contexts: { drive: { fileId: driveFileId } },
  });

  throw lastError || new Error('Failed to fetch audio');
}

/**
 * Prefetch multiple clips for timeline scrub optimization
 * Fetches in parallel with concurrency limit
 * 
 * @param driveFileIds - Array of Drive file IDs to prefetch
 * @returns Array of results indicating success/failure for each
 * 
 * @example
 * ```ts
 * // Prefetch clips visible in timeline viewport
 * const visibleClipIds = clips.map(c => c.driveFileId);
 * await prefetchClips(visibleClipIds);
 * ```
 */
export async function prefetchClips(driveFileIds: string[]): Promise<PrefetchResult[]> {
  const MAX_CONCURRENT = 3;
  const results: PrefetchResult[] = [];
  
  // Filter out already cached items
  const uncachedIds = driveFileIds.filter((id) => !audioCache.has(id));
  
  if (uncachedIds.length === 0) {
    return driveFileIds.map((id) => ({ driveFileId: id, success: true }));
  }

  // Process in batches
  for (let i = 0; i < uncachedIds.length; i += MAX_CONCURRENT) {
    const batch = uncachedIds.slice(i, i + MAX_CONCURRENT);
    
    const batchResults = await Promise.allSettled(
      batch.map(async (driveFileId) => {
        await fetchAudioBuffer(driveFileId, { priority: 'low' });
        return driveFileId;
      })
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const driveFileId = batch[j];
      
      if (result.status === 'fulfilled') {
        results.push({ driveFileId, success: true });
      } else {
        results.push({
          driveFileId,
          success: false,
          error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
        });
      }
    }
  }

  // Add already-cached items as successful
  const cachedIds = driveFileIds.filter((id) => audioCache.has(id));
  for (const id of cachedIds) {
    results.push({ driveFileId: id, success: true });
  }

  return results;
}

/**
 * Get cached buffer without fetching
 * Returns undefined if not cached
 * 
 * @param driveFileId - Drive file ID
 * @returns AudioBuffer if cached, undefined otherwise
 */
export function getCachedBuffer(driveFileId: string): AudioBuffer | undefined {
  return audioCache.get(driveFileId);
}

/**
 * Check if buffer is cached
 */
export function isCached(driveFileId: string): boolean {
  return audioCache.has(driveFileId);
}

/**
 * Remove buffer from cache
 */
export function evictFromCache(driveFileId: string): boolean {
  return audioCache.remove(driveFileId);
}

/**
 * Clear entire audio cache
 */
export function clearCache(): void {
  audioCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): CacheStats {
  return audioCache.getStats();
}

/**
 * Get cache memory usage in bytes
 */
export function getCacheMemoryUsage(): number {
  return audioCache.getMemoryUsage();
}
