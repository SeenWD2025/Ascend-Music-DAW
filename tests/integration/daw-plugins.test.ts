/**
 * Integration Tests: DAW Plugins API Routes
 *
 * Tests DAW plugin API endpoints:
 * - POST /api/v1/daw/tracks/:trackId/plugins - Add plugin
 * - GET /api/v1/daw/tracks/:trackId/plugins - List plugins
 * - GET /api/v1/daw/plugins/:pluginId - Get single plugin
 * - PUT /api/v1/daw/plugins/:pluginId - Update plugin
 * - DELETE /api/v1/daw/plugins/:pluginId - Remove plugin
 * - PATCH /api/v1/daw/tracks/:trackId/plugins/reorder - Reorder plugins
 *
 * All endpoints require authentication. 403 for unauthorized access.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import {
  createTestUserWithToken,
  deleteTestUser,
  type TestUser,
} from '../helpers/auth.helper.js';
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from '../helpers/api.helper.js';
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

interface DawPlugin {
  id: string;
  track_id: string;
  wam_id: string;
  wam_version: string;
  name: string;
  position: number;
  state?: Record<string, unknown>;
  bypass: boolean;
  created_at: string;
  updated_at: string;
}

interface CreatePluginRequest {
  wam_id: string;
  wam_version: string;
  name: string;
  position?: number;
  state?: Record<string, unknown>;
  bypass?: boolean;
}

interface UpdatePluginRequest {
  name?: string;
  position?: number;
  state?: Record<string, unknown>;
  bypass?: boolean;
}

interface ReorderPluginRequest {
  plugin_ids: string[];
}

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Cleans up all DAW projects (and cascades to tracks/plugins) for a user directly in the database.
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
 * Creates a plugin directly in the database for test setup.
 */
async function createPluginDirectly(
  trackId: string,
  data: Partial<CreatePluginRequest> = {}
): Promise<DawPlugin> {
  const adminClient = createAdminClient();

  const { data: plugin, error } = await adminClient
    .from('daw_plugins')
    .insert({
      track_id: trackId,
      wam_id: data.wam_id || 'com.example.plugin',
      wam_version: data.wam_version || '1.0.0',
      name: data.name || 'Test Plugin',
      position: data.position ?? 0,
      state: data.state || {},
      bypass: data.bypass ?? false,
    })
    .select()
    .single();

  if (error || !plugin) {
    throw new Error(`Failed to create test plugin: ${error?.message || 'Unknown error'}`);
  }

  return plugin as DawPlugin;
}

// =============================================================================
// Tests
// =============================================================================

