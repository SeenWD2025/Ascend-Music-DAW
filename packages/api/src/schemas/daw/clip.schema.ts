/**
 * Zod schemas for DAW clip validation.
 * All request/response payloads are validated against these schemas.
 */

import { z } from 'zod';

// ============================================================================
// Enums
// ============================================================================

export const ClipTypeSchema = z.enum(['audio', 'midi']);
export type ClipType = z.infer<typeof ClipTypeSchema>;

// ============================================================================
// Clip Schemas
// ============================================================================

/**
 * Schema for creating a new clip.
 */
export const CreateClipSchema = z.object({
  name: z
    .string()
    .min(1, 'Clip name is required')
    .max(100, 'Clip name must be 100 characters or less'),
  start_time: z
    .number()
    .min(0, 'Start time must be at least 0')
    .default(0),
  duration: z
    .number()
    .positive('Duration must be positive'),
  source_offset_seconds: z
    .number()
    .min(0, 'Source offset must be at least 0')
    .default(0),
  clip_type: ClipTypeSchema.default('audio'),
  drive_file_id: z
    .string()
    .uuid('Drive file ID must be a valid UUID')
    .optional(),
  volume: z
    .number()
    .min(0, 'Volume must be at least 0')
    .max(2, 'Volume must be 2 or less')
    .default(1.0),
  pan: z
    .number()
    .min(-1, 'Pan must be at least -1')
    .max(1, 'Pan must be 1 or less')
    .default(0),
  mute: z.boolean().default(false),
});

/**
 * Schema for updating an existing clip.
 */
export const UpdateClipSchema = CreateClipSchema.partial();

/**
 * Schema for moving a clip (change start time and/or track).
 */
export const MoveClipSchema = z.object({
  start_time: z
    .number()
    .min(0, 'Start time must be at least 0'),
  track_id: z
    .string()
    .uuid('Track ID must be a valid UUID')
    .optional(),
});

// ============================================================================
// Response Types
// ============================================================================

/**
 * Full clip response from the database.
 */
export interface ClipResponse {
  id: string;
  track_id: string;
  name: string;
  start_time: number;
  duration: number;
  source_offset_seconds: number;
  clip_type: ClipType;
  drive_file_id: string | null;
  volume: number;
  pan: number;
  mute: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Clip list item (subset of fields for list views).
 */
export interface ClipListItem {
  id: string;
  track_id: string;
  name: string;
  start_time: number;
  duration: number;
  clip_type: ClipType;
  drive_file_id: string | null;
  volume: number;
  pan: number;
  mute: boolean;
}

// ============================================================================
// Inferred Types
// ============================================================================

export type CreateClipInput = z.infer<typeof CreateClipSchema>;
export type UpdateClipInput = z.infer<typeof UpdateClipSchema>;
export type MoveClipInput = z.infer<typeof MoveClipSchema>;
