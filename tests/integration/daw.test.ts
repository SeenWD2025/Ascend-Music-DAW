/**
 * Integration Tests: DAW API Routes
 * 
 * Tests DAW API endpoints:
 * - POST /api/v1/daw/projects - Create a new project
 * - GET /api/v1/daw/projects - List user's projects
 * - GET /api/v1/daw/projects/:id - Get project details
 * - PUT /api/v1/daw/projects/:id - Update project
 * 
 * All endpoints require authentication.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  createTestUserWithToken,
  deleteTestUser,
  type TestUser,
} from '../helpers/auth.helper.js';
import { apiGet, apiPost, apiPut, apiDelete } from '../helpers/api.helper.js';
import { createAdminClient } from '../setup.js';

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

interface CreateProjectRequest {
  name: string;
  description?: string;
  bpm?: number;
  time_signature?: string;
  sample_rate?: number;
  bit_depth?: number;
}

interface UpdateProjectRequest {
  name?: string;
  description?: string;
  bpm?: number;
  time_signature?: string;
  sample_rate?: number;
  bit_depth?: number;
  status?: 'draft' | 'active' | 'archived';
}

/**
 * Cleans up all DAW projects for a user directly in the database.
 */
async function cleanupUserProjects(userId: string): Promise<void> {
  const adminClient = createAdminClient();
  await adminClient.from('daw_projects').delete().eq('owner_id', userId);
}

/**
 * Creates a project directly in the database for test setup.
 */
async function createProjectDirectly(
  userId: string,
  data: Partial<CreateProjectRequest> = {}
): Promise<DawProject> {
  const adminClient = createAdminClient();
  
  const { data: project, error } = await adminClient
    .from('daw_projects')
    .insert({
      owner_id: userId,
      name: data.name || 'Test Project',
      description: data.description || null,
      bpm: data.bpm || 120,
      time_signature: data.time_signature || '4/4',
      sample_rate: data.sample_rate || 44100,
      bit_depth: data.bit_depth || 24,
      status: 'draft',
    })
    .select()
    .single();

  if (error || !project) {
    throw new Error(`Failed to create test project: ${error?.message || 'Unknown error'}`);
  }

  return project as DawProject;
}

