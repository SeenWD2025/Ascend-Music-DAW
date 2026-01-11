# WAM Compatibility Matrix

> **Owner**: A03 (Integrations Specialist)  
> **Version**: 1.0.0  
> **Last Updated**: 2026-01-11  
> **Status**: Approved for Sprint 0

This document defines browser support, plugin compatibility, and CSP/CORS requirements for Web Audio Modules (WAM) integration in Ascend DAW.

---

## 1. Browser Support Matrix

### Core Feature Support

| Feature | Chrome 94+ | Edge 94+ | Firefox 89+ | Safari 15.4+ |
|---------|:----------:|:--------:|:-----------:|:------------:|
| Web Audio API | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| AudioWorklet | ✅ Full | ✅ Full | ✅ Full | ⚠️ Limited |
| SharedArrayBuffer | ✅ With COOP/COEP | ✅ With COOP/COEP | ✅ With COOP/COEP | ✅ With COOP/COEP |
| WASM Threading | ✅ Full | ✅ Full | ✅ Full | ⚠️ Partial |
| WASM SIMD | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| Cross-Origin Isolation | ✅ Required | ✅ Required | ✅ Required | ✅ Required |
| OffscreenCanvas (UI) | ✅ Full | ✅ Full | ✅ Full | ✅ 16.4+ |

### Minimum Browser Versions

```typescript
// packages/shared/src/utils/browser-support.ts
export const MIN_BROWSER_VERSIONS = {
  chrome: 94,
  edge: 94,
  firefox: 89,
  safari: 15.4,
} as const;

export function checkWAMSupport(): { supported: boolean; issues: string[] } {
  const issues: string[] = [];
  
  if (typeof AudioWorkletNode === 'undefined') {
    issues.push('AudioWorklet not supported');
  }
  
  if (typeof SharedArrayBuffer === 'undefined') {
    issues.push('SharedArrayBuffer not available - check COOP/COEP headers');
  }
  
  if (typeof WebAssembly?.Memory === 'undefined') {
    issues.push('WebAssembly not supported');
  }
  
  // Check for cross-origin isolation
  if (!crossOriginIsolated) {
    issues.push('Cross-origin isolation not enabled');
  }
  
  return {
    supported: issues.length === 0,
    issues,
  };
}
```

### Mobile Support Policy

> ⛔ **Mobile browsers are NOT supported for Ascend DAW v1**

**Rationale**:
- Touch latency incompatible with real-time audio production
- iOS Safari AudioWorklet reliability issues
- Memory constraints for large projects
- No MIDI controller support

**User-Facing Message**:
```
Ascend DAW requires a desktop browser (Chrome, Edge, or Firefox recommended).
Mobile devices are not supported for audio production workflows.
```

---

## 2. WAM Plugin Categories

### 2.1 Synthesizers

| Plugin | Type | WAM Version | Vendor | Notes |
|--------|------|:-----------:|--------|-------|
| **DX7** | FM Synth | WAM2 | webaudiomodules.com | Yamaha DX7 emulation |
| **Dexed** | FM Synth | WAM2 | Community | Open-source DX7 clone |
| **OB-Xd** | Analog Poly | WAM2 | Community | Oberheim emulation |
| **Surge** | Hybrid Synth | WAM2 | Surge Synth Team | Full-featured, open-source |
| **Vital** | Wavetable | WAM2 | Community Port | Modern wavetable synth |
| **ZynAddSubFX** | Multi-engine | WAM2 | ZynAddSubFX | Complex, resource-heavy |

**Tier 1 Synths (Guaranteed)**: DX7, OB-Xd, Surge

### 2.2 Samplers

| Plugin | Type | WAM Version | Max Sample Size | Notes |
|--------|------|:-----------:|-----------------|-------|
| **WebSampler** | General | WAM2 | 256MB | Basic multi-sample playback |
| **Salamander Piano** | Piano | WAM2 | 512MB | Concert grand samples |
| **DrumKV1** | Drum | WAM2 | 64MB | Drum machine sampler |
| **SFZ Player** | SFZ Format | WAM2 | 1GB | Universal SFZ loader |

**Tier 1 Samplers (Guaranteed)**: WebSampler, DrumKV1

### 2.3 Effects

