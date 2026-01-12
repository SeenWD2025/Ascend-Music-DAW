/**
 * Integration Tests: DAW Exports API Routes
 *
 * Tests DAW export API endpoints:
 * - POST /api/v1/daw/projects/:projectId/export - Enqueue export
 * - GET /api/v1/daw/projects/:projectId/exports - List exports
 * - GET /api/v1/daw/exports/:exportId - Get export status
 * - DELETE /api/v1/daw/exports/:exportId - Cancel export
 *
 * All endpoints require authentication. 403 for unauthorized access.
 * Also validates idempotency, concurrency limits, and format validation.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import {
  createTestUserWithToken,
  deleteTestUser,
  type TestUser,
} from '../helpers/auth.helper.js';
import { apiGet, apiPost, apiDelete } from '../helpers/api.helper.js';
import { createAdminClient } from '../setup.js';

// =============================================================================
// Types
// =============================================================================

interface DawProject {
  id: string;
  owner_id: string;
  name: string;
  description?: string | null;
  bpm: number;
  time_signature: string;
  sample_rate: number;
  bit_depth: number;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

interface DawExport {
  id: string;
  project_id: string;
  user_id: string;
  owner_id: string;
  format: 'wav' | 'mp3' | 'flac';
  quality_settings?: Record<string, unknown>;
  status: 'queued' | 'processing' | 'complete' | 'failed';
  idempotency_key: string;
  r2_url?: string | null;
  r2_key?: string | null;
  error_message?: string | null;
  file_size_bytes?: number | null;
  duration_seconds?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface CreateExportRequest {
  format: 'wav' | 'mp3' | 'flac';
  idempotency_key: string;
  quality_settings?: Record<string, unknown>;
}

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Cleans up all DAW projects for a user directly in the database.
 */
async function cleanupUserProjects(userId: string): Promise<void> {
  const adminClient = createAdminClient();
  await adminClient.from('daw_projects').delete().eq('owner_id', userId);
}

/**
 * Cleans up all exports for a user directly in the database.
 */
async function cleanupUserExports(userId: string): Promise<void> {
  const adminClient = createAdminClient();
  await adminClient.from('daw_exports').delete().eq('owner_id', userId);
}

/**
 * Creates a project directly in the database for test setup.
 */
async function createProjectDirectly(
  userId: string,
  data: Partial<{ name: string; description?: string }> = {}
): Promise<DawProject> {
  const adminClient = createAdminClient();

  const { data: project, error } = await adminClient
    .from('daw_projects')
    .insert({
      owner_id: userId,
      name: data.name || 'Test Project',
      description: data.description || null,
      bpm: 120,
      time_signature: '4/4',
      sample_rate: 44100,
      bit_depth: 24,
      status: 'draft',
    })
    .select()
    .single();

  if (error || !project) {
    throw new Error(`Failed to create test project: ${error?.message || 'Unknown error'}`);
  }

  return project as DawProject;
}

/**
 * Creates an export directly in the database for test setup.
 */
async function createExportDirectly(
  projectId: string,
  userId: string,
  data: Partial<CreateExportRequest & { status?: string }> = {}
): Promise<DawExport> {
  const adminClient = createAdminClient();

  const { data: exportData, error } = await adminClient
    .from('daw_exports')
    .insert({
      project_id: projectId,
      user_id: userId,
      owner_id: userId,
      format: data.format || 'wav',
      idempotency_key: data.idempotency_key || `export-${Date.now()}-${Math.random()}`,
      quality_settings: data.quality_settings || {},
      status: data.status || 'queued',
    })
    .select()
    .single();

  if (error || !exportData) {
    throw new Error(`Failed to create test export: ${error?.message || 'Unknown error'}`);
  }

  return exportData as DawExport;
}

// =============================================================================
// Tests
// =============================================================================

