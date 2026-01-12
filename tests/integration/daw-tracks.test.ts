/**
 * Integration Tests: DAW Tracks API Routes
 *
 * Tests DAW track API endpoints:
 * - POST /api/v1/daw/projects/:id/tracks - Create a track
 * - GET /api/v1/daw/projects/:id/tracks - List tracks
 * - GET /api/v1/daw/projects/:id/tracks/:trackId - Get single track
 * - PUT /api/v1/daw/projects/:id/tracks/:trackId - Update track
 * - DELETE /api/v1/daw/projects/:id/tracks/:trackId - Delete track
 *
 * All endpoints require authentication. 403 for unauthorized access.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import {
  createTestUserWithToken,
  deleteTestUser,
  type TestUser,
} from '../helpers/auth.helper.js';
import { apiGet, apiPost, apiPut, apiDelete } from '../helpers/api.helper.js';
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

interface DawTrack {
  id: string;
  project_id: string;
  name: string;
  type: 'audio' | 'midi' | 'bus' | 'master';
  position: number;
  color?: string | null;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
  routing?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface CreateTrackRequest {
  name: string;
  type?: 'audio' | 'midi' | 'bus' | 'master';
  position?: number;
  color?: string;
  volume?: number;
  pan?: number;
  mute?: boolean;
  solo?: boolean;
  armed?: boolean;
}

interface UpdateTrackRequest {
  name?: string;
  type?: 'audio' | 'midi' | 'bus' | 'master';
  position?: number;
  color?: string;
  volume?: number;
  pan?: number;
  mute?: boolean;
  solo?: boolean;
  armed?: boolean;
}

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Cleans up all DAW projects (and cascades to tracks) for a user directly in the database.
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
 * Creates a track directly in the database for test setup.
 */
async function createTrackDirectly(
  projectId: string,
  data: Partial<CreateTrackRequest> = {}
): Promise<DawTrack> {
  const adminClient = createAdminClient();

  const { data: track, error } = await adminClient
    .from('daw_tracks')
    .insert({
      project_id: projectId,
      name: data.name || 'Test Track',
      type: data.type || 'audio',
      position: data.position ?? 0,
      color: data.color || null,
      volume: data.volume ?? 1.0,
      pan: data.pan ?? 0.0,
      mute: data.mute ?? false,
      solo: data.solo ?? false,
      armed: data.armed ?? false,
    })
    .select()
    .single();

  if (error || !track) {
    throw new Error(`Failed to create test track: ${error?.message || 'Unknown error'}`);
  }

  return track as DawTrack;
}

// =============================================================================
// Tests
// =============================================================================

