/**
 * Drive Integration Module
 * Unified exports for Google Drive upload and audio caching
 */

// Upload utilities
export {
  uploadFile,
  initiateUpload,
  resumeUpload,
  validateFile,
  ACCEPTED_AUDIO_TYPES,
  MAX_FILE_SIZE,
  UploadError,
  type UploadProgress,
  type UploadResult,
  type InitUploadResponse,
} from './upload';

// Cache
export {
  AudioBufferCache,
  audioCache,
  type CacheStats,
  type CacheEntry,
} from './cache';

// Fetcher
export {
  fetchAudioBuffer,
  prefetchClips,
  getCachedBuffer,
  isCached,
  evictFromCache,
  clearCache,
  getCacheStats,
  getCacheMemoryUsage,
  type FetchOptions,
  type PrefetchResult,
} from './fetcher';