describe('Integration: DAW Plugins API', () => {
  let testUser: TestUser & { accessToken: string };
  let otherUser: TestUser & { accessToken: string };

  beforeAll(async () => {
    testUser = await createTestUserWithToken({
      displayName: 'DAW Plugins Test User',
      role: 'client',
    });
    otherUser = await createTestUserWithToken({
      displayName: 'Other Plugins User',
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
    // Clean up projects (and cascaded tracks/plugins) after each test
    await cleanupUserProjects(testUser.id);
    await cleanupUserProjects(otherUser.id);
  });

  // ==========================================================================
  // POST /api/v1/daw/tracks/:trackId/plugins - Add plugin
  // ==========================================================================

  describe('POST /api/v1/daw/tracks/:trackId/plugins', () => {
    it('should add a plugin and return 201', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Plugin Test Project' });
      const track = await createTrackDirectly(project.id, { name: 'Audio Track' });

      const pluginData: CreatePluginRequest = {
        wam_id: 'com.example.reverb',
        wam_version: '2.0.0',
        name: 'Hall Reverb',
        position: 0,
        state: { mix: 0.5, decay: 3.0 },
        bypass: false,
      };

      const response = await apiPost<{ data: DawPlugin }>(
        `/api/v1/daw/tracks/${track.id}/plugins`,
        pluginData,
        testUser.accessToken
      );

      expect(response.status).toBe(201);
      expect(response.data).toBeDefined();
      expect(response.data?.data).toBeDefined();
      expect(response.data?.data.wam_id).toBe('com.example.reverb');
      expect(response.data?.data.wam_version).toBe('2.0.0');
      expect(response.data?.data.name).toBe('Hall Reverb');
      expect(response.data?.data.position).toBe(0);
      expect(response.data?.data.bypass).toBe(false);
      expect(response.data?.data.track_id).toBe(track.id);
      expect(response.data?.data.id).toBeDefined();
      expect(response.data?.data.created_at).toBeDefined();
    });

    it('should add plugin with minimal data (wam_id, wam_version, name)', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Minimal Plugin Project' });
      const track = await createTrackDirectly(project.id, { name: 'Track' });

      const response = await apiPost<{ data: DawPlugin }>(
        `/api/v1/daw/tracks/${track.id}/plugins`,
        {
          wam_id: 'com.example.compressor',
          wam_version: '1.0.0',
          name: 'Compressor',
        },
        testUser.accessToken
      );

      expect(response.status).toBe(201);
      expect(response.data?.data.wam_id).toBe('com.example.compressor');
      expect(response.data?.data.wam_version).toBe('1.0.0');
      expect(response.data?.data.name).toBe('Compressor');
      // Should have defaults
      expect(response.data?.data.position).toBe(0);
      expect(response.data?.data.bypass).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'No Auth Project' });
      const track = await createTrackDirectly(project.id, { name: 'Track' });

      const response = await apiPost(
        `/api/v1/daw/tracks/${track.id}/plugins`,
        {
          wam_id: 'com.example.eq',
          wam_version: '1.0.0',
          name: 'EQ',
        }
      );

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 when adding plugin to other users track', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, { name: 'Other Project' });
      const otherTrack = await createTrackDirectly(otherProject.id, { name: 'Other Track' });

      const response = await apiPost(
        `/api/v1/daw/tracks/${otherTrack.id}/plugins`,
        {
          wam_id: 'com.example.intruder',
          wam_version: '1.0.0',
          name: 'Intruder Plugin',
        },
        testUser.accessToken
      );

      expect(response.status).toBe(403);
      expect(response.error?.code).toBe('FORBIDDEN');
    });

    it('should return 404 for non-existent track', async () => {
      const fakeTrackId = '00000000-0000-0000-0000-000000000000';

      const response = await apiPost(
        `/api/v1/daw/tracks/${fakeTrackId}/plugins`,
        {
          wam_id: 'com.example.ghost',
          wam_version: '1.0.0',
          name: 'Ghost Plugin',
        },
        testUser.accessToken
      );

      expect(response.status).toBe(404);
      expect(response.error?.code).toBe('NOT_FOUND');
    });

    it('should return 400 for missing required wam_id', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Missing WAM Project' });
      const track = await createTrackDirectly(project.id, { name: 'Track' });

      const response = await apiPost(
        `/api/v1/daw/tracks/${track.id}/plugins`,
        {
          wam_version: '1.0.0',
          name: 'No WAM ID',
        },
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error).toBeDefined();
    });

    it('should return 400 for missing required wam_version', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Missing Version Project' });
      const track = await createTrackDirectly(project.id, { name: 'Track' });

      const response = await apiPost(
        `/api/v1/daw/tracks/${track.id}/plugins`,
        {
          wam_id: 'com.example.plugin',
          name: 'No Version',
        },
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error).toBeDefined();
    });

    it('should return 400 for missing required name', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Missing Name Project' });
      const track = await createTrackDirectly(project.id, { name: 'Track' });

      const response = await apiPost(
        `/api/v1/daw/tracks/${track.id}/plugins`,
        {
          wam_id: 'com.example.plugin',
          wam_version: '1.0.0',
        },
        testUser.accessToken
      );

      expect(response.status).toBe(400);
      expect(response.error).toBeDefined();
    });
  });

  // ==========================================================================
  // GET /api/v1/daw/tracks/:trackId/plugins - List plugins
  // ==========================================================================

  describe('GET /api/v1/daw/tracks/:trackId/plugins', () => {
    it('should return empty array when track has no plugins', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Empty Plugins Project' });
      const track = await createTrackDirectly(project.id, { name: 'Empty Track' });

      const response = await apiGet<{ data: DawPlugin[] }>(
        `/api/v1/daw/tracks/${track.id}/plugins`,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data?.data).toEqual([]);
    });

    it('should return track plugins ordered by position', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Plugins Project' });
      const track = await createTrackDirectly(project.id, { name: 'Track' });
      await createPluginDirectly(track.id, { name: 'Plugin A', wam_id: 'a', position: 0 });
      await createPluginDirectly(track.id, { name: 'Plugin B', wam_id: 'b', position: 1 });
      await createPluginDirectly(track.id, { name: 'Plugin C', wam_id: 'c', position: 2 });

      const response = await apiGet<{ data: DawPlugin[] }>(
        `/api/v1/daw/tracks/${track.id}/plugins`,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data).toHaveLength(3);
      expect(response.data?.data[0].name).toBe('Plugin A');
      expect(response.data?.data[1].name).toBe('Plugin B');
      expect(response.data?.data[2].name).toBe('Plugin C');
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Auth Project' });
      const track = await createTrackDirectly(project.id, { name: 'Track' });

      const response = await apiGet(`/api/v1/daw/tracks/${track.id}/plugins`);

      expect(response.status).toBe(401);
    });

    it('should return 403 for unauthorized access', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, { name: 'Other Project' });
      const otherTrack = await createTrackDirectly(otherProject.id, { name: 'Other Track' });

      const response = await apiGet(
        `/api/v1/daw/tracks/${otherTrack.id}/plugins`,
        testUser.accessToken
      );

      expect(response.status).toBe(403);
    });
  });

  // ==========================================================================
  // GET /api/v1/daw/plugins/:pluginId - Get single plugin
  // ==========================================================================

  describe('GET /api/v1/daw/plugins/:pluginId', () => {
    it('should return a single plugin', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Single Plugin Project' });
      const track = await createTrackDirectly(project.id, { name: 'Track' });
      const plugin = await createPluginDirectly(track.id, {
        name: 'Test Plugin',
        wam_id: 'com.test.plugin',
        wam_version: '1.2.3',
        state: { param1: 0.5 },
      });

      const response = await apiGet<{ data: DawPlugin }>(
        `/api/v1/daw/plugins/${plugin.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data).toBeDefined();
      expect(response.data?.data.id).toBe(plugin.id);
      expect(response.data?.data.name).toBe('Test Plugin');
      expect(response.data?.data.wam_id).toBe('com.test.plugin');
      expect(response.data?.data.wam_version).toBe('1.2.3');
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Auth Project' });
      const track = await createTrackDirectly(project.id, { name: 'Track' });
      const plugin = await createPluginDirectly(track.id, { name: 'Plugin' });

      const response = await apiGet(`/api/v1/daw/plugins/${plugin.id}`);

      expect(response.status).toBe(401);
    });

    it('should return 403 for unauthorized access', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, { name: 'Other Project' });
      const otherTrack = await createTrackDirectly(otherProject.id, { name: 'Other Track' });
      const otherPlugin = await createPluginDirectly(otherTrack.id, { name: 'Other Plugin' });

      const response = await apiGet(
        `/api/v1/daw/plugins/${otherPlugin.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent plugin', async () => {
      const fakePluginId = '00000000-0000-0000-0000-000000000000';

      const response = await apiGet(
        `/api/v1/daw/plugins/${fakePluginId}`,
        testUser.accessToken
      );

      expect(response.status).toBe(404);
      expect(response.error?.code).toBe('NOT_FOUND');
    });
  });

  // ==========================================================================
  // PUT /api/v1/daw/plugins/:pluginId - Update plugin
  // ==========================================================================

  describe('PUT /api/v1/daw/plugins/:pluginId', () => {
    it('should update plugin state and bypass', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Update Plugin Project' });
      const track = await createTrackDirectly(project.id, { name: 'Track' });
      const plugin = await createPluginDirectly(track.id, {
        name: 'Original Plugin',
        state: { mix: 0.5 },
        bypass: false,
      });

      const updateData: UpdatePluginRequest = {
        name: 'Updated Plugin',
        state: { mix: 0.75, newParam: 'value' },
        bypass: true,
      };

      const response = await apiPut<{ data: DawPlugin }>(
        `/api/v1/daw/plugins/${plugin.id}`,
        updateData,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data.name).toBe('Updated Plugin');
      expect(response.data?.data.state).toEqual({ mix: 0.75, newParam: 'value' });
      expect(response.data?.data.bypass).toBe(true);
    });

    it('should update plugin position', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Position Project' });
      const track = await createTrackDirectly(project.id, { name: 'Track' });
      const plugin = await createPluginDirectly(track.id, { name: 'Plugin', position: 0 });

      const response = await apiPut<{ data: DawPlugin }>(
        `/api/v1/daw/plugins/${plugin.id}`,
        { position: 5 },
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data.position).toBe(5);
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Auth Project' });
      const track = await createTrackDirectly(project.id, { name: 'Track' });
      const plugin = await createPluginDirectly(track.id, { name: 'Plugin' });

      const response = await apiPut(
        `/api/v1/daw/plugins/${plugin.id}`,
        { name: 'Hacked' }
      );

      expect(response.status).toBe(401);
    });

    it('should return 403 for unauthorized access', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, { name: 'Other Project' });
      const otherTrack = await createTrackDirectly(otherProject.id, { name: 'Other Track' });
      const otherPlugin = await createPluginDirectly(otherTrack.id, { name: 'Other Plugin' });

      const response = await apiPut(
        `/api/v1/daw/plugins/${otherPlugin.id}`,
        { name: 'Hacked' },
        testUser.accessToken
      );

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent plugin', async () => {
      const fakePluginId = '00000000-0000-0000-0000-000000000000';

      const response = await apiPut(
        `/api/v1/daw/plugins/${fakePluginId}`,
        { name: 'Ghost' },
        testUser.accessToken
      );

      expect(response.status).toBe(404);
    });
  });

  // ==========================================================================
  // DELETE /api/v1/daw/plugins/:pluginId - Remove plugin
  // ==========================================================================

  describe('DELETE /api/v1/daw/plugins/:pluginId', () => {
    it('should delete a plugin and return 204', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Delete Plugin Project' });
      const track = await createTrackDirectly(project.id, { name: 'Track' });
      const plugin = await createPluginDirectly(track.id, { name: 'Plugin to Delete' });

      const response = await apiDelete(
        `/api/v1/daw/plugins/${plugin.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(204);

      // Verify deletion
      const adminClient = createAdminClient();
      const { data: deleted } = await adminClient
        .from('daw_plugins')
        .select('id')
        .eq('id', plugin.id)
        .single();

      expect(deleted).toBeNull();
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Auth Project' });
      const track = await createTrackDirectly(project.id, { name: 'Track' });
      const plugin = await createPluginDirectly(track.id, { name: 'Plugin' });

      const response = await apiDelete(`/api/v1/daw/plugins/${plugin.id}`);

      expect(response.status).toBe(401);
    });

    it('should return 403 for unauthorized access', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, { name: 'Other Project' });
      const otherTrack = await createTrackDirectly(otherProject.id, { name: 'Other Track' });
      const otherPlugin = await createPluginDirectly(otherTrack.id, { name: 'Other Plugin' });

      const response = await apiDelete(
        `/api/v1/daw/plugins/${otherPlugin.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent plugin', async () => {
      const fakePluginId = '00000000-0000-0000-0000-000000000000';

      const response = await apiDelete(
        `/api/v1/daw/plugins/${fakePluginId}`,
        testUser.accessToken
      );

      expect(response.status).toBe(404);
    });
  });

  // ==========================================================================
  // PATCH /api/v1/daw/tracks/:trackId/plugins/reorder - Reorder plugins
  // ==========================================================================

  describe('PATCH /api/v1/daw/tracks/:trackId/plugins/reorder', () => {
    it('should reorder plugins', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Reorder Project' });
      const track = await createTrackDirectly(project.id, { name: 'Track' });
      const pluginA = await createPluginDirectly(track.id, { name: 'A', wam_id: 'a', position: 0 });
      const pluginB = await createPluginDirectly(track.id, { name: 'B', wam_id: 'b', position: 1 });
      const pluginC = await createPluginDirectly(track.id, { name: 'C', wam_id: 'c', position: 2 });

      // Reorder: C, A, B
      const response = await apiPatch<{ data: DawPlugin[] }>(
        `/api/v1/daw/tracks/${track.id}/plugins/reorder`,
        { plugin_ids: [pluginC.id, pluginA.id, pluginB.id] },
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.data).toHaveLength(3);
      expect(response.data?.data[0].id).toBe(pluginC.id);
      expect(response.data?.data[0].position).toBe(0);
      expect(response.data?.data[1].id).toBe(pluginA.id);
      expect(response.data?.data[1].position).toBe(1);
      expect(response.data?.data[2].id).toBe(pluginB.id);
      expect(response.data?.data[2].position).toBe(2);
    });

    it('should return 401 without authentication', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Auth Project' });
      const track = await createTrackDirectly(project.id, { name: 'Track' });

      const response = await apiPatch(
        `/api/v1/daw/tracks/${track.id}/plugins/reorder`,
        { plugin_ids: [] }
      );

      expect(response.status).toBe(401);
    });

    it('should return 403 for unauthorized access', async () => {
      const otherProject = await createProjectDirectly(otherUser.id, { name: 'Other Project' });
      const otherTrack = await createTrackDirectly(otherProject.id, { name: 'Other Track' });

      const response = await apiPatch(
        `/api/v1/daw/tracks/${otherTrack.id}/plugins/reorder`,
        { plugin_ids: [] },
        testUser.accessToken
      );

      expect(response.status).toBe(403);
    });

    it('should return 400 for invalid plugin_ids array', async () => {
      const project = await createProjectDirectly(testUser.id, { name: 'Invalid Reorder Project' });
      const track = await createTrackDirectly(project.id, { name: 'Track' });

      const response = await apiPatch(
        `/api/v1/daw/tracks/${track.id}/plugins/reorder`,
        { plugin_ids: 'not-an-array' },
        testUser.accessToken
      );

      expect(response.status).toBe(400);
    });
  });
});