describe('Integration: DAW Tracks API', () => {
  let testUser: TestUser & { accessToken: string };
  let otherUser: TestUser & { accessToken: string };

  beforeAll(async () => {
    testUser = await createTestUserWithToken({
      displayName: 'DAW Tracks Test User',
      role: 'client',
    });
    otherUser = await createTestUserWithToken({
      displayName: 'Other Tracks User',
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
    // Clean up projects (and cascaded tracks) after each test
    await cleanupUserProjects(testUser.id);
    await cleanupUserProjects(otherUser.id);
  });

  // ==========================================================================
  // POST /api/v1/daw/projects/:id/tracks - Create track
  // ==========================================================================

  describe('POST /api/v1/daw/projects/:id/tracks', () => {
    it('should create a track and return 201', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Track Test Project' });

      const trackData: CreateTrackRequest = {
        name: 'Lead Vocal',
        type: 'audio',
        position: 1,
        color: '#FF5500',
        volume: 0.8,
        pan: -0.2,
      };

      const response = await apiPost<{ data: DawTrack }>(
        `/api/v1/daw/projects/${project.id}/tracks`,
        trackData,
        testUser.accessToken
      );

      expect(response.status).toBe(201);
      expect(response.data).toBeDefined();
      expect(response.data?.data).toBeDefined();
      expect(response.data?.data.name).toBe('Lead Vocal');
      expect(response.data?.data.type).toBe('audio');
      expect(response.data?.data.position).toBe(1);
      expect(response.data?.data.color).toBe('#FF5500');
      expect(response.data?.data.volume).toBe(0.8);
      expect(response.data?.data.pan).toBe(-0.2);
      expect(response.data?.data.project_id).toBe(project.id);
      expect(response.data?.data.id).toBeDefined();
      expect(response.data?.data.created_at).toBeDefined();
    });

    it('should create a track with minimal data (only name)', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Minimal Track Project' });

      const response = await apiPost<{ data: DawTrack }>(
        `/api/v1/daw/projects/${project.id}/tracks`,
        { name: 'Minimal Track' },
        testUser.accessToken
      );

      expect(response.status).toBe(201);
      expect(response.data?.data.name).toBe('Minimal Track');
      // Should have defaults
      expect(response.data?.data.type).toBe('audio');
      expect(response.data?.data.position).toBe(0);
      expect(response.data?.data.volume).toBe(1.0);
      expect(response.data?.data.pan).toBe(0.0);
      expect(response.data?.data.mute).toBe(false);
      expect(response.data?.data.solo).toBe(false);
      expect(response.data?.data.armed).toBe(false);
    });

    it('should create a MIDI track', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'MIDI Track Project' });

      const response = await apiPost<{ data: DawTrack }>(
        `/api/v1/daw/projects/${project.id}/tracks`,
        { name: 'Piano MIDI', type: 'midi' },
        testUser.accessToken
      );

      expect(response.status).toBe(201);
      expect(response.data?.data.name).toBe('Piano MIDI');
      expect(response.data?.data.type).toBe('midi');
    });

    it('should create a bus track', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Bus Track Project' });

      const response = await apiPost<{ data: DawTrack }>(
        `/api/v1/daw/projects/${project.id}/tracks`,
        { name: 'Drum Bus', type: 'bus' },
        testUser.accessToken
      );

      expect(response.status).toBe(201);
      expect(response.data?.data.name).toBe('Drum Bus');
      expect(response.data?.data.type).toBe('bus');
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'No Auth Project' });

      const response = await apiPost(
        `/api/v1/daw/projects/${project.id}/tracks`,
        { name: 'Unauthorized Track' }
      );

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 when creating track on other users project', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, {
        name: 'Other User Project',
      });

      const response = await apiPost(
        `/api/v1/daw/projects/${otherProject.id}/tracks`,
        { name: 'Intruder Track' },
        testUser.accessToken
      );

      expect(response.status).toBe(403);
      expect(response.error?.code).toBe('FORBIDDEN');
    });

    it('should return 404 for non-existent project', async () => {
      const fakeProjectId = '00000000-0000-0000-0000-000000000000';

      const response = await apiPost(
        `/api/v1/daw/projects/${fakeProjectId}/tracks`,
        { name: 'Ghost Track' },
        testUser.accessToken
      );

      expect(response.status).toBe(404);
      expect(response.error?.code).toBe('NOT_FOUND');
    });

    it('should return 400 for missing required name', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Missing Name Project' });

      const response = await apiPost(
        `/api/v1/daw/projects/${project.id}/tracks`,
        { type: 'audio' },
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error).toBeDefined();
    });

    it('should return 400 for invalid volume', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Invalid Volume Project' });

      const response = await apiPost(
        `/api/v1/daw/projects/${project.id}/tracks`,
        { name: 'Bad Volume', volume: 5.0 }, // volume must be 0-2
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error).toBeDefined();
    });

    it('should return 400 for invalid pan', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Invalid Pan Project' });

      const response = await apiPost(
        `/api/v1/daw/projects/${project.id}/tracks`,
        { name: 'Bad Pan', pan: 2.0 }, // pan must be -1 to 1
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error).toBeDefined();
    });

    it('should return 400 for invalid color format', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Invalid Color Project' });

      const response = await apiPost(
        `/api/v1/daw/projects/${project.id}/tracks`,
        { name: 'Bad Color', color: 'red' }, // must be #RRGGBB
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error).toBeDefined();
    });
  });

  // ==========================================================================
  // GET /api/v1/daw/projects/:id/tracks - List tracks
  // ==========================================================================

  describe('GET /api/v1/daw/projects/:id/tracks', () => {
    it('should return empty array when project has no tracks', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Empty Project' });

      const response = await apiGet<{ data: DawTrack[] }>(
        `/api/v1/daw/projects/${project.id}/tracks`,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data?.data).toEqual([]);
    });

    it('should return project tracks', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Tracks Project' });
      await createTrackDirectly(project.id, { name: 'Track A', position: 0 });
      await createTrackDirectly(project.id, { name: 'Track B', position: 1 });
      await createTrackDirectly(project.id, { name: 'Track C', position: 2 });

      const response = await apiGet<{ data: DawTrack[] }>(
        `/api/v1/daw/projects/${project.id}/tracks`,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data).toHaveLength(3);

      const names = response.data?.data.map((t) => t.name);
      expect(names).toContain('Track A');
      expect(names).toContain('Track B');
      expect(names).toContain('Track C');
    });

    it('should return tracks sorted by position', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Sorted Tracks' });
      await createTrackDirectly(project.id, { name: 'Last', position: 2 });
      await createTrackDirectly(project.id, { name: 'First', position: 0 });
      await createTrackDirectly(project.id, { name: 'Middle', position: 1 });

      const response = await apiGet<{ data: DawTrack[] }>(
        `/api/v1/daw/projects/${project.id}/tracks`,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data).toHaveLength(3);
      expect(response.data?.data[0].name).toBe('First');
      expect(response.data?.data[1].name).toBe('Middle');
      expect(response.data?.data[2].name).toBe('Last');
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Auth List Project' });

      const response = await apiGet(`/api/v1/daw/projects/${project.id}/tracks`);

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 when listing tracks from other users project', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, {
        name: 'Private Project',
      });
      await createTrackDirectly(otherProject.id, { name: 'Secret Track' });

      const response = await apiGet(
        `/api/v1/daw/projects/${otherProject.id}/tracks`,
        testUser.accessToken
      );

      expect(response.status).toBe(403);
      expect(response.error?.code).toBe('FORBIDDEN');
    });

    it('should return 404 for non-existent project', async () => {
      const fakeProjectId = '00000000-0000-0000-0000-000000000000';

      const response = await apiGet(
        `/api/v1/daw/projects/${fakeProjectId}/tracks`,
        testUser.accessToken
      );

      expect(response.status).toBe(404);
      expect(response.error?.code).toBe('NOT_FOUND');
    });

    it('should NOT leak tracks from other projects', async () => {
      const projectA = await createProjectDirectly(testUser.id, { name: 'Project A' });
      const projectB = await createProjectDirectly(testUser.id, { name: 'Project B' });

      await createTrackDirectly(projectA.id, { name: 'Track in A' });
      await createTrackDirectly(projectB.id, { name: 'Track in B' });

      const responseA = await apiGet<{ data: DawTrack[] }>(
        `/api/v1/daw/projects/${projectA.id}/tracks`,
        testUser.accessToken
      );

      expect(responseA.status).toBe(200);
      expect(responseA.data?.data).toHaveLength(1);
      expect(responseA.data?.data[0].name).toBe('Track in A');
    });
  });

  // ==========================================================================
  // GET /api/v1/daw/projects/:id/tracks/:trackId - Get single track
  // ==========================================================================

  describe('GET /api/v1/daw/projects/:id/tracks/:trackId', () => {
    it('should return track details for owner', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Detail Project' });
      const track = await createTrackDirectly(project.id, {
        name: 'Detailed Track',
        type: 'audio',
        volume: 0.75,
        pan: 0.5,
        color: '#00FF00',
      });

      const response = await apiGet<{ data: DawTrack }>(
        `/api/v1/daw/projects/${project.id}/tracks/${track.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data.id).toBe(track.id);
      expect(response.data?.data.name).toBe('Detailed Track');
      expect(response.data?.data.type).toBe('audio');
      expect(response.data?.data.volume).toBe(0.75);
      expect(response.data?.data.pan).toBe(0.5);
      expect(response.data?.data.color).toBe('#00FF00');
      expect(response.data?.data.project_id).toBe(project.id);
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Auth Single Project' });
      const track = await createTrackDirectly(project.id, { name: 'Auth Track' });

      const response = await apiGet(
        `/api/v1/daw/projects/${project.id}/tracks/${track.id}`
      );

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 for unauthorized track access', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, {
        name: 'Other Project',
      });
      const otherTrack = await createTrackDirectly(otherProject.id, {
        name: 'Private Track',
      });

      const response = await apiGet(
        `/api/v1/daw/projects/${otherProject.id}/tracks/${otherTrack.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(403);
      expect(response.error?.code).toBe('FORBIDDEN');
    });

    it('should return 404 for non-existent track', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Existing Project' });
      const fakeTrackId = '00000000-0000-0000-0000-000000000000';

      const response = await apiGet(
        `/api/v1/daw/projects/${project.id}/tracks/${fakeTrackId}`,
        testUser.accessToken
      );

      expect(response.status).toBe(404);
      expect(response.error?.code).toBe('NOT_FOUND');
    });

    it('should return 404 for non-existent project', async () => {
      const fakeProjectId = '00000000-0000-0000-0000-000000000000';
      const fakeTrackId = '00000000-0000-0000-0000-000000000001';

      const response = await apiGet(
        `/api/v1/daw/projects/${fakeProjectId}/tracks/${fakeTrackId}`,
        testUser.accessToken
      );

      expect(response.status).toBe(404);
      expect(response.error?.code).toBe('NOT_FOUND');
    });

    it('should return 404 when track exists in different project', async () => {
      const projectA = await createProjectDirectly(testUser.id, { name: 'Project A' });
      const projectB = await createProjectDirectly(testUser.id, { name: 'Project B' });
      const trackInB = await createTrackDirectly(projectB.id, { name: 'Track in B' });

      // Try to access track from project B using project A's URL
      const response = await apiGet(
        `/api/v1/daw/projects/${projectA.id}/tracks/${trackInB.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(404);
      expect(response.error?.code).toBe('NOT_FOUND');
    });
  });

  // ==========================================================================
  // PUT /api/v1/daw/projects/:id/tracks/:trackId - Update track
  // ==========================================================================

  describe('PUT /api/v1/daw/projects/:id/tracks/:trackId', () => {
    it('should update track name', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Update Project' });
      const track = await createTrackDirectly(project.id, { name: 'Original Name' });

      const response = await apiPut<{ data: DawTrack }>(
        `/api/v1/daw/projects/${project.id}/tracks/${track.id}`,
        { name: 'Updated Name' },
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data.name).toBe('Updated Name');
      expect(response.data?.data.id).toBe(track.id);
    });

    it('should update multiple fields', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Multi Update' });
      const track = await createTrackDirectly(project.id, {
        name: 'Multi Track',
        volume: 1.0,
        pan: 0,
      });

      const updateData: UpdateTrackRequest = {
        name: 'Updated Multi',
        volume: 0.5,
        pan: -0.8,
        mute: true,
        solo: true,
        color: '#0000FF',
      };

      const response = await apiPut<{ data: DawTrack }>(
        `/api/v1/daw/projects/${project.id}/tracks/${track.id}`,
        updateData,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data.name).toBe('Updated Multi');
      expect(response.data?.data.volume).toBe(0.5);
      expect(response.data?.data.pan).toBe(-0.8);
      expect(response.data?.data.mute).toBe(true);
      expect(response.data?.data.solo).toBe(true);
      expect(response.data?.data.color).toBe('#0000FF');
    });

    it('should update track armed state', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Armed Project' });
      const track = await createTrackDirectly(project.id, { name: 'To Arm', armed: false });

      const response = await apiPut<{ data: DawTrack }>(
        `/api/v1/daw/projects/${project.id}/tracks/${track.id}`,
        { armed: true },
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data.armed).toBe(true);
    });

    it('should update track position', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Reorder Project' });
      const track = await createTrackDirectly(project.id, { name: 'Moving Track', position: 0 });

      const response = await apiPut<{ data: DawTrack }>(
        `/api/v1/daw/projects/${project.id}/tracks/${track.id}`,
        { position: 5 },
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data.position).toBe(5);
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'No Auth Update' });
      const track = await createTrackDirectly(project.id, { name: 'Auth Track' });

      const response = await apiPut(
        `/api/v1/daw/projects/${project.id}/tracks/${track.id}`,
        { name: 'Should Fail' }
      );

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 for unauthorized track update', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, {
        name: 'Not My Project',
      });
      const otherTrack = await createTrackDirectly(otherProject.id, {
        name: 'Not My Track',
      });

      const response = await apiPut(
        `/api/v1/daw/projects/${otherProject.id}/tracks/${otherTrack.id}`,
        { name: 'Trying to Steal' },
        testUser.accessToken
      );

      expect(response.status).toBe(403);
      expect(response.error?.code).toBe('FORBIDDEN');
    });

    it('should return 404 for non-existent track', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Ghost Track Project' });
      const fakeTrackId = '00000000-0000-0000-0000-000000000000';

      const response = await apiPut(
        `/api/v1/daw/projects/${project.id}/tracks/${fakeTrackId}`,
        { name: 'Ghost Track' },
        testUser.accessToken
      );

      expect(response.status).toBe(404);
      expect(response.error?.code).toBe('NOT_FOUND');
    });

    it('should return 400 for invalid volume update', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Invalid Volume' });
      const track = await createTrackDirectly(project.id, { name: 'Bad Volume Track' });

      const response = await apiPut(
        `/api/v1/daw/projects/${project.id}/tracks/${track.id}`,
        { volume: 10.0 }, // volume must be 0-2
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error).toBeDefined();
    });

    it('should return 400 for invalid pan update', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Invalid Pan' });
      const track = await createTrackDirectly(project.id, { name: 'Bad Pan Track' });

      const response = await apiPut(
        `/api/v1/daw/projects/${project.id}/tracks/${track.id}`,
        { pan: -5.0 }, // pan must be -1 to 1
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error).toBeDefined();
    });

    it('should preserve unchanged fields', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Preserve Fields' });
      const track = await createTrackDirectly(project.id, {
        name: 'Original Track',
        volume: 0.7,
        pan: 0.3,
        mute: true,
      });

      // Only update name
      const response = await apiPut<{ data: DawTrack }>(
        `/api/v1/daw/projects/${project.id}/tracks/${track.id}`,
        { name: 'New Name Only' },
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data.name).toBe('New Name Only');
      // Original values should be preserved
      expect(response.data?.data.volume).toBe(0.7);
      expect(response.data?.data.pan).toBe(0.3);
      expect(response.data?.data.mute).toBe(true);
    });
  });

  // ==========================================================================
  // DELETE /api/v1/daw/projects/:id/tracks/:trackId - Delete track
  // ==========================================================================

  describe('DELETE /api/v1/daw/projects/:id/tracks/:trackId', () => {
    it('should delete a track', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Delete Project' });
      const track = await createTrackDirectly(project.id, { name: 'To Delete' });

      const response = await apiDelete(
        `/api/v1/daw/projects/${project.id}/tracks/${track.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(200);

      // Verify track is deleted
      const getResponse = await apiGet(
        `/api/v1/daw/projects/${project.id}/tracks/${track.id}`,
        testUser.accessToken
      );

      expect(getResponse.status).toBe(404);
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'No Auth Delete' });
      const track = await createTrackDirectly(project.id, { name: 'Auth Delete Track' });

      const response = await apiDelete(
        `/api/v1/daw/projects/${project.id}/tracks/${track.id}`
      );

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 for unauthorized track deletion', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, {
        name: 'Protected Project',
      });
      const otherTrack = await createTrackDirectly(otherProject.id, {
        name: 'Protected Track',
      });

      const response = await apiDelete(
        `/api/v1/daw/projects/${otherProject.id}/tracks/${otherTrack.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(403);
      expect(response.error?.code).toBe('FORBIDDEN');
    });

    it('should return 404 for non-existent track', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Delete Ghost' });
      const fakeTrackId = '00000000-0000-0000-0000-000000000000';

      const response = await apiDelete(
        `/api/v1/daw/projects/${project.id}/tracks/${fakeTrackId}`,
        testUser.accessToken
      );

      expect(response.status).toBe(404);
      expect(response.error?.code).toBe('NOT_FOUND');
    });

    it('should not allow deleting track from wrong project', async () => {
      const projectA = await createProjectDirectly(testUser.id, { name: 'Project A' });
      const projectB = await createProjectDirectly(testUser.id, { name: 'Project B' });
      const trackInB = await createTrackDirectly(projectB.id, { name: 'Track in B' });

      // Try to delete track from project B using project A's URL
      const response = await apiDelete(
        `/api/v1/daw/projects/${projectA.id}/tracks/${trackInB.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(404);

      // Verify track still exists in project B
      const verifyResponse = await apiGet<{ data: DawTrack }>(
        `/api/v1/daw/projects/${projectB.id}/tracks/${trackInB.id}`,
        testUser.accessToken
      );

      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.data?.data.id).toBe(trackInB.id);
    });
  });

  // ==========================================================================
  // Authorization Edge Cases
  // ==========================================================================

  describe('Authorization Edge Cases', () => {
    it('should handle expired/invalid tokens', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Token Test' });
      const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.token';

      const response = await apiGet(
        `/api/v1/daw/projects/${project.id}/tracks`,
        invalidToken
      );

      expect(response.status).toBe(401);
    });

    it('should NOT expose tracks via ID guessing', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, {
        name: 'Secret Project',
      });
      const secretTrack1 = await createTrackDirectly(otherProject.id, { name: 'Secret 1' });
      const secretTrack2 = await createTrackDirectly(otherProject.id, { name: 'Secret 2' });

      // Try to access each track as testUser
      const resp1 = await apiGet(
        `/api/v1/daw/projects/${otherProject.id}/tracks/${secretTrack1.id}`,
        testUser.accessToken
      );
      const resp2 = await apiGet(
        `/api/v1/daw/projects/${otherProject.id}/tracks/${secretTrack2.id}`,
        testUser.accessToken
      );

      expect(resp1.status).toBe(403);
      expect(resp2.status).toBe(403);
    });

    it('should NOT allow updating other users tracks', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, {
        name: 'Protected Project',
      });
      const otherTrack = await createTrackDirectly(otherProject.id, {
        name: 'Protected Track',
        volume: 1.0,
      });

      // Try update attempt
      await apiPut(
        `/api/v1/daw/projects/${otherProject.id}/tracks/${otherTrack.id}`,
        { name: 'Hacked!', volume: 0.0 },
        testUser.accessToken
      );

      // Verify track is unchanged
      const verifyResponse = await apiGet<{ data: DawTrack }>(
        `/api/v1/daw/projects/${otherProject.id}/tracks/${otherTrack.id}`,
        otherUser.accessToken
      );

      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.data?.data.name).toBe('Protected Track');
      expect(verifyResponse.data?.data.volume).toBe(1.0);
    });

    it('should NOT allow deleting other users tracks', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, {
        name: 'Delete Protected',
      });
      const otherTrack = await createTrackDirectly(otherProject.id, {
        name: 'Do Not Delete',
      });

      // Try delete attempt
      await apiDelete(
        `/api/v1/daw/projects/${otherProject.id}/tracks/${otherTrack.id}`,
        testUser.accessToken
      );

      // Verify track still exists
      const verifyResponse = await apiGet<{ data: DawTrack }>(
        `/api/v1/daw/projects/${otherProject.id}/tracks/${otherTrack.id}`,
        otherUser.accessToken
      );

      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.data?.data.name).toBe('Do Not Delete');
    });
  });
});
