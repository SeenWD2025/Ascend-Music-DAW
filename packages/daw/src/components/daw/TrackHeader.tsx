/**
 * TrackHeader Component
 * Sidebar component with track controls: name, color, mute/solo/arm, volume, pan
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import {
  Volume2,
  VolumeX,
  Headphones,
  Mic,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Track } from '../../stores/project.store';

export interface TrackHeaderProps {
  /** Track data */
  track: Track;
  /** Track index in the list */
  index: number;
  /** Header width in pixels */
  width?: number;
  /** Header height in pixels */
  height?: number;
  /** Callback when track name changes */
  onNameChange?: (trackId: string, name: string) => void;
  /** Callback when track color changes */
  onColorChange?: (trackId: string, color: string) => void;
  /** Callback when mute is toggled */
  onMuteToggle?: (trackId: string) => void;
  /** Callback when solo is toggled */
  onSoloToggle?: (trackId: string) => void;
  /** Callback when arm is toggled */
  onArmToggle?: (trackId: string) => void;
  /** Callback when volume changes */
  onVolumeChange?: (trackId: string, volume: number) => void;
  /** Callback when pan changes */
  onPanChange?: (trackId: string, pan: number) => void;
}

// Preset colors for track color picker
const TRACK_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
];

/**
 * Track header sidebar with controls
 * 
 * @example
 * ```tsx
 * <TrackHeader
 *   track={track}
 *   index={0}
 *   onMuteToggle={(id) => toggleTrackMute(id)}
 *   onVolumeChange={(id, vol) => setTrackVolume(id, vol)}
 * />
 * ```
 */
