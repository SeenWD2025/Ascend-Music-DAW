/**
 * Clip Component
 * Renders an audio/MIDI clip with waveform, selection state, and drag handles
 */

import { memo, useCallback, useState, useMemo } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '../../lib/utils';
import { WaveformDisplay } from './WaveformDisplay';
import type { AudioClip } from '../../stores/project.store';
import type { WaveformData } from '../../lib/audio/waveform';

export interface ClipProps {
  /** Clip data */
  clip: AudioClip;
  /** Track index for positioning */
  trackIndex: number;
  /** Whether the clip is selected */
  isSelected?: boolean;
  /** Whether the clip is muted */
  isMuted?: boolean;
  /** Pixels per second for width calculation */
  pixelsPerSecond: number;
  /** Track height in pixels */
  trackHeight: number;
  /** Pre-cached waveform data */
  waveformData?: WaveformData | null;
  /** Callback when clip is clicked */
  onClick?: (clipId: string, e: React.MouseEvent) => void;
  /** Callback when drag starts */
  onDragStart?: (e: React.MouseEvent, clipId: string, startTime: number, trackIndex: number) => void;
  /** Callback when left trim handle is dragged */
  onTrimStart?: (clipId: string, deltaPixels: number) => void;
  /** Callback when right trim handle is dragged */
  onTrimEnd?: (clipId: string, deltaPixels: number) => void;
}

/**
 * Audio/MIDI clip component with waveform display and interaction handles
 * 
 * @example
 * ```tsx
 * <Clip
 *   clip={audioClip}
 *   trackIndex={0}
 *   isSelected={selectedIds.includes(audioClip.id)}
 *   pixelsPerSecond={50}
 *   trackHeight={80}
 *   onClick={(id, e) => handleClipClick(id, e)}
 *   onDragStart={handleDragStart}
 * />
 * ```
 */
export const Clip = memo(function Clip({
  clip,
  trackIndex,
  isSelected = false,
  isMuted = false,
  pixelsPerSecond,
  trackHeight,
  waveformData,
  onClick,
  onDragStart,
  onTrimStart,
  onTrimEnd,
}: ClipProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isTrimming, setIsTrimming] = useState<'start' | 'end' | null>(null);

  // Calculate clip dimensions
  const clipStyle = useMemo(() => {
    const left = clip.startTime * pixelsPerSecond;
    const width = clip.duration * pixelsPerSecond;
    return {
      left,
      width: Math.max(width, 20), // Minimum width for visibility
      height: trackHeight - 8, // Padding from track edges
    };
  }, [clip.startTime, clip.duration, pixelsPerSecond, trackHeight]);

  // Clip color with fallback
  const clipColor = clip.color ?? '#3b82f6';

  /**
   * Handle clip click for selection
   */
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick?.(clip.id, e);
    },
    [clip.id, onClick]
  );

  /**
   * Handle mouse down for dragging
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Ignore if clicking on trim handles
      const target = e.target as HTMLElement;
      if (target.dataset.trimHandle) return;

      e.stopPropagation();
      onDragStart?.(e, clip.id, clip.startTime, trackIndex);
    },
    [clip.id, clip.startTime, trackIndex, onDragStart]
  );

  /**
   * Handle trim handle mouse down
   */
  const handleTrimMouseDown = useCallback(
    (e: React.MouseEvent, edge: 'start' | 'end') => {
      e.stopPropagation();
      e.preventDefault();

      setIsTrimming(edge);
      const startX = e.clientX;

      const handleTrimMove = (moveEvent: MouseEvent) => {
        const deltaPixels = moveEvent.clientX - startX;
        if (edge === 'start') {
          onTrimStart?.(clip.id, deltaPixels);
        } else {
          onTrimEnd?.(clip.id, deltaPixels);
        }
      };

      const handleTrimUp = () => {
        setIsTrimming(null);
        window.removeEventListener('mousemove', handleTrimMove);
        window.removeEventListener('mouseup', handleTrimUp);
        document.body.style.cursor = '';
      };

      window.addEventListener('mousemove', handleTrimMove);
      window.addEventListener('mouseup', handleTrimUp);
      document.body.style.cursor = 'ew-resize';
    },
    [clip.id, onTrimStart, onTrimEnd]
  );

  return (
    <div
      className={cn(
        'absolute top-1 rounded-sm overflow-hidden cursor-grab transition-shadow duration-100',
        'border border-white/20',
        isSelected && 'ring-2 ring-daw-accent-primary ring-offset-1 ring-offset-daw-bg-primary',
        isMuted && 'opacity-50',
        isHovered && !isTrimming && 'shadow-lg',
      )}
      style={{
        left: clipStyle.left,
        width: clipStyle.width,
        height: clipStyle.height,
        backgroundColor: clipColor,
      }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="button"
      tabIndex={0}
      aria-label={`Clip: ${clip.name}`}
      aria-selected={isSelected}
    >
      {/* Clip header with name */}
      <div
        className="absolute top-0 left-0 right-0 h-5 px-1.5 flex items-center gap-1 bg-black/30"
      >
        <GripVertical className="w-3 h-3 text-white/60 flex-shrink-0" />
        <span className="text-xs text-white font-medium truncate">
          {clip.name}
        </span>
      </div>

      {/* Waveform display area */}
      <div className="absolute top-5 left-0 right-0 bottom-0">
        {clip.sourceUrl || waveformData ? (
          <WaveformDisplay
            audioUrl={clip.sourceUrl}
            waveformData={waveformData}
            color="rgba(255, 255, 255, 0.7)"
            className="w-full h-full"
          />
        ) : (
          // Placeholder pattern for clips without audio
          <div className="w-full h-full bg-black/10 flex items-center justify-center">
            <div className="w-full h-1/2 bg-white/10 rounded" />
          </div>
        )}
      </div>

      {/* Left trim handle */}
      <div
        data-trim-handle="start"
        className={cn(
          'absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize',
          'bg-white/0 hover:bg-white/30 transition-colors',
          isTrimming === 'start' && 'bg-white/40',
        )}
        onMouseDown={(e) => handleTrimMouseDown(e, 'start')}
      >
        <div className="absolute left-0.5 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-white/50 rounded" />
      </div>

      {/* Right trim handle */}
      <div
        data-trim-handle="end"
        className={cn(
          'absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize',
          'bg-white/0 hover:bg-white/30 transition-colors',
          isTrimming === 'end' && 'bg-white/40',
        )}
        onMouseDown={(e) => handleTrimMouseDown(e, 'end')}
      >
        <div className="absolute right-0.5 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-white/50 rounded" />
      </div>

      {/* Selection indicator overlay */}
      {isSelected && (
        <div className="absolute inset-0 bg-white/10 pointer-events-none" />
      )}
    </div>
  );
});

export default Clip;
