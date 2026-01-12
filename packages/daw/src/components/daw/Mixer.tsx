/**
 * Mixer Component
 * Horizontal mixer panel with channel strips for each track
 */

import { memo, useCallback } from 'react';
import {
  ChevronUp,
  ChevronDown,
  Volume2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Track } from '../../stores/project.store';

export interface MixerProps {
  /** All tracks to display */
  tracks: Track[];
  /** Whether the mixer is expanded */
  isExpanded?: boolean;
  /** Callback when mixer expand state changes */
  onExpandedChange?: (expanded: boolean) => void;
  /** Callback when mute is toggled */
  onMuteToggle?: (trackId: string) => void;
  /** Callback when solo is toggled */
  onSoloToggle?: (trackId: string) => void;
  /** Callback when volume changes */
  onVolumeChange?: (trackId: string, volume: number) => void;
  /** Callback when pan changes */
  onPanChange?: (trackId: string, pan: number) => void;
}

/**
 * Channel strip colors based on track index
 */
const CHANNEL_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
];

interface ChannelStripProps {
  track: Track;
  index: number;
  isMaster?: boolean;
  onMuteToggle?: (trackId: string) => void;
  onSoloToggle?: (trackId: string) => void;
  onVolumeChange?: (trackId: string, volume: number) => void;
  onPanChange?: (trackId: string, pan: number) => void;
}

/**
 * Individual channel strip component
 */
const ChannelStrip = memo(function ChannelStrip({
  track,
  index,
  isMaster = false,
  onMuteToggle,
  onSoloToggle,
  onVolumeChange,
  onPanChange,
}: ChannelStripProps) {
  const channelColor = track.color ?? CHANNEL_COLORS[index % CHANNEL_COLORS.length];

  /**
   * Convert volume (0-1) to dB display
   */
  const volumeToDb = (volume: number): string => {
    if (volume === 0) return '-∞';
    const db = 20 * Math.log10(volume);
    return db.toFixed(1);
  };

  /**
   * Handle fader drag
   */
  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      onVolumeChange?.(track.id, value);
    },
    [track.id, onVolumeChange]
  );

  /**
   * Handle pan change
   */
  const handlePanChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      onPanChange?.(track.id, value);
    },
    [track.id, onPanChange]
  );

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 p-2 bg-daw-bg-secondary rounded',
        isMaster && 'bg-daw-bg-tertiary border-l-2 border-daw-accent-primary',
      )}
      style={{ width: 64 }}
    >
      {/* Track name */}
      <div className="w-full text-center">
        <span
          className={cn(
            'text-xs font-medium truncate block',
            isMaster ? 'text-daw-accent-primary' : 'text-daw-text-primary',
          )}
        >
          {isMaster ? 'Master' : track.name}
        </span>
      </div>

      {/* Color indicator */}
      {!isMaster && (
        <div
          className="w-full h-1 rounded-full"
          style={{ backgroundColor: channelColor }}
        />
      )}

      {/* Pan control */}
      {!isMaster && (
        <div className="flex flex-col items-center gap-0.5 w-full">
          <input
            type="range"
            min="-1"
            max="1"
            step="0.01"
            value={track.pan}
            onChange={handlePanChange}
            className="w-12 h-1 bg-daw-bg-tertiary rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 
              [&::-webkit-slider-thumb]:bg-daw-text-secondary [&::-webkit-slider-thumb]:rounded-full"
            aria-label="Pan"
          />
          <span className="text-[9px] text-daw-text-muted font-mono">
            {track.pan === 0 ? 'C' : track.pan > 0 ? `R${Math.round(track.pan * 100)}` : `L${Math.round(Math.abs(track.pan) * 100)}`}
          </span>
        </div>
      )}

      {/* Meter placeholder */}
      <div className="flex gap-0.5 h-24 items-end">
        <div className="w-2 bg-daw-bg-tertiary rounded-t overflow-hidden h-full flex flex-col-reverse">
          {/* L channel meter */}
          <div
            className="w-full bg-gradient-to-t from-green-500 via-yellow-400 to-red-500 transition-all"
            style={{ height: `${track.volume * 100}%` }}
          />
        </div>
        <div className="w-2 bg-daw-bg-tertiary rounded-t overflow-hidden h-full flex flex-col-reverse">
          {/* R channel meter */}
          <div
            className="w-full bg-gradient-to-t from-green-500 via-yellow-400 to-red-500 transition-all"
            style={{ height: `${track.volume * 100}%` }}
          />
        </div>
      </div>

      {/* Volume fader */}
      <div className="flex flex-col items-center gap-1">
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={track.volume}
          onChange={handleVolumeChange}
          className="w-2 h-20 bg-daw-bg-tertiary rounded-full appearance-none cursor-pointer
            [writing-mode:vertical-lr] [direction:rtl]
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-2 
            [&::-webkit-slider-thumb]:bg-daw-accent-primary [&::-webkit-slider-thumb]:rounded-sm"
          aria-label="Volume"
        />
        <span className="text-[10px] text-daw-text-muted font-mono">
          {volumeToDb(track.volume)}dB
        </span>
      </div>

      {/* Mute/Solo buttons */}
      {!isMaster && (
        <div className="flex gap-1">
          <button
            onClick={() => onMuteToggle?.(track.id)}
            className={cn(
              'w-6 h-5 rounded text-[10px] font-bold flex items-center justify-center transition-colors',
              track.isMuted
                ? 'bg-amber-500 text-black'
                : 'bg-daw-bg-tertiary text-daw-text-muted hover:text-daw-text-primary'
            )}
            title={track.isMuted ? 'Unmute' : 'Mute'}
            aria-pressed={track.isMuted}
          >
            M
          </button>
          <button
            onClick={() => onSoloToggle?.(track.id)}
            className={cn(
              'w-6 h-5 rounded text-[10px] font-bold flex items-center justify-center transition-colors',
              track.isSolo
                ? 'bg-yellow-400 text-black'
                : 'bg-daw-bg-tertiary text-daw-text-muted hover:text-daw-text-primary'
            )}
            title={track.isSolo ? 'Unsolo' : 'Solo'}
            aria-pressed={track.isSolo}
          >
            S
          </button>
        </div>
      )}
    </div>
  );
});

