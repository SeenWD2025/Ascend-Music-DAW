/**
 * Zod schemas for DAW project validation.
 * All request/response payloads are validated against these schemas.
 */

import { z } from 'zod';

// ============================================================================
// Enums
// ============================================================================

export const ProjectStatusSchema = z.enum(['draft', 'active', 'archived']);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

// ============================================================================
// Project Schemas
// ============================================================================

/**
 * Schema for creating a new project.
 */
export const CreateProjectSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(255, 'Project name must be 255 characters or less'),
  description: z.string().max(2000).optional().nullable(),
  bpm: z
    .number()
    .int()
    .min(1, 'BPM must be at least 1')
    .max(999, 'BPM must be 999 or less')
    .default(120),
  time_signature: z
    .string()
    .regex(/^\d+\/\d+$/, 'Time signature must be in format "4/4"')
    .default('4/4'),
  sample_rate: z
    .number()
    .int()
    .refine(
      (val: number) => [22050, 44100, 48000, 88200, 96000, 176400, 192000].includes(val),
      'Sample rate must be one of: 22050, 44100, 48000, 88200, 96000, 176400, 192000'
    )
    .default(44100),
  bit_depth: z
    .number()
    .int()
    .refine(
      (val: number) => [16, 24, 32].includes(val),
      'Bit depth must be one of: 16, 24, 32'
    )
    .default(24),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

/**
 * Schema for updating an existing project.
 */
export const UpdateProjectSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(255, 'Project name must be 255 characters or less')
    .optional(),
  description: z.string().max(2000).optional().nullable(),
  bpm: z
    .number()
    .int()
    .min(1, 'BPM must be at least 1')
    .max(999, 'BPM must be 999 or less')
    .optional(),
  time_signature: z
    .string()
    .regex(/^\d+\/\d+$/, 'Time signature must be in format "4/4"')
    .optional(),
  sample_rate: z
    .number()
    .int()
    .refine(
      (val: number | undefined) =>
        val === undefined ||
        [22050, 44100, 48000, 88200, 96000, 176400, 192000].includes(val),
      'Sample rate must be one of: 22050, 44100, 48000, 88200, 96000, 176400, 192000'
    )
    .optional(),
  bit_depth: z
    .number()
    .int()
    .refine(
      (val: number | undefined) => val === undefined || [16, 24, 32].includes(val),
      'Bit depth must be one of: 16, 24, 32'
    )
    .optional(),
  status: ProjectStatusSchema.optional(),
});

export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

/**
 * Schema for project list query parameters.
 */
export const ListProjectsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: ProjectStatusSchema.optional(),
  search: z.string().max(255).optional(),
  sort_by: z.enum(['created_at', 'updated_at', 'name']).default('updated_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type ListProjectsQuery = z.infer<typeof ListProjectsQuerySchema>;

/**
 * Schema for project ID parameter.
 */
export const ProjectIdParamSchema = z.object({
  id: z.string().uuid('Invalid project ID format'),
});

export type ProjectIdParam = z.infer<typeof ProjectIdParamSchema>;

// ============================================================================
// Response Schemas
// ============================================================================

/**
 * Full project response schema.
 */
export const ProjectResponseSchema = z.object({
  id: z.string().uuid(),
  owner_id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  bpm: z.number().int(),
  time_signature: z.string(),
  sample_rate: z.number().int(),
  bit_depth: z.number().int(),
  status: ProjectStatusSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type ProjectResponse = z.infer<typeof ProjectResponseSchema>;

/**
 * Project list item (may include additional computed fields).
 */
export const ProjectListItemSchema = ProjectResponseSchema.extend({
  track_count: z.number().int().optional(),
  collaborator_count: z.number().int().optional(),
});

export type ProjectListItem = z.infer<typeof ProjectListItemSchema>;
