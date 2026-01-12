/**
 * Plugin Browser Component
 * Catalog browser for adding plugins to tracks
 */

import { memo, useState, useCallback, useMemo } from 'react';
import { Search, X, Music2, Sparkles, BarChart3, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { usePluginStore } from '../../stores/plugin.store';
import {
  filterPluginsByCategory,
  searchPlugins,
  type PluginInfo,
} from '../../lib/wam';

// ============================================================================
// Types
// ============================================================================

export interface PluginBrowserProps {
  /** Audio context for loading plugins */
  audioContext: AudioContext | null;
  /** Additional CSS classes */
  className?: string;
}

type CategoryFilter = 'all' | 'synth' | 'effect' | 'analyzer';

// ============================================================================
// Sub-components
// ============================================================================

interface CategoryButtonProps {
  category: CategoryFilter;
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}

const CategoryButton = memo(function CategoryButton({
  label,
  icon,
  isActive,
  onClick,
}: CategoryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors',
        isActive
          ? 'bg-daw-accent-primary text-white'
          : 'bg-daw-bg-tertiary text-daw-text-secondary hover:bg-daw-bg-secondary hover:text-daw-text-primary'
      )}
    >
      {icon}
      {label}
    </button>
  );
});

interface PluginCardProps {
  plugin: PluginInfo;
  isLoading: boolean;
  onClick: () => void;
}

const PluginCard = memo(function PluginCard({
  plugin,
  isLoading,
  onClick,
}: PluginCardProps) {
  const getCategoryIcon = (category: PluginInfo['category']) => {
    switch (category) {
      case 'synth':
        return <Music2 className="w-5 h-5" />;
      case 'effect':
        return <Sparkles className="w-5 h-5" />;
      case 'analyzer':
        return <BarChart3 className="w-5 h-5" />;
    }
  };

  const getCategoryColor = (category: PluginInfo['category']) => {
    switch (category) {
      case 'synth':
        return 'text-purple-400';
      case 'effect':
        return 'text-blue-400';
      case 'analyzer':
        return 'text-green-400';
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className={cn(
        'flex flex-col items-center gap-2 p-4 rounded-lg bg-daw-bg-secondary',
        'border border-daw-border-secondary hover:border-daw-accent-primary',
        'transition-all hover:bg-daw-bg-tertiary',
        'focus:outline-none focus:ring-2 focus:ring-daw-accent-primary focus:ring-offset-2 focus:ring-offset-daw-bg-primary',
        isLoading && 'opacity-50 cursor-not-allowed'
      )}
      aria-label={`Add ${plugin.name} plugin`}
    >
      <div
        className={cn(
          'w-12 h-12 rounded-lg bg-daw-bg-tertiary flex items-center justify-center',
          getCategoryColor(plugin.category)
        )}
      >
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          getCategoryIcon(plugin.category)
        )}
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-daw-text-primary truncate max-w-[120px]">
          {plugin.name}
        </p>
        <p className="text-xs text-daw-text-muted capitalize">{plugin.category}</p>
      </div>
    </button>
  );
});

// ============================================================================
// Main Component
// ============================================================================

export const PluginBrowser = memo(function PluginBrowser({
  audioContext,
  className,
}: PluginBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const {
    pluginCatalog,
    loadingPlugins,
    isBrowserOpen,
    targetTrackId,
    closeBrowser,
    loadPluginToTrack,
  } = usePluginStore();

  // Filter plugins based on search and category
  const filteredPlugins = useMemo(() => {
    let plugins = pluginCatalog;
    
    if (categoryFilter !== 'all') {
      plugins = filterPluginsByCategory(plugins, categoryFilter);
    }
    
    if (searchQuery) {
      plugins = searchPlugins(plugins, searchQuery);
    }
    
    return plugins;
  }, [pluginCatalog, categoryFilter, searchQuery]);

  const handleAddPlugin = useCallback(
    async (plugin: PluginInfo) => {
      if (!audioContext || !targetTrackId) {
        console.warn('[PluginBrowser] Cannot add plugin: missing audio context or target track');
        return;
      }

      await loadPluginToTrack(targetTrackId, plugin.id, audioContext);
      closeBrowser();
    },
    [audioContext, targetTrackId, loadPluginToTrack, closeBrowser]
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    []
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  if (!isBrowserOpen) {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm',
        className
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Plugin Browser"
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] bg-daw-bg-primary rounded-lg shadow-2xl border border-daw-border-primary flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border-secondary">
          <h2 className="text-lg font-semibold text-daw-text-primary">
            Add Plugin
          </h2>
          <button
            type="button"
            onClick={closeBrowser}
            className="p-1 rounded hover:bg-daw-bg-secondary text-daw-text-muted hover:text-daw-text-primary transition-colors"
            aria-label="Close plugin browser"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search and Filters */}
        <div className="px-4 py-3 space-y-3 border-b border-daw-border-secondary">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-daw-text-muted" />
            <input
              type="text"
              placeholder="Search plugins..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full pl-9 pr-8 py-2 bg-daw-bg-secondary border border-daw-border-secondary rounded text-sm text-daw-text-primary placeholder-daw-text-muted focus:outline-none focus:border-daw-accent-primary"
              aria-label="Search plugins"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-daw-bg-tertiary text-daw-text-muted"
                aria-label="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Category Filters */}
          <div className="flex items-center gap-2">
            <CategoryButton
              category="all"
              label="All"
              icon={null}
              isActive={categoryFilter === 'all'}
              onClick={() => setCategoryFilter('all')}
            />
            <CategoryButton
              category="synth"
              label="Synths"
              icon={<Music2 className="w-4 h-4" />}
              isActive={categoryFilter === 'synth'}
              onClick={() => setCategoryFilter('synth')}
            />
            <CategoryButton
              category="effect"
              label="Effects"
              icon={<Sparkles className="w-4 h-4" />}
              isActive={categoryFilter === 'effect'}
              onClick={() => setCategoryFilter('effect')}
            />
            <CategoryButton
              category="analyzer"
              label="Analyzers"
              icon={<BarChart3 className="w-4 h-4" />}
              isActive={categoryFilter === 'analyzer'}
              onClick={() => setCategoryFilter('analyzer')}
            />
          </div>
        </div>

        {/* Plugin Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredPlugins.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <Search className="w-12 h-12 text-daw-text-muted mb-4" />
              <p className="text-daw-text-secondary">No plugins found</p>
              <p className="text-sm text-daw-text-muted mt-1">
                Try adjusting your search or filter
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {filteredPlugins.map((plugin) => (
                <PluginCard
                  key={plugin.id}
                  plugin={plugin}
                  isLoading={loadingPlugins.size > 0}
                  onClick={() => handleAddPlugin(plugin)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-daw-border-secondary bg-daw-bg-secondary">
          <p className="text-xs text-daw-text-muted text-center">
            {filteredPlugins.length} plugin{filteredPlugins.length !== 1 ? 's' : ''} available
          </p>
        </div>
      </div>
    </div>
  );
});
