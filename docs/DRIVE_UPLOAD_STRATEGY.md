# Google Drive Upload Strategy

> **Owner**: A03 (Integrations Specialist)  
> **Version**: 1.0.0  
> **Last Updated**: 2026-01-11  
> **Status**: Approved for Sprint 0

This document defines the upload strategy for DAW project assets to Google Drive, including resumable uploads, retry logic, and token management.

---

## 1. Resumable Upload Pattern

### Overview

All DAW asset uploads use Google Drive's [Resumable Upload API](https://developers.google.com/drive/api/v3/resumable-upload) to handle large files reliably.

### Configuration

```typescript
// packages/shared/src/types/drive.types.ts
export interface UploadConfig {
  /** Chunk size in bytes (default: 5MB) */
  chunkSize: number;
  /** Maximum concurrent chunk uploads */
  concurrency: number;
  /** Calculate MD5 checksum per chunk */
  verifyChecksum: boolean;
  /** Progress callback interval in ms */
  progressInterval: number;
}

export const DEFAULT_UPLOAD_CONFIG: UploadConfig = {
  chunkSize: 5 * 1024 * 1024, // 5MB
  concurrency: 3,
  verifyChecksum: true,
  progressInterval: 250,
};

// Configurable per file size
export function getUploadConfig(fileSizeBytes: number): UploadConfig {
  if (fileSizeBytes < 5 * 1024 * 1024) {
    // Small files: single request, no chunking
    return { ...DEFAULT_UPLOAD_CONFIG, chunkSize: fileSizeBytes, concurrency: 1 };
  }
  if (fileSizeBytes > 100 * 1024 * 1024) {
    // Large files (100MB+): larger chunks, more parallelism
    return { ...DEFAULT_UPLOAD_CONFIG, chunkSize: 10 * 1024 * 1024, concurrency: 3 };
  }
  return DEFAULT_UPLOAD_CONFIG;
}
```

### Resumable Upload Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │     │   Backend   │     │ Google Drive│
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │ 1. Request Upload │                   │
       │──────────────────>│                   │
       │                   │ 2. Init Resumable │
       │                   │──────────────────>│
       │                   │                   │
       │                   │ 3. Resumable URI  │
       │                   │<──────────────────│
       │ 4. Upload Session │                   │
       │<──────────────────│                   │
       │                   │                   │
       │ 5. Upload Chunks (direct to Drive)    │
       │───────────────────────────────────────>
       │                   │                   │
       │ 6. Chunk ACK      │                   │
       │<───────────────────────────────────────
       │                   │                   │
       │      [Repeat 5-6 for all chunks]      │
       │                   │                   │
       │ 7. Upload Complete│                   │
       │──────────────────>│                   │
       │                   │ 8. Verify & Index │
       │                   │──────────────────>│
       │ 9. Success        │                   │
       │<──────────────────│                   │
```

### Backend: Initialize Upload Session

```typescript
// Backend: POST /api/drive/upload/init
interface InitUploadRequest {
  fileName: string;
  mimeType: string;
  fileSize: number;
  folderId?: string;
  projectId: string;
}

interface InitUploadResponse {
  uploadId: string;
  resumableUri: string;
  expiresAt: string; // ISO timestamp, typically 7 days
  chunkSize: number;
}

