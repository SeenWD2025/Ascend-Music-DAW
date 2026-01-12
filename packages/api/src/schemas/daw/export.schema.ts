/**
 * Zod schemas for DAW export validation.
 * All request/response payloads for exports are validated against these schemas.
 */

import { z } from 'zod';

// ============================================================================
// Enums
// ============================================================================

/**
 * Export format enum matching database daw_export_format type.
 */
export const ExportFormatSchema = z.enum(['wav', 'mp3', 'flac']);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;

/**
 * Export status enum matching database daw_export_status type.
 * State machine: pending -> processing -> completed/failed
 * Note: Database uses 'queued' and 'complete', but API normalizes to 'pending' and 'completed'
 */
export const ExportStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);
export type ExportStatus = z.infer<typeof ExportStatusSchema>;

// Database status values (for internal mapping)
export const DbExportStatusSchema = z.enum(['queued', 'processing', 'complete', 'failed']);
export type DbExportStatus = z.infer<typeof DbExportStatusSchema>;

// ============================================================================
// Quality Settings
// ============================================================================

/**
 * Quality settings for export.
 * Different fields are relevant for different formats.
 */
export const ExportQualitySchema = z.object({
  // MP3 bitrate in kbps (e.g., 128, 192, 256, 320)
  bitrate: z
    .number()
    .int()
    .refine(
      (val: number) => [128, 192, 256, 320].includes(val),
      'Bitrate must be one of: 128, 192, 256, 320 kbps'
    )
    .optional(),
  
  // Sample rate in Hz (defaults to project sample rate if not specified)
  sample_rate: z
    .number()
    .int()
    .refine(
      (val: number) => [22050, 44100, 48000, 88200, 96000, 176400, 192000].includes(val),
      'Sample rate must be one of: 22050, 44100, 48000, 88200, 96000, 176400, 192000'
    )
    .optional(),
  
  // Bit depth for WAV/FLAC (defaults to project bit depth if not specified)
  bit_depth: z
    .number()
    .int()
    .refine(
      (val: number) => [16, 24, 32].includes(val),
      'Bit depth must be one of: 16, 24, 32'
    )
    .optional(),
}).strict();

export type ExportQuality = z.infer<typeof ExportQualitySchema>;

// ============================================================================
// Path Parameter Schemas
// ============================================================================

/**
 * Schema for project ID parameter in export routes.
 */
export const ProjectIdParamSchema = z.object({
  projectId: z.string().uuid('Invalid project ID format'),
});

export type ProjectIdParam = z.infer<typeof ProjectIdParamSchema>;

/**
 * Schema for export ID parameter.
 */
export const ExportIdParamSchema = z.object({
  exportId: z.string().uuid('Invalid export ID format'),
});

export type ExportIdParam = z.infer<typeof ExportIdParamSchema>;

// ============================================================================
// Request Schemas
// ============================================================================

/**
 * Schema for creating a new export job.
 */
export const CreateExportSchema = z.object({
  // Client-provided UUID for idempotency
  idempotency_key: z
    .string()
    .uuid('Idempotency key must be a valid UUID')
    .describe('Client-provided UUID for request deduplication'),
  
  // Export format
  format: ExportFormatSchema.describe('Output audio format'),
  
  // Quality settings (optional, uses project defaults if not specified)
  quality: ExportQualitySchema.optional().default({}),
}).strict();

export type CreateExportInput = z.infer<typeof CreateExportSchema>;

// ============================================================================
// Response Schemas
// ============================================================================

/**
 * Full export response schema.
 */
export const ExportResponseSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  owner_id: z.string().uuid(),
  idempotency_key: z.string(),
  format: ExportFormatSchema,
  quality_settings: ExportQualitySchema.nullable(),
  status: ExportStatusSchema,
  r2_url: z.string().url().nullable(),
  error_message: z.string().nullable(),
  file_size_bytes: z.number().int().nullable(),
  duration_seconds: z.number().nullable(),
  started_at: z.string().datetime().nullable(),
  completed_at: z.string().datetime().nullable(),
  expires_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type ExportResponse = z.infer<typeof ExportResponseSchema>;

/**
 * Export list item (compact version for listing).
 */
export const ExportListItemSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  format: ExportFormatSchema,
  status: ExportStatusSchema,
  r2_url: z.string().url().nullable(),
  file_size_bytes: z.number().int().nullable(),
  duration_seconds: z.number().nullable(),
  created_at: z.string().datetime(),
  completed_at: z.string().datetime().nullable(),
});

export type ExportListItem = z.infer<typeof ExportListItemSchema>;

/**
 * Query parameters for listing exports.
 */
export const ListExportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: ExportStatusSchema.optional(),
});

export type ListExportsQuery = z.infer<typeof ListExportsQuerySchema>;

// ============================================================================
// Status Mapping Helpers
// ============================================================================

/**
 * Map database status to API status.
 */
export function mapDbStatusToApi(dbStatus: DbExportStatus): ExportStatus {
  switch (dbStatus) {
    case 'queued':
      return 'pending';
    case 'complete':
      return 'completed';
    default:
      return dbStatus as ExportStatus;
  }
}

/**
 * Map API status to database status.
 */
export function mapApiStatusToDb(apiStatus: ExportStatus): DbExportStatus {
  switch (apiStatus) {
    case 'pending':
      return 'queued';
    case 'completed':
      return 'complete';
    default:
      return apiStatus as DbExportStatus;
  }
}