#### Equalizers
| Plugin | Bands | WAM Version | Latency | Notes |
|--------|:-----:|:-----------:|:-------:|-------|
| **ProQ** | 24 | WAM2 | 0ms | Linear phase option |
| **TDR Nova** | 4 | WAM2 | 0ms | Dynamic EQ |
| **ReaEQ** | 16 | WAM2 | 0ms | Reaper port |

#### Compressors
| Plugin | Type | WAM Version | Latency | Notes |
|--------|------|:-----------:|:-------:|-------|
| **MJUC** | Tube/Vari-mu | WAM2 | 0-5ms | Vintage character |
| **TDR Kotelnikov** | Transparent | WAM2 | 0ms | Mastering quality |
| **ReaComp** | Digital | WAM2 | 0ms | Reaper port |

#### Reverbs
| Plugin | Algorithm | WAM Version | CPU Load | Notes |
|--------|-----------|:-----------:|:--------:|-------|
| **DragonflyReverb** | Algorithmic | WAM2 | Medium | Multiple room types |
| **CloudSeed** | Granular | WAM2 | High | Ambient/pad reverb |
| **Freeverb3** | Convolution | WAM2 | High | IR-based reverb |

#### Delays
| Plugin | Type | WAM Version | Sync | Notes |
|--------|------|:-----------:|:----:|-------|
| **TAL-Dub** | Dub Delay | WAM2 | ✅ | Analog-style feedback |
| **PingPongDelay** | Stereo | WAM2 | ✅ | Basic ping-pong |
| **GranularDelay** | Granular | WAM2 | ✅ | Texture delay |

**Tier 1 Effects (Guaranteed)**: TDR Nova, TDR Kotelnikov, DragonflyReverb, TAL-Dub

### 2.4 Analyzers

| Plugin | Type | WAM Version | Notes |
|--------|------|:-----------:|-------|
| **SpectrumAnalyzer** | FFT Display | WAM2 | Real-time spectrum |
| **LUFSMeter** | Loudness | WAM2 | Broadcast-compliant |
| **Oscilloscope** | Waveform | WAM2 | Multi-channel |
| **CorrelationMeter** | Phase | WAM2 | Stereo correlation |

**Tier 1 Analyzers (Guaranteed)**: SpectrumAnalyzer, LUFSMeter

---

## 3. Supported Plugin Subset Policy

### Tier 1: Guaranteed Support (Vendored)

Plugins we host and fully support. These are bundled with Ascend DAW.

| # | Plugin | Category | Bundle Size | Load Time |
|:-:|--------|----------|:-----------:|:---------:|
| 1 | DX7 | Synth | 2.1 MB | ~500ms |
| 2 | OB-Xd | Synth | 3.4 MB | ~700ms |
| 3 | Surge | Synth | 8.2 MB | ~1.2s |
| 4 | WebSampler | Sampler | 1.8 MB | ~400ms |
| 5 | DrumKV1 | Sampler | 1.2 MB | ~300ms |
| 6 | TDR Nova | EQ | 1.5 MB | ~350ms |
| 7 | TDR Kotelnikov | Compressor | 1.6 MB | ~350ms |
| 8 | DragonflyReverb | Reverb | 2.8 MB | ~600ms |
| 9 | TAL-Dub | Delay | 1.1 MB | ~250ms |
| 10 | SpectrumAnalyzer | Analyzer | 0.8 MB | ~200ms |

**Hosting**: These plugins are served from our CDN at `https://plugins.ascend-daw.com/wam/`

**Version Pinning**: All Tier 1 plugins are version-locked and tested with each Ascend release.

### Tier 2: Community Support (CDN-Loaded)

Plugins loaded from `webaudiomodules.com` CDN. Best-effort support.

```typescript
// Example: Loading a Tier 2 plugin
const TIER2_CDN_BASE = 'https://www.webaudiomodules.com/wam2/';

interface Tier2Plugin {
  id: string;
  path: string;
  verified: boolean;
  lastTested: string;
}

export const TIER2_PLUGINS: Tier2Plugin[] = [
  { id: 'vital', path: 'vital/', verified: true, lastTested: '2026-01-01' },
  { id: 'dexed', path: 'dexed/', verified: true, lastTested: '2025-12-15' },
  // ... more community plugins
];
```

