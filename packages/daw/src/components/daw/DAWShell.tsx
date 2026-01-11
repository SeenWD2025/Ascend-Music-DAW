import { TransportBar } from './TransportBar';
import { Timeline } from './Timeline';
import { AudioContextOverlay } from './AudioContextOverlay';
import { MobileBlocker } from './MobileBlocker';

/**
 * Main DAW layout shell component
 * Provides the primary structure: TransportBar at top, Timeline in center,
 * with placeholder areas for future panels (mixer, plugins, etc.)
 */
export function DAWShell() {
  return (
    <>
      {/* Mobile blocker overlay */}
      <MobileBlocker />

      {/* Audio context overlay */}
      <AudioContextOverlay />

      {/* Main DAW layout */}
      <div className="h-screen flex flex-col bg-daw-bg-primary text-daw-text-primary overflow-hidden">
        {/* Transport bar at top */}
        <TransportBar />

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left panel placeholder (e.g., browser, plugins) */}
          <aside className="hidden lg:block w-64 bg-daw-bg-secondary border-r border-daw-border-primary">
            <div className="p-4">
              <h2 className="text-sm font-semibold text-daw-text-muted uppercase tracking-wider mb-4">
                Browser
              </h2>
              <p className="text-sm text-daw-text-muted">
                File browser coming soon...
              </p>
            </div>
          </aside>

          {/* Center: Timeline */}
          <main className="flex-1 flex flex-col overflow-hidden">
            <Timeline />
          </main>

          {/* Right panel placeholder (e.g., inspector, properties) */}
          <aside className="hidden xl:block w-72 bg-daw-bg-secondary border-l border-daw-border-primary">
            <div className="p-4">
              <h2 className="text-sm font-semibold text-daw-text-muted uppercase tracking-wider mb-4">
                Inspector
              </h2>
              <p className="text-sm text-daw-text-muted">
                Select a track or clip to view properties...
              </p>
            </div>
          </aside>
        </div>

        {/* Bottom panel placeholder (e.g., mixer, piano roll) */}
        <div className="h-48 bg-daw-bg-secondary border-t border-daw-border-primary hidden md:block">
          <div className="p-4">
            <h2 className="text-sm font-semibold text-daw-text-muted uppercase tracking-wider mb-4">
              Mixer
            </h2>
            <p className="text-sm text-daw-text-muted">
              Mixer panel coming soon...
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default DAWShell;