export const TrackHeader = memo(function TrackHeader({
  track,
  index,
  width = 192,
  height = 80,
  onNameChange,
  onColorChange,
  onMuteToggle,
  onSoloToggle,
  onArmToggle,
  onVolumeChange,
  onPanChange,
}: TrackHeaderProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(track.name);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  const trackColor = track.color ?? TRACK_COLORS[index % TRACK_COLORS.length];

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  // Close color picker on outside click
  useEffect(() => {
    if (!showColorPicker) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColorPicker]);

  /**
   * Handle name edit submission
   */
  const handleNameSubmit = useCallback(() => {
    setIsEditingName(false);
    if (editedName.trim() && editedName !== track.name) {
      onNameChange?.(track.id, editedName.trim());
    } else {
      setEditedName(track.name);
    }
  }, [editedName, track.id, track.name, onNameChange]);

  /**
   * Handle name input key down
   */
  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleNameSubmit();
      } else if (e.key === 'Escape') {
        setEditedName(track.name);
        setIsEditingName(false);
      }
    },
    [handleNameSubmit, track.name]
  );

  /**
   * Convert volume (0-1) to dB display
   */
  const volumeToDb = (volume: number): string => {
    if (volume === 0) return '-∞';
    const db = 20 * Math.log10(volume);
    return db.toFixed(1);
  };

  /**
   * Handle volume slider change
   */
  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      onVolumeChange?.(track.id, value);
    },
    [track.id, onVolumeChange]
  );

  /**
   * Handle pan slider change
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
      className="bg-daw-bg-secondary border-r border-daw-border-primary flex flex-col"
      style={{ width, height }}
    >
      {/* Top row: Color indicator + Name */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-daw-border-secondary">
        {/* Color indicator and picker */}
        <div className="relative" ref={colorPickerRef}>
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="w-3 h-3 rounded-sm flex-shrink-0 hover:ring-2 hover:ring-white/30 transition-all"
            style={{ backgroundColor: trackColor }}
            aria-label="Change track color"
          />
          
          {/* Color picker dropdown */}
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 p-1.5 bg-daw-bg-tertiary rounded shadow-lg z-50 flex gap-1">
              {TRACK_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => {
                    onColorChange?.(track.id, color);
                    setShowColorPicker(false);
                  }}
                  className={cn(
                    'w-4 h-4 rounded-sm hover:scale-110 transition-transform',
                    color === trackColor && 'ring-2 ring-white'
                  )}
                  style={{ backgroundColor: color }}
                  aria-label={`Set color to ${color}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Track name (editable) */}
        {isEditingName ? (
          <input
            ref={nameInputRef}
            type="text"
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={handleNameKeyDown}
            className="flex-1 min-w-0 bg-daw-bg-tertiary text-sm text-daw-text-primary px-1 py-0.5 rounded outline-none focus:ring-1 focus:ring-daw-accent-primary"
          />
        ) : (
          <button
            onClick={() => setIsEditingName(true)}
            className="flex-1 min-w-0 text-left text-sm text-daw-text-primary truncate hover:text-daw-text-secondary transition-colors"
          >
            {track.name}
          </button>
        )}

        {/* Track type indicator */}
        <span className="text-[10px] text-daw-text-muted uppercase flex-shrink-0">
          {track.type}
        </span>
      </div>

      {/* Bottom row: Controls */}
      <div className="flex-1 flex items-center gap-1 px-2">
        {/* Mute/Solo/Arm buttons */}
        <div className="flex gap-0.5">
          {/* Mute button */}
          <button
            onClick={() => onMuteToggle?.(track.id)}
            className={cn(
              'w-6 h-6 rounded flex items-center justify-center transition-colors',
              track.isMuted
                ? 'bg-amber-500 text-black'
                : 'bg-daw-bg-tertiary text-daw-text-muted hover:text-daw-text-primary'
            )}
            title={track.isMuted ? 'Unmute' : 'Mute'}
            aria-pressed={track.isMuted}
          >
            {track.isMuted ? (
              <VolumeX className="w-3.5 h-3.5" />
            ) : (
              <span className="text-[10px] font-bold">M</span>
            )}
          </button>

          {/* Solo button */}
          <button
            onClick={() => onSoloToggle?.(track.id)}
            className={cn(
              'w-6 h-6 rounded flex items-center justify-center transition-colors',
              track.isSolo
                ? 'bg-yellow-400 text-black'
                : 'bg-daw-bg-tertiary text-daw-text-muted hover:text-daw-text-primary'
            )}
            title={track.isSolo ? 'Unsolo' : 'Solo'}
            aria-pressed={track.isSolo}
          >
            <Headphones className="w-3.5 h-3.5" />
          </button>

          {/* Arm (record) button */}
          {track.type === 'audio' && (
            <button
              onClick={() => onArmToggle?.(track.id)}
              className={cn(
                'w-6 h-6 rounded flex items-center justify-center transition-colors',
                track.isArmed
                  ? 'bg-red-500 text-white'
                  : 'bg-daw-bg-tertiary text-daw-text-muted hover:text-daw-text-primary'
              )}
              title={track.isArmed ? 'Disarm' : 'Arm for recording'}
              aria-pressed={track.isArmed}
            >
              <Mic className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Volume slider */}
        <div className="flex-1 flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <Volume2 className="w-3 h-3 text-daw-text-muted flex-shrink-0" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={track.volume}
              onChange={handleVolumeChange}
              className="flex-1 h-1 bg-daw-bg-tertiary rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 
                [&::-webkit-slider-thumb]:bg-daw-accent-primary [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:hover:bg-daw-accent-secondary"
              aria-label="Volume"
            />
            <span className="text-[10px] text-daw-text-muted w-8 text-right font-mono">
              {volumeToDb(track.volume)}
            </span>
          </div>

          {/* Pan slider */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-daw-text-muted w-3">L</span>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.01"
              value={track.pan}
              onChange={handlePanChange}
              className="flex-1 h-1 bg-daw-bg-tertiary rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 
                [&::-webkit-slider-thumb]:bg-daw-text-secondary [&::-webkit-slider-thumb]:rounded-full"
              aria-label="Pan"
            />
            <span className="text-[10px] text-daw-text-muted w-8 text-right font-mono">
              {track.pan === 0 ? 'C' : track.pan > 0 ? `R${Math.round(track.pan * 100)}` : `L${Math.round(Math.abs(track.pan) * 100)}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default TrackHeader;
