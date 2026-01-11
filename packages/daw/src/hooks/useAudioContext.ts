/**
 * React hook for managing Web Audio context state
 * Handles audio context suspension, resumption, and state tracking
 */

import { useState, useEffect, useCallback } from 'react';
import * as Tone from 'tone';

export type AudioContextState = 'suspended' | 'running' | 'closed';

export interface UseAudioContextReturn {
  /** Current state of the audio context */
  state: AudioContextState;
  /** Resume the audio context (requires user gesture) */
  resume: () => Promise<void>;
  /** Whether the audio context is ready for playback */
  isReady: boolean;
  /** Any error that occurred during initialization */
  error: Error | null;
}

/**
 * Hook for managing Web Audio context state
 * 
 * @example
 * ```tsx
 * function PlayButton() {
 *   const { state, resume, isReady } = useAudioContext();
 *   
 *   const handleClick = async () => {
 *     if (!isReady) {
 *       await resume();
 *     }
 *     // Now safe to play audio
 *   };
 *   
 *   return (
 *     <button onClick={handleClick} disabled={state === 'closed'}>
 *       {isReady ? 'Play' : 'Click to enable audio'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useAudioContext(): UseAudioContextReturn {
  const [state, setState] = useState<AudioContextState>(() => {
    // Get initial state from Tone.js context
    return Tone.context.state as AudioContextState;
  });
  const [error, setError] = useState<Error | null>(null);

  // Update state when audio context state changes
  useEffect(() => {
    const context = Tone.context.rawContext;

    const handleStateChange = () => {
      setState(context.state as AudioContextState);
    };

    // Listen for state changes
    context.addEventListener('statechange', handleStateChange);

    // Set initial state
    setState(context.state as AudioContextState);

    return () => {
      context.removeEventListener('statechange', handleStateChange);
    };
  }, []);

  /**
   * Resume the audio context
   * Must be called from a user gesture (click, tap, etc.)
   */
  const resume = useCallback(async (): Promise<void> => {
    try {
      setError(null);

      // Start Tone.js (handles audio context resumption)
      await Tone.start();

      // Double-check the context is running
      if (Tone.context.state === 'suspended') {
        await Tone.context.resume();
      }

      setState(Tone.context.state as AudioContextState);
    } catch (err) {
      const error = err instanceof Error 
        ? err 
        : new Error('Failed to resume audio context');
      
      // TODO: Replace with Sentry.captureException(error)
      console.error('[useAudioContext] Failed to resume:', error);
      
      setError(error);
      throw error;
    }
  }, []);

  const isReady = state === 'running';

  return {
    state,
    resume,
    isReady,
    error,
  };
}

export default useAudioContext;
