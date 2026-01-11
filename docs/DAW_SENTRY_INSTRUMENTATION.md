# DAW Sentry Instrumentation

> Sentry error tracking and performance monitoring for Ascend DAW.

## Frontend Error Tracking

### Audio Worklet Errors
```typescript
// Wrap worklet processor
try {
  await audioContext.audioWorklet.addModule('/worklets/audio-processor.js');
} catch (error) {
  Sentry.captureException(error, {
    tags: { component: 'audio_worklet', worklet_type: 'processor' },
    contexts: { audio: { sampleRate: audioContext.sampleRate, state: audioContext.state } }
  });
}
```

### Audio Context Errors
```typescript
Sentry.setContext('audio_context', {
  state: audioContext.state,
  sampleRate: audioContext.sampleRate,
  baseLatency: audioContext.baseLatency,
  outputLatency: audioContext.outputLatency
});

audioContext.onstatechange = () => {
  if (audioContext.state === 'suspended') {
    Sentry.addBreadcrumb({ category: 'audio', message: 'Context suspended', level: 'warning' });
  }
};
```

### WAM Plugin Loading
```typescript
async function loadWAMPlugin(pluginUrl: string, projectId: string) {
  const span = Sentry.startSpan({ name: 'wam.plugin.load', op: 'audio.plugin' });
  try {
    const plugin = await WAM.createInstance(hostGroupId, audioContext, pluginUrl);
    span?.setStatus('ok');
    return plugin;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: 'wam_plugin', plugin_url: pluginUrl },
      contexts: { project: { id: projectId } }
    });
    span?.setStatus('error');
    throw error;
  } finally {
    span?.end();
  }
}
```

### WebSocket Errors
```typescript
socket.onerror = (event) => {
  Sentry.captureException(new Error('WebSocket connection error'), {
    tags: { component: 'websocket', connection_type: 'realtime' },
    extra: { readyState: socket.readyState, url: socket.url }
  });
};

socket.onclose = (event) => {
  if (!event.wasClean) {
    Sentry.addBreadcrumb({
      category: 'websocket',
      message: `Unexpected close: ${event.code} - ${event.reason}`,
      level: 'error'
    });
  }
};
```

## Backend Error Tracking

### Export Job Errors
```typescript
async function processExportJob(job: ExportJob) {
  return Sentry.withScope(async (scope) => {
    scope.setTag('job_type', 'audio_export');
    scope.setContext('export_job', {
      jobId: job.id,
      projectId: job.projectId,
      format: job.format,
      trackCount: job.tracks.length
    });

    try {
      const result = await renderExport(job);
      return result;
    } catch (error) {
      Sentry.captureException(error);
      await markJobFailed(job.id, error.message);
      throw error;
    }
  });
}
```

### Drive Upload Errors
```typescript
async function uploadToDrive(file: Buffer, metadata: DriveMetadata) {
  const span = Sentry.startSpan({ name: 'drive.upload', op: 'http.client' });
  try {
    span?.setAttributes({ 'file.size': file.length, 'drive.provider': metadata.provider });
    const result = await driveClient.upload(file, metadata);
    span?.setStatus('ok');
    return result;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: 'drive_upload', provider: metadata.provider },
      contexts: { file: { size: file.length, mimeType: metadata.mimeType } }
    });
    span?.setStatus('error');
    throw error;
  } finally {
    span?.end();
  }
}
```

### WebSocket Handler Errors
```typescript
function handleRealtimeMessage(ws: WebSocket, message: RealtimeMessage) {
  Sentry.withScope((scope) => {
    scope.setContext('websocket_message', {
      type: message.type,
      projectId: message.projectId,
      userId: message.userId
    });

    try {
      router.handle(message);
    } catch (error) {
      Sentry.captureException(error, { tags: { handler: message.type } });
      ws.send(JSON.stringify({ error: 'Internal error', code: 'HANDLER_ERROR' }));
    }
  });
}
```

## Custom Contexts

### Project Context
```typescript
Sentry.setContext('daw_project', {
  project_id: project.id,
  track_count: project.tracks.length,
  bpm: project.bpm,
  sample_rate: project.sampleRate,
  duration_seconds: project.duration
});
```