describe('Integration: DAW API', () => {
  let testUser: TestUser & { accessToken: string };
  let otherUser: TestUser & { accessToken: string };

  beforeAll(async () => {
    testUser = await createTestUserWithToken({
      displayName: 'DAW Test User',
      role: 'client',
    });
    otherUser = await createTestUserWithToken({
      displayName: 'Other DAW User',
      role: 'client',
    });
  });

  afterAll(async () => {
    await cleanupUserProjects(testUser.id);
    await cleanupUserProjects(otherUser.id);
    await deleteTestUser(testUser.id);
    await deleteTestUser(otherUser.id);
  });

  afterEach(async () => {
    // Clean up projects after each test
    await cleanupUserProjects(testUser.id);
    await cleanupUserProjects(otherUser.id);
  });

  // ==========================================================================
  // POST /api/v1/daw/projects - Create project
  // ==========================================================================

  describe('POST /api/v1/daw/projects', () => {
    it('should create a project and return 201', async () => {
      const projectData: CreateProjectRequest = {
        name: 'My New Track',
        description: 'A test project for integration tests',
        bpm: 140,
        time_signature: '4/4',
        sample_rate: 48000,
        bit_depth: 24,
      };

      const response = await apiPost<{ data: DawProject }>(
        '/api/v1/daw/projects',
        projectData,
        testUser.accessToken
      );

      expect(response.status).toBe(201);
      expect(response.data).toBeDefined();
      expect(response.data?.data).toBeDefined();
      expect(response.data?.data.name).toBe('My New Track');
      expect(response.data?.data.description).toBe('A test project for integration tests');
      expect(response.data?.data.bpm).toBe(140);
      expect(response.data?.data.time_signature).toBe('4/4');
      expect(response.data?.data.sample_rate).toBe(48000);
      expect(response.data?.data.bit_depth).toBe(24);
      expect(response.data?.data.owner_id).toBe(testUser.id);
      expect(response.data?.data.status).toBe('draft');
      expect(response.data?.data.id).toBeDefined();
      expect(response.data?.data.created_at).toBeDefined();
    });

    it('should create a project with minimal data (only name)', async () => {
      const response = await apiPost<{ data: DawProject }>(
        '/api/v1/daw/projects',
        { name: 'Minimal Project' },
        testUser.accessToken
      );

      expect(response.status).toBe(201);
      expect(response.data?.data.name).toBe('Minimal Project');
      // Should have defaults
      expect(response.data?.data.bpm).toBe(120);
      expect(response.data?.data.time_signature).toBe('4/4');
      expect(response.data?.data.sample_rate).toBe(44100);
      expect(response.data?.data.bit_depth).toBe(24);
    });

    it('should return 401 without authentication', async () => {
      const response = await apiPost('/api/v1/daw/projects', {
        name: 'Unauthorized Project',
      });

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 400 for missing required name', async () => {
      const response = await apiPost(
        '/api/v1/daw/projects',
        { bpm: 120 },
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error).toBeDefined();
    });

    it('should return 400 for invalid BPM', async () => {
      const response = await apiPost(
        '/api/v1/daw/projects',
        { name: 'Invalid BPM', bpm: 0 },
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error).toBeDefined();
    });

    it('should return 400 for invalid sample rate', async () => {
      const response = await apiPost(
        '/api/v1/daw/projects',
        { name: 'Invalid Sample Rate', sample_rate: 12345 },
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error).toBeDefined();
    });
  });

  // ==========================================================================
  // GET /api/v1/daw/projects - List projects
  // ==========================================================================

  describe('GET /api/v1/daw/projects', () => {
    it('should return empty array when user has no projects', async () => {
      const response = await apiGet<{ data: DawProject[] }>(
        '/api/v1/daw/projects',
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data?.data).toEqual([]);
    });

    it('should return user projects', async () => {
      // Create projects directly in database
      await createProjectDirectly(testUser.id, { name: 'Project A' });
      await createProjectDirectly(testUser.id, { name: 'Project B' });

      const response = await apiGet<{ data: DawProject[] }>(
        '/api/v1/daw/projects',
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data).toHaveLength(2);
      
      const names = response.data?.data.map((p) => p.name);
      expect(names).toContain('Project A');
      expect(names).toContain('Project B');
    });

    it('should NOT return other users projects', async () => {
      // Create projects for both users
      await createProjectDirectly(testUser.id, { name: 'My Project' });
      await createProjectDirectly(otherUser.id, { name: 'Other User Project' });

      const response = await apiGet<{ data: DawProject[] }>(
        '/api/v1/daw/projects',
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data).toHaveLength(1);
      expect(response.data?.data[0].name).toBe('My Project');
    });

    it('should return 401 without authentication', async () => {
      const response = await apiGet('/api/v1/daw/projects');

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });
  });

  // ==========================================================================
  // GET /api/v1/daw/projects/:id - Get project details
  // ==========================================================================

  describe('GET /api/v1/daw/projects/:id', () => {
    it('should return project details for owner', async () => {
      const project = await createProjectDirectly(testUser.id, {
        name: 'Detailed Project',
        description: 'With full details',
        bpm: 128,
      });

      const response = await apiGet<{ data: DawProject }>(
        `/api/v1/daw/projects/${project.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data.id).toBe(project.id);
      expect(response.data?.data.name).toBe('Detailed Project');
      expect(response.data?.data.description).toBe('With full details');
      expect(response.data?.data.bpm).toBe(128);
      expect(response.data?.data.owner_id).toBe(testUser.id);
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Auth Test' });

      const response = await apiGet(`/api/v1/daw/projects/${project.id}`);

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 for unauthorized project access', async () => {
      // Create project owned by other user
      const otherProject = await createProjectDirectly(otherUser.id, {
        name: 'Private Project',
      });

      // Try to access as testUser
      const response = await apiGet(
        `/api/v1/daw/projects/${otherProject.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(403);
      expect(response.error?.code).toBe('FORBIDDEN');
    });

    it('should return 404 for non-existent project', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await apiGet(
        `/api/v1/daw/projects/${fakeId}`,
        testUser.accessToken
      );

      expect(response.status).toBe(404);
      expect(response.error?.code).toBe('NOT_FOUND');
    });
  });

  // ==========================================================================
  // PUT /api/v1/daw/projects/:id - Update project
  // ==========================================================================

  describe('PUT /api/v1/daw/projects/:id', () => {
    it('should update project name', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Original Name' });

      const response = await apiPut<{ data: DawProject }>(
        `/api/v1/daw/projects/${project.id}`,
        { name: 'Updated Name' },
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data.name).toBe('Updated Name');
      expect(response.data?.data.id).toBe(project.id);
    });

    it('should update multiple fields', async () => {
      const project = await createProjectDirectly(testUser.id, {
        name: 'Multi Update',
        bpm: 120,
      });

      const updateData: UpdateProjectRequest = {
        name: 'Updated Multi',
        description: 'New description',
        bpm: 145,
        time_signature: '3/4',
        status: 'active',
      };

      const response = await apiPut<{ data: DawProject }>(
        `/api/v1/daw/projects/${project.id}`,
        updateData,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data.name).toBe('Updated Multi');
      expect(response.data?.data.description).toBe('New description');
      expect(response.data?.data.bpm).toBe(145);
      expect(response.data?.data.time_signature).toBe('3/4');
      expect(response.data?.data.status).toBe('active');
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'No Auth Update' });

      const response = await apiPut(`/api/v1/daw/projects/${project.id}`, {
        name: 'Should Fail',
      });

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 for unauthorized project update', async () => {
      // Create project owned by other user
      const otherProject = await createProjectDirectly(otherUser.id, {
        name: 'Not My Project',
      });

      // Try to update as testUser
      const response = await apiPut(
        `/api/v1/daw/projects/${otherProject.id}`,
        { name: 'Trying to Steal' },
        testUser.accessToken
      );

      expect(response.status).toBe(403);
      expect(response.error?.code).toBe('FORBIDDEN');
    });

    it('should return 404 for non-existent project', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await apiPut(
        `/api/v1/daw/projects/${fakeId}`,
        { name: 'Ghost Project' },
        testUser.accessToken
      );

      expect(response.status).toBe(404);
      expect(response.error?.code).toBe('NOT_FOUND');
    });

    it('should return 400 for invalid BPM update', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Invalid BPM Update' });

      const response = await apiPut(
        `/api/v1/daw/projects/${project.id}`,
        { bpm: 1500 }, // BPM must be <= 999
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error).toBeDefined();
    });

    it('should preserve unchanged fields', async () => {
      const project = await createProjectDirectly(testUser.id, {
        name: 'Preserve Fields',
        description: 'Original Description',
        bpm: 130,
      });

      // Only update name
      const response = await apiPut<{ data: DawProject }>(
        `/api/v1/daw/projects/${project.id}`,
        { name: 'New Name Only' },
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data.name).toBe('New Name Only');
      // Original values should be preserved
      expect(response.data?.data.description).toBe('Original Description');
      expect(response.data?.data.bpm).toBe(130);
    });
  });

  // ==========================================================================
  // Authorization Edge Cases
  // ==========================================================================

  describe('Authorization Edge Cases', () => {
    it('should handle expired/invalid tokens', async () => {
      const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.token';

      const response = await apiGet('/api/v1/daw/projects', invalidToken);

      expect(response.status).toBe(401);
    });

    it('should NOT expose projects via ID guessing', async () => {
      // Create multiple projects for other user
      const project1 = await createProjectDirectly(otherUser.id, { name: 'Secret 1' });
      const project2 = await createProjectDirectly(otherUser.id, { name: 'Secret 2' });

      // Try to access each one as testUser
      const resp1 = await apiGet(
        `/api/v1/daw/projects/${project1.id}`,
        testUser.accessToken
      );
      const resp2 = await apiGet(
        `/api/v1/daw/projects/${project2.id}`,
        testUser.accessToken
      );

      expect(resp1.status).toBe(403);
      expect(resp2.status).toBe(403);
    });

    it('should NOT allow updating other users projects', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, {
        name: 'Protected Project',
        description: 'Should not change',
      });

      // Try multiple update attempts
      await apiPut(
        `/api/v1/daw/projects/${otherProject.id}`,
        { name: 'Hacked!' },
        testUser.accessToken
      );

      // Verify project is unchanged
      const verifyResponse = await apiGet<{ data: DawProject }>(
        `/api/v1/daw/projects/${otherProject.id}`,
        otherUser.accessToken
      );

      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.data?.data.name).toBe('Protected Project');
      expect(verifyResponse.data?.data.description).toBe('Should not change');
    });
  });
});
