/**
 * WAM (Web Audio Modules) TypeScript Types
 * Complete type definitions for WAM plugin integration
 * 
 * @see https://webaudiomodules.org/
 * @see docs/WAM_COMPATIBILITY_MATRIX.md
 */

// ============================================================================
// Plugin Descriptor Types
// ============================================================================

/**
 * WAM Plugin Descriptor
 * Contains metadata about a WAM plugin including capabilities and identification
 */
export interface WAMDescriptor {
  /** Human-readable plugin name */
  name: string;
  /** Plugin vendor/developer */
  vendor: string;
  /** Plugin version (semver) */
  version: string;
  /** WAM API version this plugin targets */
  apiVersion: string;
  /** Optional thumbnail/icon URL */
  thumbnail?: string;
  /** Searchable keywords for plugin discovery */
  keywords?: string[];
  /** True if this is an instrument (generates audio), false for effects */
  isInstrument: boolean;
  /** Optional vendor website */
  website?: string;
  /** Whether the plugin has audio input */
  hasAudioInput?: boolean;
  /** Whether the plugin has audio output */
  hasAudioOutput?: boolean;
  /** Whether the plugin accepts MIDI input */
  hasMidiInput?: boolean;
  /** Whether the plugin produces MIDI output */
  hasMidiOutput?: boolean;
  /** Whether the plugin supports MPE (MIDI Polyphonic Expression) */
  hasMpe?: boolean;
  /** Whether the plugin accepts automation input */
  hasAutomationInput?: boolean;
  /** Whether the plugin produces automation output */
  hasAutomationOutput?: boolean;
}

// ============================================================================
// Parameter Types
// ============================================================================

/**
 * WAM Parameter Types
 * Defines the valid parameter value types for plugin controls
 */
export type WAMParameterType = 'float' | 'int' | 'boolean' | 'choice';

/**
 * WAM Parameter Info
 * Describes a single automatable parameter exposed by a plugin
 */
export interface WAMParameterInfo {
  /** Unique parameter identifier within the plugin */
  id: string;
  /** Human-readable parameter label */
  label: string;
  /** Parameter value type */
  type: WAMParameterType;
  /** Default value when plugin is instantiated */
  defaultValue: number;
  /** Minimum allowed value */
  minValue: number;
  /** Maximum allowed value */
  maxValue: number;
  /** For 'choice' type: available options */
  choices?: string[];
  /** Optional units (e.g., 'dB', 'Hz', 'ms') */
  units?: string;
  /** Optional group/category for UI organization */
  group?: string;
}

/**
 * WAM Parameter Values Map
 * Maps parameter IDs to their current values
 */
export type WAMParameterValues = Record<string, number>;

// ============================================================================
// Plugin Instance Types
// ============================================================================

/**
 * WAM Plugin Instance
 * Represents a loaded and running WAM plugin
 */
export interface WAMInstance {
  /** Unique instance identifier */
  instanceId: string;
  /** Plugin identifier (e.g., 'com.webaudiomodules.obxd') */
  pluginId: string;
  /** Plugin descriptor with metadata */
  descriptor: WAMDescriptor;
  /** The Web Audio API node for audio routing */
  audioNode: AudioNode;
  /** Cached parameter definitions (for sync access) */
  parameters: WAMParameterInfo[];
  /** Get all parameter info for this plugin */
  getParameterInfo(): Promise<WAMParameterInfo[]>;
  /** Get current values for all parameters */
  getParameterValues(): Promise<WAMParameterValues>;
  /** Set multiple parameter values at once */
  setParameterValues(values: WAMParameterValues): Promise<void>;
  /** Get a single parameter value (sync, from cache) */
  getParameterValue(paramId: string): number;
  /** Set a single parameter value (sync) */
  setParameterValue(paramId: string, value: number): void;
  /** Get the complete plugin state for serialization */
  getState(): Promise<unknown>;
  /** Restore plugin state from serialized data */
  setState(state: unknown): Promise<void>;
  /** Clean up and release all resources */
  destroy(): Promise<void>;
}

// ============================================================================
// Plugin Registry Types
// ============================================================================

