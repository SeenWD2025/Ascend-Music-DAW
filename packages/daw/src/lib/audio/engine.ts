/**
 * AudioEngine - Tone.js wrapper for DAW transport control
 * Provides a unified interface for audio playback, transport, and BPM management
 */

import * as Tone from 'tone';

export type PositionChangeCallback = (seconds: number) => void;

export interface AudioEngineOptions {
  defaultBpm?: number;
  onPositionChange?: PositionChangeCallback;
}

export class AudioEngine {
  private transport: typeof Tone.Transport;
  private positionCallback: PositionChangeCallback | null = null;
  private positionInterval: number | null = null;
  private initialized = false;

  constructor(options: AudioEngineOptions = {}) {
    this.transport = Tone.Transport;
    
    if (options.defaultBpm) {
      this.transport.bpm.value = options.defaultBpm;
    }
    
    if (options.onPositionChange) {
      this.positionCallback = options.onPositionChange;
    }
  }

  /**
   * Initialize the audio context and start position tracking
   * Must be called after a user gesture (click/tap)
   */
  async initialize(): Promise<void> {
    try {
      // Start the audio context (requires user gesture)
      await Tone.start();
      
      // Resume if suspended
      if (Tone.context.state === 'suspended') {
        await Tone.context.resume();
      }

      // Start position tracking if callback is set
      if (this.positionCallback) {
        this.startPositionTracking();
      }

      this.initialized = true;
    } catch (error) {
      // TODO: Replace with Sentry.captureException(error)
      console.error('[AudioEngine] Failed to initialize audio context:', error);
      throw new Error('Failed to initialize audio context');
    }
  }

  /**
   * Start transport playback
   */
  play(): void {
    if (!this.initialized) {
      // TODO: Replace with Sentry.captureMessage
      console.warn('[AudioEngine] Cannot play: engine not initialized');
      return;
    }

    try {
      this.transport.start();
    } catch (error) {
      // TODO: Replace with Sentry.captureException(error)
      console.error('[AudioEngine] Failed to start playback:', error);
    }
  }

  /**
   * Pause transport playback
   */
  pause(): void {
    try {
      this.transport.pause();
    } catch (error) {
      // TODO: Replace with Sentry.captureException(error)
      console.error('[AudioEngine] Failed to pause playback:', error);
    }
  }

  /**
   * Stop transport and reset position to beginning
   */
  stop(): void {
    try {
      this.transport.stop();
      this.transport.position = 0;
    } catch (error) {
      // TODO: Replace with Sentry.captureException(error)
      console.error('[AudioEngine] Failed to stop playback:', error);
    }
  }

  /**
   * Seek to a specific position in seconds
   */
  seek(seconds: number): void {
    if (seconds < 0) {
      // TODO: Replace with Sentry.captureMessage
      console.warn('[AudioEngine] Cannot seek to negative position');
      return;
    }

    try {
      this.transport.seconds = seconds;
      
      // Notify callback of position change
      if (this.positionCallback) {
        this.positionCallback(seconds);
      }
    } catch (error) {
      // TODO: Replace with Sentry.captureException(error)
      console.error('[AudioEngine] Failed to seek:', error);
    }
  }

  /**
   * Set the tempo in beats per minute
   */
  setBpm(bpm: number): void {
    if (bpm < 20 || bpm > 300) {
      // TODO: Replace with Sentry.captureMessage
      console.warn('[AudioEngine] BPM out of range (20-300):', bpm);
      return;
    }

    try {
      this.transport.bpm.value = bpm;
    } catch (error) {
      // TODO: Replace with Sentry.captureException(error)
      console.error('[AudioEngine] Failed to set BPM:', error);
    }
  }

  /**
   * Get the current BPM
   */
  getBpm(): number {
    return this.transport.bpm.value;
  }

  /**
   * Get the current transport position in seconds
   */
  getPosition(): number {
    return this.transport.seconds;
  }

  /**
   * Get the current transport state
   */
  getState(): 'started' | 'stopped' | 'paused' {
    return this.transport.state;
  }

  /**
   * Check if the audio context is running
   */
  isAudioContextRunning(): boolean {
    return Tone.context.state === 'running';
  }

  /**
   * Check if the engine is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Set the position change callback
   */
  onPositionChange(callback: PositionChangeCallback | null): void {
    this.positionCallback = callback;
    
    if (callback && this.initialized) {
      this.startPositionTracking();
    } else if (!callback) {
      this.stopPositionTracking();
    }
  }

  /**
   * Start tracking position changes
   */
  private startPositionTracking(): void {
    if (this.positionInterval !== null) {
      return;
    }

    // Update position every ~16ms (~60fps)
    this.positionInterval = window.setInterval(() => {
      if (this.positionCallback && this.transport.state === 'started') {
        this.positionCallback(this.transport.seconds);
      }
    }, 16);
  }

  /**
   * Stop tracking position changes
   */
  private stopPositionTracking(): void {
    if (this.positionInterval !== null) {
      window.clearInterval(this.positionInterval);
      this.positionInterval = null;
    }
  }

  /**
   * Dispose of the engine and clean up resources
   */
  dispose(): void {
    this.stopPositionTracking();
    this.transport.stop();
    this.transport.cancel();
    this.initialized = false;
  }
}

// Singleton instance for global access
let engineInstance: AudioEngine | null = null;

/**
 * Get or create the global AudioEngine instance
 */
export function getAudioEngine(options?: AudioEngineOptions): AudioEngine {
  if (!engineInstance) {
    engineInstance = new AudioEngine(options);
  }
  return engineInstance;
}

/**
 * Reset the global AudioEngine instance (useful for testing)
 */
export function resetAudioEngine(): void {
  if (engineInstance) {
    engineInstance.dispose();
    engineInstance = null;
  }
}
