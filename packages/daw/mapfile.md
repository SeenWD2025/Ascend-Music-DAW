---
path: packages/daw
owner: A06 (Frontend/UI Specialist)
status: active
summary: React-based Digital Audio Workstation (DAW) frontend application with Tone.js audio engine, transport controls, and timeline scaffold.
last_updated: 2026-01-15
key_artifacts:
  - src/lib/audio/engine.ts: Tone.js wrapper with transport control and position tracking
  - src/lib/audio/latency.ts: Audio latency measurement and glitch detection
  - src/stores/transport.store.ts: Zustand store for transport state (play/pause/stop/seek/bpm)
  - src/stores/project.store.ts: Zustand store for project and track state
  - src/components/daw/TransportBar.tsx: Transport controls UI
  - src/components/daw/Timeline.tsx: Timeline and track lanes scaffold
  - src/components/daw/DAWShell.tsx: Main DAW layout component
  - src/hooks/useAudioContext.ts: Audio context resume handling hook
processes:
  - Run `npm install` then `npm run dev` to start development
  - Audio context requires user gesture to resume (handled by AudioContextOverlay)
  - Desktop-only: MobileBlocker shown on small screens
dependencies:
  - packages/api: Backend API for project CRUD and realtime collaboration
  - packages/shared: Shared types
  - docs/DAW_REALTIME_CONTRACT_V1.md: Event envelope for collaboration
risks:
  - Browser audio latency varies; baseline metrics needed per browser
  - Safari AudioWorklet limitations for WAM plugins
  - Mobile browsers not supported for v1
todo:
  - Wire up API client for project persistence
  - Implement WebSocket client for realtime collaboration
  - Add waveform rendering for audio clips
  - Integrate WAM plugin loader
tags: [daw, frontend, react, tone.js, audio, sprint-0]
---

# packages/daw - DAW Frontend Package

## Purpose
React-based Digital Audio Workstation (DAW) frontend application with Tone.js audio engine integration.

## Directory Structure
```
packages/daw/
├── index.html           # HTML entry point
├── package.json         # Package dependencies and scripts
├── vite.config.ts       # Vite bundler configuration
├── tailwind.config.js   # TailwindCSS theme configuration
├── postcss.config.js    # PostCSS configuration
├── tsconfig.json        # TypeScript configuration
├── tsconfig.node.json   # TypeScript config for Node files
└── src/
    ├── main.tsx         # React entry point
    ├── App.tsx          # Router setup
    ├── index.css        # Global styles with Tailwind
    ├── components/daw/  # DAW UI components
    ├── stores/          # Zustand state stores
    ├── lib/audio/       # Audio engine and utilities
    ├── hooks/           # React hooks
    └── pages/           # Route pages
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
