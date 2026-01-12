/**
 * Waveform utilities for audio visualization
 * Provides decoding, extraction, and rendering of waveform data
 */

/**
 * Get or create a shared AudioContext for decoding
 */
let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioContext();
  }
  return sharedAudioContext;
}

/**
 * Decode an ArrayBuffer into an AudioBuffer
 * 
 * @param arrayBuffer - Raw audio file data
 * @returns Promise resolving to decoded AudioBuffer
 * 
 * @example
 * ```ts
 * const response = await fetch(audioUrl);
 * const arrayBuffer = await response.arrayBuffer();
 * const audioBuffer = await decodeAudioBuffer(arrayBuffer);
 * ```
 */
export async function decodeAudioBuffer(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  const audioContext = getAudioContext();
  
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    return audioBuffer;
  } catch (error) {
    throw new Error(`Failed to decode audio data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Waveform data containing min/max pairs for each pixel column
 * Even indices are min values, odd indices are max values
 */
export interface WaveformData {
  /** Min/max pairs for drawing. Length = samplesCount * 2 */
  data: Float32Array;
  /** Number of sample points (each point has min + max) */
  length: number;
  /** Duration of the audio in seconds */
  duration: number;
  /** Number of channels in the source audio */
  channels: number;
}

/**
 * Extract waveform visualization data from an AudioBuffer
 * Returns min/max pairs that can be used to draw the waveform
 * 
 * @param audioBuffer - Decoded AudioBuffer
 * @param samplesPerPixel - Number of audio samples per visual sample (controls resolution)
 * @returns WaveformData with min/max pairs for rendering
 * 
 * @example
 * ```ts
 * const waveformData = extractWaveformData(audioBuffer, 256);
 * // waveformData.data contains alternating min/max values
 * ```
 */
export function extractWaveformData(
  audioBuffer: AudioBuffer,
  samplesPerPixel: number = 256
): WaveformData {
  const { numberOfChannels, length: totalSamples, duration } = audioBuffer;
  
  // Calculate number of output samples
  const outputLength = Math.ceil(totalSamples / samplesPerPixel);
  
  // Create output array (min/max pairs)
  const data = new Float32Array(outputLength * 2);
  
  // Mix down to mono for visualization
  const channelData: Float32Array[] = [];
  for (let c = 0; c < numberOfChannels; c++) {
    channelData.push(audioBuffer.getChannelData(c));
  }
  
  // Process each output sample
  for (let i = 0; i < outputLength; i++) {
    const startSample = i * samplesPerPixel;
    const endSample = Math.min(startSample + samplesPerPixel, totalSamples);
    
    let min = 1;
    let max = -1;
    
    // Find min/max across all channels for this sample range
    for (let s = startSample; s < endSample; s++) {
      for (let c = 0; c < numberOfChannels; c++) {
        const value = channelData[c][s];
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
    
    // Store min/max pair
    data[i * 2] = min;
    data[i * 2 + 1] = max;
  }
  
  return {
    data,
    length: outputLength,
    duration,
    channels: numberOfChannels,
  };
}

/**
 * Draw a waveform to a canvas
 * 
 * @param canvas - Canvas element to draw on
 * @param waveformData - Pre-extracted waveform data
 * @param color - Color for the waveform (CSS color string)
 * @param startPixel - Starting X position on canvas
 * @param widthPixels - Width to draw in pixels
 * @param options - Additional drawing options
 * 
 * @example
 * ```ts
 * const canvas = canvasRef.current;
 * drawWaveform(canvas, waveformData, '#3b82f6', 0, canvas.width);
 * ```
 */
export function drawWaveform(
  canvas: HTMLCanvasElement,
  waveformData: WaveformData,
  color: string = '#3b82f6',
  startPixel: number = 0,
  widthPixels?: number,
  options: {
    /** Background color (set to 'transparent' for no background) */
    backgroundColor?: string;
    /** Whether to mirror the waveform */
    mirror?: boolean;
    /** Vertical scale factor (0-1) */
    amplitude?: number;
  } = {}
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  const {
    backgroundColor = 'transparent',
    mirror = true,
    amplitude = 0.9,
  } = options;
  
  const { width, height } = canvas;
  const drawWidth = widthPixels ?? width - startPixel;
  
  // Clear canvas or draw background
  if (backgroundColor === 'transparent') {
    ctx.clearRect(startPixel, 0, drawWidth, height);
  } else {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(startPixel, 0, drawWidth, height);
  }
  
  const { data, length: dataLength } = waveformData;
  if (dataLength === 0) return;
  
  // Calculate scaling
  const centerY = height / 2;
  const maxHeight = (height / 2) * amplitude;
  
  // Samples per pixel on canvas
  const samplesPerCanvasPixel = dataLength / drawWidth;
  
  ctx.fillStyle = color;
  
  // Draw waveform bars
  for (let x = 0; x < drawWidth; x++) {
    const sampleIndex = Math.floor(x * samplesPerCanvasPixel);
    
    if (sampleIndex * 2 + 1 >= data.length) break;
    
    const min = data[sampleIndex * 2];
    const max = data[sampleIndex * 2 + 1];
    
    if (mirror) {
      // Draw mirrored waveform
      const y1 = centerY - max * maxHeight;
      const y2 = centerY - min * maxHeight;
      const barHeight = Math.max(1, y2 - y1);
      
      ctx.fillRect(startPixel + x, y1, 1, barHeight);
    } else {
      // Draw from bottom
      const barHeight = Math.max(1, Math.abs(max - min) * maxHeight);
      ctx.fillRect(startPixel + x, height - barHeight, 1, barHeight);
    }
  }
}

/**
 * Draw waveform directly from AudioBuffer (convenience function)
 * Combines extraction and drawing in one call
 */
export function drawWaveformFromBuffer(
  canvas: HTMLCanvasElement,
  audioBuffer: AudioBuffer,
  color: string = '#3b82f6',
  samplesPerPixel: number = 256
): WaveformData {
  const waveformData = extractWaveformData(audioBuffer, samplesPerPixel);
  drawWaveform(canvas, waveformData, color, 0, canvas.width);
  return waveformData;
}

/**
 * Calculate optimal samples per pixel for a given duration and width
 */
export function calculateSamplesPerPixel(
  audioBuffer: AudioBuffer,
  targetWidth: number
): number {
  const totalSamples = audioBuffer.length;
  return Math.max(1, Math.ceil(totalSamples / targetWidth));
}
