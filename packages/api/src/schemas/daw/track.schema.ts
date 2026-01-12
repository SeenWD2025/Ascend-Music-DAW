/**
 * Zod schemas for DAW track validation.
 * All request/response payloads are validated against these schemas.
 */

import { z } from 'zod';

// ============================================================================
// Enums
// ============================================================================

export const TrackTypeSchema = z.enum(['audio', 'midi', 'bus', 'master']);
export type TrackType = z.infer<typeof TrackTypeSchema>;

// ============================================================================
// Track Schemas
// ============================================================================

/**
 * Schema for creating a new track.
 */
export const CreateTrackSchema = z.object({
  name: z
    .string()
    .min(1, 'Track name is required')
    .max(100, 'Track name must be 100 characters or less'),
  type: TrackTypeSchema.default('audio'),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color (e.g., #FF5500)')
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
  solo: z.boolean().default(false),
  armed: z.boolean().default(false),
});

/**
 * Schema for updating an existing track.
 */
export const UpdateTrackSchema = CreateTrackSchema.partial();

/**
 * Schema for reordering tracks within a project.
 */
export const ReorderTracksSchema = z.object({
  trackIds: z
    .array(z.string().uuid('Each track ID must be a valid UUID'))
    .min(1, 'At least one track ID is required'),
});

// ============================================================================
// Response Types
// ============================================================================

/**
 * Full track response object.
 */
export interface TrackResponse {
  id: string;
  project_id: string;
  name: string;
  type: TrackType;
  position: number;
  color: string | null;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
  routing: {
    input_source: string | null;
    output_destination: string;
  };
  created_at: string;
  updated_at: string;
}

/**
 * Track list item (for listing tracks in a project).
 */
export interface TrackListItem {
  id: string;
  project_id: string;
  name: string;
  type: TrackType;
  position: number;
  color: string | null;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
}

// ============================================================================
// Input Types
// ============================================================================

export type CreateTrackInput = z.infer<typeof CreateTrackSchema>;
export type UpdateTrackInput = z.infer<typeof UpdateTrackSchema>;
export type ReorderTracksInput = z.infer<typeof ReorderTracksSchema>;
