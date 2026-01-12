/**
 * WAM (Web Audio Modules) Plugin Loader
 * Production-quality loader with retry logic, timeout handling, CDN fallback,
 * and comprehensive telemetry via PostHog and Sentry.
 * 
 * Features:
 * - Load from CDN first, fallback to local
 * - Pinned versions for known-good plugins
 * - AudioWorklet initialization with error handling
 * - 10s timeout with AbortController
 * - Max 2 retries with exponential backoff
 * - Sentry capture on failure
 * - PostHog telemetry events
 * 
 * @see docs/WAM_KNOWN_GOOD_PLUGINS.md
 * @see docs/WAM_COMPATIBILITY_MATRIX.md
 */

import * as Sentry from '@sentry/browser';
import type {
  WAMInstance,
  WAMDescriptor,
  WAMParameterInfo,
  WAMParameterValues,
  PluginLoadOptions,
  PluginLoadResult,
  PluginErrorCode,
  PluginCategory,
} from './types';
import {
  KNOWN_GOOD_PLUGINS,
  PLUGIN_CATALOG,
  isKnownPlugin,
  getKnownPluginInfo,
  getPluginInfo as getPluginCatalogInfo,
} from './registry';

// Re-export types and registry functions for backwards compatibility
export type {
  WAMInstance,
  WAMDescriptor,
  WAMParameterInfo,
  PluginLoadOptions,
};
export { PLUGIN_CATALOG, isKnownPlugin, getKnownPluginInfo };

// ============================================================================
// Legacy Types (for backwards compatibility)
// ============================================================================

export interface PluginInfo {
  id: string;
  name: string;
  category: 'synth' | 'effect' | 'analyzer';
  version?: string;
  icon?: string;
  description?: string;
}

export interface WAMParameter {
  id: string;
  label: string;
  type: 'float' | 'int' | 'boolean' | 'choice';
  defaultValue: number;
  minValue?: number;
  maxValue?: number;
  choices?: string[];
  units?: string;
}

export class PluginLoadError extends Error {
  public readonly code: PluginErrorCode;
  public readonly attempts: number;
  
  constructor(
    message: string,
    public readonly pluginId: string,
    code: PluginErrorCode = 'UNKNOWN_ERROR',
    attempts = 1,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'PluginLoadError';
    this.code = code;
    this.attempts = attempts;
  }
}

// ============================================================================
// Constants
// ============================================================================

/** Default CDN base URL for WAM plugins */
const WAM_CDN_BASE = 'https://webaudiomodules.com/wam';

/** Plugin load timeout in milliseconds */
const DEFAULT_TIMEOUT_MS = 10000;

/** Maximum number of retry attempts */
const DEFAULT_MAX_RETRIES = 2;

/** Initial delay for exponential backoff (ms) */
const INITIAL_BACKOFF_DELAY_MS = 1000;

/** Maximum backoff delay (ms) */
const MAX_BACKOFF_DELAY_MS = 8000;

/** Backoff multiplier */
const BACKOFF_MULTIPLIER = 2;

/** Jitter factor for backoff (0-1) */
const JITTER_FACTOR = 0.1;

// ============================================================================
// Telemetry Helpers
// ============================================================================

/**
 * PostHog event capture (stub - replace with actual PostHog integration)
 * TODO: Connect to actual PostHog client when available
 */
function captureEvent(
  eventName: string,
  properties: Record<string, unknown>
): void {
  // PostHog capture will be wired up here
  // For now, log in development
  if (import.meta.env.DEV) {
    console.debug(`[PostHog] ${eventName}`, properties);
  }
  
  // TODO: Uncomment when PostHog is integrated
  // posthog.capture(eventName, properties);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique instance ID for a plugin
 */
function generateInstanceId(): string {
  return `wam_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Wait for a specified duration
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoffDelay(attempt: number): number {
  const baseDelay = INITIAL_BACKOFF_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, attempt);
  const cappedDelay = Math.min(baseDelay, MAX_BACKOFF_DELAY_MS);
  const jitter = cappedDelay * JITTER_FACTOR * Math.random();
  return Math.floor(cappedDelay + jitter);
}

/**
 * Create a timeout promise that rejects after the specified duration
 */
function createTimeoutPromise<T>(
  ms: number,
  signal?: AbortSignal
): { promise: Promise<T>; clear: () => void } {
  let timeoutId: ReturnType<typeof setTimeout>;
  
  const promise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Plugin load timeout after ${ms}ms`));
    }, ms);
    
    // Handle abort signal
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        reject(new Error('Plugin load aborted'));
      });
    }
  });
  
  return {
    promise,
    clear: () => clearTimeout(timeoutId),
  };
}

