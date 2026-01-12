/**
 * Zod schemas for DAW plugin validation.
 * All request/response payloads are validated against these schemas.
 */

import { z } from 'zod';

// ============================================================================
// Path Parameter Schemas
// ============================================================================

/**
 * Schema for plugin ID path parameter.
 */
export const PluginIdParamSchema = z.object({
  pluginId: z.string().uuid('Plugin ID must be a valid UUID'),
});

/**
 * Schema for track ID path parameter (for plugin operations).
 */
export const TrackIdParamSchema = z.object({
  trackId: z.string().uuid('Track ID must be a valid UUID'),
});

export type PluginIdParam = z.infer<typeof PluginIdParamSchema>;
export type TrackIdParam = z.infer<typeof TrackIdParamSchema>;

// ============================================================================
// Plugin Schemas
// ============================================================================

/**
 * Schema for creating a new plugin on a track.
 */
export const CreatePluginSchema = z.object({
  wam_id: z
    .string()
    .min(1, 'WAM ID is required')
    .max(255, 'WAM ID must be 255 characters or less'),
  name: z
    .string()
    .min(1, 'Plugin name is required')
    .max(100, 'Plugin name must be 100 characters or less'),
  wam_version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, 'WAM version must be in semver format (e.g., 1.0.0)')
    .default('1.0.0'),
  position: z
    .number()
    .int('Position must be an integer')
    .min(0, 'Position must be at least 0')
    .optional(),
  state: z
    .record(z.unknown())
    .default({}),
  bypass: z
    .boolean()
    .default(false),
});

/**
 * Schema for updating an existing plugin.
 */
export const UpdatePluginSchema = z.object({
  state: z
    .record(z.unknown())
    .optional(),
  bypass: z
    .boolean()
    .optional(),
  position: z
    .number()
    .int('Position must be an integer')
    .min(0, 'Position must be at least 0')
    .optional(),
  name: z
    .string()
    .min(1, 'Plugin name is required')
    .max(100, 'Plugin name must be 100 characters or less')
    .optional(),
});

/**
 * Schema for reordering plugins within a track's effect chain.
 */
export const ReorderPluginsSchema = z.object({
  pluginOrder: z
    .array(z.string().uuid('Each plugin ID must be a valid UUID'))
    .min(1, 'At least one plugin ID is required'),
});

// ============================================================================
// Response Types
// ============================================================================

/**
 * Full plugin response object.
 */
export interface PluginResponse {
  id: string;
  track_id: string;
  wam_id: string;
  name: string;
  wam_version: string;
  position: number;
  state: Record<string, unknown>;
  bypass: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Plugin list item (for listing plugins in a track).
 */
export interface PluginListItem {
  id: string;
  track_id: string;
  wam_id: string;
  name: string;
  wam_version: string;
  position: number;
  state: Record<string, unknown>;
  bypass: boolean;
}

// ============================================================================
// Input Types
// ============================================================================

export type CreatePluginInput = z.infer<typeof CreatePluginSchema>;
export type UpdatePluginInput = z.infer<typeof UpdatePluginSchema>;
export type ReorderPluginsInput = z.infer<typeof ReorderPluginsSchema>;