async function initResumableUpload(
  req: InitUploadRequest,
  accessToken: string
): Promise<InitUploadResponse> {
  const uploadId = crypto.randomUUID();
  
  // Initialize resumable session with Google
  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': req.mimeType,
        'X-Upload-Content-Length': String(req.fileSize),
      },
      body: JSON.stringify({
        name: req.fileName,
        parents: req.folderId ? [req.folderId] : undefined,
        appProperties: {
          ascendProjectId: req.projectId,
          ascendUploadId: uploadId,
        },
      }),
    }
  );
  
  const resumableUri = response.headers.get('Location');
  if (!resumableUri) {
    throw new Error('Failed to get resumable URI');
  }
  
  // Store upload session in database
  await db.uploadSessions.create({
    id: uploadId,
    resumableUri,
    fileName: req.fileName,
    fileSize: req.fileSize,
    projectId: req.projectId,
    status: 'pending',
    bytesUploaded: 0,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  
  return {
    uploadId,
    resumableUri,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    chunkSize: getUploadConfig(req.fileSize).chunkSize,
  };
}
```

### Frontend: Chunk Upload Manager

```typescript
// Frontend upload service
interface ChunkUploadProgress {
  uploadId: string;
  totalBytes: number;
  uploadedBytes: number;
  currentChunk: number;
  totalChunks: number;
  speed: number; // bytes per second
  eta: number; // seconds remaining
}

class ResumableUploader {
  private abortController: AbortController | null = null;
  
  async upload(
    file: File,
    session: InitUploadResponse,
    onProgress: (progress: ChunkUploadProgress) => void
  ): Promise<DriveFile> {
    const config = getUploadConfig(file.size);
    const totalChunks = Math.ceil(file.size / config.chunkSize);
    let uploadedBytes = 0;
    const startTime = Date.now();
    
    this.abortController = new AbortController();
    
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * config.chunkSize;
      const end = Math.min(start + config.chunkSize, file.size);
      const chunk = file.slice(start, end);
      
      // Calculate checksum if enabled
      let checksum: string | undefined;
      if (config.verifyChecksum) {
        checksum = await this.calculateMD5(chunk);
      }
      
      // Upload chunk with retry
      const result = await this.uploadChunkWithRetry(
        session.resumableUri,
        chunk,
        start,
        end - 1,
        file.size,
        checksum
      );
      
      uploadedBytes = end;
      
      // Calculate progress
      const elapsed = (Date.now() - startTime) / 1000;
      const speed = uploadedBytes / elapsed;
      const remaining = file.size - uploadedBytes;
      
      onProgress({
        uploadId: session.uploadId,
        totalBytes: file.size,
        uploadedBytes,
        currentChunk: chunkIndex + 1,
        totalChunks,
        speed,
        eta: remaining / speed,
      });
      
      // Check if upload complete
      if (result.complete) {
        return result.file;
      }
    }
    
    throw new Error('Upload did not complete');
  }
  
  private async uploadChunkWithRetry(
    uri: string,
    chunk: Blob,
    start: number,
    end: number,
    total: number,
    checksum?: string
  ): Promise<{ complete: boolean; file?: DriveFile }> {
    const maxRetries = 5;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        return await this.uploadChunk(uri, chunk, start, end, total, checksum);
      } catch (error) {
        attempt++;
        if (attempt >= maxRetries) throw error;
        
        const delay = this.getBackoffDelay(attempt);
        console.warn(`Chunk upload failed, retry ${attempt}/${maxRetries} in ${delay}ms`);
        await this.sleep(delay);
      }
    }
    
    throw new Error('Max retries exceeded');
  }
  
  private async uploadChunk(
    uri: string,
    chunk: Blob,
    start: number,
    end: number,
    total: number,
    checksum?: string
  ): Promise<{ complete: boolean; file?: DriveFile }> {
    const headers: Record<string, string> = {
      'Content-Length': String(chunk.size),
      'Content-Range': `bytes ${start}-${end}/${total}`,
    };
    
    if (checksum) {
      headers['X-Upload-Content-MD5'] = checksum;
    }
    
    const response = await fetch(uri, {
      method: 'PUT',
      headers,
      body: chunk,
      signal: this.abortController?.signal,
    });
    
    if (response.status === 200 || response.status === 201) {
      // Upload complete
      const file = await response.json();
      return { complete: true, file };
    }
    
    if (response.status === 308) {
      // Resume incomplete - chunk accepted, continue
      return { complete: false };
    }
    
    throw new UploadError(`Chunk upload failed: ${response.status}`, response.status);
  }
  
  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }
  
  private getBackoffDelay(attempt: number): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 32s
    return Math.min(1000 * Math.pow(2, attempt - 1), 32000);
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  private async calculateMD5(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('MD5', buffer);
    return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
  }
}
```

---

## 2. Retry & Backoff Strategy

### Backoff Configuration

```typescript
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number; // 0-1, adds randomness to prevent thundering herd
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 32000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(baseDelay, config.maxDelayMs);
  
  // Add jitter
  const jitter = cappedDelay * config.jitterFactor * Math.random();
  return Math.floor(cappedDelay + jitter);
}
```

### Retry Sequence

| Attempt | Base Delay | With Jitter (example) |
|:-------:|:----------:|:---------------------:|
| 1 | 1s | 1.0-1.1s |
| 2 | 2s | 2.0-2.2s |
| 3 | 4s | 4.0-4.4s |
| 4 | 8s | 8.0-8.8s |
| 5 | 16s | 16.0-17.6s |
| 6+ | 32s (max) | 32.0-35.2s |

### Retryable vs Non-Retryable Errors

```typescript
export function isRetryableError(error: unknown): boolean {
  if (error instanceof UploadError) {
    const status = error.statusCode;
    
    // Retryable HTTP errors
    if (status === 408 || status === 429 || status === 500 || 
        status === 502 || status === 503 || status === 504) {
      return true;
    }
    
    // Non-retryable
    if (status === 400 || status === 401 || status === 403 || status === 404) {
      return false;
    }
  }
  
  // Network errors are retryable
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  
  return false;
}

