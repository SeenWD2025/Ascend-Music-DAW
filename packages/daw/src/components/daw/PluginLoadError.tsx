/**
 * Plugin Load Error Component
 * Graceful error UI when a plugin fails to load
 */

import { memo, useCallback, useEffect } from 'react';
import * as Sentry from '@sentry/browser';
import { AlertTriangle, RefreshCw, X, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getPluginInfo } from '../../lib/wam';

// ============================================================================
// Types
// ============================================================================

export interface PluginLoadErrorProps {
  /** Plugin catalog ID */
  pluginId: string;
  /** Error that occurred during loading */
  error: Error;
  /** Callback to retry loading the plugin */
  onRetry: () => void;
  /** Callback to remove the plugin slot */
  onRemove: () => void;
  /** Additional CSS classes */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export const PluginLoadError = memo(function PluginLoadError({
  pluginId,
  error,
  onRetry,
  onRemove,
  className,
}: PluginLoadErrorProps) {
  const pluginInfo = getPluginInfo(pluginId);
  const pluginName = pluginInfo?.name ?? pluginId;

  // Report error to Sentry on mount
  useEffect(() => {
    Sentry.captureException(error, {
      tags: {
        component: 'PluginLoadError',
        plugin_id: pluginId,
      },
      extra: {
        plugin_name: pluginName,
        error_message: error.message,
      },
    });
  }, [pluginId, pluginName, error]);

  const handleRetry = useCallback(() => {
    onRetry();
  }, [onRetry]);

  const handleRemove = useCallback(() => {
    onRemove();
  }, [onRemove]);

  // Parse error message for user-friendly display
  const getErrorDetails = (err: Error): { title: string; description: string } => {
    const message = err.message.toLowerCase();

    if (message.includes('timeout')) {
      return {
        title: 'Load Timeout',
        description: 'The plugin took too long to load. Check your internet connection and try again.',
      };
    }

    if (message.includes('network') || message.includes('fetch')) {
      return {
        title: 'Network Error',
        description: 'Could not download the plugin. Check your internet connection.',
      };
    }

    if (message.includes('audioworklet')) {
      return {
        title: 'AudioWorklet Error',
        description: 'Failed to initialize the audio processor. Your browser may not support this plugin.',
      };
    }

    if (message.includes('not found') || message.includes('404')) {
      return {
        title: 'Plugin Not Found',
        description: 'The plugin could not be found on the server.',
      };
    }

    return {
      title: 'Load Failed',
      description: err.message || 'An unknown error occurred while loading the plugin.',
    };
  };

  const { title, description } = getErrorDetails(error);

  return (
    <div
      className={cn(
        'flex flex-col gap-3 p-4 rounded-lg',
        'bg-red-950/40 border border-red-500/30',
        className
      )}
      role="alert"
      aria-live="polite"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-red-400" />
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-red-300">
            {pluginName}
          </h3>
          <p className="text-xs text-red-400/80 mt-0.5">
            {title}
          </p>
        </div>
      </div>

      {/* Error Description */}
      <p className="text-sm text-red-200/70 leading-relaxed">
        {description}
      </p>

      {/* Technical Details (collapsible) */}
      <details className="group">
        <summary className="flex items-center gap-1 text-xs text-red-400/60 cursor-pointer hover:text-red-400 transition-colors">
          <ExternalLink className="w-3 h-3" />
          Technical details
        </summary>
        <pre className="mt-2 p-2 bg-red-950/50 rounded text-xs text-red-300/70 overflow-x-auto whitespace-pre-wrap break-words">
          {error.stack ?? error.message}
        </pre>
      </details>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleRetry}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium',
            'bg-red-500/20 hover:bg-red-500/30',
            'text-red-200 hover:text-red-100',
            'border border-red-500/30 hover:border-red-500/50',
            'transition-colors'
          )}
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
        
        <button
          type="button"
          onClick={handleRemove}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium',
            'bg-transparent hover:bg-red-500/10',
            'text-red-400/70 hover:text-red-300',
            'transition-colors'
          )}
        >
          <X className="w-4 h-4" />
          Remove
        </button>
      </div>
    </div>
  );
});

// ============================================================================
// Error Boundary for Plugin Components
// ============================================================================

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface PluginErrorBoundaryProps {
  pluginId: string;
  children: ReactNode;
  onError?: (error: Error) => void;
  onRemove: () => void;
  onRetry: () => void;
}

interface PluginErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class PluginErrorBoundary extends Component<
  PluginErrorBoundaryProps,
  PluginErrorBoundaryState
> {
  constructor(props: PluginErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): PluginErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { pluginId, onError } = this.props;

    Sentry.captureException(error, {
      tags: {
        component: 'PluginErrorBoundary',
        plugin_id: pluginId,
      },
      extra: {
        componentStack: errorInfo.componentStack,
      },
    });

    onError?.(error);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry();
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { pluginId, children, onRemove } = this.props;

    if (hasError && error) {
      return (
        <PluginLoadError
          pluginId={pluginId}
          error={error}
          onRetry={this.handleRetry}
          onRemove={onRemove}
        />
      );
    }

    return children;
  }
}