/**
 * Get the CDN URL for a plugin
 */
function getPluginCdnUrl(pluginId: string, version?: string): string {
  const versionPath = version ? `@${version}` : '';
  const pluginName = pluginId.split('.').pop() ?? pluginId;
  return `${WAM_CDN_BASE}/${pluginName}${versionPath}/index.js`;
}

/**
 * Map error to PluginErrorCode
 */
function mapErrorToCode(error: Error): PluginErrorCode {
  const message = error.message.toLowerCase();
  
  if (message.includes('timeout')) return 'LOAD_TIMEOUT';
  if (message.includes('abort')) return 'ABORTED';
  if (message.includes('network') || message.includes('fetch')) return 'NETWORK_ERROR';
  if (message.includes('audioworklet')) return 'AUDIO_WORKLET_INIT_FAILED';
  if (message.includes('module') || message.includes('export')) return 'INVALID_MODULE';
  if (message.includes('instance') || message.includes('create')) return 'INSTANTIATION_FAILED';
  
  return 'UNKNOWN_ERROR';
}

// ============================================================================
// AudioWorklet Initialization
// ============================================================================

/**
 * Initialize AudioWorklet for a plugin
 */
async function initializeAudioWorklet(
  audioContext: AudioContext,
  pluginId: string,
  url: string
): Promise<void> {
  const pluginName = pluginId.split('.').pop() ?? pluginId;
  
  // Derive processor URL from the base URL
  const processorUrl = url.replace('/index.js', '/processor.js');

  try {
    await audioContext.audioWorklet.addModule(processorUrl);
  } catch (error) {
    // Check for Safari-specific AudioWorklet issues
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isSafari) {
      Sentry.addBreadcrumb({
        category: 'wam-loader',
        message: 'Safari AudioWorklet initialization attempt',
        level: 'warning',
        data: { pluginId, pluginName },
      });
    }
    
    throw new PluginLoadError(
      `Failed to initialize AudioWorklet for ${pluginId}: ${error instanceof Error ? error.message : String(error)}`,
      pluginId,
      'AUDIO_WORKLET_INIT_FAILED',
      1,
      error instanceof Error ? error : undefined
    );
  }
}

// ============================================================================
// Plugin Loading Implementation
// ============================================================================

/**
 * Load a single plugin from a specific URL without retry logic
 */
async function loadPluginFromUrl(
  pluginId: string,
  audioContext: AudioContext,
  url: string,
  options: PluginLoadOptions = {}
): Promise<WAMInstance> {
  const { signal } = options;
  
  // Check for abort before starting
  if (signal?.aborted) {
    throw new PluginLoadError('Plugin load aborted', pluginId, 'ABORTED');
  }

  // Import the plugin module
  const module = await import(/* @vite-ignore */ url);
  
  if (!module.default) {
    throw new PluginLoadError(
      'Invalid plugin module: missing default export',
      pluginId,
      'INVALID_MODULE'
    );
  }

  // Initialize AudioWorklet if required
  await initializeAudioWorklet(audioContext, pluginId, url);

  // Check for abort after worklet init
  if (signal?.aborted) {
    throw new PluginLoadError('Plugin load aborted', pluginId, 'ABORTED');
  }

  // Create the plugin instance
  const PluginClass = module.default;
  const instance = await PluginClass.createInstance(audioContext);

  // Get plugin descriptor and parameters
  const descriptor = await instance.getDescriptor();
  const parameterInfo = await instance.getParameterInfo();

  // Map parameters to our format
  const parameters: WAMParameterInfo[] = Object.entries(parameterInfo).map(
    ([id, info]: [string, unknown]) => {
      const paramInfo = info as {
        label?: string;
        type?: string;
        defaultValue?: number;
        minValue?: number;
        maxValue?: number;
        choices?: string[];
        units?: string;
      };
      return {
        id,
        label: paramInfo.label ?? id,
        type: (paramInfo.type as WAMParameterInfo['type']) ?? 'float',
        defaultValue: paramInfo.defaultValue ?? 0,
        minValue: paramInfo.minValue ?? 0,
        maxValue: paramInfo.maxValue ?? 1,
        choices: paramInfo.choices,
        units: paramInfo.units,
      };
    }
  );

  const instanceId = generateInstanceId();
  
  // Cache parameters for sync access
  let cachedParameters = parameters;

  return {
    instanceId,
    pluginId,
    audioNode: instance.audioNode,
    descriptor: {
      ...descriptor,
      apiVersion: descriptor.sdkVersion ?? descriptor.apiVersion ?? '2.0.0',
    } as WAMDescriptor,
    
    async getParameterInfo(): Promise<WAMParameterInfo[]> {
      return cachedParameters;
    },
    
    async getParameterValues(): Promise<WAMParameterValues> {
      const values: WAMParameterValues = {};
      for (const param of cachedParameters) {
        values[param.id] = instance.getParameterValue(param.id);
      }
      return values;
    },
    
    async setParameterValues(values: WAMParameterValues): Promise<void> {
      for (const [paramId, value] of Object.entries(values)) {
        instance.setParameterValue(paramId, value);
      }
    },
    
    async getState(): Promise<unknown> {
      return instance.getState();
    },
    
    async setState(state: unknown): Promise<void> {
      await instance.setState(state);
    },
    
    async destroy(): Promise<void> {
      instance.audioNode.disconnect();
      await instance.destroy?.();
    },
  };
}