// Error classification for user feedback
export type UploadErrorCategory = 
  | 'network'      // Retry automatically
  | 'auth'         // Re-authenticate
  | 'quota'        // User action required
  | 'conflict'     // File exists, prompt overwrite
  | 'server'       // Retry or report
  | 'client';      // Bug, report

export function categorizeError(error: UploadError): UploadErrorCategory {
  switch (error.statusCode) {
    case 401: return 'auth';
    case 403: return error.message.includes('quota') ? 'quota' : 'auth';
    case 409: return 'conflict';
    case 500:
    case 502:
    case 503:
    case 504: return 'server';
    default: return 'client';
  }
}
```

### Resume After Disconnect

```typescript
async function resumeUpload(uploadId: string): Promise<DriveFile> {
  // 1. Get session from backend
  const session = await api.getUploadSession(uploadId);
  
  if (session.status === 'expired') {
    throw new Error('Upload session expired. Please restart upload.');
  }
  
  // 2. Query Google for current upload state
  const response = await fetch(session.resumableUri, {
    method: 'PUT',
    headers: {
      'Content-Length': '0',
      'Content-Range': `bytes */${session.fileSize}`,
    },
  });
  
  if (response.status === 200 || response.status === 201) {
    // Already complete!
    return response.json();
  }
  
  if (response.status === 308) {
    // Get bytes uploaded so far
    const range = response.headers.get('Range');
    const uploadedBytes = range ? parseInt(range.split('-')[1]) + 1 : 0;
    
    console.log(`Resuming upload from byte ${uploadedBytes}`);
    
    // Resume from last successful byte
    return continueUpload(session, uploadedBytes);
  }
  
  throw new Error('Failed to resume upload');
}
```

---

## 3. Token Refresh Ownership

### Architecture Decision

> **⚠️ CRITICAL**: The **backend owns all token operations**. The frontend NEVER handles refresh tokens.

```
┌─────────────┐                  ┌─────────────┐                  ┌─────────────┐
│   Frontend  │                  │   Backend   │                  │ Google OAuth│
└──────┬──────┘                  └──────┬──────┘                  └──────┬──────┘
       │                                │                                │
       │ Request upload                 │                                │
       │───────────────────────────────>│                                │
       │                                │                                │
       │                                │ Check token expiry             │
       │                                │ (expires_at - 5min)            │
       │                                │                                │
       │                                │ If expired: refresh            │
       │                                │───────────────────────────────>│
       │                                │                                │
       │                                │ New access token               │
       │                                │<───────────────────────────────│
       │                                │                                │
       │ Resumable URI                  │                                │
       │ (or pre-signed URL)            │                                │
       │<───────────────────────────────│                                │
       │                                │                                │
       │ Upload directly                │                                │
       │─────────────────────────────────────────────────────────────────>
```

### Token Refresh Implementation

```typescript
// Backend: Token manager service
class DriveTokenManager {
  private readonly REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes
  
