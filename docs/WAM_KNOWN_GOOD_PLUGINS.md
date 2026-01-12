# WAM Known-Good Plugins

> **Owner**: A03 (Integrations Specialist)  
> **Version**: 1.0.0  
> **Last Updated**: 2026-01-11  
> **Status**: Active for Sprint 2

This document defines the curated list of known-good WAM plugins for Ascend DAW, including pinned versions, compatibility notes, and the process for adding new plugins.

---

## 1. Overview

Ascend DAW uses a **known-good plugin subset** approach for WAM integration:

- **Pinned Versions**: Each approved plugin is locked to a specific tested version
- **Local Fallback**: If CDN fails, plugins fall back to locally bundled versions
- **Browser Compatibility**: Each plugin is tested across Chrome, Edge, Firefox, and Safari
- **Graceful Degradation**: Plugin failures don't crash the DAW; users see helpful error messages

---

## 2. Known-Good Plugin List

### 2.1 Synthesizers

| Plugin ID | Name | Version | Category | Notes |
|-----------|------|:-------:|----------|-------|
| `com.webaudiomodules.obxd` | OB-Xd | 1.5.0 | Synth | Oberheim OB-X emulation, excellent analog sound |
| `com.webaudiomodules.dexed` | Dexed | 1.0.0 | Synth | DX7 FM synthesis, great for classic FM sounds |
| `com.webaudiomodules.dx7` | DX7 | 1.0.0 | Synth | Official DX7 emulation |
| `com.webaudiomodules.surge` | Surge XT | 1.3.1 | Synth | Full-featured hybrid synth, powerful modulation |

### 2.2 Effects

| Plugin ID | Name | Version | Category | Notes |
|-----------|------|:-------:|----------|-------|
| `com.webaudiomodules.freeverb` | FreeVerb | 1.0.0 | Reverb | Classic Freeverb algorithm |
| `com.webaudiomodules.parametric-eq` | Parametric EQ | 1.0.0 | EQ | 8-band parametric EQ with spectrum analyzer |
| `com.webaudiomodules.compressor` | Compressor | 1.0.0 | Dynamics | Versatile dynamics processor with sidechain |

---

## 3. Configuration Reference

### 3.1 Loader Configuration

```typescript
// packages/daw/src/lib/wam/registry.ts

export const KNOWN_GOOD_PLUGINS: Map<string, KnownPluginInfo> = new Map([
  ['com.webaudiomodules.obxd', { version: '1.5.0', fallbackUrl: '/plugins/obxd.wam' }],
  ['com.webaudiomodules.dexed', { version: '1.0.0', fallbackUrl: '/plugins/dexed.wam' }],
  ['com.webaudiomodules.freeverb', { version: '1.0.0', fallbackUrl: '/plugins/freeverb.wam' }],
  ['com.webaudiomodules.parametric-eq', { version: '1.0.0', fallbackUrl: '/plugins/eq.wam' }],
  ['com.webaudiomodules.compressor', { version: '1.0.0', fallbackUrl: '/plugins/compressor.wam' }],
  ['com.webaudiomodules.surge', { version: '1.3.1', fallbackUrl: '/plugins/surge.wam' }],
  ['com.webaudiomodules.dx7', { version: '1.0.0', fallbackUrl: '/plugins/dx7.wam' }],
]);
```

### 3.2 Load Options

```typescript
const options: PluginLoadOptions = {
  timeoutMs: 10000,      // 10 second timeout
  maxRetries: 2,         // Up to 3 total attempts (initial + 2 retries)
  useFallback: true,     // Try local fallback if CDN fails
  signal: abortController.signal, // Optional cancellation
};

const synth = await loadWAMPlugin(audioContext, 'com.webaudiomodules.obxd', undefined, options);
```

---

## 4. CSP/CORS Requirements

### 4.1 Content Security Policy

The following CSP directives are required for WAM plugin loading:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval' https://webaudiomodules.com;
  worker-src 'self' blob:;
  connect-src 'self' https://webaudiomodules.com https://*.r2.cloudflarestorage.com;
```

Key requirements:
- `'wasm-unsafe-eval'` for WebAssembly execution
- `worker-src blob:` for AudioWorklet processors
- CDN domains in `connect-src` for plugin loading

### 4.2 Cross-Origin Isolation

WAM plugins require Cross-Origin Isolation for SharedArrayBuffer:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### 4.3 CORS for Local Fallback

When serving local fallback plugins, ensure CORS headers are set:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET
```

---

## 5. Browser Compatibility

### 5.1 Support Matrix

| Browser | AudioWorklet | SharedArrayBuffer | WASM SIMD | Known Issues |
|---------|:------------:|:-----------------:|:---------:|--------------|
| Chrome 94+ | ✅ Full | ✅ With COOP/COEP | ✅ Full | None |
| Edge 94+ | ✅ Full | ✅ With COOP/COEP | ✅ Full | None |
| Firefox 89+ | ✅ Full | ✅ With COOP/COEP | ✅ Full | Minor timing differences |
| Safari 15.4+ | ⚠️ Limited | ✅ With COOP/COEP | ✅ Full | See Safari notes below |

### 5.2 Safari-Specific Issues

Safari has known AudioWorklet limitations that affect some plugins:

1. **AudioWorklet Timing**: Safari's AudioWorklet timing is less precise, causing potential audio glitches
2. **Module Loading**: Some dynamic imports may fail; fallback loading is essential
3. **Memory Management**: Safari may garbage collect AudioWorklet nodes unexpectedly

**Recommendations for Safari Users**:
- Use Chrome or Firefox for optimal performance
- Keep track counts lower (<16 tracks with plugins)
- Avoid complex plugin chains (>4 plugins per track)

### 5.3 Plugin-Specific Compatibility

| Plugin | Chrome | Edge | Firefox | Safari |
|--------|:------:|:----:|:-------:|:------:|
| OB-Xd | ✅ | ✅ | ✅ | ⚠️ |
| Dexed | ✅ | ✅ | ✅ | ✅ |
| DX7 | ✅ | ✅ | ✅ | ✅ |
| Surge XT | ✅ | ✅ | ✅ | ⚠️ |
| FreeVerb | ✅ | ✅ | ✅ | ✅ |
| Parametric EQ | ✅ | ✅ | ✅ | ✅ |
| Compressor | ✅ | ✅ | ✅ | ✅ |

Legend:
- ✅ Full support
- ⚠️ Works with minor issues
- ❌ Not supported

---

## 6. Fallback Behavior

### 6.1 Loading Sequence

```
1. CDN Load (https://webaudiomodules.com/wam/{plugin}@{version}/index.js)
   ├── Success → Use CDN version
   └── Failure → Retry with exponential backoff (up to 2 retries)
       └── All retries failed → Try local fallback

2. Local Fallback (/plugins/{plugin}.wam)
   ├── Success → Use local version, log warning
   └── Failure → Retry with exponential backoff
       └── All retries failed → Throw PluginLoadError
```

### 6.2 Exponential Backoff

```
Attempt 1: Immediate
Attempt 2: 1000ms + jitter
Attempt 3: 2000ms + jitter
```

- Base delay: 1000ms
- Multiplier: 2x
- Max delay: 8000ms
- Jitter: ±10%

### 6.3 Error Handling

When a plugin fails to load:

1. **Sentry Alert**: Error captured with plugin ID, version, and error code
2. **PostHog Event**: `plugin.load_failed` event with details
3. **User Notification**: Toast message with retry option
4. **Graceful Degradation**: Track continues working, plugin slot shows error state

---

## 7. Telemetry Events

### 7.1 PostHog Events

| Event | Properties | Description |
|-------|------------|-------------|
| `plugin.load_started` | plugin_id, version, source, is_known_good | Plugin load initiated |
| `plugin.load_success` | plugin_id, version, source, load_time_ms, retry_count | Plugin loaded successfully |
| `plugin.load_failed` | plugin_id, version, error_code, error_message, attempted_sources | Plugin load failed after all retries |

### 7.2 Sentry Context

All plugin operations include Sentry breadcrumbs and spans:

```typescript
Sentry.captureException(error, {
  tags: {
    component: 'wam-loader',
    plugin_id: wamId,
    error_code: errorCode,
    is_known_good: String(isKnown),
  },
  extra: {
    version: effectiveVersion,
    attempts: totalAttempts,
    attempted_sources: attemptedSources,
  },
});
```

---

## 8. Adding New Plugins

### 8.1 Evaluation Criteria

Before adding a plugin to the known-good list:

1. **Stability**: Plugin must load reliably in all supported browsers
2. **Performance**: CPU usage must be reasonable (< 20% for single instance)
3. **Compatibility**: Must work with Cross-Origin Isolation headers
4. **State Serialization**: `getState()`/`setState()` must work correctly
5. **Audio Quality**: No audible artifacts or glitches

### 8.2 Testing Checklist

- [ ] Load/unload 10 times consecutively without errors
- [ ] Test in Chrome, Edge, Firefox, Safari
- [ ] Verify parameter automation works
- [ ] Test state save/restore across session
- [ ] Profile CPU usage with audio playing
- [ ] Test with 10+ tracks using the plugin simultaneously
- [ ] Verify AudioWorklet thread stability

### 8.3 Adding to Registry

1. Add to `KNOWN_GOOD_PLUGINS` map in [registry.ts](../packages/daw/src/lib/wam/registry.ts)
2. Add catalog entry to `PLUGIN_CATALOG` array
3. Bundle fallback to `/public/plugins/{name}.wam`
4. Update this documentation
5. Update [WAM_COMPATIBILITY_MATRIX.md](WAM_COMPATIBILITY_MATRIX.md)

---

## 9. Troubleshooting

### 9.1 Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Plugin fails to load | Missing COOP/COEP headers | Enable Cross-Origin Isolation |
| AudioWorklet error | Module not found | Check fallback bundling |
| Timeout on load | Slow CDN or network | Increase timeout, check connection |
| Safari crashes | AudioWorklet instability | Reduce plugin count, use Chrome |
| No audio output | Node not connected | Check audio routing in DevTools |

### 9.2 Debug Mode

Enable debug logging for plugin operations:

```javascript
localStorage.setItem('debug:wam-loader', 'true');
```

This logs detailed information about load attempts, timing, and errors.

---

## 10. References

- [WAM Specification](https://webaudiomodules.org/docs/specification)
- [AudioWorklet MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [Cross-Origin Isolation Guide](https://web.dev/cross-origin-isolation-guide/)
- [WAM Compatibility Matrix](WAM_COMPATIBILITY_MATRIX.md)
