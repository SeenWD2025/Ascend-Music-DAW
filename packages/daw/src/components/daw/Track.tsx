/**
 * Track Component
 * Track lane that renders the track header and clips
 */

import { memo, useCallback } from 'react';
import { cn } from '../../lib/utils';
import { TrackHeader } from './TrackHeader';
import { Clip } from './Clip';
import type { Track as TrackType } from '../../stores/project.store';

export interface TrackProps {
  /** Track data */
  track: TrackType;
  /** Track index in the list */
  index: number;
  /** Track height in pixels */
  height?: number;
  /** Track header width in pixels */
  headerWidth?: number;
  /** Timeline width in pixels */
  timelineWidth: number;
  /** Pixels per second for clip positioning */
  pixelsPerSecond: number;
  /** IDs of currently selected clips */
  selectedClipIds?: string[];
  /** Callback when track name changes */
  onNameChange?: (trackId: string, name: string) => void;
  /** Callback when track color changes */
  onColorChange?: (trackId: string, color: string) => void;
  /** Callback when mute is toggled */
  onMuteToggle?: (trackId: string) => void;
  /** Callback when solo is toggled */
  onSoloToggle?: (trackId: string) => void;
  /** Callback when arm is toggled */
  onArmToggle?: (trackId: string) => void;
  /** Callback when volume changes */
  onVolumeChange?: (trackId: string, volume: number) => void;
  /** Callback when pan changes */
  onPanChange?: (trackId: string, pan: number) => void;
  /** Callback when a clip is clicked */
  onClipClick?: (clipId: string, e: React.MouseEvent) => void;
  /** Callback when clip drag starts */
  onClipDragStart?: (e: React.MouseEvent, clipId: string, startTime: number, trackIndex: number) => void;
  /** Callback when clip is dropped on this track */
  onClipDrop?: (clipId: string, trackId: string, newStartTime: number) => void;
}

/**
 * Track lane component with header and clips
 * 
 * @example
 * ```tsx
 * <Track
 *   track={track}
 *   index={0}
 *   timelineWidth={15000}
 *   pixelsPerSecond={50}
 *   selectedClipIds={selectedClipIds}
 *   onClipClick={handleClipClick}
 *   onClipDragStart={handleDragStart}
 * />
 * ```
 */
export const Track = memo(function Track({
  track,
  index,
  height = 80,
  headerWidth = 192,
  timelineWidth,
  pixelsPerSecond,
  selectedClipIds = [],
  onNameChange,
  onColorChange,
  onMuteToggle,
  onSoloToggle,
  onArmToggle,
  onVolumeChange,
  onPanChange,
  onClipClick,
  onClipDragStart,
  onClipDrop,
}: TrackProps) {
  /**
   * Handle drop on track lane
   */
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      
      const clipId = e.dataTransfer.getData('text/clip-id');
      if (!clipId) return;

      // Calculate drop position
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const newStartTime = x / pixelsPerSecond;

      onClipDrop?.(clipId, track.id, Math.max(0, newStartTime));
    },
    [track.id, pixelsPerSecond, onClipDrop]
  );

  /**
   * Allow drop on track lane
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  /**
   * Handle click on empty track area (deselect)
   */
  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      // Only if clicking directly on track, not on clips
      if (e.target === e.currentTarget) {
        onClipClick?.('', e);
      }
    },
    [onClipClick]
  );

  return (
    <div
      className="flex border-b border-daw-border-secondary"
      style={{ height }}
    >
      {/* Track header (sticky on left) */}
      <div className="sticky left-0 z-10 flex-shrink-0">
        <TrackHeader
          track={track}
          index={index}
          width={headerWidth}
          height={height}
          onNameChange={onNameChange}
          onColorChange={onColorChange}
          onMuteToggle={onMuteToggle}
          onSoloToggle={onSoloToggle}
          onArmToggle={onArmToggle}
          onVolumeChange={onVolumeChange}
          onPanChange={onPanChange}
        />
      </div>

      {/* Track lane with clips */}
      <div
        className={cn(
          'relative bg-daw-bg-tertiary/30 flex-shrink-0',
          track.isMuted && 'opacity-60',
        )}
        style={{ width: timelineWidth - headerWidth }}
        onClick={handleTrackClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {/* Grid lines (beat markers) */}
        <div className="absolute inset-0 pointer-events-none opacity-20">
          {/* Vertical beat lines would go here - simplified for now */}
        </div>

        {/* Clips */}
        {track.clips.map((clip) => (
          <Clip
            key={clip.id}
            clip={clip}
            trackIndex={index}
            isSelected={selectedClipIds.includes(clip.id)}
            isMuted={track.isMuted}
            pixelsPerSecond={pixelsPerSecond}
            trackHeight={height}
            onClick={onClipClick}
            onDragStart={onClipDragStart}
          />
        ))}
      </div>
    </div>
  );
});

export default Track;
