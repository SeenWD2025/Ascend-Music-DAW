import { Play, Pause, Square, SkipBack } from 'lucide-react';
import { useTransportStore } from '../../stores/transport.store';

/**
 * Format seconds to MM:SS display
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Transport controls component with Play/Pause/Stop buttons,
 * position display, BPM display, and time signature
 */
export function TransportBar() {
  const {
    isPlaying,
    position,
    bpm,
    timeSignature,
    play,
    pause,
    stop,
    seek,
  } = useTransportStore();

  const handlePlayPause = () => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  };

  const handleStop = () => {
    stop();
  };

  const handleRewind = () => {
    seek(0);
  };

  return (
    <div className="h-14 bg-daw-bg-secondary border-b border-daw-border-primary flex items-center justify-between px-4">
      {/* Left section: Transport controls */}
      <div className="flex items-center gap-2">
        {/* Rewind button */}
        <button
          onClick={handleRewind}
          className="p-2 rounded-md hover:bg-daw-bg-tertiary text-daw-text-secondary hover:text-daw-text-primary transition-colors"
          aria-label="Rewind to start"
        >
          <SkipBack size={18} />
        </button>

        {/* Play/Pause button */}
        <button
          onClick={handlePlayPause}
          className="p-2 rounded-md bg-daw-accent-primary hover:bg-daw-accent-secondary text-white transition-colors"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>

        {/* Stop button */}
        <button
          onClick={handleStop}
          className="p-2 rounded-md hover:bg-daw-bg-tertiary text-daw-text-secondary hover:text-daw-text-primary transition-colors"
          aria-label="Stop"
        >
          <Square size={18} />
        </button>
      </div>

      {/* Center section: Position display */}
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-center">
          <span className="text-xs text-daw-text-muted uppercase tracking-wider">Position</span>
          <span className="font-mono text-xl text-daw-text-primary tabular-nums">
            {formatTime(position)}
          </span>
        </div>
      </div>

      {/* Right section: BPM and Time Signature */}
      <div className="flex items-center gap-6">
        {/* BPM display */}
        <div className="flex flex-col items-center">
          <span className="text-xs text-daw-text-muted uppercase tracking-wider">BPM</span>
          <span className="font-mono text-lg text-daw-text-primary tabular-nums">
            {bpm}
          </span>
        </div>

        {/* Time signature display */}
        <div className="flex flex-col items-center">
          <span className="text-xs text-daw-text-muted uppercase tracking-wider">Time Sig</span>
          <span className="font-mono text-lg text-daw-text-primary">
            {timeSignature.numerator}/{timeSignature.denominator}
          </span>
        </div>
      </div>
    </div>
  );
}

export default TransportBar;