  async getValidAccessToken(userId: string): Promise<string> {
    const connection = await db.driveConnections.findByUserId(userId);
    
    if (!connection) {
      throw new AuthError('No Google Drive connection', 'NO_CONNECTION');
    }
    
    // Check if token needs refresh
    const expiresAt = new Date(connection.expires_at).getTime();
    const now = Date.now();
    
    if (expiresAt - now < this.REFRESH_BUFFER_MS) {
      return this.refreshToken(connection);
    }
    
    return connection.access_token;
  }
  
  private async refreshToken(connection: DriveConnection): Promise<string> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: connection.refresh_token,
        grant_type: 'refresh_token',
      }),
    });
    
    if (!response.ok) {
      // Refresh token revoked or expired
      await this.invalidateConnection(connection.user_id);
      throw new AuthError('Google connection expired. Please reconnect.', 'TOKEN_REVOKED');
    }
    
    const tokens = await response.json();
    
    // Update stored tokens
    await db.driveConnections.update(connection.id, {
      access_token: tokens.access_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000),
    });
    
    return tokens.access_token;
  }
  
  private async invalidateConnection(userId: string): Promise<void> {
    await db.driveConnections.update(
      { user_id: userId },
      { status: 'revoked', access_token: null }
    );
    
    // Notify frontend via WebSocket or polling
    await notificationService.send(userId, {
      type: 'drive_disconnected',
      message: 'Your Google Drive connection has expired. Please reconnect.',
    });
  }
}
```

### Frontend: Handling Auth Errors

```typescript
// Frontend: Upload service error handling
class UploadService {
  async upload(file: File, projectId: string): Promise<DriveFile> {
    try {
      return await this.performUpload(file, projectId);
    } catch (error) {
      if (error instanceof AuthError) {
        if (error.code === 'TOKEN_REVOKED' || error.code === 'NO_CONNECTION') {
          // Trigger re-auth flow
          await this.handleReauth();
          // Retry once after re-auth
          return await this.performUpload(file, projectId);
        }
      }
      throw error;
    }
  }
  
  private async handleReauth(): Promise<void> {
    const confirmed = await showDialog({
      title: 'Reconnect Google Drive',
      message: 'Your Google Drive connection has expired. Would you like to reconnect?',
      actions: ['Cancel', 'Reconnect'],
    });
    
    if (confirmed === 'Reconnect') {
      // Opens Google OAuth popup
      await authService.connectGoogleDrive();
    } else {
      throw new UserCancelledError('User declined to reconnect Google Drive');
    }
  }
}
```

---

## 4. Large File Handling (100MB+)

### Parallel Chunk Upload Strategy

```typescript
class ParallelChunkUploader {
  private readonly MAX_CONCURRENT = 3;
  
  async uploadLargeFile(
    file: File,
    session: InitUploadResponse,
    onProgress: (progress: ChunkUploadProgress) => void
  ): Promise<DriveFile> {
    const config = getUploadConfig(file.size);
    const chunks = this.createChunks(file, config.chunkSize);
    
    // Track overall progress
    const progress = new UploadProgressTracker(file.size, chunks.length);
    
    // Upload chunks with controlled concurrency
    // Note: Must upload in order for resumable upload
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Verify checksum before upload
      const checksum = await this.calculateMD5(chunk.blob);
      
      await this.uploadChunkWithRetry(session.resumableUri, chunk, checksum);
      
      progress.markChunkComplete(i);
      onProgress(progress.getProgress());
    }
    
    return this.finalizeUpload(session);
  }
  
  private createChunks(file: File, chunkSize: number): Chunk[] {
    const chunks: Chunk[] = [];
    let offset = 0;
    
    while (offset < file.size) {
      const end = Math.min(offset + chunkSize, file.size);
      chunks.push({
        index: chunks.length,
        start: offset,
        end: end - 1,
        blob: file.slice(offset, end),
      });
      offset = end;
    }
    
    return chunks;
  }
}
```

### MD5 Checksum Verification

```typescript
async function calculateMD5(blob: Blob): Promise<string> {
  // Use SubtleCrypto for efficient hashing
  const buffer = await blob.arrayBuffer();
  
  // Note: SubtleCrypto doesn't support MD5, use a library or worker
  const md5 = await crypto.subtle.digest('SHA-256', buffer); // Fallback to SHA-256
  
  // For true MD5, use spark-md5 library in a worker
  return arrayBufferToBase64(md5);
}

