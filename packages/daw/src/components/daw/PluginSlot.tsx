/**
 * Plugin Slot Component
 * Single plugin slot in the effects chain with bypass, expand, and delete controls
 */

import { memo, useCallback } from 'react';
import { GripVertical, Power, X, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getPluginInfo } from '../../lib/wam';

// ============================================================================
// Types
// ============================================================================

export interface PluginSlotProps {
  /** Track ID this slot belongs to */
  trackId: string;
  /** Plugin instance ID */
  instanceId: string;
  /** Plugin catalog ID */
  pluginId: string;
  /** Whether the plugin is bypassed */
  isBypassed: boolean;
  /** Whether this slot is currently selected/expanded */
  isSelected: boolean;
  /** Whether the plugin is loading */
  isLoading?: boolean;
  /** Whether the plugin failed to load */
  hasFailed?: boolean;
  /** Error message if failed */
  errorMessage?: string;
  /** Callback when slot is clicked to expand */
  onSelect: () => void;
  /** Callback for delete button */
  onDelete: () => void;
  /** Callback for bypass toggle */
  onBypassToggle: () => void;
  /** Callback for retry on failed plugins */
  onRetry?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Drag handle props from react-beautiful-dnd */
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

// ============================================================================
// Component
// ============================================================================

export const PluginSlot = memo(function PluginSlot({
  trackId: _trackId,
  instanceId: _instanceId,
  pluginId,
  isBypassed,
  isSelected,
  isLoading = false,
  hasFailed = false,
  errorMessage,
  onSelect,
  onDelete,
  onBypassToggle,
  onRetry,
  className,
  dragHandleProps,
}: PluginSlotProps) {
  const pluginInfo = getPluginInfo(pluginId);
  const pluginName = pluginInfo?.name ?? pluginId;

  const handleBypassClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onBypassToggle();
    },
    [onBypassToggle]
  );

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete();
    },
    [onDelete]
  );

  const handleRetryClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRetry?.();
    },
    [onRetry]
  );

  // Render failed state
  if (hasFailed) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-2 py-2 rounded bg-red-900/30 border border-red-500/50',
          className
        )}
        role="listitem"
        aria-label={`${pluginName} - failed to load`}
      >
        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-300 truncate">{pluginName}</p>
          {errorMessage && (
            <p className="text-xs text-red-400/70 truncate">{errorMessage}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onRetry && (
            <button
              type="button"
              onClick={handleRetryClick}
              className="p-1 rounded text-daw-text-muted hover:text-daw-accent-primary hover:bg-daw-bg-tertiary transition-colors"
              aria-label="Retry loading plugin"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 4v6h6M23 20v-6h-6" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={handleDeleteClick}
            className="p-1 rounded text-daw-text-muted hover:text-daw-accent-error hover:bg-daw-bg-tertiary transition-colors"
            aria-label="Remove plugin"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Render loading state
  if (isLoading) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-2 py-2 rounded bg-daw-bg-tertiary border border-daw-border-secondary',
          'opacity-60',
          className
        )}
        role="listitem"
        aria-label={`${pluginName} - loading`}
      >
        <Loader2 className="w-4 h-4 text-daw-accent-primary animate-spin flex-shrink-0" />
        <span className="text-sm text-daw-text-secondary truncate flex-1">
          Loading {pluginName}...
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1 px-2 py-1.5 rounded transition-colors',
        'border',
        isSelected
          ? 'bg-daw-accent-primary/20 border-daw-accent-primary'
          : 'bg-daw-bg-tertiary border-daw-border-secondary hover:border-daw-border-primary',
        isBypassed && 'opacity-50',
        className
      )}
      role="listitem"
      aria-label={`${pluginName}${isBypassed ? ' (bypassed)' : ''}`}
    >
      {/* Drag Handle */}
      <div
        {...dragHandleProps}
        className="cursor-grab active:cursor-grabbing text-daw-text-muted hover:text-daw-text-secondary p-0.5"
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Plugin Name - Clickable to expand */}
      <button
        type="button"
        onClick={onSelect}
        className="flex-1 flex items-center gap-2 min-w-0 text-left"
      >
        <span
          className={cn(
            'text-sm font-medium truncate',
            isBypassed ? 'text-daw-text-muted' : 'text-daw-text-primary'
          )}
        >
          {pluginName}
        </span>
        <ChevronRight
          className={cn(
            'w-4 h-4 flex-shrink-0 transition-transform',
            isSelected && 'rotate-90',
            'text-daw-text-muted'
          )}
        />
      </button>

      {/* Controls */}
      <div className="flex items-center gap-0.5">
        {/* Bypass Toggle */}
        <button
          type="button"
          onClick={handleBypassClick}
          className={cn(
            'p-1 rounded transition-colors',
            isBypassed
              ? 'text-daw-text-muted hover:text-daw-accent-warning'
              : 'text-daw-accent-success hover:text-daw-accent-success/80'
          )}
          aria-label={isBypassed ? 'Enable plugin' : 'Bypass plugin'}
          aria-pressed={!isBypassed}
        >
          <Power className="w-4 h-4" />
        </button>

        {/* Delete Button */}
        <button
          type="button"
          onClick={handleDeleteClick}
          className="p-1 rounded text-daw-text-muted hover:text-daw-accent-error hover:bg-daw-bg-secondary transition-colors"
          aria-label="Remove plugin"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});
