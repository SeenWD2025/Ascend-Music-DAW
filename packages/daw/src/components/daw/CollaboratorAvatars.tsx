/**
 * CollaboratorAvatars Component
 * Shows an avatar stack of collaborators in the session with tooltips.
 */

import { useMemo, useState } from 'react';
import { useCollaborationStore } from '../../stores/collaboration.store';

// ============================================================================
// Types
// ============================================================================

interface CollaboratorAvatarsProps {
  /** Maximum number of avatars to show before +N indicator */
  maxVisible?: number;
  
  /** Size of avatars in pixels */
  size?: 'sm' | 'md' | 'lg';
  
  /** Whether to show online indicator dot */
  showOnlineIndicator?: boolean;
  
  /** Additional class name */
  className?: string;
}

interface AvatarData {
  clientId: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  color: string;
  activity?: string;
  isCurrentUser: boolean;
}

// ============================================================================
// Size configurations
// ============================================================================

const SIZES = {
  sm: { avatar: 24, indicator: 6, overlap: 8, text: 'text-xs' },
  md: { avatar: 32, indicator: 8, overlap: 10, text: 'text-sm' },
  lg: { avatar: 40, indicator: 10, overlap: 12, text: 'text-base' },
};

// ============================================================================
// Activity Labels
// ============================================================================

const ACTIVITY_LABELS: Record<string, string> = {
  idle: 'Viewing',
  editing: 'Editing',
  playing: 'Playing',
  recording: 'Recording',
  dragging: 'Moving clip',
};

// ============================================================================
// Component
// ============================================================================

export function CollaboratorAvatars({
  maxVisible = 4,
  size = 'md',
  showOnlineIndicator = true,
  className = '',
}: CollaboratorAvatarsProps) {
  const { collaborators, myClientId, isConnected } = useCollaborationStore();
  const [hoveredUser, setHoveredUser] = useState<string | null>(null);
  
  const sizeConfig = SIZES[size];

  // Transform and sort collaborators
  const avatars = useMemo<AvatarData[]>(() => {
    return collaborators
      .map((user) => ({
        clientId: user.clientId,
        userId: user.userId,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        color: user.color,
        activity: user.activity,
        isCurrentUser: user.clientId === myClientId,
      }))
      .sort((a, b) => {
        // Current user first
        if (a.isCurrentUser) return -1;
        if (b.isCurrentUser) return 1;
        return a.displayName.localeCompare(b.displayName);
      });
  }, [collaborators, myClientId]);

  const visibleAvatars = avatars.slice(0, maxVisible);
  const overflowCount = Math.max(0, avatars.length - maxVisible);

  if (!isConnected && avatars.length === 0) {
    return null;
  }

  return (
    <div className={`relative flex items-center ${className}`}>
      {/* Avatar stack */}
      <div className="flex items-center -space-x-2">
        {visibleAvatars.map((avatar, index) => (
          <div
            key={avatar.clientId}
            className="relative group"
            style={{ zIndex: visibleAvatars.length - index }}
            onMouseEnter={() => setHoveredUser(avatar.clientId)}
            onMouseLeave={() => setHoveredUser(null)}
          >
            {/* Avatar */}
            <div
              className="rounded-full ring-2 ring-gray-900 flex items-center justify-center overflow-hidden"
              style={{
                width: sizeConfig.avatar,
                height: sizeConfig.avatar,
                backgroundColor: avatar.color,
              }}
            >
              {avatar.avatarUrl ? (
                <img
                  src={avatar.avatarUrl}
                  alt={avatar.displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className={`font-medium text-white ${sizeConfig.text}`}>
                  {avatar.displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            {/* Online indicator */}
            {showOnlineIndicator && (
              <div
                className={`absolute bottom-0 right-0 rounded-full ring-2 ring-gray-900 ${
                  avatar.activity === 'recording'
                    ? 'bg-red-500 animate-pulse'
                    : 'bg-green-500'
                }`}
                style={{
                  width: sizeConfig.indicator,
                  height: sizeConfig.indicator,
                }}
              />
            )}

            {/* Tooltip */}
            {hoveredUser === avatar.clientId && (
              <div
                className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 pointer-events-none"
                role="tooltip"
              >
                <div className="bg-gray-800 text-white text-sm rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                  <div className="font-medium">
                    {avatar.displayName}
                    {avatar.isCurrentUser && (
                      <span className="text-gray-400 font-normal ml-1">(you)</span>
                    )}
                  </div>
                  {avatar.activity && (
                    <div className="text-gray-400 text-xs mt-0.5 flex items-center gap-1">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          avatar.activity === 'recording'
                            ? 'bg-red-500 animate-pulse'
                            : avatar.activity === 'editing'
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                        }`}
                      />
                      {ACTIVITY_LABELS[avatar.activity] || avatar.activity}
                    </div>
                  )}
                  {/* Tooltip arrow */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2">
                    <div className="border-8 border-transparent border-b-gray-800" />
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Overflow indicator */}
        {overflowCount > 0 && (
          <div
            className="relative rounded-full ring-2 ring-gray-900 bg-gray-700 flex items-center justify-center"
            style={{
              width: sizeConfig.avatar,
              height: sizeConfig.avatar,
            }}
            title={`${overflowCount} more collaborator${overflowCount > 1 ? 's' : ''}`}
          >
            <span className={`font-medium text-gray-300 ${sizeConfig.text}`}>
              +{overflowCount}
            </span>
          </div>
        )}
      </div>

      {/* Connection status indicator */}
      {!isConnected && (
        <div className="ml-2 flex items-center gap-1 text-yellow-500 text-xs">
          <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          Reconnecting...
        </div>
      )}
    </div>
  );
}

export default CollaboratorAvatars;
