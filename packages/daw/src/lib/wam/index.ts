/**
 * WAM (Web Audio Modules) utilities
 * Re-exports loader, registry, and types
 * 
 * @see docs/WAM_KNOWN_GOOD_PLUGINS.md
 * @see docs/WAM_COMPATIBILITY_MATRIX.md
 */

// Types
export type {
  WAMDescriptor,
  WAMInstance,
  WAMParameterInfo,
  WAMParameterValues,
  WAMParameterType,
  KnownPluginInfo,
  PluginCatalogEntry,
  PluginCategory,
  PluginLoadOptions,
  PluginLoadResult,
  PluginLoadError as PluginLoadErrorType,
  PluginErrorCode,
  PluginLoadStartedEvent,
  PluginLoadSuccessEvent,
  PluginLoadFailedEvent,
} from './types';

// Loader exports
export {
  loadWAMPlugin,
  loadPlugin,
  unloadPlugin,
  getPluginInfo,
  filterPluginsByCategory,
  searchPlugins,
  PluginLoadError,
  // Legacy exports
  PLUGIN_CATALOG,
  type PluginInfo,
  type WAMParameter,
} from './loader';

// Registry exports
export {
  pluginRegistry,
  KNOWN_GOOD_PLUGINS,
  getKnownPlugins,
  isKnownPlugin,
  getKnownPluginInfo,
  getKnownGoodPlugins,
  getCategories,
  getPluginsByVendor,
  getPluginsByTag,
} from './registry';
