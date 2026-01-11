import { Monitor, Smartphone } from 'lucide-react';

/**
 * Component shown on mobile/small screens
 * DAW functionality requires a desktop browser for proper usage
 */
export function MobileBlocker() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-daw-bg-primary p-6 md:hidden">
      <div className="text-center max-w-sm">
        {/* Icon illustration */}
        <div className="mb-8 flex items-center justify-center gap-4">
          <div className="relative">
            <Smartphone className="w-12 h-12 text-daw-text-muted" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-0.5 bg-daw-accent-error rotate-45 rounded-full" />
            </div>
          </div>
          <div className="text-daw-text-muted text-2xl">→</div>
          <Monitor className="w-16 h-16 text-daw-accent-primary" />
        </div>

        {/* Message */}
        <h1 className="text-2xl font-bold text-daw-text-primary mb-4">
          Desktop Required
        </h1>
        <p className="text-daw-text-secondary mb-6 leading-relaxed">
          Ascend DAW requires a desktop browser for the best experience. 
          The timeline, mixer, and audio processing features need a larger screen.
        </p>

        {/* Suggestions */}
        <div className="bg-daw-bg-secondary rounded-lg p-4 text-left">
          <h2 className="text-sm font-semibold text-daw-text-muted uppercase tracking-wider mb-3">
            Recommended
          </h2>
          <ul className="space-y-2 text-sm text-daw-text-secondary">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-daw-accent-success" />
              Chrome, Firefox, or Edge on desktop
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-daw-accent-success" />
              Screen width of 1024px or larger
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-daw-accent-success" />
              Audio interface for best latency
            </li>
          </ul>
        </div>

        {/* Ascend branding */}
        <p className="mt-8 text-sm text-daw-text-muted">
          <span className="font-semibold text-daw-accent-primary">Ascend</span>{' '}
          Digital Audio Workstation
        </p>
      </div>
    </div>
  );
}

export default MobileBlocker;
