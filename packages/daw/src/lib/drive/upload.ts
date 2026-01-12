/**
 * Drive Upload Utilities for DAW
 * Handles resumable uploads to Google Drive via backend proxy
 * 
 * @see docs/DRIVE_UPLOAD_STRATEGY.md
 */

import * as Sentry from '@sentry/browser';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
  speed?: number; // bytes per second
  eta?: number; // seconds remaining
}

export interface UploadResult {
  driveFileId: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface InitUploadResponse {
  uploadId: string;
  resumableUri: string;
  expiresAt: string;
  chunkSize: number;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
}

export class UploadError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = '/api/v1';

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 32000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

/** Accepted audio MIME types */
export const ACCEPTED_AUDIO_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/flac',
  'audio/x-flac',
  'audio/ogg',
  'audio/aiff',
  'audio/x-aiff',
] as const;

/** Max file size: 2GB */
export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(baseDelay, config.maxDelayMs);
  const jitter = cappedDelay * config.jitterFactor * Math.random();
  return Math.floor(cappedDelay + jitter);
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof UploadError) {
    return error.retryable;
  }
  
  // Network errors are retryable
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  
  return false;
}

/**
 * Check if a status code is retryable
 */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 500 || 
         status === 502 || status === 503 || status === 504;
}

/**
 * Validate file for upload
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File exceeds 2GB limit' };
  }

  const isAudio = ACCEPTED_AUDIO_TYPES.some((type) =>
    file.type === type || file.name.toLowerCase().endsWith(`.${type.split('/')[1]}`)
  );

  if (!isAudio) {
    return { valid: false, error: 'Only audio files are accepted (WAV, MP3, FLAC, OGG, AIFF)' };
  }

  return { valid: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request resumable upload URI from backend
 * 
 * @param file - File to upload
 * @param projectId - DAW project ID
 * @returns Resumable upload session info
 * 
 * @example
 * ```ts
 * const session = await initiateUpload(audioFile, 'proj-123');
 * console.log('Upload URI:', session.resumableUri);
 * ```
 */