// ============================================================================
// Main Loading Functions
// ============================================================================

/**
 * Load a WAM plugin with CDN fallback, timeout, and retry logic
 * 
 * @param audioContext - The AudioContext to use for the plugin
 * @param wamId - The plugin identifier (e.g., 'com.webaudiomodules.obxd')
 * @param version - Optional version string (uses pinned version for known-good plugins)
 * @param options - Optional load configuration
 * @returns Promise resolving to the loaded WAMInstance
 * @throws PluginLoadError if loading fails after all retries
 * 
 * @example
 * ```ts
 * const synth = await loadWAMPlugin(audioContext, 'com.webaudiomodules.obxd');
 * synth.audioNode.connect(audioContext.destination);
 * ```
 */
export async function loadWAMPlugin(
  audioContext: AudioContext,
  wamId: string,
  version?: string,
  options: PluginLoadOptions = {}
): Promise<WAMInstance> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    useFallback = true,
    signal,
  } = options;

  const startTime = performance.now();
  const knownPluginInfo = getKnownPluginInfo(wamId);
  const isKnown = isKnownPlugin(wamId);
  
  // Use pinned version for known-good plugins if no version specified
  const effectiveVersion = version ?? knownPluginInfo?.version;
  
  // Emit load started event
  captureEvent('plugin.load_started', {
    plugin_id: wamId,
    version: effectiveVersion,
    source: 'cdn',
    is_known_good: isKnown,
  });

  const attemptedSources: ('cdn' | 'fallback')[] = [];
  let lastError: Error | undefined;
  let currentSource: 'cdn' | 'fallback' = 'cdn';
  
  // Try CDN first, then fallback
  const sources = [
    { type: 'cdn' as const, url: getPluginCdnUrl(wamId, effectiveVersion) },
  ];
  
  // Add fallback URL for known-good plugins
  if (useFallback && knownPluginInfo?.fallbackUrl) {
    sources.push({ type: 'fallback' as const, url: knownPluginInfo.fallbackUrl });
  }

  for (const source of sources) {
    currentSource = source.type;
    attemptedSources.push(source.type);
    
    // Retry loop for each source
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Check for abort
      if (signal?.aborted) {
        throw new PluginLoadError('Plugin load aborted', wamId, 'ABORTED', attempt);
      }
      
      if (attempt > 0) {
        const backoffDelay = calculateBackoffDelay(attempt - 1);
        console.debug(
          `[WAM Loader] Retrying ${wamId} from ${source.type} ` +
          `(attempt ${attempt + 1}/${maxRetries + 1}, delay ${backoffDelay}ms)`
        );
        await delay(backoffDelay);
      }

      try {
        // Create timeout with abort support
        const timeoutController = createTimeoutPromise<WAMInstance>(timeoutMs, signal);
        
        // Race between loading and timeout
        const instance = await Promise.race([
          loadPluginFromUrl(wamId, audioContext, source.url, { signal }),
          timeoutController.promise,
        ]);
        
        timeoutController.clear();
        
        const loadTimeMs = Math.round(performance.now() - startTime);
        
        console.debug(
          `[WAM Loader] Successfully loaded ${wamId} from ${source.type} in ${loadTimeMs}ms`
        );
        
        // Emit success event
        captureEvent('plugin.load_success', {
          plugin_id: wamId,
          version: effectiveVersion ?? instance.descriptor.version,
          source: source.type,
          load_time_ms: loadTimeMs,
          is_known_good: isKnown,
          retry_count: attempt,
        });
        
        return instance;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        console.warn(
          `[WAM Loader] Failed to load ${wamId} from ${source.type}:`,
          lastError.message
        );
        
        // Don't retry on abort or if it's a fatal error
        if (lastError.message.includes('abort')) {
          throw new PluginLoadError(
            'Plugin load aborted',
            wamId,
            'ABORTED',
            attempt + 1,
            lastError
          );
        }
      }
    }
  }

  // All sources and retries exhausted
  const totalAttempts = attemptedSources.length * (maxRetries + 1);
  const errorCode = mapErrorToCode(lastError ?? new Error('Unknown error'));
  
  const loadError = new PluginLoadError(
    `Failed to load plugin ${wamId} after ${totalAttempts} attempts: ${lastError?.message}`,
    wamId,
    errorCode,
    totalAttempts,
    lastError
  );

  // Emit failure event
  captureEvent('plugin.load_failed', {
    plugin_id: wamId,
    version: effectiveVersion,
    error_code: errorCode,
    error_message: lastError?.message ?? 'Unknown error',
    is_known_good: isKnown,
    retry_count: totalAttempts,
    attempted_sources: attemptedSources,
  });

  Sentry.captureException(loadError, {
    tags: {
      component: 'wam-loader',
      plugin_id: wamId,
      error_code: errorCode,
      is_known_good: String(isKnown),
    },
    extra: {
      version: effectiveVersion,
      attempts: totalAttempts,
      attempted_sources: attemptedSources,
    },
  });

  throw loadError;
}

