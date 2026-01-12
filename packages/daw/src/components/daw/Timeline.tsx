/**
 * Timeline Component
 * Enhanced timeline with multi-track editing, waveform rendering, and clip interactions
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { ZoomIn, ZoomOut, Grid3X3 } from 'lucide-react';
import { useTransportStore } from '../../stores/transport.store';
import { useProjectStore } from '../../stores/project.store';
import { useClipDrag } from '../../hooks/useClipDrag';
import { Track } from './Track';
import { cn } from '../../lib/utils';

/**
 * Generate time ruler markers based on zoom level
 */
function generateTimeMarkers(duration: number, pixelsPerSecond: number): number[] {
  const markers: number[] = [];
  // Determine marker interval based on zoom
  let interval = 1; // seconds
  if (pixelsPerSecond < 20) interval = 10;
  else if (pixelsPerSecond < 50) interval = 5;
  else if (pixelsPerSecond < 100) interval = 2;

  for (let t = 0; t <= duration; t += interval) {
    markers.push(t);
  }
  return markers;
}

/**
 * Format seconds to time display for ruler
 */
function formatRulerTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Constants for timeline layout
const DEFAULT_PIXELS_PER_SECOND = 50;
const MIN_PIXELS_PER_SECOND = 10;
const MAX_PIXELS_PER_SECOND = 200;
const TIMELINE_DURATION = 300; // 5 minutes default
const RULER_HEIGHT = 24;
const TRACK_HEIGHT = 80;
const HEADER_WIDTH = 192;

/**
 * Timeline component with multi-track editing and clip interactions
 */
