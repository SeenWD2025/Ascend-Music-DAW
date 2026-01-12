/**
 * WAM Plugin Registry
 * Catalog and discovery utilities for known-good WAM plugins
 * 
 * This module maintains the curated list of tested, compatible WAM plugins
 * and provides search/filter functionality for the plugin browser UI.
 * 
 * @see docs/WAM_KNOWN_GOOD_PLUGINS.md
 * @see docs/WAM_COMPATIBILITY_MATRIX.md
 */

import type {
  PluginCatalogEntry,
  PluginCategory,
  KnownPluginInfo,
} from './types';

// ============================================================================
// Known-Good Plugin Registry
// ============================================================================

/**
 * Pinned versions and fallback URLs for known-good plugins.
 * These plugins have been tested for compatibility and stability.
 */
export const KNOWN_GOOD_PLUGINS: Map<string, KnownPluginInfo> = new Map([
  [
    'com.webaudiomodules.obxd',
    {
      version: '1.5.0',
      fallbackUrl: '/plugins/obxd.wam',
    },
  ],
  [
    'com.webaudiomodules.dexed',
    {
      version: '1.0.0',
      fallbackUrl: '/plugins/dexed.wam',
    },
  ],
  [
    'com.webaudiomodules.freeverb',
    {
      version: '1.0.0',
      fallbackUrl: '/plugins/freeverb.wam',
    },
  ],
  [
    'com.webaudiomodules.parametric-eq',
    {
      version: '1.0.0',
      fallbackUrl: '/plugins/eq.wam',
    },
  ],
  [
    'com.webaudiomodules.compressor',
    {
      version: '1.0.0',
      fallbackUrl: '/plugins/compressor.wam',
    },
  ],
  [
    'com.webaudiomodules.surge',
    {
      version: '1.3.1',
      fallbackUrl: '/plugins/surge.wam',
    },
  ],
  [
    'com.webaudiomodules.dx7',
    {
      version: '1.0.0',
      fallbackUrl: '/plugins/dx7.wam',
    },
  ],
]);

// ============================================================================
// Plugin Catalog
// ============================================================================

/**
 * Complete plugin catalog with metadata for UI display.
 * Includes both known-good plugins and community plugins.
 */
export const PLUGIN_CATALOG: PluginCatalogEntry[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // Synthesizers (Known-Good)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'com.webaudiomodules.obxd',
    name: 'OB-Xd',
    category: 'synth',
    vendor: 'webaudiomodules.com',
    description: 'Virtual analog synthesizer emulating the Oberheim OB-X series',
    icon: '/plugin-icons/obxd.png',
    version: '1.5.0',
    isKnownGood: true,
    tags: ['analog', 'poly', 'warm', 'vintage', 'oberheim'],
  },
  {
    id: 'com.webaudiomodules.dexed',
    name: 'Dexed',
    category: 'synth',
    vendor: 'webaudiomodules.com',
    description: 'FM synthesizer closely modeled on the Yamaha DX7',
    icon: '/plugin-icons/dexed.png',
    version: '1.0.0',
    isKnownGood: true,
    tags: ['fm', 'digital', 'dx7', 'yamaha', 'classic'],
  },
  {
    id: 'com.webaudiomodules.dx7',
    name: 'DX7',
    category: 'synth',
    vendor: 'webaudiomodules.com',
    description: 'Classic Yamaha DX7 FM synthesis emulation',
    icon: '/plugin-icons/dx7.png',
    version: '1.0.0',
    isKnownGood: true,
    tags: ['fm', 'digital', 'yamaha', 'classic', '80s'],
  },
  {
    id: 'com.webaudiomodules.surge',
    name: 'Surge XT',
    category: 'synth',
    vendor: 'Surge Synth Team',
    description: 'Full-featured hybrid synthesizer with extensive modulation',
    icon: '/plugin-icons/surge.png',
    version: '1.3.1',
    isKnownGood: true,
    tags: ['hybrid', 'wavetable', 'fm', 'modern', 'powerful'],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Effects (Known-Good)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'com.webaudiomodules.freeverb',
    name: 'FreeVerb',
    category: 'reverb',
    vendor: 'webaudiomodules.com',
    description: 'High-quality algorithmic reverb based on the Freeverb algorithm',
    icon: '/plugin-icons/freeverb.png',
    version: '1.0.0',
    isKnownGood: true,
    tags: ['reverb', 'space', 'ambient', 'room'],
  },
  {
    id: 'com.webaudiomodules.parametric-eq',
    name: 'Parametric EQ',
    category: 'eq',
    vendor: 'webaudiomodules.com',
    description: 'Professional 8-band parametric equalizer with spectrum analyzer',
    icon: '/plugin-icons/eq.png',
    version: '1.0.0',
    isKnownGood: true,
    tags: ['eq', 'equalizer', 'mixing', 'mastering', 'frequency'],
  },
  {
    id: 'com.webaudiomodules.compressor',
    name: 'Compressor',
    category: 'dynamics',
    vendor: 'webaudiomodules.com',
    description: 'Versatile dynamics compressor with sidechain support',
    icon: '/plugin-icons/compressor.png',
    version: '1.0.0',
    isKnownGood: true,
    tags: ['compressor', 'dynamics', 'mixing', 'mastering', 'punch'],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Community Plugins (Not Known-Good - use with caution)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'com.webaudiomodules.vital',
    name: 'Vital',
    category: 'synth',
    vendor: 'Community Port',
    description: 'Modern wavetable synthesizer with powerful modulation',
    isKnownGood: false,
    browserNotes: 'May have stability issues in Safari',
    tags: ['wavetable', 'modern', 'powerful', 'modulation'],
  },
  {
    id: 'com.webaudiomodules.zynaddsubfx',
    name: 'ZynAddSubFX',
    category: 'synth',
    vendor: 'ZynAddSubFX',
    description: 'Multi-engine synthesizer with additive, subtractive, and pad synthesis',
    isKnownGood: false,
    browserNotes: 'Resource-heavy, may cause audio dropouts on slower systems',
    tags: ['additive', 'subtractive', 'pad', 'complex'],
  },
];

