/**
 * useAudioBuffer Hook
 * React hook for loading audio buffers with caching
 * 
 * Provides loading state, error handling, and automatic cache integration.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as Sentry from '@sentry/browser';
import { fetchAudioBuffer, getCachedBuffer, type FetchOptions } from '../lib/drive';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UseAudioBufferResult {
  /** The loaded AudioBuffer, or null if not loaded */
  buffer: AudioBuffer | null;
  /** Whether the buffer is currently loading */
  isLoading: boolean;
  /** Any error that occurred during loading */
  error: Error | null;
  /** Force reload the buffer (bypass cache) */
  reload: () => void;
}

export interface UseAudioBufferOptions {
  /** Whether to start loading immediately (default: true) */
  enabled?: boolean;
  /** Force refresh, bypassing cache */
  forceRefresh?: boolean;
  /** Callback when buffer loads successfully */
  onSuccess?: (buffer: AudioBuffer) => void;
  /** Callback when loading fails */
  onError?: (error: Error) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * React hook for loading audio buffers from Drive with caching
 * 
 * @param driveFileId - Google Drive file ID, or null to skip loading
 * @param options - Hook options
 * @returns Loading state, buffer, and error
 * 
 * @example
 * ```tsx
 * function ClipWaveform({ clip }: { clip: AudioClip }) {
 *   const { buffer, isLoading, error } = useAudioBuffer(clip.driveFileId);
 *   
 *   if (isLoading) return <Skeleton />;
 *   if (error) return <ErrorState error={error} />;
 *   if (!buffer) return null;
 *   
 *   return <WaveformDisplay buffer={buffer} />;
 * }
 * ```
 */
export function useAudioBuffer(
  driveFileId: string | null,
  options: UseAudioBufferOptions = {}
): UseAudioBufferResult {
  const {
    enabled = true,
    forceRefresh = false,
    onSuccess,
    onError,
  } = options;

  const [buffer, setBuffer] = useState<AudioBuffer | null>(() => {
    // Check cache synchronously for initial state
    if (driveFileId && !forceRefresh) {
      return getCachedBuffer(driveFileId) ?? null;
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track current file ID to prevent stale updates
  const currentFileIdRef = useRef<string | null>(null);
  
  // AbortController for cleanup
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Load the audio buffer
   */
  const loadBuffer = useCallback(async (fileId: string, refresh: boolean = false) => {
    // Abort any pending request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    
    currentFileIdRef.current = fileId;

    // Check cache first (unless forcing refresh)
    if (!refresh) {
      const cached = getCachedBuffer(fileId);
      if (cached) {
        setBuffer(cached);
        setIsLoading(false);
        setError(null);
        onSuccess?.(cached);
        return;
      }
    }

    setIsLoading(true);
    setError(null);

    try {
      const fetchOptions: FetchOptions = {
        forceRefresh: refresh,
        signal: abortControllerRef.current.signal,
      };

      const loadedBuffer = await fetchAudioBuffer(fileId, fetchOptions);

      // Only update if this is still the current file
      if (currentFileIdRef.current === fileId) {
        setBuffer(loadedBuffer);
        setIsLoading(false);
        onSuccess?.(loadedBuffer);
      }
    } catch (err) {
      // Ignore abort errors
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }

      const error = err instanceof Error ? err : new Error('Failed to load audio');

      // Only update if this is still the current file
      if (currentFileIdRef.current === fileId) {
        setError(error);
        setIsLoading(false);
        onError?.(error);

        Sentry.captureException(error, {
          tags: { component: 'useAudioBuffer', driveFileId: fileId },
        });
      }
    }
  }, [onSuccess, onError]);

  /**
   * Reload the buffer (bypass cache)
   */
  const reload = useCallback(() => {
    if (driveFileId) {
      loadBuffer(driveFileId, true);
    }
  }, [driveFileId, loadBuffer]);

  // Effect to load buffer when fileId changes
  useEffect(() => {
    // Reset state when fileId changes
    if (!driveFileId) {
      setBuffer(null);
      setIsLoading(false);
      setError(null);
      currentFileIdRef.current = null;
      return;
    }

    if (!enabled) {
      return;
    }

    loadBuffer(driveFileId, forceRefresh);

    // Cleanup
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [driveFileId, enabled, forceRefresh, loadBuffer]);

  return {
    buffer,
    isLoading,
    error,
    reload,
  };
}

export default useAudioBuffer;