/**
 * Mixer panel component with horizontal layout of channel strips
 * 
 * @example
 * ```tsx
 * <Mixer
 *   tracks={tracks}
 *   isExpanded={showMixer}
 *   onExpandedChange={setShowMixer}
 *   onVolumeChange={(id, vol) => setTrackVolume(id, vol)}
 * />
 * ```
 */
export const Mixer = memo(function Mixer({
  tracks,
  isExpanded = true,
  onExpandedChange,
  onMuteToggle,
  onSoloToggle,
  onVolumeChange,
  onPanChange,
}: MixerProps) {
  /**
   * Toggle expanded state
   */
  const toggleExpanded = useCallback(() => {
    onExpandedChange?.(!isExpanded);
  }, [isExpanded, onExpandedChange]);

  // Create a virtual master track
  const masterTrack: Track = {
    id: 'master',
    name: 'Master',
    type: 'master',
    volume: 0.8,
    pan: 0,
    isMuted: false,
    isSolo: false,
    isArmed: false,
    clips: [],
    color: '#8b5cf6',
  };

  return (
    <div
      className={cn(
        'bg-daw-bg-primary border-t border-daw-border-primary transition-all duration-200',
        isExpanded ? 'h-64' : 'h-8',
      )}
    >
      {/* Header with expand toggle */}
      <div
        className="h-8 flex items-center justify-between px-3 border-b border-daw-border-secondary cursor-pointer hover:bg-daw-bg-secondary/50"
        onClick={toggleExpanded}
      >
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-daw-text-muted" />
          <span className="text-sm font-medium text-daw-text-primary">Mixer</span>
          <span className="text-xs text-daw-text-muted">
            ({tracks.length} channels)
          </span>
        </div>
        <button
          className="p-1 hover:bg-daw-bg-tertiary rounded transition-colors"
          aria-label={isExpanded ? 'Collapse mixer' : 'Expand mixer'}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-daw-text-muted" />
          ) : (
            <ChevronUp className="w-4 h-4 text-daw-text-muted" />
          )}
        </button>
      </div>

      {/* Channel strips */}
      {isExpanded && (
        <div className="h-[calc(100%-2rem)] overflow-x-auto overflow-y-hidden p-2">
          <div className="flex gap-2 h-full">
            {/* Track channels */}
            {tracks.map((track, index) => (
              <ChannelStrip
                key={track.id}
                track={track}
                index={index}
                onMuteToggle={onMuteToggle}
                onSoloToggle={onSoloToggle}
                onVolumeChange={onVolumeChange}
                onPanChange={onPanChange}
              />
            ))}

            {/* Separator */}
            {tracks.length > 0 && (
              <div className="w-px bg-daw-border-primary self-stretch mx-1" />
            )}

            {/* Master channel */}
            <ChannelStrip
              track={masterTrack}
              index={-1}
              isMaster
              onVolumeChange={onVolumeChange}
            />
          </div>
        </div>
      )}
    </div>
  );
});

export default Mixer;
