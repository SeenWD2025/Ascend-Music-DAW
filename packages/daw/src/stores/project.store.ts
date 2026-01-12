import { create } from 'zustand';

export interface AudioClip {
  id: string;
  name: string;
  startTime: number; // in seconds
  duration: number; // in seconds
  sourceUrl?: string;
  color?: string;
  /** Offset into the source audio for trimmed clips */
  sourceOffset?: number;
  /** Original duration before trimming */
  originalDuration?: number;
}

export interface Track {
  id: string;
  name: string;
  type: 'audio' | 'midi' | 'master';
  volume: number; // 0-1
  pan: number; // -1 to 1
  isMuted: boolean;
  isSolo: boolean;
  isArmed: boolean;
  clips: AudioClip[];
  color?: string;
}

export interface Project {
  id: string;
  name: string;
  bpm: number;
  timeSignature: { numerator: number; denominator: number };
  createdAt: string;
  updatedAt: string;
}

interface ProjectState {
  currentProject: Project | null;
  tracks: Track[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  
  // Selection state
  selectedClipIds: string[];

  // Project actions
  setProject: (project: Project | null) => void;
  updateProject: (updates: Partial<Project>) => void;
  clearProject: () => void;

  // Track CRUD actions
  addTrack: (track: Track) => void;
  updateTrack: (trackId: string, updates: Partial<Track>) => void;
  removeTrack: (trackId: string) => void;
  reorderTracks: (fromIndex: number, toIndex: number) => void;

  // Track audio controls
  setTrackVolume: (trackId: string, volume: number) => void;
  setTrackPan: (trackId: string, pan: number) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  toggleTrackArm: (trackId: string) => void;

  // Clip actions
  addClip: (trackId: string, clip: AudioClip) => void;
  updateClip: (trackId: string, clipId: string, updates: Partial<AudioClip>) => void;
  removeClip: (trackId: string, clipId: string) => void;
  
  // Clip movement and selection
  moveClip: (clipId: string, newStartTime: number, newTrackId?: string) => void;
  selectClip: (clipId: string, addToSelection?: boolean) => void;
  deselectAll: () => void;
  deleteSelectedClips: () => void;

  // Loading states
  setLoading: (isLoading: boolean) => void;
  setSaving: (isSaving: boolean) => void;
  setError: (error: string | null) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentProject: null,
  tracks: [],
  isLoading: false,
  isSaving: false,
  error: null,
  selectedClipIds: [],

  // Project actions
  setProject: (project) => set({ currentProject: project, error: null }),
  updateProject: (updates) =>
    set((state) => ({
      currentProject: state.currentProject
        ? { ...state.currentProject, ...updates, updatedAt: new Date().toISOString() }
        : null,
    })),
  clearProject: () => set({ currentProject: null, tracks: [], error: null }),

  // Track CRUD actions
  addTrack: (track) => set((state) => ({ tracks: [...state.tracks, track] })),
  updateTrack: (trackId, updates) =>
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId ? { ...track, ...updates } : track
      ),
    })),
  removeTrack: (trackId) =>
    set((state) => ({
      tracks: state.tracks.filter((track) => track.id !== trackId),
    })),
  reorderTracks: (fromIndex, toIndex) =>
    set((state) => {
      const newTracks = [...state.tracks];
      const [removed] = newTracks.splice(fromIndex, 1);
      newTracks.splice(toIndex, 0, removed);
      return { tracks: newTracks };
    }),

  // Track audio controls
  setTrackVolume: (trackId, volume) =>
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId ? { ...track, volume: Math.max(0, Math.min(1, volume)) } : track
      ),
    })),
  setTrackPan: (trackId, pan) =>
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId ? { ...track, pan: Math.max(-1, Math.min(1, pan)) } : track
      ),
    })),
  toggleTrackMute: (trackId) =>
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId ? { ...track, isMuted: !track.isMuted } : track
      ),
    })),
  toggleTrackSolo: (trackId) =>
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId ? { ...track, isSolo: !track.isSolo } : track
      ),
    })),
  toggleTrackArm: (trackId) =>
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId ? { ...track, isArmed: !track.isArmed } : track
      ),
    })),

  // Clip actions
  addClip: (trackId, clip) =>
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId ? { ...track, clips: [...track.clips, clip] } : track
      ),
    })),
  updateClip: (trackId, clipId, updates) =>
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId
          ? {
              ...track,
              clips: track.clips.map((clip) =>
                clip.id === clipId ? { ...clip, ...updates } : clip
              ),
            }
          : track
      ),
    })),
  removeClip: (trackId, clipId) =>
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId
          ? { ...track, clips: track.clips.filter((clip) => clip.id !== clipId) }
          : track
      ),
      // Also remove from selection if selected
      selectedClipIds: state.selectedClipIds.filter((id) => id !== clipId),
    })),

  // Clip movement and selection
  moveClip: (clipId, newStartTime, newTrackId) =>
    set((state) => {
      // Find the clip and its current track
      let clipToMove: AudioClip | null = null;
      let sourceTrackId: string | null = null;
      
      for (const track of state.tracks) {
        const clip = track.clips.find((c) => c.id === clipId);
        if (clip) {
          clipToMove = clip;
          sourceTrackId = track.id;
          break;
        }
      }
      
      if (!clipToMove || !sourceTrackId) return state;
      
      const targetTrackId = newTrackId ?? sourceTrackId;
      const updatedClip = { ...clipToMove, startTime: Math.max(0, newStartTime) };
      
      if (sourceTrackId === targetTrackId) {
        // Same track - just update position
        return {
          tracks: state.tracks.map((track) =>
            track.id === sourceTrackId
              ? {
                  ...track,
                  clips: track.clips.map((c) =>
                    c.id === clipId ? updatedClip : c
                  ),
                }
              : track
          ),
        };
      } else {
        // Moving to different track
        return {
          tracks: state.tracks.map((track) => {
            if (track.id === sourceTrackId) {
              // Remove from source
              return { ...track, clips: track.clips.filter((c) => c.id !== clipId) };
            }
            if (track.id === targetTrackId) {
              // Add to target
              return { ...track, clips: [...track.clips, updatedClip] };
            }
            return track;
          }),
        };
      }
    }),

  selectClip: (clipId, addToSelection = false) =>
    set((state) => {
      if (addToSelection) {
        // Toggle selection when shift is held
        if (state.selectedClipIds.includes(clipId)) {
          return { selectedClipIds: state.selectedClipIds.filter((id) => id !== clipId) };
        }
        return { selectedClipIds: [...state.selectedClipIds, clipId] };
      }
      // Single selection
      return { selectedClipIds: [clipId] };
    }),

  deselectAll: () => set({ selectedClipIds: [] }),

  deleteSelectedClips: () =>
    set((state) => {
      const selectedIds = new Set(state.selectedClipIds);
      if (selectedIds.size === 0) return state;
      
      // PostHog tracking placeholder
      // posthog.capture('daw_clips_deleted', { count: selectedIds.size });
      
      return {
        tracks: state.tracks.map((track) => ({
          ...track,
          clips: track.clips.filter((clip) => !selectedIds.has(clip.id)),
        })),
        selectedClipIds: [],
      };
    }),

  // Loading states
  setLoading: (isLoading) => set({ isLoading }),
  setSaving: (isSaving) => set({ isSaving }),
  setError: (error) => set({ error }),
}));
