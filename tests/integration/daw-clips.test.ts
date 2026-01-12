/**
 * Integration Tests: DAW Clips API Routes
 *
 * Tests DAW clip API endpoints:
 * - POST /api/v1/daw/tracks/:trackId/clips - Create a clip
 * - GET /api/v1/daw/tracks/:trackId/clips - List clips
 * - GET /api/v1/daw/clips/:clipId - Get single clip
 * - PUT /api/v1/daw/clips/:clipId - Update clip
 * - PUT /api/v1/daw/clips/:clipId/move - Move clip
 * - DELETE /api/v1/daw/clips/:clipId - Delete clip
 *
 * All endpoints require authentication. 403 for unauthorized access.
 * Also validates source_offset_seconds field handling.
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

interface DawClip {
  id: string;
  track_id: string;
  name: string;
  start_time: number;
  duration: number;
  source_offset_seconds: number;
  clip_type: 'audio' | 'midi';
  drive_file_id: string | null;
  volume: number;
  pan: number;
  mute: boolean;
  created_at: string;
  updated_at: string;
}

interface CreateClipRequest {
  name: string;
  start_time?: number;
  duration: number;
  source_offset_seconds?: number;
  clip_type?: 'audio' | 'midi';
  drive_file_id?: string;
  volume?: number;
  pan?: number;
  mute?: boolean;
}

interface UpdateClipRequest {
  name?: string;
  start_time?: number;
  duration?: number;
  source_offset_seconds?: number;
  clip_type?: 'audio' | 'midi';
  drive_file_id?: string;
  volume?: number;
  pan?: number;
  mute?: boolean;
}

interface MoveClipRequest {
  start_time: number;
  track_id?: string;
}

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Cleans up all DAW projects (and cascades to tracks/clips) for a user directly in the database.
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
  data: Partial<{ name: string; type: string; position: number }> = {}
): Promise<DawTrack> {
  const adminClient = createAdminClient();

  const { data: track, error } = await adminClient
    .from('daw_tracks')
    .insert({
      project_id: projectId,
      name: data.name || 'Test Track',
      type: data.type || 'audio',
      position: data.position ?? 0,
      volume: 1.0,
      pan: 0.0,
      mute: false,
      solo: false,
      armed: false,
    })
    .select()
    .single();

  if (error || !track) {
    throw new Error(`Failed to create test track: ${error?.message || 'Unknown error'}`);
  }

  return track as DawTrack;
}

/**
 * Creates a clip directly in the database for test setup.
 */
async function createClipDirectly(
  trackId: string,
  data: Partial<CreateClipRequest> = {}
): Promise<DawClip> {
  const adminClient = createAdminClient();

  const { data: clip, error } = await adminClient
    .from('daw_clips')
    .insert({
      track_id: trackId,
      name: data.name || 'Test Clip',
      start_time: data.start_time ?? 0,
      duration: data.duration ?? 10,
      source_offset_seconds: data.source_offset_seconds ?? 0,
      clip_type: data.clip_type || 'audio',
      drive_file_id: data.drive_file_id || null,
      volume: data.volume ?? 1.0,
      pan: data.pan ?? 0.0,
      mute: data.mute ?? false,
    })
    .select()
    .single();

  if (error || !clip) {
    throw new Error(`Failed to create test clip: ${error?.message || 'Unknown error'}`);
  }

  return clip as DawClip;
}

// =============================================================================
// Tests
// =============================================================================

