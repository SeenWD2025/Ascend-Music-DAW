import { useEffect, useRef } from 'react';
import { useTransportStore } from '../../stores/transport.store';

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
const PIXELS_PER_SECOND = 50;
const TIMELINE_DURATION = 300; // 5 minutes default
const RULER_HEIGHT = 24;
const TRACK_HEIGHT = 80;
const TRACK_COUNT = 8; // Placeholder tracks

/**
 * Timeline scaffold component with time ruler, track lanes placeholder,
 * and playhead indicator that moves with position
 */
export function Timeline() {
  const { position, isPlaying } = useTransportStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);

  const timelineWidth = TIMELINE_DURATION * PIXELS_PER_SECOND;
  const timeMarkers = generateTimeMarkers(TIMELINE_DURATION, PIXELS_PER_SECOND);

  // Auto-scroll to keep playhead visible during playback
  useEffect(() => {
    if (isPlaying && containerRef.current && playheadRef.current) {
      const container = containerRef.current;
      const playheadPosition = position * PIXELS_PER_SECOND;
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
  }, [position, isPlaying]);

  const playheadPosition = position * PIXELS_PER_SECOND;

  return (
    <div className="flex-1 flex flex-col bg-daw-bg-primary overflow-hidden">
      {/* Timeline container with horizontal scroll */}
      <div
        ref={containerRef}
        className="flex-1 overflow-x-auto overflow-y-auto relative"
      >
        {/* Timeline content wrapper */}
        <div
          className="relative"
          style={{ width: timelineWidth, minHeight: '100%' }}
        >
          {/* Time ruler */}
          <div
            className="sticky top-0 z-20 bg-daw-bg-secondary border-b border-daw-border-primary"
            style={{ height: RULER_HEIGHT }}
          >
            <div className="relative h-full" style={{ width: timelineWidth }}>
              {timeMarkers.map((time) => (
                <div
                  key={time}
                  className="absolute top-0 h-full flex flex-col justify-end"
                  style={{ left: time * PIXELS_PER_SECOND }}
                >
                  <span className="text-xs text-daw-text-muted font-mono px-1">
                    {formatRulerTime(time)}
                  </span>
                  <div className="w-px h-2 bg-daw-border-primary" />
                </div>
              ))}
            </div>
          </div>

          {/* Track lanes placeholder */}
          <div className="relative">
            {Array.from({ length: TRACK_COUNT }).map((_, index) => (
              <div
                key={index}
                className="border-b border-daw-border-secondary flex items-center"
                style={{ height: TRACK_HEIGHT }}
              >
                {/* Track header */}
                <div className="sticky left-0 z-10 w-48 h-full bg-daw-bg-secondary border-r border-daw-border-primary flex items-center px-3">
                  <span className="text-sm text-daw-text-secondary truncate">
                    Track {index + 1}
                  </span>
                </div>

                {/* Track lane */}
                <div
                  className="flex-1 h-full bg-daw-bg-tertiary/30"
                  style={{ width: timelineWidth - 192 }}
                >
                  {/* Placeholder for clips */}
                </div>
              </div>
            ))}
          </div>

          {/* Playhead indicator */}
          <div
            ref={playheadRef}
            className="absolute top-0 bottom-0 z-30 pointer-events-none"
            style={{ left: playheadPosition }}
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
        </div>
      </div>
    </div>
  );
}

export default Timeline;
