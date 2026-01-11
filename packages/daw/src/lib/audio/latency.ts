/**
 * Latency measurement and glitch tracking utilities
 * Used for monitoring audio performance and reporting to analytics
 */

import * as Tone from 'tone';

export interface LatencyMetrics {
  latency: number;
  glitchCount: number;
  measurementCount: number;
  averageLatency: number;
  lastMeasuredAt: number | null;
}

class LatencyTracker {
  private latency = 0;
  private glitchCount = 0;
  private measurementCount = 0;
  private totalLatency = 0;
  private lastMeasuredAt: number | null = null;

  /**
   * Measure round-trip audio latency using Web Audio API
   * Returns latency in milliseconds
   */
  async measureLatency(): Promise<number> {
    try {
      const context = Tone.context.rawContext;
      
      if (context.state !== 'running') {
        console.warn('[Latency] Audio context not running, cannot measure latency');
        return this.latency;
      }

      // Calculate base latency from audio context
      const baseLatency = context.baseLatency || 0;
      const outputLatency = (context as AudioContext).outputLatency || 0;
      
      // Total latency in milliseconds
      const totalLatencyMs = (baseLatency + outputLatency) * 1000;
      
      // Store measurement
      this.latency = totalLatencyMs;
      this.measurementCount++;
      this.totalLatency += totalLatencyMs;
      this.lastMeasuredAt = Date.now();

      return totalLatencyMs;
    } catch (error) {
      // TODO: Replace with Sentry.captureException(error)
      console.error('[Latency] Failed to measure latency:', error);
      return this.latency;
    }
  }

  /**
   * Increment the glitch counter
   * Call this when an audio underrun or glitch is detected
   */
  trackGlitch(): void {
    this.glitchCount++;
    
    // TODO: Replace with Sentry.addBreadcrumb
    console.debug('[Latency] Audio glitch detected, count:', this.glitchCount);
  }

  /**
   * Get current latency metrics
   */
  getMetrics(): LatencyMetrics {
    return {
      latency: this.latency,
      glitchCount: this.glitchCount,
      measurementCount: this.measurementCount,
      averageLatency: this.measurementCount > 0 
        ? this.totalLatency / this.measurementCount 
        : 0,
      lastMeasuredAt: this.lastMeasuredAt,
    };
  }

  /**
   * Report metrics to PostHog analytics
   * Placeholder for analytics integration
   */
  reportToPostHog(): void {
    const metrics = this.getMetrics();
    
    // TODO: Replace with actual PostHog integration
    // posthog.capture('daw_audio_metrics', {
    //   latency_ms: metrics.latency,
    //   average_latency_ms: metrics.averageLatency,
    //   glitch_count: metrics.glitchCount,
    //   measurement_count: metrics.measurementCount,
    // });
    
    console.debug('[Latency] Reporting to PostHog:', metrics);
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.latency = 0;
    this.glitchCount = 0;
    this.measurementCount = 0;
    this.totalLatency = 0;
    this.lastMeasuredAt = null;
  }
}

// Singleton instance
const latencyTracker = new LatencyTracker();

/**
 * Measure round-trip audio latency
 * @returns Latency in milliseconds
 */
export async function measureLatency(): Promise<number> {
  return latencyTracker.measureLatency();
}

/**
 * Track an audio glitch occurrence
 */
export function trackGlitch(): void {
  latencyTracker.trackGlitch();
}

/**
 * Get current latency and glitch metrics
 */
export function getMetrics(): LatencyMetrics {
  return latencyTracker.getMetrics();
}

/**
 * Report metrics to PostHog
 */
export function reportToPostHog(): void {
  latencyTracker.reportToPostHog();
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics(): void {
  latencyTracker.reset();
}

/**
 * Set up automatic glitch detection using Web Audio API
 * Monitors for audio buffer underruns
 */
export function setupGlitchDetection(): () => void {
  const context = Tone.context.rawContext as AudioContext;
  
  let lastCurrentTime = 0;
  let checkInterval: number | null = null;
  
  const checkForGlitches = () => {
    if (context.state !== 'running') {
      return;
    }
    
    const currentTime = context.currentTime;
    const expectedDelta = 0.1; // 100ms check interval
    const actualDelta = currentTime - lastCurrentTime;
    
    // If time jumped more than expected, a glitch likely occurred
    if (lastCurrentTime > 0 && actualDelta > expectedDelta * 1.5) {
      trackGlitch();
    }
    
    lastCurrentTime = currentTime;
  };
  
  // Check every 100ms
  checkInterval = window.setInterval(checkForGlitches, 100);
  
  // Return cleanup function
  return () => {
    if (checkInterval !== null) {
      window.clearInterval(checkInterval);
    }
  };
}
