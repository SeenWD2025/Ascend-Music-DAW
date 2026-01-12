/**
 * Plugin Store
 * Zustand store for managing WAM plugin state and lifecycle
 */

import { create } from 'zustand';
import * as Sentry from '@sentry/browser';
import {
  loadPlugin,
  unloadPlugin,
  PLUGIN_CATALOG,
  type PluginInfo,
  type WAMInstance,
} from '../lib/wam';

// ============================================================================
// Types
// ============================================================================

export interface TrackPluginSlot {
  id: string;
  pluginId: string;
  instanceId: string;
  order: number;
  isBypassed: boolean;
}

export interface PluginState {
  /** Available plugins from the catalog */
  pluginCatalog: PluginInfo[];
  
  /** Loaded plugin instances by instance ID */
  loadedPlugins: Map<string, WAMInstance>;
  
  /** Plugin IDs currently being loaded */
  loadingPlugins: Set<string>;
  
  /** Failed plugin loads by instance ID */
  failedPlugins: Map<string, Error>;
  
  /** Plugin slots per track */
  trackPluginSlots: Map<string, TrackPluginSlot[]>;
  
  /** Currently selected plugin instance for parameter editing */
  selectedPluginInstanceId: string | null;
  
  /** Whether the plugin browser is open */
  isBrowserOpen: boolean;
  
  /** Track ID to add plugin to (when browser is open) */
  targetTrackId: string | null;

  // Actions
  openBrowser: (trackId: string) => void;
  closeBrowser: () => void;
  selectPlugin: (instanceId: string | null) => void;
  
  loadPluginToTrack: (
    trackId: string,
    pluginId: string,
    audioContext: AudioContext
  ) => Promise<string | null>;
  
  unloadPluginFromTrack: (trackId: string, instanceId: string) => Promise<void>;
  
  updateParameter: (
    instanceId: string,
    paramId: string,
    value: number
  ) => void;
  
  bypassPlugin: (trackId: string, instanceId: string, bypass: boolean) => void;
  
  reorderPlugins: (
    trackId: string,
    fromIndex: number,
    toIndex: number
  ) => void;
  
  retryLoadPlugin: (
    trackId: string,
    instanceId: string,
    audioContext: AudioContext
  ) => Promise<void>;
  
  clearFailedPlugin: (instanceId: string) => void;
  
  getTrackPlugins: (trackId: string) => TrackPluginSlot[];
  
