/**
 * R2 Storage Services Index
 * Re-exports all R2-related services and types.
 */

export {
  R2Service,
  R2Error,
  getR2Service,
  resetR2Service,
  MAX_EXPORT_SIZE,
  ALLOWED_EXPORT_TYPES,
  type R2Config,
  type UploadOptions,
  type UploadResult,
  type FileMetadata,
  type R2ErrorCode,
} from './r2.service.js';
