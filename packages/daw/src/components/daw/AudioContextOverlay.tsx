import { Volume2 } from 'lucide-react';
import { useAudioContext } from '../../hooks/useAudioContext';

/**
 * Overlay shown when audio context is suspended
 * Displays a "Click to enable audio" message with resume button
 * Required due to browser autoplay policies
 */
export function AudioContextOverlay() {
  const { state, resume, isReady } = useAudioContext();

  // Don't show overlay if audio is already running
  if (isReady) {
    return null;
  }

  // Don't show overlay if context is closed (error state)
  if (state === 'closed') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-daw-bg-primary/95 backdrop-blur-sm">
        <div className="text-center p-8 max-w-md">
          <div className="mb-6 inline-flex items-center justify-center w-16 h-16 rounded-full bg-daw-accent-error/20">
            <Volume2 className="w-8 h-8 text-daw-accent-error" />
          </div>
          <h2 className="text-2xl font-bold text-daw-text-primary mb-3">
            Audio Unavailable
          </h2>
          <p className="text-daw-text-secondary mb-6">
            Unable to initialize audio. Please refresh the page or try a different browser.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-daw-accent-primary hover:bg-daw-accent-secondary text-white font-medium rounded-lg transition-colors"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  // Show enable audio overlay for suspended state
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-daw-bg-primary/95 backdrop-blur-sm">
      <div className="text-center p-8 max-w-md">
        <div className="mb-6 inline-flex items-center justify-center w-16 h-16 rounded-full bg-daw-accent-primary/20 animate-pulse">
          <Volume2 className="w-8 h-8 text-daw-accent-primary" />
        </div>
        <h2 className="text-2xl font-bold text-daw-text-primary mb-3">
          Enable Audio
        </h2>
        <p className="text-daw-text-secondary mb-6">
          Click the button below to enable audio playback. 
          This is required by your browser's autoplay policy.
        </p>
        <button
          onClick={resume}
          className="px-8 py-4 bg-daw-accent-primary hover:bg-daw-accent-secondary text-white font-medium rounded-lg transition-colors text-lg shadow-lg shadow-daw-accent-primary/25 hover:shadow-daw-accent-secondary/25"
        >
          Click to Enable Audio
        </button>
        <p className="mt-4 text-sm text-daw-text-muted">
          You only need to do this once per session
        </p>
      </div>
    </div>
  );
}

export default AudioContextOverlay;