### Audio State Context
```typescript
Sentry.setContext('audio_state', {
  playback_state: transport.state,        // 'playing' | 'paused' | 'stopped'
  buffer_size: audioEngine.bufferSize,
  active_plugins: audioEngine.activePluginCount,
  cpu_usage: audioEngine.cpuUsage,
  memory_usage: audioEngine.memoryUsage
});
```

### Session Context
```typescript
Sentry.setUser({
  id: user.id,
  subscription_tier: user.tier           // 'free' | 'pro' | 'studio'
});

Sentry.setContext('collaboration', {
  session_id: session.id,
  participant_count: session.participants.length,
  is_host: session.hostId === user.id
});
```

## Performance Spans

### Buffer Loading
```typescript
async function loadAudioBuffer(url: string): Promise<AudioBuffer> {
  return Sentry.startSpan({ name: 'audio.buffer.load', op: 'audio.decode' }, async (span) => {
    span?.setAttributes({ 'audio.url': url });
    
    const fetchSpan = Sentry.startSpan({ name: 'audio.buffer.fetch', op: 'http.client' });
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    fetchSpan?.end();

    const decodeSpan = Sentry.startSpan({ name: 'audio.buffer.decode', op: 'audio.decode' });
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    decodeSpan?.setAttributes({ 'audio.duration': audioBuffer.duration, 'audio.channels': audioBuffer.numberOfChannels });
    decodeSpan?.end();

    return audioBuffer;
  });
}
```

### Plugin Initialization
```typescript
async function initializePlugin(descriptor: PluginDescriptor): Promise<Plugin> {
  return Sentry.startSpan({ name: 'plugin.init', op: 'audio.plugin' }, async (span) => {
    span?.setAttributes({ 'plugin.name': descriptor.name, 'plugin.type': descriptor.type });

    const loadSpan = Sentry.startSpan({ name: 'plugin.load_module', op: 'resource.script' });
    const module = await loadPluginModule(descriptor.url);
    loadSpan?.end();

    const createSpan = Sentry.startSpan({ name: 'plugin.create_instance', op: 'audio.plugin' });
    const instance = await module.createInstance(audioContext);
    createSpan?.end();

    const connectSpan = Sentry.startSpan({ name: 'plugin.connect_audio', op: 'audio.routing' });
    await instance.connect();
    connectSpan?.end();

    return instance;
  });
}
```

### Export Rendering
```typescript
async function renderExport(project: Project, format: ExportFormat): Promise<Buffer> {
  return Sentry.startSpan({ name: 'export.render', op: 'audio.export' }, async (span) => {
    span?.setAttributes({
      'export.format': format,
      'export.track_count': project.tracks.length,
      'export.duration': project.duration
    });

    const prepareSpan = Sentry.startSpan({ name: 'export.prepare_graph', op: 'audio.routing' });
    const graph = await buildOfflineGraph(project);
    prepareSpan?.end();

    const renderSpan = Sentry.startSpan({ name: 'export.offline_render', op: 'audio.render' });
    const rawBuffer = await graph.render();
    renderSpan?.setAttributes({ 'render.samples': rawBuffer.length });
    renderSpan?.end();

    const encodeSpan = Sentry.startSpan({ name: 'export.encode', op: 'audio.encode' });
    const encoded = await encodeToFormat(rawBuffer, format);
    encodeSpan?.setAttributes({ 'encode.size_bytes': encoded.length });
    encodeSpan?.end();

    return encoded;
  });
}
```

## Sentry Configuration

```typescript
// sentry.client.config.ts
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  profilesSampleRate: 0.1,
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,
  
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false })
  ],

  beforeSend(event) {
    // Filter high-frequency audio glitches
    if (event.tags?.component === 'audio_worklet' && event.extra?.glitch_count < 3) {
      return null;
    }
    return event;
  },

  ignoreErrors: [
    'AbortError',                          // User-initiated cancellations
    'NotAllowedError',                     // Audio autoplay blocked
    /ResizeObserver loop/                  // Benign browser warning
  ]
});
```