**Support Policy**:
- We test Tier 2 plugins quarterly
- No guaranteed compatibility with Ascend updates
- Community can report issues; fixes are best-effort
- May be promoted to Tier 1 based on stability

### Tier 3: Experimental (User-Provided)

Users can load their own WAM2 plugins from URLs they provide.

**Support Policy**:
- ⚠️ No support provided
- ⚠️ Security warnings displayed to user
- ⚠️ Plugin errors isolated from DAW core
- ⚠️ Crash recovery mechanisms required

```typescript
// User-provided plugin loading with isolation
async function loadTier3Plugin(url: string): Promise<WAMPlugin> {
  // Security check
  const allowed = await confirmUserPluginLoad(url);
  if (!allowed) throw new Error('User cancelled plugin load');
  
  // Load in isolated context
  const sandbox = createPluginSandbox();
  try {
    const plugin = await sandbox.loadWAM(url);
    return wrapWithErrorBoundary(plugin);
  } catch (error) {
    logPluginError('tier3_load_failed', { url, error });
    throw new PluginLoadError(`Failed to load plugin from ${url}`);
  }
}
```

---

## 4. CSP/CORS Constraints

### Required HTTP Headers

All pages hosting Ascend DAW MUST include these headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: cross-origin
```

**Reason**: SharedArrayBuffer requires cross-origin isolation for security.

### Content Security Policy

```
Content-Security-Policy: 
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval' https://plugins.ascend-daw.com https://www.webaudiomodules.com;
  worker-src 'self' blob:;
  connect-src 'self' https://plugins.ascend-daw.com https://www.webaudiomodules.com https://www.googleapis.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:;
  media-src 'self' blob:;
