/**
 * Effects Chain Component
 * Vertical list of plugins on a track with drag-and-drop reordering
 */

import { memo, useCallback, useState } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
  type DroppableProvided,
  type DroppableStateSnapshot,
  type DraggableProvided,
  type DraggableStateSnapshot,
} from '@hello-pangea/dnd';
import { Plus, Layers } from 'lucide-react';
import { cn } from '../../lib/utils';
import { usePluginStore, type TrackPluginSlot } from '../../stores/plugin.store';
import { PluginSlot } from './PluginSlot';
import { PluginParameters } from './PluginParameters';

// ============================================================================
// Types
// ============================================================================

export interface EffectsChainProps {
  /** Track ID to show effects for */
  trackId: string;
  /** Audio context for plugin operations */
  audioContext: AudioContext | null;
  /** Additional CSS classes */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export const EffectsChain = memo(function EffectsChain({
  trackId,
  audioContext,
  className,
}: EffectsChainProps) {
  const [expandedPluginId, setExpandedPluginId] = useState<string | null>(null);

  const {
    getTrackPlugins,
    getPluginInstance,
    loadingPlugins,
    failedPlugins,
    openBrowser,
    unloadPluginFromTrack,
    bypassPlugin,
    reorderPlugins,
    updateParameter,
    retryLoadPlugin,
    selectedPluginInstanceId,
    selectPlugin,
  } = usePluginStore();

  const plugins = getTrackPlugins(trackId);

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return;
      if (result.source.index === result.destination.index) return;

      reorderPlugins(trackId, result.source.index, result.destination.index);

      // TODO: API call to persist reorder
      // api.reorderTrackPlugins(trackId, result.source.index, result.destination.index);
    },
    [trackId, reorderPlugins]
  );

  const handleAddPlugin = useCallback(() => {
    openBrowser(trackId);
  }, [trackId, openBrowser]);

  const handlePluginSelect = useCallback(
    (instanceId: string) => {
      const newExpandedId = expandedPluginId === instanceId ? null : instanceId;
      setExpandedPluginId(newExpandedId);
      selectPlugin(newExpandedId);
    },
    [expandedPluginId, selectPlugin]
  );

  const handlePluginDelete = useCallback(
    async (instanceId: string) => {
      await unloadPluginFromTrack(trackId, instanceId);
      if (expandedPluginId === instanceId) {
        setExpandedPluginId(null);
      }
    },
    [trackId, unloadPluginFromTrack, expandedPluginId]
  );

  const handlePluginBypass = useCallback(
    (slot: TrackPluginSlot) => {
      bypassPlugin(trackId, slot.instanceId, !slot.isBypassed);
    },
    [trackId, bypassPlugin]
  );

  const handlePluginRetry = useCallback(
    async (instanceId: string) => {
      if (!audioContext) return;
      await retryLoadPlugin(trackId, instanceId, audioContext);
    },
    [trackId, audioContext, retryLoadPlugin]
  );

  const handleParameterChange = useCallback(
    (instanceId: string, paramId: string, value: number) => {
      updateParameter(instanceId, paramId, value);
    },
    [updateParameter]
  );

  // Get parameter values for expanded plugin
  const getParameterValues = useCallback(
    (instanceId: string): Map<string, number> => {
      const instance = getPluginInstance(instanceId);
      if (!instance) return new Map();

      const values = new Map<string, number>();
      instance.parameters.forEach((param) => {
        try {
          values.set(param.id, instance.getParameterValue(param.id));
        } catch {
          values.set(param.id, param.defaultValue);
        }
      });
      return values;
    },
    [getPluginInstance]
  );

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-daw-border-secondary">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-daw-text-muted" />
          <span className="text-sm font-medium text-daw-text-primary">Effects</span>
          {plugins.length > 0 && (
            <span className="text-xs text-daw-text-muted">({plugins.length})</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleAddPlugin}
          className="p-1 rounded text-daw-text-muted hover:text-daw-accent-primary hover:bg-daw-bg-tertiary transition-colors"
          aria-label="Add effect plugin"
          title="Add effect"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Plugin List */}
      <div className="flex-1 overflow-y-auto">
        {plugins.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <Layers className="w-8 h-8 text-daw-text-muted mb-2" />
            <p className="text-sm text-daw-text-secondary">No effects</p>
            <p className="text-xs text-daw-text-muted mt-1">
              Click + to add plugins
            </p>
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId={`effects-${trackId}`}>
              {(provided: DroppableProvided, snapshot: DroppableStateSnapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    'p-2 space-y-1',
                    snapshot.isDraggingOver && 'bg-daw-accent-primary/5'
                  )}
                  role="list"
                  aria-label="Effects chain"
                >
                  {plugins.map((slot, index) => {
                    const isLoading = loadingPlugins.has(slot.instanceId);
                    const error = failedPlugins.get(slot.instanceId);
                    const hasFailed = !!error;
                    const isSelected = selectedPluginInstanceId === slot.instanceId;
                    const isExpanded = expandedPluginId === slot.instanceId;
                    const instance = getPluginInstance(slot.instanceId);

                    return (
                      <Draggable
                        key={slot.id}
                        draggableId={slot.id}
                        index={index}
                        isDragDisabled={isLoading || hasFailed}
                      >
                        {(dragProvided: DraggableProvided, dragSnapshot: DraggableStateSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={cn(
                              dragSnapshot.isDragging && 'shadow-lg'
                            )}
                          >
                            <PluginSlot
                              trackId={trackId}
                              instanceId={slot.instanceId}
                              pluginId={slot.pluginId}
                              isBypassed={slot.isBypassed}
                              isSelected={isSelected}
                              isLoading={isLoading}
                              hasFailed={hasFailed}
                              errorMessage={error?.message}
                              onSelect={() => handlePluginSelect(slot.instanceId)}
                              onDelete={() => handlePluginDelete(slot.instanceId)}
                              onBypassToggle={() => handlePluginBypass(slot)}
                              onRetry={() => handlePluginRetry(slot.instanceId)}
                              dragHandleProps={dragProvided.dragHandleProps ?? undefined}
                            />

                            {/* Expanded Parameters Panel */}
                            {isExpanded && instance && (
                              <div className="mt-1 bg-daw-bg-secondary rounded border border-daw-border-secondary">
                                <PluginParameters
                                  instanceId={slot.instanceId}
                                  parameters={instance.parameters}
                                  values={getParameterValues(slot.instanceId)}
                                  onParameterChange={(paramId, value) =>
                                    handleParameterChange(slot.instanceId, paramId, value)
                                  }
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>

      {/* Add Plugin Button (Bottom) */}
      <div className="p-2 border-t border-daw-border-secondary">
        <button
          type="button"
          onClick={handleAddPlugin}
          className={cn(
            'w-full flex items-center justify-center gap-2 py-2 rounded',
            'bg-daw-bg-tertiary hover:bg-daw-bg-secondary',
            'text-sm text-daw-text-secondary hover:text-daw-text-primary',
            'border border-dashed border-daw-border-secondary hover:border-daw-border-primary',
            'transition-colors'
          )}
        >
          <Plus className="w-4 h-4" />
          Add Plugin
        </button>
      </div>
    </div>
  );
});
