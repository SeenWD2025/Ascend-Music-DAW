/**
 * Audio engine utilities for DAW
 * Re-exports AudioEngine and latency utilities
 */

// Audio Engine
export { 
  AudioEngine, 
  getAudioEngine, 
  resetAudioEngine,
  type AudioEngineOptions,
  type PositionChangeCallback,
} from './engine';

// Latency utilities
export {
  measureLatency,
  trackGlitch,
  getMetrics,
  reportToPostHog,
  resetMetrics,
  setupGlitchDetection,
  type LatencyMetrics,
} from './latency';

// Waveform utilities
export {
  decodeAudioBuffer,
  extractWaveformData,
  drawWaveform,
  drawWaveformFromBuffer,
  calculateSamplesPerPixel,
  type WaveformData,
} from './waveform';
