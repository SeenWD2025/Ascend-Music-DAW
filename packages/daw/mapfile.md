---
path: packages/daw
owner: A06 (Frontend/UI Specialist)
status: active
summary: React-based Digital Audio Workstation (DAW) frontend application with Tone.js audio engine, multi-track timeline, waveform rendering, mixer controls, clip drag/drop editing, WAM plugin system, and Google Drive integration for audio storage.
last_updated: 2026-01-11
key_artifacts:
  - src/lib/audio/engine.ts: Tone.js wrapper with transport control and position tracking
  - src/lib/audio/latency.ts: Audio latency measurement and glitch detection
  - src/lib/audio/waveform.ts: Waveform decoding, extraction, and canvas rendering
  - src/lib/drive/upload.ts: Resumable upload utilities for Google Drive
  - src/lib/drive/cache.ts: LRU audio buffer cache for scrub/playback optimization
  - src/lib/drive/fetcher.ts: Audio fetcher with caching and retry logic
  - src/lib/wam/loader.ts: WAM plugin loader with timeout and retry logic
  - src/stores/transport.store.ts: Zustand store for transport state (play/pause/stop/seek/bpm)
  - src/stores/project.store.ts: Zustand store for project, tracks, clips, and selection state
  - src/stores/plugin.store.ts: Zustand store for WAM plugin lifecycle and state
  - src/components/daw/TransportBar.tsx: Transport controls UI
  - src/components/daw/Timeline.tsx: Enhanced timeline with multi-track editing, zoom, snap-to-grid
  - src/components/daw/Track.tsx: Track lane with header and clips
  - src/components/daw/TrackHeader.tsx: Track header with name, color, mute/solo/arm, volume/pan
  - src/components/daw/Clip.tsx: Clip component with waveform, selection, drag handles
  - src/components/daw/WaveformDisplay.tsx: Canvas-based waveform visualization
  - src/components/daw/Mixer.tsx: Horizontal mixer panel with channel strips
  - src/components/daw/DAWShell.tsx: Main DAW layout component
  - src/components/daw/UploadDropzone.tsx: Drag-and-drop upload overlay for audio files
  - src/components/daw/FileImportDialog.tsx: Dialog for browsing and importing Drive files
  - src/components/daw/PluginBrowser.tsx: Plugin catalog browser with search and category filters
  - src/components/daw/PluginSlot.tsx: Single plugin slot with bypass, delete, drag handle
  - src/components/daw/PluginParameters.tsx: Generic parameter controls with throttled updates
  - src/components/daw/EffectsChain.tsx: Drag-and-drop effects chain for track plugins
  - src/components/daw/PluginLoadError.tsx: Graceful error UI with retry/remove actions
  - src/lib/realtime/plugin-sync.ts: Plugin parameter sync with throttling and locking
  - src/hooks/useAudioContext.ts: Audio context resume handling hook
  - src/hooks/useClipDrag.ts: Clip drag hook with snap-to-grid quantization
  - src/hooks/useAudioBuffer.ts: Hook for loading audio buffers with caching
processes:
  - Run `npm install` then `npm run dev` to start development
  - Audio context requires user gesture to resume (handled by AudioContextOverlay)
  - Desktop-only: MobileBlocker shown on small screens
  - Keyboard shortcuts: Delete to remove clips, Escape to deselect, Ctrl+A to select all
  - Drag audio files onto DAW to upload and create clips
  - WAM plugins load from webaudiomodules.com CDN with 10s timeout and 2 retries
dependencies:
  - packages/api: Backend API for project CRUD, Drive proxy, and realtime collaboration
  - packages/shared: Shared types
  - docs/DAW_REALTIME_CONTRACT_V1.md: Event envelope for collaboration
  - docs/DRIVE_UPLOAD_STRATEGY.md: Resumable upload patterns
  - docs/WAM_COMPATIBILITY_MATRIX.md: Known-good WAM plugins
risks:
  - Browser audio latency varies; baseline metrics needed per browser
  - Safari AudioWorklet limitations for WAM plugins
  - Mobile browsers not supported for v1
  - Large audio files may hit browser memory limits
  - WAM plugin CDN availability affects plugin loading
todo:
  - [x] Wire up API client for project persistence
  - [x] Implement WebSocket client for realtime collaboration
  - [x] Integrate WAM plugin loader
  - [x] Create plugin browser and effects chain UI
  - [ ] Add audio playback for clips (Sprint 2)
  - [ ] Add undo/redo for clip operations
  - [x] Implement audio waveform prefetching for visible timeline clips
  - [ ] Connect effects chain to audio routing
