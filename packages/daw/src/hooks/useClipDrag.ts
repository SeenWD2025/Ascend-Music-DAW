/**
 * useClipDrag Hook
 * Custom hook for handling clip dragging with snap-to-grid quantization
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface DragPosition {
  /** X position in pixels */
  x: number;
  /** Y position in pixels */
  y: number;
  /** Snapped time in seconds */
  snappedTime: number;
  /** Track index at current position */
  trackIndex: number;
}

export interface UseClipDragOptions {
  /** Pixels per second for time conversion */
  pixelsPerSecond: number;
  /** Snap interval in seconds (e.g., 0.25 for 1/16 note at 60bpm) */
  snapInterval?: number;
  /** Whether snapping is enabled */
  snapEnabled?: boolean;
  /** Track height in pixels */
  trackHeight?: number;
  /** Callback when drag starts */
  onDragStart?: (clipId: string) => void;
  /** Callback during drag */
  onDrag?: (clipId: string, position: DragPosition) => void;
  /** Callback when drag ends */
  onDragEnd?: (clipId: string, position: DragPosition) => void;
}

export interface UseClipDragReturn {
  /** Whether a clip is currently being dragged */
  isDragging: boolean;
  /** Current drag position (null if not dragging) */
  dragPosition: DragPosition | null;
  /** ID of the clip being dragged */
  draggedClipId: string | null;
  /** Mouse event handlers to attach to clip elements */
  handlers: {
    onMouseDown: (e: React.MouseEvent, clipId: string, initialTime: number, trackIndex: number) => void;
  };
  /** Start drag programmatically */
  startDrag: (clipId: string, initialX: number, initialY: number, initialTime: number, trackIndex: number) => void;
  /** Cancel current drag */
  cancelDrag: () => void;
}

/**
 * Hook for handling clip drag operations with grid snapping
 * 
 * @example
 * ```tsx
 * const { isDragging, dragPosition, handlers } = useClipDrag({
 *   pixelsPerSecond: 50,
 *   snapInterval: 0.25,
 *   onDragEnd: (clipId, pos) => moveClip(clipId, pos.snappedTime, pos.trackIndex),
 * });
 * 
 * return (
 *   <div
 *     onMouseDown={(e) => handlers.onMouseDown(e, clip.id, clip.startTime, trackIndex)}
 *     style={{ transform: isDragging ? `translateX(${dragPosition.x}px)` : undefined }}
 *   />
 * );
 * ```
 */
export function useClipDrag({
  pixelsPerSecond,
  snapInterval = 0.25,
  snapEnabled = true,
  trackHeight = 80,
  onDragStart,
  onDrag,
  onDragEnd,
}: UseClipDragOptions): UseClipDragReturn {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState<DragPosition | null>(null);
  const [draggedClipId, setDraggedClipId] = useState<string | null>(null);

  // Store drag state in refs for event handlers
  const dragStateRef = useRef({
    startX: 0,
    startY: 0,
    initialTime: 0,
    initialTrackIndex: 0,
    currentPosition: null as DragPosition | null,
  });

  /**
   * Snap a time value to the nearest grid interval
   */
  const snapToGrid = useCallback(
    (time: number): number => {
      if (!snapEnabled || snapInterval <= 0) return time;
      return Math.round(time / snapInterval) * snapInterval;
    },
    [snapEnabled, snapInterval]
  );

  /**
   * Calculate position from mouse coordinates
   */
  const calculatePosition = useCallback(
    (clientX: number, clientY: number): DragPosition => {
      const { startX, startY, initialTime, initialTrackIndex } = dragStateRef.current;

      // Calculate delta in pixels
      const deltaX = clientX - startX;
      const deltaY = clientY - startY;

      // Convert X delta to time
      const deltaTime = deltaX / pixelsPerSecond;
      const rawTime = Math.max(0, initialTime + deltaTime);
      const snappedTime = snapToGrid(rawTime);

      // Calculate track index from Y delta
      const trackDelta = Math.round(deltaY / trackHeight);
      const trackIndex = Math.max(0, initialTrackIndex + trackDelta);

      // Calculate snapped X position
      const x = snappedTime * pixelsPerSecond;

      return {
        x,
        y: trackIndex * trackHeight,
        snappedTime,
        trackIndex,
      };
    },
    [pixelsPerSecond, trackHeight, snapToGrid]
  );

  /**
   * Handle mouse move during drag
   */
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggedClipId) return;

      // Use requestAnimationFrame for smooth 60fps updates
      requestAnimationFrame(() => {
        const position = calculatePosition(e.clientX, e.clientY);
        dragStateRef.current.currentPosition = position;
        setDragPosition(position);
        onDrag?.(draggedClipId, position);
      });
    },
    [draggedClipId, calculatePosition, onDrag]
  );

  /**
   * Handle mouse up to end drag
   */
  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (!draggedClipId) return;

      const position = calculatePosition(e.clientX, e.clientY);
      
      setIsDragging(false);
      setDragPosition(null);
      setDraggedClipId(null);
      
      onDragEnd?.(draggedClipId, position);
    },
    [draggedClipId, calculatePosition, onDragEnd]
  );

  /**
   * Start drag operation
   */
  const startDrag = useCallback(
    (
      clipId: string,
      initialX: number,
      initialY: number,
      initialTime: number,
      trackIndex: number
    ) => {
      dragStateRef.current = {
        startX: initialX,
        startY: initialY,
        initialTime,
        initialTrackIndex: trackIndex,
        currentPosition: null,
      };

      setDraggedClipId(clipId);
      setIsDragging(true);
      setDragPosition({
        x: initialTime * pixelsPerSecond,
        y: trackIndex * trackHeight,
        snappedTime: initialTime,
        trackIndex,
      });

      onDragStart?.(clipId);
    },
    [pixelsPerSecond, trackHeight, onDragStart]
  );

  /**
   * Cancel current drag without applying changes
   */
  const cancelDrag = useCallback(() => {
    setIsDragging(false);
    setDragPosition(null);
    setDraggedClipId(null);
  }, []);

  /**
   * Mouse down handler to attach to clip elements
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, clipId: string, initialTime: number, trackIndex: number) => {
      // Only left click
      if (e.button !== 0) return;

      e.preventDefault();
      e.stopPropagation();

      startDrag(clipId, e.clientX, e.clientY, initialTime, trackIndex);
    },
    [startDrag]
  );

  // Attach/detach global mouse listeners
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);

      // Prevent text selection during drag
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Cancel drag on Escape key
  useEffect(() => {
    if (!isDragging) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelDrag();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDragging, cancelDrag]);

  return {
    isDragging,
    dragPosition,
    draggedClipId,
    handlers: {
      onMouseDown: handleMouseDown,
    },
    startDrag,
    cancelDrag,
  };
}

export default useClipDrag;
