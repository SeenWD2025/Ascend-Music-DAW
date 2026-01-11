import { create } from 'zustand';

interface TransportState {
  isPlaying: boolean;
  isPaused: boolean;
  isRecording: boolean;
  position: number; // in seconds
  bpm: number;
  timeSignature: { numerator: number; denominator: number };
  
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (position: number) => void;
  setBpm: (bpm: number) => void;
  setTimeSignature: (numerator: number, denominator: number) => void;
}

export const useTransportStore = create<TransportState>((set) => ({
  isPlaying: false,
  isPaused: false,
  isRecording: false,
  position: 0,
  bpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  
  play: () => set({ isPlaying: true, isPaused: false }),
  pause: () => set({ isPlaying: false, isPaused: true }),
  stop: () => set({ isPlaying: false, isPaused: false, position: 0 }),
  seek: (position) => set({ position }),
  setBpm: (bpm) => set({ bpm }),
  setTimeSignature: (numerator, denominator) => set({ timeSignature: { numerator, denominator } }),
}));