describe('Integration: DAW Exports API', () => {
  let testUser: TestUser & { accessToken: string };
  let otherUser: TestUser & { accessToken: string };

  beforeAll(async () => {
    testUser = await createTestUserWithToken({
      displayName: 'DAW Exports Test User',
      role: 'client',
    });
    otherUser = await createTestUserWithToken({
      displayName: 'Other Exports User',
      role: 'client',
    });
  });

  afterAll(async () => {
    await cleanupUserExports(testUser.id);
    await cleanupUserExports(otherUser.id);
    await cleanupUserProjects(testUser.id);
    await cleanupUserProjects(otherUser.id);
    await deleteTestUser(testUser.id);
    await deleteTestUser(otherUser.id);
  });

  afterEach(async () => {
    // Clean up exports and projects after each test
    await cleanupUserExports(testUser.id);
    await cleanupUserExports(otherUser.id);
    await cleanupUserProjects(testUser.id);
    await cleanupUserProjects(otherUser.id);
  });

  // ==========================================================================
  // POST /api/v1/daw/projects/:projectId/export - Enqueue export
  // ==========================================================================

  describe('POST /api/v1/daw/projects/:projectId/export', () => {
    it('should enqueue export and return 201', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Export Test Project' });
      const idempotencyKey = `test-export-${Date.now()}`;

      const response = await apiPost<{ data: DawExport }>(
        `/api/v1/daw/projects/${project.id}/export`,
        {
          format: 'wav',
          idempotency_key: idempotencyKey,
          quality_settings: { sample_rate: 48000, bit_depth: 24 },
        },
        testUser.accessToken
      );

      expect(response.status).toBe(201);
      expect(response.data).toBeDefined();
      expect(response.data?.data).toBeDefined();
      expect(response.data?.data.format).toBe('wav');
      expect(response.data?.data.status).toBe('queued');
      expect(response.data?.data.idempotency_key).toBe(idempotencyKey);
      expect(response.data?.data.project_id).toBe(project.id);
      expect(response.data?.data.owner_id).toBe(testUser.id);
      expect(response.data?.data.id).toBeDefined();
      expect(response.data?.data.created_at).toBeDefined();
    });

    it('should create MP3 export', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'MP3 Export Project' });

      const response = await apiPost<{ data: DawExport }>(
        `/api/v1/daw/projects/${project.id}/export`,
        {
          format: 'mp3',
          idempotency_key: `mp3-export-${Date.now()}`,
          quality_settings: { bitrate: 320 },
        },
        testUser.accessToken
      );

      expect(response.status).toBe(201);
      expect(response.data?.data.format).toBe('mp3');
    });

    it('should create FLAC export', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'FLAC Export Project' });

      const response = await apiPost<{ data: DawExport }>(
        `/api/v1/daw/projects/${project.id}/export`,
        {
          format: 'flac',
          idempotency_key: `flac-export-${Date.now()}`,
        },
        testUser.accessToken
      );

      expect(response.status).toBe(201);
      expect(response.data?.data.format).toBe('flac');
    });

    it('should return same export for duplicate idempotency key (idempotency)', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Idempotent Project' });
      const idempotencyKey = `idempotent-key-${Date.now()}`;

      // First request
      const response1 = await apiPost<{ data: DawExport }>(
        `/api/v1/daw/projects/${project.id}/export`,
        {
          format: 'wav',
          idempotency_key: idempotencyKey,
        },
        testUser.accessToken
      );

      expect(response1.status).toBe(201);
      const firstExportId = response1.data?.data.id;

      // Second request with same idempotency key
      const response2 = await apiPost<{ data: DawExport }>(
        `/api/v1/daw/projects/${project.id}/export`,
        {
          format: 'wav',
          idempotency_key: idempotencyKey,
        },
        testUser.accessToken
      );

      // Should return the same export (200 or 201)
      expect([200, 201]).toContain(response2.status);
      expect(response2.data?.data.id).toBe(firstExportId);
    });

    it('should return 429 when exceeding concurrency limit (> 3 active exports)', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Rate Limit Project' });

      // Create 3 active exports directly
      await createExportDirectly(project.id, testUser.id, {
        idempotency_key: `active-1-${Date.now()}`,
        status: 'processing',
      });
      await createExportDirectly(project.id, testUser.id, {
        idempotency_key: `active-2-${Date.now()}`,
        status: 'processing',
      });
      await createExportDirectly(project.id, testUser.id, {
        idempotency_key: `active-3-${Date.now()}`,
        status: 'queued',
      });

      // Try to create a 4th export
      const response = await apiPost(
        `/api/v1/daw/projects/${project.id}/export`,
        {
          format: 'wav',
          idempotency_key: `over-limit-${Date.now()}`,
        },
        testUser.accessToken
      );

      expect(response.status).toBe(429);
      expect(response.error).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'No Auth Project' });

      const response = await apiPost(
        `/api/v1/daw/projects/${project.id}/export`,
        {
          format: 'wav',
          idempotency_key: `no-auth-${Date.now()}`,
        }
      );

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 for unauthorized access', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, { name: 'Other Project' });

      const response = await apiPost(
        `/api/v1/daw/projects/${otherProject.id}/export`,
        {
          format: 'wav',
          idempotency_key: `intruder-${Date.now()}`,
        },
        testUser.accessToken
      );

      expect(response.status).toBe(403);
      expect(response.error?.code).toBe('FORBIDDEN');
    });

    it('should return 404 for non-existent project', async () => {
      const fakeProjectId = '00000000-0000-0000-0000-000000000000';

      const response = await apiPost(
        `/api/v1/daw/projects/${fakeProjectId}/export`,
        {
          format: 'wav',
          idempotency_key: `ghost-${Date.now()}`,
        },
        testUser.accessToken
      );

      expect(response.status).toBe(404);
      expect(response.error?.code).toBe('NOT_FOUND');
    });

    it('should return 400 for invalid format', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Invalid Format Project' });

      const response = await apiPost(
        `/api/v1/daw/projects/${project.id}/export`,
        {
          format: 'ogg', // Invalid format
          idempotency_key: `invalid-format-${Date.now()}`,
        },
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error).toBeDefined();
    });

    it('should return 400 for missing idempotency_key', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'No Key Project' });

      const response = await apiPost(
        `/api/v1/daw/projects/${project.id}/export`,
        {
          format: 'wav',
          // Missing idempotency_key
        },
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error).toBeDefined();
    });

    it('should return 400 for missing format', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'No Format Project' });

      const response = await apiPost(
        `/api/v1/daw/projects/${project.id}/export`,
        {
          idempotency_key: `no-format-${Date.now()}`,
          // Missing format
        },
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error).toBeDefined();
    });
  });

  // ==========================================================================
  // GET /api/v1/daw/projects/:projectId/exports - List exports
  // ==========================================================================

  describe('GET /api/v1/daw/projects/:projectId/exports', () => {
    it('should return empty array when project has no exports', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Empty Exports Project' });

      const response = await apiGet<{ data: DawExport[] }>(
        `/api/v1/daw/projects/${project.id}/exports`,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data?.data).toEqual([]);
    });

    it('should return project exports', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Exports Project' });
      await createExportDirectly(project.id, testUser.id, { format: 'wav' });
      await createExportDirectly(project.id, testUser.id, { format: 'mp3' });
      await createExportDirectly(project.id, testUser.id, { format: 'flac' });

      const response = await apiGet<{ data: DawExport[] }>(
        `/api/v1/daw/projects/${project.id}/exports`,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data).toHaveLength(3);
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Auth Project' });

      const response = await apiGet(`/api/v1/daw/projects/${project.id}/exports`);

      expect(response.status).toBe(401);
    });

    it('should return 403 for unauthorized access', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, { name: 'Other Project' });

      const response = await apiGet(
        `/api/v1/daw/projects/${otherProject.id}/exports`,
        testUser.accessToken
      );

      expect(response.status).toBe(403);
    });
  });

  // ==========================================================================
  // GET /api/v1/daw/exports/:exportId - Get export status
  // ==========================================================================

  describe('GET /api/v1/daw/exports/:exportId', () => {
    it('should return a single export with status', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Single Export Project' });
      const exportData = await createExportDirectly(project.id, testUser.id, {
        format: 'wav',
        idempotency_key: `single-export-${Date.now()}`,
      });

      const response = await apiGet<{ data: DawExport }>(
        `/api/v1/daw/exports/${exportData.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data).toBeDefined();
      expect(response.data?.data.id).toBe(exportData.id);
      expect(response.data?.data.format).toBe('wav');
      expect(response.data?.data.status).toBe('queued');
    });

    it('should return export with processing status', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Processing Export Project' });
      const exportData = await createExportDirectly(project.id, testUser.id, {
        format: 'mp3',
        status: 'processing',
      });

      const response = await apiGet<{ data: DawExport }>(
        `/api/v1/daw/exports/${exportData.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data.status).toBe('processing');
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Auth Project' });
      const exportData = await createExportDirectly(project.id, testUser.id);

      const response = await apiGet(`/api/v1/daw/exports/${exportData.id}`);

      expect(response.status).toBe(401);
    });

    it('should return 403 for unauthorized access', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, { name: 'Other Project' });
      const otherExport = await createExportDirectly(otherProject.id, otherUser.id);

      const response = await apiGet(
        `/api/v1/daw/exports/${otherExport.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent export', async () => {
      const fakeExportId = '00000000-0000-0000-0000-000000000000';

      const response = await apiGet(
        `/api/v1/daw/exports/${fakeExportId}`,
        testUser.accessToken
      );

      expect(response.status).toBe(404);
      expect(response.error?.code).toBe('NOT_FOUND');
    });
  });

  // ==========================================================================
  // DELETE /api/v1/daw/exports/:exportId - Cancel export
  // ==========================================================================

  describe('DELETE /api/v1/daw/exports/:exportId', () => {
    it('should cancel/delete a queued export and return 204', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Cancel Export Project' });
      const exportData = await createExportDirectly(project.id, testUser.id, {
        status: 'queued',
      });

      const response = await apiDelete(
        `/api/v1/daw/exports/${exportData.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(204);

      // Verify deletion
      const adminClient = createAdminClient();
      const { data: deleted } = await adminClient
        .from('daw_exports')
        .select('id')
        .eq('id', exportData.id)
        .single();

      expect(deleted).toBeNull();
    });

    it('should allow canceling a processing export', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Cancel Processing Project' });
      const exportData = await createExportDirectly(project.id, testUser.id, {
        status: 'processing',
      });

      const response = await apiDelete(
        `/api/v1/daw/exports/${exportData.id}`,
        testUser.accessToken
      );

      // Should succeed or return appropriate status based on implementation
      expect([200, 204]).toContain(response.status);
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Auth Project' });
      const exportData = await createExportDirectly(project.id, testUser.id);

      const response = await apiDelete(`/api/v1/daw/exports/${exportData.id}`);

      expect(response.status).toBe(401);
    });

    it('should return 403 for unauthorized access', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, { name: 'Other Project' });
      const otherExport = await createExportDirectly(otherProject.id, otherUser.id);

      const response = await apiDelete(
        `/api/v1/daw/exports/${otherExport.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent export', async () => {
      const fakeExportId = '00000000-0000-0000-0000-000000000000';

      const response = await apiDelete(
        `/api/v1/daw/exports/${fakeExportId}`,
        testUser.accessToken
      );

      expect(response.status).toBe(404);
    });
  });
});
