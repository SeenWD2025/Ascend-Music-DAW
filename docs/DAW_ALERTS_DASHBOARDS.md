# DAW Alerts & Dashboards

> Monitoring dashboards, alerting rules, and SLOs for Ascend DAW.

## Dashboards

### 1. DAW Sessions Dashboard

| Panel | Metric | Visualization |
|-------|--------|---------------|
| Active Sessions | `daw_sessions_active` | Stat |
| Sessions by Tier | `daw_sessions_active{tier}` | Pie chart |
| Session Duration | `daw_session_duration_seconds` | Histogram |
| New Sessions/hr | `rate(daw_sessions_started_total[1h])` | Time series |
| Concurrent Users | `daw_collaboration_participants` | Gauge |

**Filters:** `environment`, `subscription_tier`, `region`

### 2. Audio Performance Dashboard

| Panel | Metric | Visualization |
|-------|--------|---------------|
| Audio Glitch Rate | `rate(daw_audio_glitches_total[5m])` | Time series |
| Buffer Underruns | `rate(daw_buffer_underruns_total[5m])` | Time series |
| CPU Usage (p95) | `histogram_quantile(0.95, daw_audio_cpu_usage)` | Gauge |
| Latency Distribution | `daw_audio_latency_ms` | Heatmap |
| Plugin Load Time | `daw_plugin_init_duration_seconds` | Histogram |
| Active Plugins | `daw_plugins_active` | Stat |

**Filters:** `buffer_size`, `sample_rate`, `plugin_type`

### 3. Exports Dashboard

| Panel | Metric | Visualization |
|-------|--------|---------------|
| Export Queue Depth | `daw_export_queue_size` | Gauge |
| Exports/hr | `rate(daw_exports_completed_total[1h])` | Time series |
| Export Success Rate | `daw_exports_completed_total / daw_exports_started_total` | Stat |
| Export Duration | `daw_export_duration_seconds` | Histogram |
| Exports by Format | `daw_exports_completed_total{format}` | Bar chart |
| Failed Exports | `daw_exports_failed_total` | Table (recent) |

**Filters:** `format`, `quality`, `track_count_bucket`

### 4. Collaboration Dashboard

| Panel | Metric | Visualization |
|-------|--------|---------------|
| Active Collab Sessions | `daw_collab_sessions_active` | Stat |
| WebSocket Connections | `daw_websocket_connections` | Time series |
| Message Rate | `rate(daw_realtime_messages_total[1m])` | Time series |
| Sync Latency (p95) | `histogram_quantile(0.95, daw_sync_latency_ms)` | Gauge |
| Connection Errors | `rate(daw_websocket_errors_total[5m])` | Time series |
| Participants/Session | `daw_collab_participants` | Histogram |

**Filters:** `message_type`, `region`

---

## Alerts

### Critical Alerts (PagerDuty)

| Alert | Condition | For | Severity |
|-------|-----------|-----|----------|
| Export Queue Backlog | `daw_export_queue_size > 50` | 5m | critical |
| Export Failure Spike | `rate(daw_exports_failed_total[10m]) / rate(daw_exports_started_total[10m]) > 0.05` | 5m | critical |
| WebSocket Error Storm | `rate(daw_websocket_errors_total[1m]) > 10` | 2m | critical |
| Audio Service Down | `up{job="daw-audio"} == 0` | 1m | critical |

### Warning Alerts (Slack)

| Alert | Condition | For | Severity |
|-------|-----------|-----|----------|
| High Glitch Rate | `rate(daw_audio_glitches_total[5m]) > 0.01` | 5m | warning |
| Export Queue Growing | `daw_export_queue_size > 25` | 10m | warning |
| High Plugin Init Time | `histogram_quantile(0.95, daw_plugin_init_duration_seconds) > 3` | 5m | warning |
| Elevated Latency | `histogram_quantile(0.95, daw_audio_latency_ms) > 40` | 5m | warning |
| Drive Upload Failures | `rate(daw_drive_upload_errors_total[10m]) > 0.02` | 5m | warning |

### Alert Definitions (Prometheus)

```yaml
groups:
  - name: daw-critical
    rules:
      - alert: ExportQueueBacklog
        expr: daw_export_queue_size > 50
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Export queue backlog critical"
          description: "Export queue has {{ $value }} pending jobs"

      - alert: ExportFailureRate
        expr: |
          rate(daw_exports_failed_total[10m]) 
          / rate(daw_exports_started_total[10m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Export failure rate >5%"
          description: "{{ $value | humanizePercentage }} of exports failing"

      - alert: WebSocketErrorStorm
        expr: rate(daw_websocket_errors_total[1m]) > 10
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "WebSocket errors exceeding 10/min"
          description: "{{ $value }} WebSocket errors per minute"

  - name: daw-warning
    rules:
      - alert: HighAudioGlitchRate
        expr: rate(daw_audio_glitches_total[5m]) > 0.01
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Audio glitch rate >1%"
          description: "Glitch rate at {{ $value | humanizePercentage }}"
```

---

## SLOs

### Latency SLO

| SLI | Target | Window |
|-----|--------|--------|
| Audio processing latency p95 | < 50ms | 30 days |
| Plugin initialization p95 | < 2s | 30 days |
| Real-time sync latency p95 | < 100ms | 30 days |

```yaml
# Audio Latency SLO
slo:
  name: audio-latency-p95
  target: 0.95
  window: 30d
  sli:
    events:
      good: histogram_quantile(0.95, daw_audio_latency_ms) < 50
      total: sum(rate(daw_audio_operations_total[30d]))
```

### Export Success SLO

| SLI | Target | Window |
|-----|--------|--------|
| Export completion rate | > 99% | 30 days |
| Export start-to-complete p95 | < 60s (per minute of audio) | 30 days |

```yaml
# Export Success SLO
slo:
  name: export-success-rate
  target: 0.99
  window: 30d
  sli:
    events:
      good: sum(rate(daw_exports_completed_total[30d]))
      total: sum(rate(daw_exports_started_total[30d]))
```

### Availability SLO

| SLI | Target | Window |
|-----|--------|--------|
| API availability | > 99.5% | 30 days |
| WebSocket uptime | > 99.5% | 30 days |
| Audio engine availability | > 99.9% | 30 days |

```yaml
# API Availability SLO
slo:
  name: api-availability
  target: 0.995
  window: 30d
  sli:
    events:
      good: sum(rate(http_requests_total{status!~"5.."}[30d]))
      total: sum(rate(http_requests_total[30d]))
```

### Error Budget Policy

| Remaining Budget | Action |
|------------------|--------|
| > 50% | Normal development velocity |
| 25-50% | Prioritize reliability work |
| 10-25% | Feature freeze, focus on stability |
| < 10% | Incident response mode |

---

## Runbook Links

| Alert | Runbook |
|-------|---------|
| ExportQueueBacklog | `docs/runbooks/export-queue.md` |
| WebSocketErrorStorm | `docs/runbooks/websocket-recovery.md` |
| HighAudioGlitchRate | `docs/runbooks/audio-performance.md` |
| DriveUploadFailures | `docs/runbooks/drive-integration.md` |