export function Timeline() {
  const { position, isPlaying, bpm } = useTransportStore();
  const { 
    tracks, 
    selectedClipIds,
    moveClip,
    selectClip,
    deselectAll,
    deleteSelectedClips,
    toggleTrackMute,
    toggleTrackSolo,
    toggleTrackArm,
    setTrackVolume,
    setTrackPan,
    updateTrack,
  } = useProjectStore();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Zoom state
  const [pixelsPerSecond, setPixelsPerSecond] = useState(DEFAULT_PIXELS_PER_SECOND);
  const [snapEnabled, setSnapEnabled] = useState(true);

  // Calculate snap interval based on BPM (snap to 1/16 notes)
  const snapInterval = useMemo(() => {
    const beatsPerSecond = bpm / 60;
    return 1 / (beatsPerSecond * 4); // 1/16 note
  }, [bpm]);

  // Timeline dimensions
  const timelineWidth = TIMELINE_DURATION * pixelsPerSecond;
  const timeMarkers = useMemo(
    () => generateTimeMarkers(TIMELINE_DURATION, pixelsPerSecond),
    [pixelsPerSecond]
  );

  // Clip drag hook
  const { isDragging, dragPosition, draggedClipId, handlers: dragHandlers } = useClipDrag({
    pixelsPerSecond,
    snapInterval,
    snapEnabled,
    trackHeight: TRACK_HEIGHT,
    onDragEnd: (clipId, position) => {
      // Find target track by index
      const targetTrack = tracks[position.trackIndex];
      if (targetTrack) {
        moveClip(clipId, position.snappedTime, targetTrack.id);
        
        // PostHog tracking placeholder
        // posthog.capture('daw_clip_moved', { clip_id: clipId, new_time: position.snappedTime });
      }
    },
  });

  // Auto-scroll to keep playhead visible during playback
  useEffect(() => {
    if (isPlaying && scrollContainerRef.current && playheadRef.current) {
      const container = scrollContainerRef.current;
      const playheadPosition = position * pixelsPerSecond;
      const containerWidth = container.clientWidth;
      const scrollLeft = container.scrollLeft;

      // If playhead is out of view, scroll to center it
      if (playheadPosition < scrollLeft || playheadPosition > scrollLeft + containerWidth - 100) {
        container.scrollTo({
          left: Math.max(0, playheadPosition - containerWidth / 2),
          behavior: 'smooth',
        });
      }
    }
  }, [position, isPlaying, pixelsPerSecond]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if focus is on an input
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          if (selectedClipIds.length > 0) {
            e.preventDefault();
            deleteSelectedClips();
          }
          break;
        case 'Escape':
          deselectAll();
          break;
        case 'a':
        case 'A':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            // Select all clips
            const allClipIds = tracks.flatMap((t) => t.clips.map((c) => c.id));
            allClipIds.forEach((id, i) => selectClip(id, i > 0));
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedClipIds, tracks, deleteSelectedClips, deselectAll, selectClip]);

  /**
   * Handle clip click for selection
   */
  const handleClipClick = useCallback(
    (clipId: string, e: React.MouseEvent) => {
      if (!clipId) {
        // Clicked on empty track area
        if (!e.shiftKey) {
          deselectAll();
        }
        return;
      }

      selectClip(clipId, e.shiftKey);
      
      // PostHog tracking placeholder
      // posthog.capture('daw_clip_selected', { clip_id: clipId, multi: e.shiftKey });
    },
    [selectClip, deselectAll]
  );

  /**
   * Handle clip drag start
   */
  const handleClipDragStart = useCallback(
    (e: React.MouseEvent, clipId: string, startTime: number, trackIndex: number) => {
      // Auto-select if not already selected
      if (!selectedClipIds.includes(clipId)) {
        selectClip(clipId);
      }
      dragHandlers.onMouseDown(e, clipId, startTime, trackIndex);
    },
    [selectedClipIds, selectClip, dragHandlers]
  );

  /**
   * Handle track name change
   */
  const handleNameChange = useCallback(
    (trackId: string, name: string) => {
      updateTrack(trackId, { name });
    },
    [updateTrack]
  );

  /**
   * Handle track color change
   */
  const handleColorChange = useCallback(
    (trackId: string, color: string) => {
      updateTrack(trackId, { color });
    },
    [updateTrack]
  );

  /**
   * Zoom controls
   */
  const handleZoomIn = useCallback(() => {
    setPixelsPerSecond((prev) =>
      Math.min(MAX_PIXELS_PER_SECOND, prev * 1.25)
    );
  }, []);

  const handleZoomOut = useCallback(() => {
    setPixelsPerSecond((prev) =>
      Math.max(MIN_PIXELS_PER_SECOND, prev / 1.25)
    );
  }, []);

  const toggleSnap = useCallback(() => {
    setSnapEnabled((prev) => !prev);
  }, []);

  /**
   * Handle click on ruler for seeking
   */
  const handleRulerClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = x / pixelsPerSecond;
      useTransportStore.getState().seek(Math.max(0, time));
      
      // PostHog tracking placeholder
      // posthog.capture('daw_timeline_seek', { time });
    },
    [pixelsPerSecond]
  );

  /**
   * Handle click on empty timeline area
   */
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent) => {
      // Only deselect if clicking directly on the container
      if (e.target === e.currentTarget) {
        deselectAll();
      }
    },
    [deselectAll]
  );

  const playheadPosition = position * pixelsPerSecond;

  // Show empty state if no tracks
  const hasNoTracks = tracks.length === 0;

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col bg-daw-bg-primary overflow-hidden"
    >
      {/* Toolbar */}
      <div className="h-8 flex items-center gap-2 px-3 border-b border-daw-border-secondary bg-daw-bg-secondary">
        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            className="p-1 rounded hover:bg-daw-bg-tertiary transition-colors"
            title="Zoom out"
            disabled={pixelsPerSecond <= MIN_PIXELS_PER_SECOND}
          >
            <ZoomOut className="w-4 h-4 text-daw-text-muted" />
          </button>
          <span className="text-xs text-daw-text-muted w-12 text-center font-mono">
            {Math.round(pixelsPerSecond)}px/s
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1 rounded hover:bg-daw-bg-tertiary transition-colors"
            title="Zoom in"
            disabled={pixelsPerSecond >= MAX_PIXELS_PER_SECOND}
          >
            <ZoomIn className="w-4 h-4 text-daw-text-muted" />
          </button>
        </div>

        <div className="w-px h-4 bg-daw-border-primary" />

        {/* Snap toggle */}
        <button
          onClick={toggleSnap}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
            snapEnabled
              ? 'bg-daw-accent-primary/20 text-daw-accent-primary'
              : 'text-daw-text-muted hover:bg-daw-bg-tertiary'
          )}
          title={snapEnabled ? 'Snap enabled' : 'Snap disabled'}
        >
          <Grid3X3 className="w-3.5 h-3.5" />
          Snap
        </button>

        {/* Selection info */}
        {selectedClipIds.length > 0 && (
          <>
            <div className="w-px h-4 bg-daw-border-primary" />
            <span className="text-xs text-daw-text-muted">
              {selectedClipIds.length} clip{selectedClipIds.length > 1 ? 's' : ''} selected
            </span>
          </>
        )}
      </div>

      {/* Timeline container with horizontal scroll */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-x-auto overflow-y-auto relative"
        onClick={handleTimelineClick}
      >
        {/* Timeline content wrapper */}
        <div
          className="relative"
          style={{ width: timelineWidth + HEADER_WIDTH, minHeight: '100%' }}
        >
          {/* Time ruler */}
          <div
            className="sticky top-0 z-20 bg-daw-bg-secondary border-b border-daw-border-primary flex"
            style={{ height: RULER_HEIGHT }}
          >
            {/* Header spacer */}
            <div
              className="sticky left-0 z-30 bg-daw-bg-secondary border-r border-daw-border-primary flex-shrink-0"
              style={{ width: HEADER_WIDTH }}
            />
            
            {/* Ruler area */}
            <div
              className="relative h-full cursor-pointer"
              style={{ width: timelineWidth }}
              onClick={handleRulerClick}
            >
              {timeMarkers.map((time) => (
                <div
                  key={time}
                  className="absolute top-0 h-full flex flex-col justify-end"
                  style={{ left: time * pixelsPerSecond }}
                >
                  <span className="text-xs text-daw-text-muted font-mono px-1">
                    {formatRulerTime(time)}
                  </span>
                  <div className="w-px h-2 bg-daw-border-primary" />
                </div>
              ))}
            </div>
          </div>

          {/* Tracks area */}
          <div className="relative">
            {hasNoTracks ? (
              // Empty state
              <div
                className="flex items-center justify-center text-daw-text-muted"
                style={{ height: TRACK_HEIGHT * 4 }}
              >
                <div className="text-center">
                  <p className="text-sm mb-1">No tracks yet</p>
                  <p className="text-xs">Create a track to get started</p>
                </div>
              </div>
            ) : (
              // Track lanes
              tracks.map((track, index) => (
                <Track
                  key={track.id}
                  track={track}
                  index={index}
                  height={TRACK_HEIGHT}
                  headerWidth={HEADER_WIDTH}
                  timelineWidth={timelineWidth + HEADER_WIDTH}
                  pixelsPerSecond={pixelsPerSecond}
                  selectedClipIds={selectedClipIds}
                  onNameChange={handleNameChange}
                  onColorChange={handleColorChange}
                  onMuteToggle={toggleTrackMute}
                  onSoloToggle={toggleTrackSolo}
                  onArmToggle={toggleTrackArm}
                  onVolumeChange={setTrackVolume}
                  onPanChange={setTrackPan}
                  onClipClick={handleClipClick}
                  onClipDragStart={handleClipDragStart}
                />
              ))
            )}
          </div>

          {/* Playhead indicator */}
          <div
            ref={playheadRef}
            className="absolute top-0 bottom-0 z-30 pointer-events-none"
            style={{ left: playheadPosition + HEADER_WIDTH }}
          >
            {/* Playhead line */}
            <div className="w-px h-full bg-daw-accent-primary" />
            {/* Playhead top marker */}
            <div
              className="absolute top-0 -translate-x-1/2 w-3 h-3 bg-daw-accent-primary"
              style={{
                clipPath: 'polygon(50% 100%, 0% 0%, 100% 0%)',
              }}
            />
          </div>

          {/* Drag preview overlay */}
          {isDragging && dragPosition && draggedClipId && (
            <div
              className="absolute bg-daw-accent-primary/30 border-2 border-daw-accent-primary border-dashed rounded pointer-events-none z-40"
              style={{
                left: dragPosition.x + HEADER_WIDTH,
                top: RULER_HEIGHT + dragPosition.y + 4,
                width: 100, // Would be clip width
                height: TRACK_HEIGHT - 8,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default Timeline;