describe('Integration: DAW Clips API', () => {
  let testUser: TestUser & { accessToken: string };
  let otherUser: TestUser & { accessToken: string };

  beforeAll(async () => {
    testUser = await createTestUserWithToken({
      displayName: 'DAW Clips Test User',
      role: 'client',
    });
    otherUser = await createTestUserWithToken({
      displayName: 'Other Clips User',
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
    // Clean up projects (and cascaded tracks/clips) after each test
    await cleanupUserProjects(testUser.id);
    await cleanupUserProjects(otherUser.id);
  });

  // ==========================================================================
  // POST /api/v1/daw/tracks/:trackId/clips - Create clip
  // ==========================================================================

  describe('POST /api/v1/daw/tracks/:trackId/clips', () => {
    it('should create a clip and return 201', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Clip Test Project' });
      const track = await createTrackDirectly(project.id, { name: 'Audio Track 1' });

      const clipData: CreateClipRequest = {
        name: 'Vocal Take 1',
        start_time: 5.0,
        duration: 30.5,
        source_offset_seconds: 2.5,
        clip_type: 'audio',
        volume: 0.9,
        pan: 0.1,
        mute: false,
      };

      const response = await apiPost<{ data: DawClip }>(
        `/api/v1/daw/tracks/${track.id}/clips`,
        clipData,
        testUser.accessToken
      );

      expect(response.status).toBe(201);
      expect(response.data).toBeDefined();
      expect(response.data?.data).toBeDefined();
      expect(response.data?.data.name).toBe('Vocal Take 1');
      expect(response.data?.data.start_time).toBe(5.0);
      expect(response.data?.data.duration).toBe(30.5);
      expect(response.data?.data.source_offset_seconds).toBe(2.5);
      expect(response.data?.data.clip_type).toBe('audio');
      expect(response.data?.data.volume).toBe(0.9);
      expect(response.data?.data.pan).toBe(0.1);
      expect(response.data?.data.mute).toBe(false);
      expect(response.data?.data.track_id).toBe(track.id);
      expect(response.data?.data.id).toBeDefined();
      expect(response.data?.data.created_at).toBeDefined();
    });

    it('should create a clip with minimal data (name and duration only)', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Minimal Clip Project' });
      const track = await createTrackDirectly(project.id, { name: 'Minimal Track' });

      const response = await apiPost<{ data: DawClip }>(
        `/api/v1/daw/tracks/${track.id}/clips`,
        { name: 'Minimal Clip', duration: 10 },
        testUser.accessToken
      );

      expect(response.status).toBe(201);
      expect(response.data?.data.name).toBe('Minimal Clip');
      expect(response.data?.data.duration).toBe(10);
      // Should have defaults
      expect(response.data?.data.start_time).toBe(0);
      expect(response.data?.data.source_offset_seconds).toBe(0);
      expect(response.data?.data.clip_type).toBe('audio');
      expect(response.data?.data.volume).toBe(1.0);
      expect(response.data?.data.pan).toBe(0);
      expect(response.data?.data.mute).toBe(false);
    });

    it('should create a MIDI clip', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'MIDI Clip Project' });
      const track = await createTrackDirectly(project.id, { name: 'MIDI Track', type: 'midi' });

      const response = await apiPost<{ data: DawClip }>(
        `/api/v1/daw/tracks/${track.id}/clips`,
        { name: 'Piano Roll', duration: 8, clip_type: 'midi' },
        testUser.accessToken
      );

      expect(response.status).toBe(201);
      expect(response.data?.data.name).toBe('Piano Roll');
      expect(response.data?.data.clip_type).toBe('midi');
    });

    it('should validate source_offset_seconds is not negative', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Validation Test Project' });
      const track = await createTrackDirectly(project.id, { name: 'Validation Track' });

      const response = await apiPost(
        `/api/v1/daw/tracks/${track.id}/clips`,
        { name: 'Invalid Clip', duration: 10, source_offset_seconds: -5 },
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should validate source_offset_seconds defaults to 0', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Default Offset Project' });
      const track = await createTrackDirectly(project.id, { name: 'Default Offset Track' });

      const response = await apiPost<{ data: DawClip }>(
        `/api/v1/daw/tracks/${track.id}/clips`,
        { name: 'Default Offset Clip', duration: 15 },
        testUser.accessToken
      );

      expect(response.status).toBe(201);
      expect(response.data?.data.source_offset_seconds).toBe(0);
    });

    it('should accept valid source_offset_seconds value', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Valid Offset Project' });
      const track = await createTrackDirectly(project.id, { name: 'Valid Offset Track' });

      const response = await apiPost<{ data: DawClip }>(
        `/api/v1/daw/tracks/${track.id}/clips`,
        { name: 'Trimmed Clip', duration: 20, source_offset_seconds: 10.5 },
        testUser.accessToken
      );

      expect(response.status).toBe(201);
      expect(response.data?.data.source_offset_seconds).toBe(10.5);
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'No Auth Project' });
      const track = await createTrackDirectly(project.id, { name: 'No Auth Track' });

      const response = await apiPost(
        `/api/v1/daw/tracks/${track.id}/clips`,
        { name: 'Unauthorized Clip', duration: 10 }
      );

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 when creating clip on other users track', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, {
        name: 'Other User Project',
      });
      const otherTrack = await createTrackDirectly(otherProject.id, {
        name: 'Other User Track',
      });

      const response = await apiPost(
        `/api/v1/daw/tracks/${otherTrack.id}/clips`,
        { name: 'Intruder Clip', duration: 10 },
        testUser.accessToken
      );

      expect(response.status).toBe(403);
      expect(response.error?.code).toBe('FORBIDDEN');
    });

    it('should return 404 for non-existent track', async () => {
      const fakeTrackId = '00000000-0000-0000-0000-000000000000';

      const response = await apiPost(
        `/api/v1/daw/tracks/${fakeTrackId}/clips`,
        { name: 'Ghost Clip', duration: 10 },
        testUser.accessToken
      );

      expect(response.status).toBe(404);
      expect(response.error?.code).toBe('NOT_FOUND');
    });

    it('should return 400 for invalid track ID format', async () => {
      const response = await apiPost(
        `/api/v1/daw/tracks/not-a-uuid/clips`,
        { name: 'Bad ID Clip', duration: 10 },
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when duration is missing', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Duration Validation Project' });
      const track = await createTrackDirectly(project.id, { name: 'Duration Validation Track' });

      const response = await apiPost(
        `/api/v1/daw/tracks/${track.id}/clips`,
        { name: 'No Duration Clip' },
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when duration is negative', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Negative Duration Project' });
      const track = await createTrackDirectly(project.id, { name: 'Negative Duration Track' });

      const response = await apiPost(
        `/api/v1/daw/tracks/${track.id}/clips`,
        { name: 'Negative Duration Clip', duration: -5 },
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  // ==========================================================================
  // GET /api/v1/daw/tracks/:trackId/clips - List clips
  // ==========================================================================

  describe('GET /api/v1/daw/tracks/:trackId/clips', () => {
    it('should list all clips for a track', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'List Clips Project' });
      const track = await createTrackDirectly(project.id, { name: 'List Clips Track' });

      // Create multiple clips
      await createClipDirectly(track.id, { name: 'Clip A', start_time: 0, duration: 10 });
      await createClipDirectly(track.id, { name: 'Clip B', start_time: 15, duration: 5 });
      await createClipDirectly(track.id, { name: 'Clip C', start_time: 25, duration: 8 });

      const response = await apiGet<{ data: DawClip[] }>(
        `/api/v1/daw/tracks/${track.id}/clips`,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data?.data).toHaveLength(3);

      const clipNames = response.data?.data.map((c) => c.name);
      expect(clipNames).toContain('Clip A');
      expect(clipNames).toContain('Clip B');
      expect(clipNames).toContain('Clip C');
    });

    it('should return empty array when track has no clips', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Empty Track Project' });
      const track = await createTrackDirectly(project.id, { name: 'Empty Track' });

      const response = await apiGet<{ data: DawClip[] }>(
        `/api/v1/daw/tracks/${track.id}/clips`,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data).toHaveLength(0);
    });

    it('should not list clips from other users tracks', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, {
        name: 'Other List Project',
      });
      const otherTrack = await createTrackDirectly(otherProject.id, {
        name: 'Other List Track',
      });
      await createClipDirectly(otherTrack.id, { name: 'Other Clip', duration: 10 });

      const response = await apiGet(
        `/api/v1/daw/tracks/${otherTrack.id}/clips`,
        testUser.accessToken
      );

      expect(response.status).toBe(403);
      expect(response.error?.code).toBe('FORBIDDEN');
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'No Auth List Project' });
      const track = await createTrackDirectly(project.id, { name: 'No Auth List Track' });

      const response = await apiGet(`/api/v1/daw/tracks/${track.id}/clips`);

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 404 for non-existent track', async () => {
      const fakeTrackId = '00000000-0000-0000-0000-000000000000';

      const response = await apiGet(
        `/api/v1/daw/tracks/${fakeTrackId}/clips`,
        testUser.accessToken
      );

      expect(response.status).toBe(404);
      expect(response.error?.code).toBe('NOT_FOUND');
    });
  });

  // ==========================================================================
  // GET /api/v1/daw/clips/:clipId - Get single clip
  // ==========================================================================

  describe('GET /api/v1/daw/clips/:clipId', () => {
    it('should get a single clip by ID', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Get Clip Project' });
      const track = await createTrackDirectly(project.id, { name: 'Get Clip Track' });
      const clip = await createClipDirectly(track.id, {
        name: 'Single Clip',
        start_time: 5,
        duration: 20,
        source_offset_seconds: 1.5,
        volume: 0.8,
      });

      const response = await apiGet<{ data: DawClip }>(
        `/api/v1/daw/clips/${clip.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data?.data.id).toBe(clip.id);
      expect(response.data?.data.name).toBe('Single Clip');
      expect(response.data?.data.start_time).toBe(5);
      expect(response.data?.data.duration).toBe(20);
      expect(response.data?.data.source_offset_seconds).toBe(1.5);
      expect(response.data?.data.volume).toBe(0.8);
      expect(response.data?.data.track_id).toBe(track.id);
    });

    it('should return 403 when accessing other users clip', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, {
        name: 'Other Get Project',
      });
      const otherTrack = await createTrackDirectly(otherProject.id, {
        name: 'Other Get Track',
      });
      const otherClip = await createClipDirectly(otherTrack.id, {
        name: 'Other Single Clip',
        duration: 10,
      });

      const response = await apiGet(
        `/api/v1/daw/clips/${otherClip.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(403);
      expect(response.error?.code).toBe('FORBIDDEN');
    });

    it('should return 404 for non-existent clip', async () => {
      const fakeClipId = '00000000-0000-0000-0000-000000000000';

      const response = await apiGet(
        `/api/v1/daw/clips/${fakeClipId}`,
        testUser.accessToken
      );

      expect(response.status).toBe(404);
      expect(response.error?.code).toBe('NOT_FOUND');
    });

    it('should return 400 for invalid clip ID format', async () => {
      const response = await apiGet(
        `/api/v1/daw/clips/not-a-uuid`,
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'No Auth Get Project' });
      const track = await createTrackDirectly(project.id, { name: 'No Auth Get Track' });
      const clip = await createClipDirectly(track.id, { name: 'No Auth Clip', duration: 10 });

      const response = await apiGet(`/api/v1/daw/clips/${clip.id}`);

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });
  });

  // ==========================================================================
  // PUT /api/v1/daw/clips/:clipId - Update clip
  // ==========================================================================

  describe('PUT /api/v1/daw/clips/:clipId', () => {
    it('should update a clip and return 200', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Update Clip Project' });
      const track = await createTrackDirectly(project.id, { name: 'Update Clip Track' });
      const clip = await createClipDirectly(track.id, {
        name: 'Original Name',
        duration: 10,
        volume: 1.0,
      });

      const updateData: UpdateClipRequest = {
        name: 'Updated Name',
        volume: 0.75,
        pan: -0.5,
      };

      const response = await apiPut<{ data: DawClip }>(
        `/api/v1/daw/clips/${clip.id}`,
        updateData,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data.name).toBe('Updated Name');
      expect(response.data?.data.volume).toBe(0.75);
      expect(response.data?.data.pan).toBe(-0.5);
      expect(response.data?.data.duration).toBe(10); // Unchanged
    });

    it('should update source_offset_seconds', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Offset Update Project' });
      const track = await createTrackDirectly(project.id, { name: 'Offset Update Track' });
      const clip = await createClipDirectly(track.id, {
        name: 'Offset Clip',
        duration: 20,
        source_offset_seconds: 0,
      });

      const response = await apiPut<{ data: DawClip }>(
        `/api/v1/daw/clips/${clip.id}`,
        { source_offset_seconds: 5.25 },
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data.source_offset_seconds).toBe(5.25);
    });

    it('should reject negative source_offset_seconds on update', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Bad Offset Update Project' });
      const track = await createTrackDirectly(project.id, { name: 'Bad Offset Update Track' });
      const clip = await createClipDirectly(track.id, { name: 'Bad Offset Clip', duration: 10 });

      const response = await apiPut(
        `/api/v1/daw/clips/${clip.id}`,
        { source_offset_seconds: -2 },
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should update start_time and duration', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Time Update Project' });
      const track = await createTrackDirectly(project.id, { name: 'Time Update Track' });
      const clip = await createClipDirectly(track.id, {
        name: 'Time Clip',
        start_time: 0,
        duration: 10,
      });

      const response = await apiPut<{ data: DawClip }>(
        `/api/v1/daw/clips/${clip.id}`,
        { start_time: 15, duration: 30 },
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data.start_time).toBe(15);
      expect(response.data?.data.duration).toBe(30);
    });

    it('should update mute state', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Mute Update Project' });
      const track = await createTrackDirectly(project.id, { name: 'Mute Update Track' });
      const clip = await createClipDirectly(track.id, {
        name: 'Mute Clip',
        duration: 10,
        mute: false,
      });

      const response = await apiPut<{ data: DawClip }>(
        `/api/v1/daw/clips/${clip.id}`,
        { mute: true },
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data.mute).toBe(true);
    });

    it('should return 403 when updating other users clip', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, {
        name: 'Other Update Project',
      });
      const otherTrack = await createTrackDirectly(otherProject.id, {
        name: 'Other Update Track',
      });
      const otherClip = await createClipDirectly(otherTrack.id, {
        name: 'Other Clip',
        duration: 10,
      });

      const response = await apiPut(
        `/api/v1/daw/clips/${otherClip.id}`,
        { name: 'Hacked Name' },
        testUser.accessToken
      );

      expect(response.status).toBe(403);
      expect(response.error?.code).toBe('FORBIDDEN');
    });

    it('should return 404 for non-existent clip', async () => {
      const fakeClipId = '00000000-0000-0000-0000-000000000000';

      const response = await apiPut(
        `/api/v1/daw/clips/${fakeClipId}`,
        { name: 'Ghost Update' },
        testUser.accessToken
      );

      expect(response.status).toBe(404);
      expect(response.error?.code).toBe('NOT_FOUND');
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'No Auth Update Project' });
      const track = await createTrackDirectly(project.id, { name: 'No Auth Update Track' });
      const clip = await createClipDirectly(track.id, { name: 'No Auth Update Clip', duration: 10 });

      const response = await apiPut(
        `/api/v1/daw/clips/${clip.id}`,
        { name: 'Unauthenticated Update' }
      );

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });
  });

  // ==========================================================================
  // PUT /api/v1/daw/clips/:clipId/move - Move clip
  // ==========================================================================

  describe('PUT /api/v1/daw/clips/:clipId/move', () => {
    it('should move a clip to a new start_time', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Move Clip Project' });
      const track = await createTrackDirectly(project.id, { name: 'Move Clip Track' });
      const clip = await createClipDirectly(track.id, {
        name: 'Moveable Clip',
        start_time: 0,
        duration: 10,
      });

      const moveData: MoveClipRequest = {
        start_time: 25,
      };

      const response = await apiPut<{ data: DawClip }>(
        `/api/v1/daw/clips/${clip.id}/move`,
        moveData,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data.start_time).toBe(25);
      expect(response.data?.data.track_id).toBe(track.id); // Same track
    });

    it('should move a clip to a different track', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Cross Track Move Project' });
      const trackA = await createTrackDirectly(project.id, { name: 'Track A', position: 0 });
      const trackB = await createTrackDirectly(project.id, { name: 'Track B', position: 1 });
      const clip = await createClipDirectly(trackA.id, {
        name: 'Cross Track Clip',
        start_time: 10,
        duration: 15,
      });

      const moveData: MoveClipRequest = {
        start_time: 5,
        track_id: trackB.id,
      };

      const response = await apiPut<{ data: DawClip }>(
        `/api/v1/daw/clips/${clip.id}/move`,
        moveData,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data.start_time).toBe(5);
      expect(response.data?.data.track_id).toBe(trackB.id);
    });

    it('should reject negative start_time on move', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Bad Move Project' });
      const track = await createTrackDirectly(project.id, { name: 'Bad Move Track' });
      const clip = await createClipDirectly(track.id, {
        name: 'Bad Move Clip',
        duration: 10,
      });

      const response = await apiPut(
        `/api/v1/daw/clips/${clip.id}/move`,
        { start_time: -5 },
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 403 when moving clip to other users track', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Own Move Project' });
      const track = await createTrackDirectly(project.id, { name: 'Own Track' });
      const clip = await createClipDirectly(track.id, { name: 'Own Clip', duration: 10 });

      const otherProject = await createProjectDirectly(otherUser.id, {
        name: 'Other Target Project',
      });
      const otherTrack = await createTrackDirectly(otherProject.id, {
        name: 'Other Target Track',
      });

      const response = await apiPut(
        `/api/v1/daw/clips/${clip.id}/move`,
        { start_time: 0, track_id: otherTrack.id },
        testUser.accessToken
      );

      expect(response.status).toBe(403);
      expect(response.error?.code).toBe('FORBIDDEN');
    });

    it('should return 403 when moving other users clip', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, {
        name: 'Other Move Project',
      });
      const otherTrack = await createTrackDirectly(otherProject.id, {
        name: 'Other Move Track',
      });
      const otherClip = await createClipDirectly(otherTrack.id, {
        name: 'Other Move Clip',
        duration: 10,
      });

      const response = await apiPut(
        `/api/v1/daw/clips/${otherClip.id}/move`,
        { start_time: 10 },
        testUser.accessToken
      );

      expect(response.status).toBe(403);
      expect(response.error?.code).toBe('FORBIDDEN');
    });

    it('should return 404 for non-existent clip', async () => {
      const fakeClipId = '00000000-0000-0000-0000-000000000000';

      const response = await apiPut(
        `/api/v1/daw/clips/${fakeClipId}/move`,
        { start_time: 10 },
        testUser.accessToken
      );

      expect(response.status).toBe(404);
      expect(response.error?.code).toBe('NOT_FOUND');
    });

    it('should return 404 for non-existent target track', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Fake Track Move Project' });
      const track = await createTrackDirectly(project.id, { name: 'Fake Track Move Track' });
      const clip = await createClipDirectly(track.id, {
        name: 'Fake Track Clip',
        duration: 10,
      });
      const fakeTrackId = '00000000-0000-0000-0000-000000000000';

      const response = await apiPut(
        `/api/v1/daw/clips/${clip.id}/move`,
        { start_time: 10, track_id: fakeTrackId },
        testUser.accessToken
      );

      expect(response.status).toBe(404);
      expect(response.error?.code).toBe('NOT_FOUND');
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'No Auth Move Project' });
      const track = await createTrackDirectly(project.id, { name: 'No Auth Move Track' });
      const clip = await createClipDirectly(track.id, { name: 'No Auth Move Clip', duration: 10 });

      const response = await apiPut(
        `/api/v1/daw/clips/${clip.id}/move`,
        { start_time: 10 }
      );

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });
  });

  // ==========================================================================
  // DELETE /api/v1/daw/clips/:clipId - Delete clip
  // ==========================================================================

  describe('DELETE /api/v1/daw/clips/:clipId', () => {
    it('should delete a clip and return 200', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Delete Clip Project' });
      const track = await createTrackDirectly(project.id, { name: 'Delete Clip Track' });
      const clip = await createClipDirectly(track.id, {
        name: 'To Be Deleted',
        duration: 10,
      });

      const deleteResponse = await apiDelete(
        `/api/v1/daw/clips/${clip.id}`,
        testUser.accessToken
      );

      expect(deleteResponse.status).toBe(200);

      // Verify clip is gone
      const getResponse = await apiGet(
        `/api/v1/daw/clips/${clip.id}`,
        testUser.accessToken
      );

      expect(getResponse.status).toBe(404);
    });

    it('should return 403 when deleting other users clip', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, {
        name: 'Other Delete Project',
      });
      const otherTrack = await createTrackDirectly(otherProject.id, {
        name: 'Other Delete Track',
      });
      const otherClip = await createClipDirectly(otherTrack.id, {
        name: 'Other Delete Clip',
        duration: 10,
      });

      const response = await apiDelete(
        `/api/v1/daw/clips/${otherClip.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(403);
      expect(response.error?.code).toBe('FORBIDDEN');
    });

    it('should return 404 for non-existent clip', async () => {
      const fakeClipId = '00000000-0000-0000-0000-000000000000';

      const response = await apiDelete(
        `/api/v1/daw/clips/${fakeClipId}`,
        testUser.accessToken
      );

      expect(response.status).toBe(404);
      expect(response.error?.code).toBe('NOT_FOUND');
    });

    it('should return 400 for invalid clip ID format', async () => {
      const response = await apiDelete(
        `/api/v1/daw/clips/not-a-uuid`,
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'No Auth Delete Project' });
      const track = await createTrackDirectly(project.id, { name: 'No Auth Delete Track' });
      const clip = await createClipDirectly(track.id, { name: 'No Auth Delete Clip', duration: 10 });

      const response = await apiDelete(`/api/v1/daw/clips/${clip.id}`);

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });
  });

  // ==========================================================================
  // source_offset_seconds field validation
  // ==========================================================================

  describe('source_offset_seconds field validation', () => {
    it('should store and retrieve source_offset_seconds accurately', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Offset Precision Project' });
      const track = await createTrackDirectly(project.id, { name: 'Offset Precision Track' });

      // Create with precise offset
      const createResponse = await apiPost<{ data: DawClip }>(
        `/api/v1/daw/tracks/${track.id}/clips`,
        {
          name: 'Precise Offset Clip',
          duration: 60,
          source_offset_seconds: 123.456789,
        },
        testUser.accessToken
      );

      expect(createResponse.status).toBe(201);
      expect(createResponse.data?.data.source_offset_seconds).toBeCloseTo(123.456789, 5);

      // Retrieve and verify
      const getResponse = await apiGet<{ data: DawClip }>(
        `/api/v1/daw/clips/${createResponse.data?.data.id}`,
        testUser.accessToken
      );

      expect(getResponse.status).toBe(200);
      expect(getResponse.data?.data.source_offset_seconds).toBeCloseTo(123.456789, 5);
    });

    it('should allow source_offset_seconds of 0', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Zero Offset Project' });
      const track = await createTrackDirectly(project.id, { name: 'Zero Offset Track' });

      const response = await apiPost<{ data: DawClip }>(
        `/api/v1/daw/tracks/${track.id}/clips`,
        {
          name: 'Zero Offset Clip',
          duration: 10,
          source_offset_seconds: 0,
        },
        testUser.accessToken
      );

      expect(response.status).toBe(201);
      expect(response.data?.data.source_offset_seconds).toBe(0);
    });

    it('should preserve source_offset_seconds when updating other fields', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Preserve Offset Project' });
      const track = await createTrackDirectly(project.id, { name: 'Preserve Offset Track' });
      const clip = await createClipDirectly(track.id, {
        name: 'Preserve Clip',
        duration: 20,
        source_offset_seconds: 5.5,
      });

      // Update only name
      const response = await apiPut<{ data: DawClip }>(
        `/api/v1/daw/clips/${clip.id}`,
        { name: 'Renamed Clip' },
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data.name).toBe('Renamed Clip');
      expect(response.data?.data.source_offset_seconds).toBe(5.5); // Preserved
    });

    it('should preserve source_offset_seconds when moving clip', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Move Preserve Project' });
      const track = await createTrackDirectly(project.id, { name: 'Move Preserve Track' });
      const clip = await createClipDirectly(track.id, {
        name: 'Move Preserve Clip',
        start_time: 0,
        duration: 15,
        source_offset_seconds: 3.25,
      });

      const response = await apiPut<{ data: DawClip }>(
        `/api/v1/daw/clips/${clip.id}/move`,
        { start_time: 50 },
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data.start_time).toBe(50);
      expect(response.data?.data.source_offset_seconds).toBe(3.25); // Preserved
    });
  });
});