  getPluginInstance: (instanceId: string) => WAMInstance | undefined;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const usePluginStore = create<PluginState>((set, get) => ({
  pluginCatalog: PLUGIN_CATALOG,
  loadedPlugins: new Map(),
  loadingPlugins: new Set(),
  failedPlugins: new Map(),
  trackPluginSlots: new Map(),
  selectedPluginInstanceId: null,
  isBrowserOpen: false,
  targetTrackId: null,

  openBrowser: (trackId) => {
    set({ isBrowserOpen: true, targetTrackId: trackId });
    
    // PostHog tracking placeholder
    // posthog.capture('plugin.browser_opened', { track_id: trackId });
  },

  closeBrowser: () => {
    set({ isBrowserOpen: false, targetTrackId: null });
  },

  selectPlugin: (instanceId) => {
    set({ selectedPluginInstanceId: instanceId });
  },

  loadPluginToTrack: async (trackId, pluginId, audioContext) => {
    const { loadingPlugins, failedPlugins } = get();
    
    // Generate a temporary instance ID for tracking loading state
    const tempInstanceId = `loading_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    
    // Mark as loading
    const newLoadingPlugins = new Set(loadingPlugins);
    newLoadingPlugins.add(tempInstanceId);
    set({ loadingPlugins: newLoadingPlugins });

    try {
      // Load the plugin
      const instance = await loadPlugin(pluginId, audioContext);
      
      // Remove from loading state
      const updatedLoadingPlugins = new Set(get().loadingPlugins);
      updatedLoadingPlugins.delete(tempInstanceId);
      
      // Add to loaded plugins
      const updatedLoadedPlugins = new Map(get().loadedPlugins);
      updatedLoadedPlugins.set(instance.instanceId, instance);
      
      // Add slot to track
      const currentSlots = get().trackPluginSlots.get(trackId) ?? [];
      const newSlot: TrackPluginSlot = {
        id: instance.instanceId,
        pluginId,
        instanceId: instance.instanceId,
        order: currentSlots.length,
        isBypassed: false,
      };
      
      const updatedTrackSlots = new Map(get().trackPluginSlots);
      updatedTrackSlots.set(trackId, [...currentSlots, newSlot]);
      
      set({
        loadingPlugins: updatedLoadingPlugins,
        loadedPlugins: updatedLoadedPlugins,
        trackPluginSlots: updatedTrackSlots,
      });

      // PostHog tracking placeholder
      // posthog.capture('plugin.added', {
      //   track_id: trackId,
      //   plugin_id: pluginId,
      //   instance_id: instance.instanceId,
      // });

      return instance.instanceId;
    } catch (error) {
      // Remove from loading state
      const updatedLoadingPlugins = new Set(get().loadingPlugins);
      updatedLoadingPlugins.delete(tempInstanceId);
      
      // Add to failed plugins
      const updatedFailedPlugins = new Map(failedPlugins);
      updatedFailedPlugins.set(tempInstanceId, error as Error);
      
      // Still add a slot for the failed plugin so user can retry
      const currentSlots = get().trackPluginSlots.get(trackId) ?? [];
      const failedSlot: TrackPluginSlot = {
        id: tempInstanceId,
        pluginId,
        instanceId: tempInstanceId,
        order: currentSlots.length,
        isBypassed: true,
      };
      
      const updatedTrackSlots = new Map(get().trackPluginSlots);
      updatedTrackSlots.set(trackId, [...currentSlots, failedSlot]);
      
      set({
        loadingPlugins: updatedLoadingPlugins,
        failedPlugins: updatedFailedPlugins,
        trackPluginSlots: updatedTrackSlots,
      });

      Sentry.captureException(error, {
        tags: {
          component: 'plugin-store',
          action: 'load_plugin',
        },
        extra: {
          track_id: trackId,
          plugin_id: pluginId,
        },
      });

      return null;
    }
  },

  unloadPluginFromTrack: async (trackId, instanceId) => {
    const { loadedPlugins, trackPluginSlots, failedPlugins } = get();
    
    // Get the instance if it exists
    const instance = loadedPlugins.get(instanceId);
    
    if (instance) {
      try {
        await unloadPlugin(instance);
      } catch (error) {
        Sentry.captureException(error, {
          tags: {
            component: 'plugin-store',
            action: 'unload_plugin',
          },
        });
      }
    }
    
    // Remove from loaded plugins
    const updatedLoadedPlugins = new Map(loadedPlugins);
    updatedLoadedPlugins.delete(instanceId);
    
    // Remove from failed plugins if it was there
    const updatedFailedPlugins = new Map(failedPlugins);
    updatedFailedPlugins.delete(instanceId);
    
    // Remove slot from track
    const currentSlots = trackPluginSlots.get(trackId) ?? [];
    const updatedSlots = currentSlots
      .filter((slot) => slot.instanceId !== instanceId)
      .map((slot, index) => ({ ...slot, order: index }));
    
    const updatedTrackSlots = new Map(trackPluginSlots);
    updatedTrackSlots.set(trackId, updatedSlots);
    
    // Clear selection if this was the selected plugin
    const selectedPluginInstanceId = get().selectedPluginInstanceId;
    
    set({
      loadedPlugins: updatedLoadedPlugins,
      failedPlugins: updatedFailedPlugins,
      trackPluginSlots: updatedTrackSlots,
      selectedPluginInstanceId: 
        selectedPluginInstanceId === instanceId ? null : selectedPluginInstanceId,
    });

    // PostHog tracking placeholder
    // posthog.capture('plugin.removed', {
    //   track_id: trackId,
    //   instance_id: instanceId,
    // });
  },

  updateParameter: (instanceId, paramId, value) => {
    const { loadedPlugins } = get();
    const instance = loadedPlugins.get(instanceId);
    
    if (!instance) {
      console.warn(`[PluginStore] Cannot update parameter: instance ${instanceId} not found`);
      return;
    }

    try {
      instance.setParameterValue(paramId, value);
      
      // PostHog tracking placeholder (throttled at component level)
      // posthog.capture('plugin.param_changed', {
      //   instance_id: instanceId,
      //   param_id: paramId,
      //   value,
      // });
    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          component: 'plugin-store',
          action: 'update_parameter',
        },
        extra: {
          instance_id: instanceId,
          param_id: paramId,
        },
      });
    }
  },

  bypassPlugin: (trackId, instanceId, bypass) => {
    const { trackPluginSlots } = get();
    
    const currentSlots = trackPluginSlots.get(trackId) ?? [];
    const updatedSlots = currentSlots.map((slot) =>
      slot.instanceId === instanceId ? { ...slot, isBypassed: bypass } : slot
    );
    
    const updatedTrackSlots = new Map(trackPluginSlots);
    updatedTrackSlots.set(trackId, updatedSlots);
    
    set({ trackPluginSlots: updatedTrackSlots });
  },

  reorderPlugins: (trackId, fromIndex, toIndex) => {
    const { trackPluginSlots } = get();
    
    const currentSlots = trackPluginSlots.get(trackId) ?? [];
    if (fromIndex < 0 || fromIndex >= currentSlots.length) return;
    if (toIndex < 0 || toIndex >= currentSlots.length) return;
    
    const newSlots = [...currentSlots];
    const [removed] = newSlots.splice(fromIndex, 1);
    newSlots.splice(toIndex, 0, removed);
    
    // Update order values
    const reorderedSlots = newSlots.map((slot, index) => ({
      ...slot,
      order: index,
    }));
    
    const updatedTrackSlots = new Map(trackPluginSlots);
    updatedTrackSlots.set(trackId, reorderedSlots);
    
    set({ trackPluginSlots: updatedTrackSlots });
  },

  retryLoadPlugin: async (trackId, instanceId, audioContext) => {
    const { failedPlugins, trackPluginSlots } = get();
    
    // Get the slot to find the plugin ID
    const slots = trackPluginSlots.get(trackId) ?? [];
    const slot = slots.find((s) => s.instanceId === instanceId);
    
    if (!slot) {
      console.warn(`[PluginStore] Cannot retry: slot ${instanceId} not found`);
      return;
    }
    
    // Clear the failed state
    const updatedFailedPlugins = new Map(failedPlugins);
    updatedFailedPlugins.delete(instanceId);
    set({ failedPlugins: updatedFailedPlugins });
    
    // Remove the failed slot
    await get().unloadPluginFromTrack(trackId, instanceId);
    
    // Try loading again
    await get().loadPluginToTrack(trackId, slot.pluginId, audioContext);
  },

  clearFailedPlugin: (instanceId) => {
    const { failedPlugins } = get();
    const updatedFailedPlugins = new Map(failedPlugins);
    updatedFailedPlugins.delete(instanceId);
    set({ failedPlugins: updatedFailedPlugins });
  },

  getTrackPlugins: (trackId) => {
    const { trackPluginSlots } = get();
    return trackPluginSlots.get(trackId) ?? [];
  },

  getPluginInstance: (instanceId) => {
    const { loadedPlugins } = get();
    return loadedPlugins.get(instanceId);
  },
}));