```

**Key Points**:
- `wasm-unsafe-eval` required for WASM compilation
- `blob:` worker-src required for AudioWorklet
- Plugin CDNs must be explicitly allowed

### Plugin CDN CORS Requirements

Plugins loaded from `webaudiomodules.com` must have:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

**Our Plugin CDN** (`plugins.ascend-daw.com`):
```
Access-Control-Allow-Origin: https://app.ascend-daw.com
Access-Control-Allow-Methods: GET, OPTIONS
Cross-Origin-Resource-Policy: cross-origin
```

### AudioWorklet Loading Pattern

```typescript
// Correct way to load AudioWorklet with cross-origin isolation
async function initAudioWorklet(context: AudioContext): Promise<void> {
  const workletUrl = new URL('./audio-worklet.js', import.meta.url);
  
  // Blob URL pattern for dynamic worklet code
  const response = await fetch(workletUrl, {
    credentials: 'same-origin',
    mode: 'same-origin',
  });
  const code = await response.text();
  const blob = new Blob([code], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);
  
  try {
    await context.audioWorklet.addModule(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}
```

---

## 5. Known Issues & Workarounds

### 5.1 Safari AudioWorklet Limitations

**Issue**: Safari has intermittent AudioWorklet stability issues, especially with complex plugin graphs.

**Symptoms**:
- Random audio dropouts after 30+ minutes
- Worklet thread crashes on memory pressure
- Slower WASM execution (~20% compared to Chrome)

**Workarounds**:
```typescript
// Safari-specific configuration
function getSafariAudioConfig(): AudioContextOptions {
  return {
    latencyHint: 'playback', // More stable than 'interactive'
    sampleRate: 44100, // Avoid 48000 on some Safari versions
  };
}

// Implement watchdog for Safari
class SafariWorkletWatchdog {
  private lastPing = Date.now();
  private readonly maxSilence = 5000; // 5 seconds
  
  constructor(private context: AudioContext) {
    this.startHeartbeat();
  }
  
  private startHeartbeat(): void {
    setInterval(() => {
      if (Date.now() - this.lastPing > this.maxSilence) {
        this.recoverAudioContext();
      }
    }, 1000);
  }
  
  private async recoverAudioContext(): Promise<void> {
    console.warn('[Safari] AudioContext recovery triggered');
    // Suspend and resume to reset worklet thread
    await this.context.suspend();
    await new Promise(r => setTimeout(r, 100));
    await this.context.resume();
    this.lastPing = Date.now();
  }
}
```

**Recommendations**:
- Display "Chrome recommended" banner for Safari users
- Limit Safari to 16 simultaneous plugin instances
- Auto-save more frequently on Safari (every 30s vs 60s)

### 5.2 Firefox SharedArrayBuffer Requirements

**Issue**: Firefox requires explicit opt-in for SharedArrayBuffer via headers.

**Symptoms**:
- `SharedArrayBuffer is not defined` error
- Plugins fail to initialize
- WASM threading unavailable

**Solution**: Ensure server sends correct headers (see Section 4).

**Detection & Fallback**:
```typescript
function checkFirefoxSAB(): { available: boolean; fallbackMode: boolean } {
  const available = typeof SharedArrayBuffer !== 'undefined';
  
  if (!available && isFirefox()) {
    console.warn('[Firefox] SharedArrayBuffer unavailable. COOP/COEP headers missing?');
    return { available: false, fallbackMode: true };
  }
  
  return { available, fallbackMode: false };
}

// Fallback: Load plugins without WASM threading (reduced performance)
async function loadPluginFallbackMode(pluginId: string): Promise<WAMPlugin> {
  const plugin = await loadPlugin(pluginId, { 
    useWasmThreads: false,
    useSharedMemory: false,
  });
  
  console.warn(`[Fallback] Plugin ${pluginId} loaded without threading`);
  return plugin;
}
```

### 5.3 Mobile Browser Limitations

**Policy**: Mobile browsers are explicitly **NOT SUPPORTED** for v1.

**Implementation**:
```typescript
// Early bailout for mobile
function blockMobileAccess(): void {
  const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry/i.test(navigator.userAgent);
  const isSmallScreen = window.innerWidth < 1024;
  
  if (isMobile || isSmallScreen) {
    showMobileBlocker({
      title: 'Desktop Required',
      message: 'Ascend DAW requires a desktop browser for audio production.',
      suggestion: 'Please visit on Chrome, Edge, or Firefox on your computer.',
    });
    throw new Error('Mobile access blocked');
  }
}
```

### 5.4 WASM Memory Limits

**Issue**: Some browsers limit WASM memory, causing large plugins to fail.

**Workarounds**:
```typescript
// Check available WASM memory before loading heavy plugins
async function checkWasmMemory(requiredMB: number): Promise<boolean> {
  try {
    const pages = Math.ceil((requiredMB * 1024 * 1024) / 65536);
    const memory = new WebAssembly.Memory({ 
      initial: 1, 
      maximum: pages,
      shared: true 
    });
    return true;
  } catch {
    return false;
  }
}

// Pre-check for memory-heavy plugins
const PLUGIN_MEMORY_REQUIREMENTS: Record<string, number> = {
  'surge': 256,
  'vital': 512,
  'salamander-piano': 768,
};
```

### 5.5 Chrome High-Resolution Timer Restrictions

**Issue**: Chrome restricts `performance.now()` precision without cross-origin isolation.

**Impact**: Timing-sensitive audio calculations may be less accurate.

**Solution**: Always ensure COOP/COEP headers are set (already required for SharedArrayBuffer).

---

## 6. Implementation Checklist for A01/A06

### Server Configuration (A06 Backend)
- [ ] Configure COOP/COEP headers on all DAW routes
- [ ] Set up plugin CDN with proper CORS headers
- [ ] Implement CSP header generation

### Client Implementation (A01 Frontend)
- [ ] Implement `checkWAMSupport()` on app initialization
- [ ] Create browser compatibility banner component
- [ ] Implement mobile blocker UI
- [ ] Add Safari watchdog for AudioContext recovery

### Plugin Loading (A03 Integration - This Sprint)
- [ ] Create plugin loader service with tier support
- [ ] Implement error boundaries for plugin isolation
- [ ] Set up plugin CDN hosting infrastructure
- [ ] Document Tier 1 plugin bundle versions

---

## Appendix: Quick Reference

### Supported Configuration
```
Browser: Chrome 94+, Edge 94+, Firefox 89+, Safari 15.4+ (limited)
Platform: Desktop only (Windows, macOS, Linux)
Screen: 1024px minimum width
Memory: 4GB RAM minimum, 8GB recommended
```

### Headers Checklist
```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: cross-origin
Content-Security-Policy: [see section 4]
```

### Emergency Contacts
- WAM Issues: https://github.com/niclasvonwydler/web-audio-modules/issues
- Ascend Issues: Internal Slack #daw-integrations
