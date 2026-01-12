/**
 * CollaboratorCursors Component
 * Renders colored vertical lines for each collaborator's cursor position on the timeline.
 */

import { useMemo } from 'react';
import { useCollaborationStore } from '../../stores/collaboration.store';

// ============================================================================
// Types
// ============================================================================

interface CollaboratorCursorsProps {
  /** Pixels per second for timeline scaling */
  pixelsPerSecond: number;
  
  /** Timeline scroll offset in pixels */
  scrollLeft?: number;
  
  /** Height of the timeline area */
  height?: number;
  
  /** Whether to show name labels */
  showLabels?: boolean;
}

interface CursorData {
  clientId: string;
  displayName: string;
  color: string;
  position: number; // in seconds
  avatarUrl?: string;
}

// ============================================================================
// Component
// ============================================================================

export function CollaboratorCursors({
  pixelsPerSecond,
  scrollLeft = 0,
  height = 200,
  showLabels = true,
}: CollaboratorCursorsProps) {
  const { collaborators, myClientId } = useCollaborationStore();

  // Filter and transform collaborator data
  const cursors = useMemo<CursorData[]>(() => {
    return collaborators
      .filter((user) => {
        // Exclude self and users without cursor position
        return user.clientId !== myClientId && user.cursorPosition !== undefined;
      })
      .map((user) => ({
        clientId: user.clientId,
        displayName: user.displayName,
        color: user.color,
        position: user.cursorPosition!,
        avatarUrl: user.avatarUrl,
      }));
  }, [collaborators, myClientId]);

  if (cursors.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ height }}
      aria-hidden="true"
    >
      {cursors.map((cursor) => {
        const pixelPosition = cursor.position * pixelsPerSecond - scrollLeft;
        
        // Don't render if off screen
        if (pixelPosition < -50 || pixelPosition > window.innerWidth + 50) {
          return null;
        }

        return (
          <div
            key={cursor.clientId}
            className="absolute top-0 bottom-0 transition-transform duration-75 ease-out"
            style={{
              transform: `translateX(${pixelPosition}px)`,
            }}
          >
            {/* Cursor line */}
            <div
              className="w-0.5 h-full opacity-70"
              style={{ backgroundColor: cursor.color }}
            />
            
            {/* Name label */}
            {showLabels && (
              <div
                className="absolute top-1 left-1 flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-white shadow-md whitespace-nowrap"
                style={{ backgroundColor: cursor.color }}
              >
                {cursor.avatarUrl && (
                  <img
                    src={cursor.avatarUrl}
                    alt=""
                    className="w-4 h-4 rounded-full"
                  />
                )}
                <span className="max-w-[100px] truncate">
                  {cursor.displayName}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default CollaboratorCursors;
