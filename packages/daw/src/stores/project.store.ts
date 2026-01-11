import { create } from 'zustand';

export interface AudioClip {
  id: string;
  name: string;
  startTime: number; // in seconds
  duration: number; // in seconds
  sourceUrl?: string;
  color?: string;
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
    })),

  // Loading states
  setLoading: (isLoading) => set({ isLoading }),
  setSaving: (isSaving) => set({ isSaving }),
  setError: (error) => set({ error }),
}));