// For large files, use streaming hash
async function calculateMD5Streaming(blob: Blob): Promise<string> {
  const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks for hashing
  const spark = new SparkMD5.ArrayBuffer();
  
  for (let offset = 0; offset < blob.size; offset += CHUNK_SIZE) {
    const chunk = blob.slice(offset, offset + CHUNK_SIZE);
    const buffer = await chunk.arrayBuffer();
    spark.append(buffer);
  }
  
  return spark.end();
}
```

### Incomplete Upload Cleanup

```typescript
// Backend: Scheduled job (runs every hour)
async function cleanupIncompleteUploads(): Promise<void> {
  const EXPIRY_HOURS = 24;
  const cutoff = new Date(Date.now() - EXPIRY_HOURS * 60 * 60 * 1000);
  
  const staleUploads = await db.uploadSessions.findMany({
    where: {
      status: 'pending',
      createdAt: { lt: cutoff },
    },
  });
  
  for (const upload of staleUploads) {
    try {
      // Cancel the resumable upload with Google
      await fetch(upload.resumableUri, {
        method: 'DELETE',
        headers: {
          'Content-Length': '0',
        },
      });
      
      // Mark as cleaned up
      await db.uploadSessions.update(upload.id, {
        status: 'cancelled',
        cancelledReason: 'auto_cleanup_24h',
      });
      
      console.log(`Cleaned up stale upload: ${upload.id}`);
    } catch (error) {
      console.error(`Failed to cleanup upload ${upload.id}:`, error);
    }
  }
}
```

---

## 5. Error Handling

### Error Types and User Messages

| Error Type | HTTP Code | User Message | Action |
|------------|:---------:|--------------|--------|
| Network Error | - | "Connection lost. Retrying..." | Auto-retry |
| Rate Limited | 429 | "Too many requests. Waiting..." | Auto-retry with backoff |
| Quota Exceeded | 403 | "Google Drive storage full" | Show cleanup dialog |
| Auth Expired | 401 | "Session expired. Please reconnect." | Re-auth flow |
| File Too Large | 400 | "File exceeds 5TB limit" | Block upload |
| Server Error | 5xx | "Google Drive unavailable. Retrying..." | Auto-retry |

### Error Handling Implementation

```typescript
class UploadErrorHandler {
  async handleError(error: unknown, context: UploadContext): Promise<ErrorResolution> {
    if (error instanceof UploadError) {
      switch (error.statusCode) {
        case 401:
          return this.handleAuthError(context);
        
        case 403:
          if (error.message.includes('storageQuotaExceeded')) {
            return this.handleQuotaError(context);
          }
          return this.handlePermissionError(context);
        
        case 404:
          return this.handleSessionExpired(context);
        
        case 429:
          return this.handleRateLimit(error, context);
        
        case 500:
        case 502:
        case 503:
        case 504:
          return this.handleServerError(context);
        
        default:
          return this.handleUnknownError(error, context);
      }
    }
    
    if (this.isNetworkError(error)) {
      return this.handleNetworkError(context);
    }
    
    return this.handleUnknownError(error, context);
  }
  
  private async handleQuotaError(context: UploadContext): Promise<ErrorResolution> {
    // Notify user and provide cleanup suggestions
    await showNotification({
      type: 'error',
      title: 'Storage Full',
      message: 'Your Google Drive is full. Free up space to continue uploading.',
      actions: [
        { label: 'Open Drive', action: () => window.open('https://drive.google.com') },
        { label: 'Cancel Upload', action: () => context.abort() },
      ],
    });
    
    return { action: 'abort', reason: 'quota_exceeded' };
  }
  