export async function initiateUpload(file: File, projectId: string): Promise<InitUploadResponse> {
  const span = Sentry.startSpan({ name: 'drive.upload.init', op: 'http.client' });
  
  try {
    const response = await fetch(`${API_BASE}/drive/upload/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type || 'audio/wav',
        fileSize: file.size,
        projectId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.message || `Failed to initiate upload: ${response.status}`;
      
      throw new UploadError(message, response.status, isRetryableStatus(response.status));
    }

    const data = await response.json();
    span?.setStatus({ code: 1, message: 'ok' });
    return data;
  } catch (error) {
    span?.setStatus({ code: 2, message: 'error' });
    
    if (error instanceof UploadError) {
      throw error;
    }
    
    Sentry.captureException(error, {
      tags: { component: 'drive_upload', operation: 'init' },
      contexts: { file: { name: file.name, size: file.size, type: file.type } },
    });
    
    throw new UploadError(
      error instanceof Error ? error.message : 'Failed to initiate upload',
      0,
      true
    );
  } finally {
    span?.end();
  }
}

/**
 * Upload file with progress callback
 * Uses resumable upload for reliability
 * 
 * @param file - File to upload
 * @param projectId - DAW project ID  
 * @param onProgress - Progress callback
 * @returns Upload result with Drive file info
 * 
 * @example
 * ```ts
 * const result = await uploadFile(audioFile, 'proj-123', (progress) => {
 *   console.log(`Upload: ${progress.percent}%`);
 * });
 * ```
 */
export async function uploadFile(
  file: File,
  projectId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  const span = Sentry.startSpan({ name: 'drive.upload.file', op: 'http.client' });
  
  try {
    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      throw new UploadError(validation.error!, 400, false);
    }

    // Initialize upload session
    const session = await initiateUpload(file, projectId);
    
    // Upload with retry logic
    const result = await uploadWithRetry(file, session, onProgress);
    
    // Finalize upload on backend
    await finalizeUpload(session.uploadId, result.driveFileId);
    
    span?.setStatus({ code: 1, message: 'ok' });
    return result;
  } catch (error) {
    span?.setStatus({ code: 2, message: 'error' });
    
    Sentry.captureException(error, {
      tags: { component: 'drive_upload', operation: 'upload' },
      contexts: { 
        file: { name: file.name, size: file.size, type: file.type },
        project: { id: projectId },
      },
    });
    
    throw error;
  } finally {
    span?.end();
  }
}

/**
 * Upload with retry logic and progress tracking
 */
async function uploadWithRetry(
  file: File,
  session: InitUploadResponse,
  onProgress?: (progress: UploadProgress) => void,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<UploadResult> {
  let attempt = 0;
  let lastError: Error | null = null;
  let uploadedBytes = 0;

  while (attempt < config.maxRetries) {
    try {
      return await performUpload(file, session, uploadedBytes, onProgress);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      attempt++;
      
      if (!isRetryableError(error) || attempt >= config.maxRetries) {
        throw lastError;
      }

      // Query upload status to determine resume point
      try {
        uploadedBytes = await queryUploadStatus(session.resumableUri, file.size);
      } catch {
        // If we can't query status, start from beginning
        uploadedBytes = 0;
      }

      const delay = calculateBackoffDelay(attempt, config);
      console.warn(`[Upload] Retry ${attempt}/${config.maxRetries} in ${delay}ms`);
      await sleep(delay);
    }
  }

  throw lastError || new UploadError('Upload failed after max retries', 0, false);
}

/**
 * Perform the actual upload with chunking
 */
async function performUpload(
  file: File,
  session: InitUploadResponse,
  startOffset: number,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  const chunkSize = session.chunkSize || 5 * 1024 * 1024; // 5MB default
  let uploadedBytes = startOffset;
  const startTime = Date.now();

  while (uploadedBytes < file.size) {
    const start = uploadedBytes;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);

    const response = await fetch(session.resumableUri, {
      method: 'PUT',
      headers: {
        'Content-Length': String(chunk.size),
        'Content-Range': `bytes ${start}-${end - 1}/${file.size}`,
      },
      body: chunk,
    });

    if (response.status === 200 || response.status === 201) {
      // Upload complete
      const data = await response.json();
      
      onProgress?.({
        loaded: file.size,
        total: file.size,
        percent: 100,
      });

      return {
        driveFileId: data.id,
        name: data.name,
        mimeType: data.mimeType,
        size: parseInt(data.size, 10),
      };
    }

    if (response.status === 308) {
      // Chunk accepted, continue
      const range = response.headers.get('Range');
      uploadedBytes = range ? parseInt(range.split('-')[1], 10) + 1 : end;
      
      // Calculate progress
      const elapsed = (Date.now() - startTime) / 1000;
      const speed = uploadedBytes / elapsed;
      const remaining = file.size - uploadedBytes;
      
      onProgress?.({
        loaded: uploadedBytes,
        total: file.size,
        percent: Math.round((uploadedBytes / file.size) * 100),
        speed,
        eta: speed > 0 ? remaining / speed : undefined,
      });
    } else {
      throw new UploadError(
        `Chunk upload failed: ${response.status}`,
        response.status,
        isRetryableStatus(response.status)
      );
    }
  }

  throw new UploadError('Upload did not complete', 0, true);
}

/**
 * Query Google for current upload status
 */
async function queryUploadStatus(resumableUri: string, totalSize: number): Promise<number> {
  const response = await fetch(resumableUri, {
    method: 'PUT',
    headers: {
      'Content-Length': '0',
      'Content-Range': `bytes */${totalSize}`,
    },
  });

  if (response.status === 200 || response.status === 201) {
    // Already complete
    return totalSize;
  }

  if (response.status === 308) {
    const range = response.headers.get('Range');
    if (range) {
      return parseInt(range.split('-')[1], 10) + 1;
    }
    return 0;
  }

  throw new UploadError(`Failed to query upload status: ${response.status}`, response.status);
}

/**
 * Resume failed upload from last chunk
 * 
 * @param uploadUri - Resumable upload URI
 * @param file - Original file
 * @param offset - Byte offset to resume from
 * @returns Upload result
 * 
 * @example
 * ```ts
 * // Resume from byte 10MB
 * const result = await resumeUpload(uri, file, 10 * 1024 * 1024);
 * ```
 */
export async function resumeUpload(
  uploadUri: string,
  file: File,
  offset: number
): Promise<UploadResult> {
  const span = Sentry.startSpan({ name: 'drive.upload.resume', op: 'http.client' });
  
  try {
    const session: InitUploadResponse = {
      uploadId: '',
      resumableUri: uploadUri,
      expiresAt: '',
      chunkSize: 5 * 1024 * 1024,
    };

    const result = await performUpload(file, session, offset);
    span?.setStatus({ code: 1, message: 'ok' });
    return result;
  } catch (error) {
    span?.setStatus({ code: 2, message: 'error' });
    
    Sentry.captureException(error, {
      tags: { component: 'drive_upload', operation: 'resume' },
      contexts: { 
        file: { name: file.name, size: file.size },
        resume: { offset },
      },
    });
    
    throw error;
  } finally {
    span?.end();
  }
}

/**
 * Notify backend that upload is complete
 */
async function finalizeUpload(uploadId: string, driveFileId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/drive/upload/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ uploadId, driveFileId }),
  });

  if (!response.ok) {
    // Non-critical - log but don't fail upload
    console.error('[Upload] Failed to finalize upload:', response.status);
  }
}
