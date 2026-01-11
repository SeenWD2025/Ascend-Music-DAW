# DAW PostHog Event Taxonomy

> **Version**: 1.0.0  
> **Last Updated**: 2025-01-11  
> **Owner**: A08 (DevOps/Observability)

This document defines the PostHog analytics event taxonomy for the Ascend DAW application. All events follow a consistent naming convention and property structure for reliable analytics and debugging.

---

## Table of Contents

1. [Naming Conventions](#naming-conventions)
2. [Common Properties](#common-properties)
3. [Event Categories](#event-categories)
   - [Project Events](#project-events)
   - [Transport Events](#transport-events)
   - [Track Events](#track-events)
   - [Clip Events](#clip-events)
   - [Plugin Events](#plugin-events)
   - [Collaboration Events](#collaboration-events)
   - [Export Events](#export-events)
   - [Performance Events](#performance-events)
4. [TypeScript Interfaces](#typescript-interfaces)
5. [Implementation Examples](#implementation-examples)
6. [Best Practices](#best-practices)

---

## Naming Conventions

All DAW events follow the pattern: `daw_{category}_{action}`

- **Prefix**: `daw_` - Identifies all DAW-related events
- **Category**: Feature area (e.g., `project`, `transport`, `track`)
- **Action**: Past-tense verb (e.g., `created`, `opened`, `started`)

---

## Common Properties

All events automatically include these base properties via PostHog:

| Property | Type | Description |
|----------|------|-------------|
| `$current_url` | string | Current page URL |
| `$browser` | string | Browser name |
| `$device_type` | string | Device type (desktop/mobile) |
| `$session_id` | string | PostHog session ID |
| `distinct_id` | string | User ID (Supabase auth ID) |

---

## Event Categories

### Project Events

Events related to DAW project lifecycle.

| Event Name | Description | When to Fire |
|------------|-------------|--------------|
| `daw_project_created` | New project initialized | After project creation succeeds |
| `daw_project_opened` | Existing project loaded | After project fully loads |
| `daw_project_saved` | Project saved (manual or auto) | After save completes |
| `daw_project_deleted` | Project deleted | After deletion confirmed |

#### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `project_id` | string (UUID) | ✅ | Unique project identifier |
| `track_count` | number | ✅ | Number of tracks in project |
| `is_template` | boolean | ❌ | Whether created from template |
| `save_type` | 'manual' \| 'auto' | ❌ | Type of save (for saved event) |

---

### Transport Events

Events related to playback controls.

| Event Name | Description | When to Fire |
|------------|-------------|--------------|
| `daw_transport_play` | Playback started | When play is triggered |
| `daw_transport_pause` | Playback paused | When pause is triggered |
| `daw_transport_stop` | Playback stopped | When stop is triggered |
| `daw_transport_seek` | Playhead position changed | After seek completes |

#### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `project_id` | string (UUID) | ✅ | Unique project identifier |
| `position_ms` | number | ✅ | Playhead position in milliseconds |
| `is_recording` | boolean | ❌ | Whether recording is active |
| `loop_enabled` | boolean | ❌ | Whether loop mode is enabled |

---

### Track Events

Events related to track management.

| Event Name | Description | When to Fire |
|------------|-------------|--------------|
| `daw_track_created` | New track added | After track creation succeeds |
| `daw_track_deleted` | Track removed | After track deletion confirms |

#### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `project_id` | string (UUID) | ✅ | Unique project identifier |
| `track_id` | string (UUID) | ✅ | Unique track identifier |
| `track_type` | 'audio' \| 'midi' \| 'aux' \| 'master' | ✅ | Type of track |
| `track_index` | number | ❌ | Position in track list |

---

### Clip Events

Events related to audio/MIDI clip operations.

| Event Name | Description | When to Fire |
|------------|-------------|--------------|
| `daw_clip_added` | Clip added to track | After clip placement succeeds |
| `daw_clip_moved` | Clip repositioned | After clip move completes |
| `daw_clip_deleted` | Clip removed from track | After clip deletion confirms |

#### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `project_id` | string (UUID) | ✅ | Unique project identifier |
| `track_id` | string (UUID) | ✅ | Track containing the clip |
| `clip_id` | string (UUID) | ✅ | Unique clip identifier |
| `duration_ms` | number | ✅ | Clip duration in milliseconds |
| `clip_type` | 'audio' \| 'midi' | ❌ | Type of clip |
| `start_position_ms` | number | ❌ | Clip start position on timeline |

---

### Plugin Events

Events related to WAM plugin lifecycle.

| Event Name | Description | When to Fire |
|------------|-------------|--------------|
| `daw_plugin_loaded` | Plugin WAM loaded into memory | After plugin instance created |
| `daw_plugin_added` | Plugin inserted on track | After plugin added to chain |
| `daw_plugin_removed` | Plugin removed from track | After plugin removal |

#### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `plugin_id` | string (UUID) | ✅ | Internal plugin instance ID |
| `wam_id` | string | ✅ | WAM identifier (e.g., vendor/plugin) |
| `load_time_ms` | number | ✅ | Time to load plugin in ms |
| `track_id` | string (UUID) | ❌ | Track where plugin is inserted |
| `plugin_type` | 'instrument' \| 'effect' | ❌ | Category of plugin |
| `chain_position` | number | ❌ | Position in effect chain |

---

### Collaboration Events

Events related to real-time collaboration sessions.

| Event Name | Description | When to Fire |
|------------|-------------|--------------|
| `daw_collab_joined` | User joined collaboration session | After successfully joining |
| `daw_collab_left` | User left collaboration session | When leaving session |

#### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `project_id` | string (UUID) | ✅ | Unique project identifier |
| `collaborator_count` | number | ✅ | Number of active collaborators |
| `session_id` | string (UUID) | ❌ | Collaboration session ID |
| `role` | 'owner' \| 'editor' \| 'viewer' | ❌ | User's collaboration role |

---

### Export Events

Events related to audio export/render operations.

| Event Name | Description | When to Fire |
|------------|-------------|--------------|
| `daw_export_started` | Export process initiated | When export begins |
| `daw_export_completed` | Export finished successfully | After export completes |
| `daw_export_failed` | Export encountered error | When export fails |

#### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `format` | 'wav' \| 'mp3' \| 'flac' \| 'ogg' | ✅ | Export audio format |
| `duration_ms` | number | ✅ | Project duration in ms |
| `render_time_ms` | number | ✅ | Time to render in ms |
| `project_id` | string (UUID) | ❌ | Project being exported |
| `sample_rate` | number | ❌ | Export sample rate (Hz) |
| `bit_depth` | number | ❌ | Export bit depth |
| `error_code` | string | ❌ | Error code (for failed event) |
| `error_message` | string | ❌ | Error details (for failed event) |

---

### Performance Events

Events related to audio performance monitoring.

| Event Name | Description | When to Fire |
|------------|-------------|--------------|
| `daw_audio_glitch` | Audio underrun/dropout detected | When glitch occurs |
| `daw_context_resume` | AudioContext resumed from suspended | After context resumes |
| `daw_latency_measurement` | Periodic latency measurement | Every 30 seconds during playback |

#### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `browser` | string | ✅ | Browser name and version |
| `latency_ms` | number | ✅ | Measured latency in ms |
| `buffer_size` | number | ❌ | Audio buffer size |
| `sample_rate` | number | ❌ | Audio context sample rate |
| `cpu_usage` | number | ❌ | Estimated CPU usage (0-100) |
| `active_voices` | number | ❌ | Number of active audio voices |
| `project_id` | string (UUID) | ❌ | Active project ID |

---

## TypeScript Interfaces

```typescript
// packages/shared/src/types/analytics.ts

/**
 * Base properties included with all DAW events
 */
export interface DawEventBase {
  project_id?: string;
  timestamp?: number;
}

/**
 * Project lifecycle events
 */
export interface DawProjectCreatedEvent extends DawEventBase {
  project_id: string;
  track_count: number;
  is_template?: boolean;
}

export interface DawProjectOpenedEvent extends DawEventBase {
  project_id: string;
  track_count: number;
}

export interface DawProjectSavedEvent extends DawEventBase {
  project_id: string;
  track_count: number;
  save_type?: 'manual' | 'auto';
}

export interface DawProjectDeletedEvent extends DawEventBase {
  project_id: string;
  track_count: number;
}

/**
 * Transport control events
 */
export interface DawTransportEvent extends DawEventBase {
  project_id: string;
  position_ms: number;
  is_recording?: boolean;
  loop_enabled?: boolean;
}

export type DawTransportPlayEvent = DawTransportEvent;
export type DawTransportPauseEvent = DawTransportEvent;
export type DawTransportStopEvent = DawTransportEvent;
export type DawTransportSeekEvent = DawTransportEvent;

/**
 * Track management events
 */
export type TrackType = 'audio' | 'midi' | 'aux' | 'master';

export interface DawTrackCreatedEvent extends DawEventBase {
  project_id: string;
  track_id: string;
  track_type: TrackType;
  track_index?: number;
}

export interface DawTrackDeletedEvent extends DawEventBase {
  project_id: string;
  track_id: string;
  track_type: TrackType;
}

/**
 * Clip operation events
 */
export type ClipType = 'audio' | 'midi';

export interface DawClipEvent extends DawEventBase {
  project_id: string;
  track_id: string;
  clip_id: string;
  duration_ms: number;
  clip_type?: ClipType;
  start_position_ms?: number;
}

export type DawClipAddedEvent = DawClipEvent;
export type DawClipMovedEvent = DawClipEvent;
export type DawClipDeletedEvent = DawClipEvent;

/**
 * Plugin lifecycle events
 */
export type PluginType = 'instrument' | 'effect';

export interface DawPluginEvent {
  plugin_id: string;
  wam_id: string;
  load_time_ms: number;
  track_id?: string;
  plugin_type?: PluginType;
  chain_position?: number;
}

export type DawPluginLoadedEvent = DawPluginEvent;
export type DawPluginAddedEvent = DawPluginEvent;
export type DawPluginRemovedEvent = DawPluginEvent;

/**
 * Collaboration events
 */
export type CollaboratorRole = 'owner' | 'editor' | 'viewer';

export interface DawCollabEvent extends DawEventBase {
  project_id: string;
  collaborator_count: number;
  session_id?: string;
  role?: CollaboratorRole;
}

export type DawCollabJoinedEvent = DawCollabEvent;
export type DawCollabLeftEvent = DawCollabEvent;

/**
 * Export events
 */
export type ExportFormat = 'wav' | 'mp3' | 'flac' | 'ogg';

export interface DawExportStartedEvent extends DawEventBase {
  format: ExportFormat;
  duration_ms: number;
  render_time_ms: number;
  project_id?: string;
  sample_rate?: number;
  bit_depth?: number;
}

export interface DawExportCompletedEvent extends DawExportStartedEvent {}

export interface DawExportFailedEvent extends DawExportStartedEvent {
  error_code?: string;
  error_message?: string;
}

/**
 * Performance monitoring events
 */
export interface DawPerformanceEvent {
  browser: string;
  latency_ms: number;
  buffer_size?: number;
  sample_rate?: number;
  cpu_usage?: number;
  active_voices?: number;
  project_id?: string;
}

export type DawAudioGlitchEvent = DawPerformanceEvent;
export type DawContextResumeEvent = DawPerformanceEvent;
export type DawLatencyMeasurementEvent = DawPerformanceEvent;

/**
 * Union type of all DAW events
 */
export type DawEvent =
  | DawProjectCreatedEvent
  | DawProjectOpenedEvent
  | DawProjectSavedEvent
  | DawProjectDeletedEvent
  | DawTransportPlayEvent
  | DawTransportPauseEvent
  | DawTransportStopEvent
  | DawTransportSeekEvent
  | DawTrackCreatedEvent
  | DawTrackDeletedEvent
  | DawClipAddedEvent
  | DawClipMovedEvent
  | DawClipDeletedEvent
  | DawPluginLoadedEvent
  | DawPluginAddedEvent
  | DawPluginRemovedEvent
  | DawCollabJoinedEvent
  | DawCollabLeftEvent
  | DawExportStartedEvent
  | DawExportCompletedEvent
  | DawExportFailedEvent
  | DawAudioGlitchEvent
  | DawContextResumeEvent
  | DawLatencyMeasurementEvent;

/**
 * Event name constants
 */
export const DAW_EVENTS = {
  // Project
  PROJECT_CREATED: 'daw_project_created',
  PROJECT_OPENED: 'daw_project_opened',
  PROJECT_SAVED: 'daw_project_saved',
  PROJECT_DELETED: 'daw_project_deleted',
  
  // Transport
  TRANSPORT_PLAY: 'daw_transport_play',
  TRANSPORT_PAUSE: 'daw_transport_pause',
  TRANSPORT_STOP: 'daw_transport_stop',
  TRANSPORT_SEEK: 'daw_transport_seek',
  
  // Track
  TRACK_CREATED: 'daw_track_created',
  TRACK_DELETED: 'daw_track_deleted',
  
  // Clip
  CLIP_ADDED: 'daw_clip_added',
  CLIP_MOVED: 'daw_clip_moved',
  CLIP_DELETED: 'daw_clip_deleted',
  
  // Plugin
  PLUGIN_LOADED: 'daw_plugin_loaded',
  PLUGIN_ADDED: 'daw_plugin_added',
  PLUGIN_REMOVED: 'daw_plugin_removed',
  
  // Collaboration
  COLLAB_JOINED: 'daw_collab_joined',
  COLLAB_LEFT: 'daw_collab_left',
  
  // Export
  EXPORT_STARTED: 'daw_export_started',
  EXPORT_COMPLETED: 'daw_export_completed',
  EXPORT_FAILED: 'daw_export_failed',
  
  // Performance
  AUDIO_GLITCH: 'daw_audio_glitch',
  CONTEXT_RESUME: 'daw_context_resume',
  LATENCY_MEASUREMENT: 'daw_latency_measurement',
} as const;

export type DawEventName = typeof DAW_EVENTS[keyof typeof DAW_EVENTS];
```

---

## Implementation Examples

### Analytics Service

```typescript
// packages/daw-client/src/services/analytics.service.ts

import posthog from 'posthog-js';
import {
  DAW_EVENTS,
  DawEventName,
  DawProjectCreatedEvent,
  DawTransportEvent,
  DawTrackCreatedEvent,
  DawPluginEvent,
  DawExportStartedEvent,
  DawPerformanceEvent,
} from '@ascend/shared';

class DawAnalyticsService {
  private initialized = false;

  /**
   * Initialize PostHog with project API key
   */
  init(apiKey: string, options?: { debug?: boolean }) {
    if (this.initialized) return;
    
    posthog.init(apiKey, {
      api_host: 'https://app.posthog.com',
      capture_pageview: false, // Manual control for SPA
      persistence: 'localStorage',
      ...options,
    });
    
    this.initialized = true;
  }

  /**
   * Identify user after authentication
   */
  identify(userId: string, traits?: Record<string, unknown>) {
    posthog.identify(userId, traits);
  }

  /**
   * Generic event capture with type safety
   */
  private capture<T extends Record<string, unknown>>(
    eventName: DawEventName,
    properties: T
  ) {
    posthog.capture(eventName, {
      ...properties,
      timestamp: Date.now(),
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Project Events
  // ─────────────────────────────────────────────────────────────

  projectCreated(props: DawProjectCreatedEvent) {
    this.capture(DAW_EVENTS.PROJECT_CREATED, props);
  }

  projectOpened(props: { project_id: string; track_count: number }) {
    this.capture(DAW_EVENTS.PROJECT_OPENED, props);
  }

  projectSaved(props: { 
    project_id: string; 
    track_count: number; 
    save_type?: 'manual' | 'auto' 
  }) {
    this.capture(DAW_EVENTS.PROJECT_SAVED, props);
  }

  projectDeleted(props: { project_id: string; track_count: number }) {
    this.capture(DAW_EVENTS.PROJECT_DELETED, props);
  }

  // ─────────────────────────────────────────────────────────────
  // Transport Events
  // ─────────────────────────────────────────────────────────────

  transportPlay(props: DawTransportEvent) {
    this.capture(DAW_EVENTS.TRANSPORT_PLAY, props);
  }

  transportPause(props: DawTransportEvent) {
    this.capture(DAW_EVENTS.TRANSPORT_PAUSE, props);
  }

  transportStop(props: DawTransportEvent) {
    this.capture(DAW_EVENTS.TRANSPORT_STOP, props);
  }

  transportSeek(props: DawTransportEvent) {
    this.capture(DAW_EVENTS.TRANSPORT_SEEK, props);
  }

  // ─────────────────────────────────────────────────────────────
  // Track Events
  // ─────────────────────────────────────────────────────────────

  trackCreated(props: DawTrackCreatedEvent) {
    this.capture(DAW_EVENTS.TRACK_CREATED, props);
  }

  trackDeleted(props: { 
    project_id: string; 
    track_id: string; 
    track_type: string 
  }) {
    this.capture(DAW_EVENTS.TRACK_DELETED, props);
  }

  // ─────────────────────────────────────────────────────────────
  // Clip Events
  // ─────────────────────────────────────────────────────────────

  clipAdded(props: {
    project_id: string;
    track_id: string;
    clip_id: string;
    duration_ms: number;
  }) {
    this.capture(DAW_EVENTS.CLIP_ADDED, props);
  }

  clipMoved(props: {
    project_id: string;
    track_id: string;
    clip_id: string;
    duration_ms: number;
  }) {
    this.capture(DAW_EVENTS.CLIP_MOVED, props);
  }

  clipDeleted(props: {
    project_id: string;
    track_id: string;
    clip_id: string;
    duration_ms: number;
  }) {
    this.capture(DAW_EVENTS.CLIP_DELETED, props);
  }

  // ─────────────────────────────────────────────────────────────
  // Plugin Events
  // ─────────────────────────────────────────────────────────────

  pluginLoaded(props: DawPluginEvent) {
    this.capture(DAW_EVENTS.PLUGIN_LOADED, props);
  }

  pluginAdded(props: DawPluginEvent) {
    this.capture(DAW_EVENTS.PLUGIN_ADDED, props);
  }

  pluginRemoved(props: DawPluginEvent) {
    this.capture(DAW_EVENTS.PLUGIN_REMOVED, props);
  }

  // ─────────────────────────────────────────────────────────────
  // Collaboration Events
  // ─────────────────────────────────────────────────────────────

  collabJoined(props: { project_id: string; collaborator_count: number }) {
    this.capture(DAW_EVENTS.COLLAB_JOINED, props);
  }

  collabLeft(props: { project_id: string; collaborator_count: number }) {
    this.capture(DAW_EVENTS.COLLAB_LEFT, props);
  }

  // ─────────────────────────────────────────────────────────────
  // Export Events
  // ─────────────────────────────────────────────────────────────

  exportStarted(props: DawExportStartedEvent) {
    this.capture(DAW_EVENTS.EXPORT_STARTED, props);
  }

  exportCompleted(props: DawExportStartedEvent) {
    this.capture(DAW_EVENTS.EXPORT_COMPLETED, props);
  }

  exportFailed(props: DawExportStartedEvent & { 
    error_code?: string; 
    error_message?: string 
  }) {
    this.capture(DAW_EVENTS.EXPORT_FAILED, props);
  }

  // ─────────────────────────────────────────────────────────────
  // Performance Events
  // ─────────────────────────────────────────────────────────────

  audioGlitch(props: DawPerformanceEvent) {
    this.capture(DAW_EVENTS.AUDIO_GLITCH, props);
  }

  contextResume(props: DawPerformanceEvent) {
    this.capture(DAW_EVENTS.CONTEXT_RESUME, props);
  }

  latencyMeasurement(props: DawPerformanceEvent) {
    this.capture(DAW_EVENTS.LATENCY_MEASUREMENT, props);
  }
}

// Singleton export
export const dawAnalytics = new DawAnalyticsService();
```

### Usage in Components

```typescript
// Example: Track component usage
import { dawAnalytics } from '@/services/analytics.service';

function createTrack(projectId: string, type: 'audio' | 'midi') {
  const track = {
    id: crypto.randomUUID(),
    type,
    // ... other track properties
  };
  
  // Fire analytics event
  dawAnalytics.trackCreated({
    project_id: projectId,
    track_id: track.id,
    track_type: type,
    track_index: getTrackCount(),
  });
  
  return track;
}
```

```typescript
// Example: Transport controls
import { dawAnalytics } from '@/services/analytics.service';

function handlePlay(projectId: string, positionMs: number) {
  audioEngine.play();
  
  dawAnalytics.transportPlay({
    project_id: projectId,
    position_ms: positionMs,
    is_recording: audioEngine.isRecording,
    loop_enabled: audioEngine.loopEnabled,
  });
}
```

```typescript
// Example: Performance monitoring
import { dawAnalytics } from '@/services/analytics.service';

function setupPerformanceMonitoring() {
  const audioContext = getAudioContext();
  
  // Periodic latency measurement
  setInterval(() => {
    if (audioContext.state === 'running') {
      dawAnalytics.latencyMeasurement({
        browser: navigator.userAgent,
        latency_ms: audioContext.baseLatency * 1000,
        buffer_size: audioContext.sampleRate,
        sample_rate: audioContext.sampleRate,
      });
    }
  }, 30000);
  
  // Audio glitch detection
  audioEngine.on('glitch', () => {
    dawAnalytics.audioGlitch({
      browser: navigator.userAgent,
      latency_ms: audioContext.baseLatency * 1000,
      cpu_usage: audioEngine.getCpuUsage(),
      active_voices: audioEngine.getActiveVoiceCount(),
    });
  });
}
```

---

## Best Practices

### 1. Event Timing

- Fire events **after** the action completes successfully
- For async operations, wait for confirmation before tracking
- Include `render_time_ms` or `load_time_ms` for performance-sensitive events

### 2. Property Consistency

- Always use snake_case for property names
- Use UUIDs for all ID properties
- Use milliseconds for all time-based properties

### 3. Sampling for High-Volume Events

```typescript
// For high-frequency events like latency measurements
function shouldSample(rate: number = 0.1): boolean {
  return Math.random() < rate;
}

// Only track 10% of latency measurements
if (shouldSample(0.1)) {
  dawAnalytics.latencyMeasurement({ ... });
}
```

### 4. Error Context

Always include error context for failure events:

```typescript
dawAnalytics.exportFailed({
  format: 'wav',
  duration_ms: 180000,
  render_time_ms: 5000,
  error_code: 'ENCODE_FAILED',
  error_message: 'Insufficient memory for encoding',
});
```

### 5. Privacy Considerations

- Never include PII in event properties
- Use project/track IDs, not names
- Anonymize user-generated content

---

## PostHog Dashboard Recommendations

### Key Metrics to Track

1. **Project Engagement**: Projects created/opened per user per day
2. **Feature Adoption**: Plugin usage, export formats, collaboration rate
3. **Performance Health**: Glitch rate, average latency by browser
4. **Export Success Rate**: Completed vs failed exports

### Suggested Funnels

1. **Project Completion**: Created → Opened → Saved → Exported
2. **Collaboration Flow**: Project Opened → Collab Joined → Changes Made
3. **Plugin Discovery**: Plugin Loaded → Plugin Added → Plugin Retained

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-01-11 | Initial taxonomy definition |