// ============================================================================
// Registry Functions
// ============================================================================

/**
 * Get all plugins from the catalog
 */
export function getKnownPlugins(): PluginCatalogEntry[] {
  return [...PLUGIN_CATALOG];
}

/**
 * Check if a plugin is in the known-good registry
 */
export function isKnownPlugin(wamId: string): boolean {
  return KNOWN_GOOD_PLUGINS.has(wamId);
}

/**
 * Get detailed info for a known-good plugin
 */
export function getKnownPluginInfo(wamId: string): KnownPluginInfo | null {
  return KNOWN_GOOD_PLUGINS.get(wamId) ?? null;
}

/**
 * Get catalog entry for a plugin
 */
export function getPluginInfo(wamId: string): PluginCatalogEntry | null {
  return PLUGIN_CATALOG.find((p) => p.id === wamId) ?? null;
}

/**
 * Get all known-good plugins only
 */
export function getKnownGoodPlugins(): PluginCatalogEntry[] {
  return PLUGIN_CATALOG.filter((p) => p.isKnownGood);
}

/**
 * Search plugins by query string
 * Searches name, description, vendor, and tags
 */
export function searchPlugins(
  query: string,
  category?: PluginCategory
): PluginCatalogEntry[] {
  const normalizedQuery = query.toLowerCase().trim();
  
  let results = PLUGIN_CATALOG;
  
  // Filter by category if specified
  if (category) {
    results = results.filter((p) => p.category === category);
  }
  
  // Return all if no query
  if (!normalizedQuery) {
    return results;
  }
  
  // Search across multiple fields
  return results.filter((plugin) => {
    const searchFields = [
      plugin.name,
      plugin.description,
      plugin.vendor,
      ...(plugin.tags ?? []),
    ];
    
    return searchFields.some(
      (field) => field?.toLowerCase().includes(normalizedQuery)
    );
  });
}

/**
 * Filter plugins by category
 */
export function filterPluginsByCategory(
  category: PluginCategory
): PluginCatalogEntry[] {
  return PLUGIN_CATALOG.filter((p) => p.category === category);
}

/**
 * Get all unique categories in the catalog
 */
export function getCategories(): PluginCategory[] {
  const categories = new Set(PLUGIN_CATALOG.map((p) => p.category));
  return Array.from(categories);
}

/**
 * Get plugins by vendor
 */
export function getPluginsByVendor(vendor: string): PluginCatalogEntry[] {
  const normalizedVendor = vendor.toLowerCase();
  return PLUGIN_CATALOG.filter(
    (p) => p.vendor.toLowerCase().includes(normalizedVendor)
  );
}

/**
 * Get plugins by tag
 */
export function getPluginsByTag(tag: string): PluginCatalogEntry[] {
  const normalizedTag = tag.toLowerCase();
  return PLUGIN_CATALOG.filter(
    (p) => p.tags?.some((t) => t.toLowerCase() === normalizedTag)
  );
}

// ============================================================================
// Plugin Registry Object (For Convenient Access)
// ============================================================================

/**
 * Plugin Registry API
 * Provides convenient access to all registry functions
 */
export const pluginRegistry = {
  getKnownPlugins,
  isKnownPlugin,
  getKnownPluginInfo,
  getPluginInfo,
  getKnownGoodPlugins,
  searchPlugins,
  filterPluginsByCategory,
  getCategories,
  getPluginsByVendor,
  getPluginsByTag,
  
  /** Direct access to the known-good plugins map */
  knownGoodPlugins: KNOWN_GOOD_PLUGINS,
  
  /** Direct access to the full catalog */
  catalog: PLUGIN_CATALOG,
} as const;