  private async handleNetworkError(context: UploadContext): Promise<ErrorResolution> {
    // Wait for network recovery
    await this.waitForNetwork();
    
    // Resume from last successful chunk
    return { 
      action: 'resume', 
      fromByte: context.lastSuccessfulByte,
    };
  }
  
  private async waitForNetwork(): Promise<void> {
    return new Promise(resolve => {
      if (navigator.onLine) {
        resolve();
        return;
      }
      
      const handler = () => {
        window.removeEventListener('online', handler);
        resolve();
      };
      
      window.addEventListener('online', handler);
    });
  }
}
```

---

## 6. Integration with DAW

### Upload Queue Management

```typescript
interface QueuedUpload {
  id: string;
  file: File;
  projectId: string;
  priority: 'high' | 'normal' | 'low';
  status: 'queued' | 'uploading' | 'paused' | 'complete' | 'failed';
  progress: number;
  retries: number;
  addedAt: Date;
}

class UploadQueueManager {
  private queue: QueuedUpload[] = [];
  private activeUploads = new Map<string, ResumableUploader>();
  private readonly MAX_CONCURRENT_UPLOADS = 2;
  
  async add(file: File, projectId: string, priority: 'high' | 'normal' | 'low' = 'normal'): Promise<string> {
    const upload: QueuedUpload = {
      id: crypto.randomUUID(),
      file,
      projectId,
      priority,
      status: 'queued',
      progress: 0,
      retries: 0,
      addedAt: new Date(),
    };
    
    this.queue.push(upload);
    this.sortQueue();
    this.processQueue();
    
    return upload.id;
  }
  