/**
 * Legacy alias for loadWAMPlugin (backwards compatibility)
 * @deprecated Use loadWAMPlugin instead
 */
export async function loadPlugin(
  pluginId: string,
  audioContext: AudioContext,
  version?: string
): Promise<WAMInstance> {
  return loadWAMPlugin(audioContext, pluginId, version);
}

/**
 * Unload a WAM plugin instance and release resources
 */
export async function unloadPlugin(instance: WAMInstance): Promise<void> {
  const span = Sentry.startSpan({ 
    name: 'wam.unload', 
    op: 'function',
    attributes: { plugin_id: instance.pluginId },
  });
  
  try {
    await instance.destroy();
    console.debug(`[WAM Loader] Unloaded plugin ${instance.pluginId}`);
    span?.setStatus({ code: 1, message: 'ok' });
  } catch (error) {
    span?.setStatus({ code: 2, message: 'error' });
    Sentry.captureException(error, {
      tags: {
        component: 'wam-loader',
        plugin_id: instance.pluginId,
      },
    });
    console.error(`[WAM Loader] Error unloading plugin:`, error);
    throw error;
  } finally {
    span?.end();
  }
}

// ============================================================================
// Plugin Discovery Functions
// ============================================================================

/**
 * Get plugin info from catalog by ID
 * @deprecated Use getPluginCatalogInfo from registry instead
 */
export function getPluginInfo(pluginId: string): PluginInfo | undefined {
  const entry = getPluginCatalogInfo(pluginId);
  if (!entry) return undefined;
  
  // Map to legacy PluginInfo format
  const categoryMap: Record<string, 'synth' | 'effect' | 'analyzer'> = {
    synth: 'synth',
    sampler: 'synth',
    effect: 'effect',
    dynamics: 'effect',
    eq: 'effect',
    reverb: 'effect',
    delay: 'effect',
    modulation: 'effect',
    distortion: 'effect',
    analyzer: 'analyzer',
    utility: 'effect',
    other: 'effect',
  };
  
  return {
    id: entry.id,
    name: entry.name,
    category: categoryMap[entry.category] ?? 'effect',
    version: entry.version,
    icon: entry.icon,
    description: entry.description,
  };
}

/**
 * Filter plugins by category
 * @deprecated Use filterPluginsByCategory from registry instead
 */
export function filterPluginsByCategory(
  plugins: PluginInfo[],
  category?: 'synth' | 'effect' | 'analyzer'
): PluginInfo[] {
  if (!category) return plugins;
  return plugins.filter((p) => p.category === category);
}

/**
 * Search plugins by name
 * @deprecated Use searchPlugins from registry instead
 */
export function searchPlugins(
  plugins: PluginInfo[],
  query: string
): PluginInfo[] {
  if (!query.trim()) return plugins;
  const lowerQuery = query.toLowerCase();
  return plugins.filter((p) =>
    p.name.toLowerCase().includes(lowerQuery) ||
    p.id.toLowerCase().includes(lowerQuery)
  );
}