tags: [daw, frontend, react, tone.js, audio, drive, plugins, wam, sprint-2]
---

# packages/daw - DAW Frontend Package

## Purpose
React-based Digital Audio Workstation (DAW) frontend application with Tone.js audio engine integration.

## Directory Structure
```
packages/daw/
├── index.html              # HTML entry point
├── package.json            # Package dependencies and scripts
├── vite.config.ts          # Vite bundler configuration
├── tailwind.config.js      # TailwindCSS theme configuration
├── postcss.config.js       # PostCSS configuration
├── tsconfig.json           # TypeScript configuration
├── tsconfig.node.json      # TypeScript config for Node files
└── src/
    ├── main.tsx            # React entry point
    ├── App.tsx             # Router setup
    ├── index.css           # Global styles with Tailwind
    ├── components/daw/
    │   ├── DAWShell.tsx         # Main DAW layout container
    │   ├── TransportBar.tsx     # Play/pause/stop, BPM, position
    │   ├── Timeline.tsx         # Multi-track timeline with zoom/snap
    │   ├── Track.tsx            # Track lane container
    │   ├── TrackHeader.tsx      # Name, color, mute/solo/arm, gain/pan
    │   ├── Clip.tsx             # Clip with waveform, drag handles
    │   ├── WaveformDisplay.tsx  # Canvas waveform visualization
    │   ├── Mixer.tsx            # Horizontal mixer panel
    │   ├── CollaboratorCursors.tsx  # Realtime cursor overlays
    │   ├── UploadDropzone.tsx   # Drag-and-drop audio upload
    │   ├── FileImportDialog.tsx # Drive file browser dialog
    │   ├── PluginBrowser.tsx    # Plugin catalog browser
    │   ├── PluginSlot.tsx       # Single plugin slot in chain
    │   ├── PluginParameters.tsx # Generic parameter controls
    │   ├── EffectsChain.tsx     # Drag-and-drop effects chain
    │   └── PluginLoadError.tsx  # Error UI for failed plugins
    ├── stores/
    │   ├── transport.store.ts   # Transport state (play/pause/bpm/seek)
    │   ├── project.store.ts     # Project/tracks/clips/selection
    │   ├── collaboration.store.ts # Presence, cursors, locks
    │   └── plugin.store.ts      # WAM plugin state and lifecycle
    ├── lib/
    │   ├── audio/
    │   │   ├── engine.ts        # Tone.js wrapper, transport control
    │   │   ├── latency.ts       # Latency measurement, glitch detect
    │   │   └── waveform.ts      # Waveform decode, extract, render
    │   ├── drive/
    │   │   ├── upload.ts        # Resumable upload to Drive
    │   │   ├── cache.ts         # LRU audio buffer cache
    │   │   └── fetcher.ts       # Audio fetch with retry/cache
    │   ├── wam/
    │   │   ├── index.ts         # WAM exports
    │   │   └── loader.ts        # WAM plugin loader with retry
    │   └── realtime/
    │       └── client.ts        # WebSocket client for collaboration
    ├── hooks/
    │   ├── useAudioContext.ts   # Audio context resume handling
    │   ├── useClipDrag.ts       # Clip drag with snap-to-grid
    │   └── useAudioBuffer.ts    # Audio buffer loading with cache
    └── pages/                   # Route pages
```

## Key Technologies
- **React 18**: UI framework
- **Vite**: Build tool and dev server
- **Tone.js**: Web Audio API wrapper for audio synthesis and playback
- **Zustand**: Lightweight state management
- **TailwindCSS**: Utility-first CSS framework
- **TypeScript**: Type safety

## Scripts
- `npm run dev` - Start development server (port 5173)
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Design System
Uses custom DAW color palette defined in `tailwind.config.js`:
- **Background**: Dark theme with primary/secondary/tertiary layers
- **Accent**: Purple/indigo tones for interactive elements
- **Text**: Light colors with primary/secondary/muted variants

## Component Utilities
Predefined CSS classes for DAW components:
- `.daw-panel` - Container panels
- `.daw-button` - Primary action buttons
- `.daw-input` - Form inputs

## Dependencies on Other Packages
- `@ascend/shared` - Shared types and utilities (planned)