/**
 * Known Plugin Info
 * Metadata for plugins in the known-good registry
 */
export interface KnownPluginInfo {
  /** Pinned version for stability */
  version: string;
  /** Local fallback URL if CDN fails */
  fallbackUrl: string;
  /** SHA-256 hash for integrity verification (optional) */
  integrityHash?: string;
}

/**
 * Plugin Catalog Entry
 * Complete information about a plugin in the catalog
 */
export interface PluginCatalogEntry {
  /** Plugin identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Plugin category */
  category: PluginCategory;
  /** Plugin vendor/developer */
  vendor: string;
  /** Description for UI display */
  description?: string;
  /** Icon/thumbnail URL */
  icon?: string;
  /** Pinned version (undefined = latest) */
  version?: string;
  /** Whether this is a known-good tested plugin */
  isKnownGood: boolean;
  /** Browser compatibility notes */
  browserNotes?: string;
  /** Tags for searching */
  tags?: string[];
}

/**
 * Plugin Category
 * Classification of plugin types
 */
export type PluginCategory = 
  | 'synth' 
  | 'sampler'
  | 'effect' 
  | 'dynamics'
  | 'eq'
  | 'reverb'
  | 'delay'
  | 'modulation'
  | 'distortion'
  | 'analyzer'
  | 'utility'
  | 'other';

// ============================================================================
// Loader Types
// ============================================================================

/**
 * Plugin Load Options
 * Configuration for loading a WAM plugin
 */
export interface PluginLoadOptions {
  /** Specific version to load (undefined = use pinned or latest) */
  version?: string;
  /** Timeout in milliseconds (default: 10000) */
  timeoutMs?: number;
  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;
  /** Whether to use local fallback on CDN failure (default: true) */
  useFallback?: boolean;
  /** AbortController signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Plugin Load Result
 * Result of a plugin load attempt
 */
export interface PluginLoadResult {
  /** Whether the load was successful */
  success: boolean;
  /** The loaded instance (if successful) */
  instance?: WAMInstance;
  /** Error information (if failed) */
  error?: PluginLoadError;
  /** Source where plugin was loaded from */
  source?: 'cdn' | 'fallback';
  /** Time taken to load in milliseconds */
  loadTimeMs?: number;
}

/**
 * Plugin Load Error
 * Detailed error information for failed plugin loads
 */
export interface PluginLoadError {
  /** Error code for programmatic handling */
  code: PluginErrorCode;
  /** Human-readable error message */
  message: string;
  /** The plugin that failed to load */
  pluginId: string;
  /** Original error (if available) */
  cause?: Error;
  /** Number of retry attempts made */
  attempts?: number;
}

/**
 * Plugin Error Codes
 */
export type PluginErrorCode =
  | 'LOAD_TIMEOUT'
  | 'NETWORK_ERROR'
  | 'AUDIO_WORKLET_INIT_FAILED'
  | 'INVALID_MODULE'
  | 'INSTANTIATION_FAILED'
  | 'ABORTED'
  | 'UNSUPPORTED_BROWSER'
  | 'UNKNOWN_ERROR';

// ============================================================================
// Telemetry Event Types
// ============================================================================

/**
 * Plugin Load Started Event
 * PostHog event for tracking plugin load attempts
 */
export interface PluginLoadStartedEvent {
  plugin_id: string;
  version?: string;
  source: 'cdn' | 'fallback';
  is_known_good: boolean;
}

/**
 * Plugin Load Success Event
 * PostHog event for successful plugin loads
 */
export interface PluginLoadSuccessEvent {
  plugin_id: string;
  version: string;
  source: 'cdn' | 'fallback';
  load_time_ms: number;
  is_known_good: boolean;
  retry_count: number;
}

/**
 * Plugin Load Failed Event
 * PostHog event for failed plugin loads
 */
export interface PluginLoadFailedEvent {
  plugin_id: string;
  version?: string;
  error_code: PluginErrorCode;
  error_message: string;
  is_known_good: boolean;
  retry_count: number;
  attempted_sources: ('cdn' | 'fallback')[];
}
