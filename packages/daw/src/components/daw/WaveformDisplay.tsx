/**
 * WaveformDisplay Component
 * Renders audio waveforms on a canvas with proper scaling and resize handling
 */

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  decodeAudioBuffer,
  extractWaveformData,
  drawWaveform,
  type WaveformData,
} from '../../lib/audio/waveform';

export interface WaveformDisplayProps {
  /** Pre-decoded AudioBuffer */
  audioBuffer?: AudioBuffer | null;
  /** Pre-extracted waveform data (use instead of audioBuffer for performance) */
  waveformData?: WaveformData | null;
  /** URL to fetch and decode audio from */
  audioUrl?: string;
  /** Waveform color (CSS color string) */
  color?: string;
  /** Additional CSS classes */
  className?: string;
  /** Whether to show loading state */
  showLoading?: boolean;
  /** Callback when waveform data is extracted */
  onWaveformReady?: (data: WaveformData) => void;
  /** Callback on decode error */
  onError?: (error: Error) => void;
  /** Starting offset in pixels (for clips) */
  offsetPixels?: number;
  /** Width to render (for clips) */
  widthPixels?: number;
}

/**
 * Component for rendering audio waveforms
 * Supports loading from URL, AudioBuffer, or pre-extracted WaveformData
 * 
 * @example
 * ```tsx
 * // From URL
 * <WaveformDisplay audioUrl="/audio/track.mp3" color="#3b82f6" />
 * 
 * // From AudioBuffer
 * <WaveformDisplay audioBuffer={buffer} color="#10b981" />
 * 
 * // From pre-extracted data (best performance)
 * <WaveformDisplay waveformData={cachedWaveform} color="#8b5cf6" />
 * ```
 */
export const WaveformDisplay = memo(function WaveformDisplay({
  audioBuffer,
  waveformData: externalWaveformData,
  audioUrl,
  color = '#3b82f6',
  className,
  showLoading = true,
  onWaveformReady,
  onError,
  offsetPixels = 0,
  widthPixels,
}: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [internalWaveformData, setInternalWaveformData] = useState<WaveformData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Use external waveform data if provided, otherwise use internal
  const waveformData = externalWaveformData ?? internalWaveformData;

  // Extract waveform from AudioBuffer
  useEffect(() => {
    if (externalWaveformData || !audioBuffer) return;

    try {
      const canvas = canvasRef.current;
      const targetWidth = widthPixels ?? canvas?.width ?? 800;
      const samplesPerPixel = Math.max(1, Math.ceil(audioBuffer.length / targetWidth));
      
      const data = extractWaveformData(audioBuffer, samplesPerPixel);
      setInternalWaveformData(data);
      onWaveformReady?.(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to extract waveform');
      setError(error);
      onError?.(error);
    }
  }, [audioBuffer, externalWaveformData, widthPixels, onWaveformReady, onError]);

  // Fetch and decode from URL
  useEffect(() => {
    if (externalWaveformData || audioBuffer || !audioUrl) return;

    let cancelled = false;

    async function loadFromUrl() {
      if (!audioUrl) return;
      
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(audioUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch audio: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;

        const decodedBuffer = await decodeAudioBuffer(arrayBuffer);
        if (cancelled) return;

        const canvas = canvasRef.current;
        const targetWidth = widthPixels ?? canvas?.width ?? 800;
        const samplesPerPixel = Math.max(1, Math.ceil(decodedBuffer.length / targetWidth));
        
        const data = extractWaveformData(decodedBuffer, samplesPerPixel);
        setInternalWaveformData(data);
        onWaveformReady?.(data);
      } catch (err) {
        if (cancelled) return;
        const error = err instanceof Error ? err : new Error('Failed to load audio');
        setError(error);
        onError?.(error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadFromUrl();

    return () => {
      cancelled = true;
    };
  }, [audioUrl, audioBuffer, externalWaveformData, widthPixels, onWaveformReady, onError]);

  // Draw waveform on canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !waveformData) return;

    // Update canvas size to match container
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    const displayWidth = widthPixels ?? rect.width;
    const displayHeight = rect.height;
    
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    // Scale context for high DPI
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }

    // Draw waveform
    drawWaveform(canvas, waveformData, color, offsetPixels, displayWidth);
  }, [waveformData, color, offsetPixels, widthPixels]);

  // Redraw on waveform data change
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(drawCanvas);
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [drawCanvas]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full h-full overflow-hidden',
        className
      )}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
      />

      {/* Loading state */}
      {isLoading && showLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Loader2 className="w-5 h-5 text-daw-text-muted animate-spin" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-500/10">
          <span className="text-xs text-red-400 px-2 truncate">
            {error.message}
          </span>
        </div>
      )}
    </div>
  );
});

export default WaveformDisplay;