  private sortQueue(): void {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    this.queue.sort((a, b) => {
      if (a.status === 'uploading') return -1;
      if (b.status === 'uploading') return 1;
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }
  
  private async processQueue(): Promise<void> {
    const uploadingCount = this.queue.filter(u => u.status === 'uploading').length;
    
    if (uploadingCount >= this.MAX_CONCURRENT_UPLOADS) return;
    
    const next = this.queue.find(u => u.status === 'queued');
    if (!next) return;
    
    next.status = 'uploading';
    
    try {
      const uploader = new ResumableUploader();
      this.activeUploads.set(next.id, uploader);
      
      const session = await api.initUpload({
        fileName: next.file.name,
        mimeType: next.file.type,
        fileSize: next.file.size,
        projectId: next.projectId,
      });
      
      await uploader.upload(next.file, session, (progress) => {
        next.progress = (progress.uploadedBytes / progress.totalBytes) * 100;
        this.emit('progress', { uploadId: next.id, progress: next.progress });
      });
      
      next.status = 'complete';
      this.emit('complete', { uploadId: next.id });
    } catch (error) {
      next.status = 'failed';
      this.emit('error', { uploadId: next.id, error });
    } finally {
      this.activeUploads.delete(next.id);
      this.processQueue(); // Process next item
    }
  }
  
  pause(uploadId: string): void {
    const uploader = this.activeUploads.get(uploadId);
    if (uploader) {
      uploader.abort();
      const upload = this.queue.find(u => u.id === uploadId);
      if (upload) upload.status = 'paused';
    }
  }
  
  resume(uploadId: string): void {
    const upload = this.queue.find(u => u.id === uploadId);
    if (upload && upload.status === 'paused') {
      upload.status = 'queued';
      this.processQueue();
    }
  }
  
  cancel(uploadId: string): void {
    this.pause(uploadId);
    this.queue = this.queue.filter(u => u.id !== uploadId);
  }
}
```

### Background Upload During Session

```typescript
// Auto-save and upload DAW project changes
class DAWAutoSaver {
  private readonly SAVE_INTERVAL_MS = 60000; // 1 minute
  private readonly uploadQueue: UploadQueueManager;
  private lastSaveHash: string | null = null;
  
  constructor(uploadQueue: UploadQueueManager) {
    this.uploadQueue = uploadQueue;
    this.startAutoSave();
  }
  
  private startAutoSave(): void {
    setInterval(() => this.autoSave(), this.SAVE_INTERVAL_MS);
    
    // Also save before unload
    window.addEventListener('beforeunload', (e) => {
      if (this.hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes.';
      }
    });
  }
  
  private async autoSave(): Promise<void> {
    const project = dawState.getCurrentProject();
    if (!project) return;
    
    const projectData = await project.serialize();
    const hash = await this.hashData(projectData);
    
    // Skip if no changes
    if (hash === this.lastSaveHash) return;
    
    // Create project file blob
    const blob = new Blob([projectData], { type: 'application/json' });
    const file = new File([blob], `${project.name}.ascend`, {
      type: 'application/json',
    });
    
    // Queue for upload (low priority, background)
    await this.uploadQueue.add(file, project.id, 'low');
    this.lastSaveHash = hash;
    
    showToast('Project saved', 'success');
  }
  
  private hasUnsavedChanges(): boolean {
    // Check if current state differs from last save
    return this.lastSaveHash !== null; // Simplified check
  }
}
```

### Offline Detection and Pause

```typescript
class OfflineHandler {
  private wasOffline = false;
  private pausedUploads: string[] = [];
  
  constructor(private uploadQueue: UploadQueueManager) {
    this.setupListeners();
  }
  
  private setupListeners(): void {
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    
    // Also monitor actual connectivity (not just browser state)
    this.startConnectivityPolling();
  }
  
  private handleOffline(): void {
    if (this.wasOffline) return;
    this.wasOffline = true;
    
    // Pause all active uploads
    const activeUploads = this.uploadQueue.getActiveUploads();
    this.pausedUploads = activeUploads.map(u => {
      this.uploadQueue.pause(u.id);
      return u.id;
    });
    
    showNotification({
      type: 'warning',
      title: 'You\'re offline',
      message: 'Uploads paused. They will resume when you\'re back online.',
      persistent: true,
      id: 'offline-notification',
    });
  }
  
  private handleOnline(): void {
    if (!this.wasOffline) return;
    this.wasOffline = false;
    
    // Resume paused uploads
    for (const uploadId of this.pausedUploads) {
      this.uploadQueue.resume(uploadId);
    }
    this.pausedUploads = [];
    
    dismissNotification('offline-notification');
    
    showToast('Back online! Resuming uploads...', 'success');
  }
  
  private startConnectivityPolling(): void {
    // Ping our backend every 30s to verify actual connectivity
    setInterval(async () => {
      try {
        await fetch('/api/health', { method: 'HEAD' });
        if (this.wasOffline) this.handleOnline();
      } catch {
        if (!this.wasOffline) this.handleOffline();
      }
    }, 30000);
  }
}
```

---

## 7. Implementation Checklist for A01/A06

### Backend (A06)
- [ ] Implement `POST /api/drive/upload/init` endpoint
- [ ] Implement `GET /api/drive/upload/:id` for session status
- [ ] Add token refresh logic in `DriveTokenManager`
- [ ] Create scheduled job for stale upload cleanup
- [ ] Add upload progress tracking in database

### Frontend (A01)
- [ ] Create `ResumableUploader` class
- [ ] Implement `UploadQueueManager` 
- [ ] Build upload progress UI component
- [ ] Add offline detection and handling
- [ ] Implement auto-save for DAW projects

### Integration (A03 - This Sprint)
- [ ] Define TypeScript interfaces in `packages/shared`
- [ ] Document API contracts
- [ ] Create integration test fixtures

---

## Appendix: Quick Reference

### Upload Size Tiers

| File Size | Chunk Size | Concurrency | Checksum |
|-----------|:----------:|:-----------:|:--------:|
| < 5 MB | Single request | 1 | Optional |
| 5-100 MB | 5 MB | 1 | Yes |
| 100 MB+ | 10 MB | 3 | Yes |

### Retry Backoff

```
Attempt 1: 1s delay
Attempt 2: 2s delay
Attempt 3: 4s delay
Attempt 4: 8s delay
Attempt 5: 16s delay
Max: 32s delay
```

### Token Refresh Timeline

```
Token Lifetime: 1 hour (3600s)
Refresh Buffer: 5 minutes before expiry
Refresh Trigger: expires_at - 300s
```
