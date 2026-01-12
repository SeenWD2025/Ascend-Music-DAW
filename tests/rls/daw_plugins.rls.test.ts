/**
 * RLS Policy Tests: daw_plugins table
 * 
 * Verifies Row Level Security policies for the daw_plugins table.
 * Plugins inherit access from their parent track/project.
 * 
 * Policies tested:
 * - daw_plugins_member_select: Project members (owner + active collaborators) can SELECT
 * - daw_plugins_editor_insert: Project editors (owner + editor/admin collaborators) can INSERT
 * - daw_plugins_editor_update: Project editors can UPDATE
 * - daw_plugins_editor_delete: Project editors can DELETE
 * - daw_plugins_admin_all: Platform admin can access all plugins
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAdminClient, createUserClient, createAnonClient } from '../setup.js';
import {
  createTestUser,
  createAdminUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/auth.helper.js';

describe('RLS: daw_plugins table', () => {
  let projectOwner: TestUser;
  let editorCollaborator: TestUser;
  let viewerCollaborator: TestUser;
  let nonMember: TestUser;
  let adminUser: TestUser;
  let testProjectId: string;
  let testTrackId: string;
  let testPluginId: string;

  beforeAll(async () => {
    // Create test users
    projectOwner = await createTestUser({ displayName: 'Plugin Test Owner', role: 'client' });
    editorCollaborator = await createTestUser({ displayName: 'Plugin Editor', role: 'client' });
    viewerCollaborator = await createTestUser({ displayName: 'Plugin Viewer', role: 'client' });
    nonMember = await createTestUser({ displayName: 'Non Member', role: 'client' });
    adminUser = await createAdminUser();

    // Create a test project as admin (bypass RLS)
    const adminClient = createAdminClient();
    const { data: project, error: projectError } = await adminClient
      .from('daw_projects')
      .insert({
        owner_id: projectOwner.id,
        name: 'Plugin RLS Test Project',
        description: 'Project for testing plugin RLS policies',
        bpm: 120,
        time_signature: '4/4',
        sample_rate: 44100,
        bit_depth: 24,
        status: 'active',
      })
      .select()
      .single();

    if (projectError || !project) {
      throw new Error(`Failed to create test project: ${projectError?.message}`);
    }

    testProjectId = project.id;

    // Create a test track for plugin tests
    const { data: track, error: trackError } = await adminClient
      .from('daw_tracks')
      .insert({
        project_id: testProjectId,
        name: 'Test Track for Plugins',
        type: 'audio',
        position: 0,
        color: '#FF5500',
        volume: 1.0,
        pan: 0.0,
        mute: false,
        solo: false,
        armed: false,
      })
      .select()
      .single();

    if (trackError || !track) {
      throw new Error(`Failed to create test track: ${trackError?.message}`);
    }

    testTrackId = track.id;

    // Create a test plugin for read/update/delete tests
    const { data: plugin, error: pluginError } = await adminClient
      .from('daw_plugins')
      .insert({
        track_id: testTrackId,
        wam_id: 'com.example.reverb',
        wam_version: '1.0.0',
        name: 'Test Reverb Plugin',
        position: 0,
        state: { mix: 0.5, decay: 2.0 },
        bypass: false,
      })
      .select()
      .single();

    if (pluginError || !plugin) {
      throw new Error(`Failed to create test plugin: ${pluginError?.message}`);
    }

    testPluginId = plugin.id;

    // Add collaborators
    await adminClient.from('daw_collaborators').insert([
      {
        project_id: testProjectId,
        user_id: editorCollaborator.id,
        role: 'editor',
        invited_by: projectOwner.id,
        status: 'active',
        joined_at: new Date().toISOString(),
      },
      {
        project_id: testProjectId,
        user_id: viewerCollaborator.id,
        role: 'viewer',
        invited_by: projectOwner.id,
        status: 'active',
        joined_at: new Date().toISOString(),
      },
    ]);
  });

  afterAll(async () => {
    // Cleanup using admin client
    const adminClient = createAdminClient();

    // Delete plugins first
    await adminClient.from('daw_plugins').delete().eq('track_id', testTrackId);

    // Delete tracks
    await adminClient.from('daw_tracks').delete().eq('project_id', testProjectId);

    // Delete collaborators
    await adminClient.from('daw_collaborators').delete().eq('project_id', testProjectId);

    // Delete test project
    await adminClient.from('daw_projects').delete().eq('id', testProjectId);

    // Delete test users
    await deleteTestUser(projectOwner.id);
    await deleteTestUser(editorCollaborator.id);
    await deleteTestUser(viewerCollaborator.id);
    await deleteTestUser(nonMember.id);
    await deleteTestUser(adminUser.id);
  });

  // ==========================================================================
  // Project Owner Tests (Full CRUD)
  // ==========================================================================
  describe('Project owner access (can_edit_daw_project)', () => {
    it('✓ Owner can SELECT plugins on their tracks', async () => {
      const { client } = await createUserClient(projectOwner.email, projectOwner.password);

      const { data, error } = await client
        .from('daw_plugins')
        .select('*')
        .eq('id', testPluginId)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(testPluginId);
      expect(data?.name).toBe('Test Reverb Plugin');
      expect(data?.wam_id).toBe('com.example.reverb');
    });

    it('✓ Owner can INSERT plugin to their track', async () => {
      const { client } = await createUserClient(projectOwner.email, projectOwner.password);

      const { data, error } = await client
        .from('daw_plugins')
        .insert({
          track_id: testTrackId,
          wam_id: 'com.example.compressor',
          wam_version: '2.0.0',
          name: 'Owner Created Compressor',
          position: 1,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.name).toBe('Owner Created Compressor');
      expect(data?.wam_id).toBe('com.example.compressor');
      expect(data?.wam_version).toBe('2.0.0');

      // Cleanup
      const adminClient = createAdminClient();
      await adminClient.from('daw_plugins').delete().eq('id', data!.id);
    });

    it('✓ Owner can UPDATE plugin state/bypass', async () => {
      const { client } = await createUserClient(projectOwner.email, projectOwner.password);
      const newState = { mix: 0.75, decay: 3.0, roomSize: 'large' };

      const { data, error } = await client
        .from('daw_plugins')
        .update({ state: newState, bypass: true })
        .eq('id', testPluginId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.state).toEqual(newState);
      expect(data?.bypass).toBe(true);

      // Restore original values
      const adminClient = createAdminClient();
      await adminClient
        .from('daw_plugins')
        .update({ state: { mix: 0.5, decay: 2.0 }, bypass: false })
        .eq('id', testPluginId);
    });

    it('✓ Owner can DELETE plugin', async () => {
      const { client } = await createUserClient(projectOwner.email, projectOwner.password);

      // Create a plugin to delete
      const adminClient = createAdminClient();
      const { data: pluginToDelete } = await adminClient
        .from('daw_plugins')
        .insert({
          track_id: testTrackId,
          wam_id: 'com.example.eq',
          wam_version: '1.0.0',
          name: 'Plugin to Delete',
          position: 99,
        })
        .select()
        .single();

      expect(pluginToDelete).not.toBeNull();

      // Delete as owner
      const { error: deleteError } = await client
        .from('daw_plugins')
        .delete()
        .eq('id', pluginToDelete!.id);

      expect(deleteError).toBeNull();

      // Verify deletion
      const { data: deleted } = await adminClient
        .from('daw_plugins')
        .select('id')
        .eq('id', pluginToDelete!.id)
        .single();

      expect(deleted).toBeNull();
    });
  });

  // ==========================================================================
  // Editor Collaborator Tests (Full CRUD)
  // ==========================================================================
  describe('Editor collaborator access (can_edit_daw_project)', () => {
    it('✓ Collaborator can SELECT plugins on shared project', async () => {
      const { client } = await createUserClient(editorCollaborator.email, editorCollaborator.password);

      const { data, error } = await client
        .from('daw_plugins')
        .select('*')
        .eq('id', testPluginId)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(testPluginId);
    });

    it('✓ Collaborator with edit permission can INSERT plugin', async () => {
      const { client } = await createUserClient(editorCollaborator.email, editorCollaborator.password);

      const { data, error } = await client
        .from('daw_plugins')
        .insert({
          track_id: testTrackId,
          wam_id: 'com.example.delay',
          wam_version: '1.5.0',
          name: 'Editor Created Delay',
          position: 2,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.name).toBe('Editor Created Delay');
      expect(data?.wam_id).toBe('com.example.delay');

      // Cleanup
      const adminClient = createAdminClient();
      await adminClient.from('daw_plugins').delete().eq('id', data!.id);
    });

    it('✓ Collaborator with edit permission can UPDATE plugin', async () => {
      const { client } = await createUserClient(editorCollaborator.email, editorCollaborator.password);
      const newName = `Editor Updated ${Date.now()}`;

      const { data, error } = await client
        .from('daw_plugins')
        .update({ name: newName, bypass: true })
        .eq('id', testPluginId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.name).toBe(newName);
      expect(data?.bypass).toBe(true);

      // Restore original values
      const adminClient = createAdminClient();
      await adminClient
        .from('daw_plugins')
        .update({ name: 'Test Reverb Plugin', bypass: false })
        .eq('id', testPluginId);
    });

    it('✓ Collaborator with edit permission can DELETE plugin', async () => {
      const { client } = await createUserClient(editorCollaborator.email, editorCollaborator.password);

      // Create a plugin to delete
      const adminClient = createAdminClient();
      const { data: pluginToDelete } = await adminClient
        .from('daw_plugins')
        .insert({
          track_id: testTrackId,
          wam_id: 'com.example.limiter',
          wam_version: '1.0.0',
          name: 'Editor Delete Plugin',
          position: 98,
        })
        .select()
        .single();

      expect(pluginToDelete).not.toBeNull();

      // Delete as editor
      const { error: deleteError } = await client
        .from('daw_plugins')
        .delete()
        .eq('id', pluginToDelete!.id);

      expect(deleteError).toBeNull();

      // Verify deletion
      const { data: deleted } = await adminClient
        .from('daw_plugins')
        .select('id')
        .eq('id', pluginToDelete!.id)
        .single();

      expect(deleted).toBeNull();
    });
  });

  // ==========================================================================
  // Viewer Collaborator Tests (SELECT only)
  // ==========================================================================
  describe('Viewer collaborator access (is_daw_project_member, SELECT only)', () => {
    it('✓ Viewer collaborator can SELECT plugins', async () => {
      const { client } = await createUserClient(viewerCollaborator.email, viewerCollaborator.password);

      const { data, error } = await client
        .from('daw_plugins')
        .select('*')
        .eq('id', testPluginId)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(testPluginId);
      expect(data?.name).toBe('Test Reverb Plugin');
    });

    it('✗ Viewer collaborator cannot INSERT plugin', async () => {
      const { client } = await createUserClient(viewerCollaborator.email, viewerCollaborator.password);

      const { data, error } = await client
        .from('daw_plugins')
        .insert({
          track_id: testTrackId,
          wam_id: 'com.example.viewer-plugin',
          wam_version: '1.0.0',
          name: 'Viewer Attempted Plugin',
          position: 50,
        })
        .select()
        .single();

      // RLS should prevent insert
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it('✗ Viewer collaborator cannot UPDATE plugin', async () => {
      const { client } = await createUserClient(viewerCollaborator.email, viewerCollaborator.password);

      const { data, error } = await client
        .from('daw_plugins')
        .update({ name: 'Viewer Hacked Plugin', bypass: true })
        .eq('id', testPluginId)
        .select()
        .single();

      // RLS should prevent update - no rows returned
      expect(data).toBeNull();

      // Verify plugin was not modified
      const adminClient = createAdminClient();
      const { data: original } = await adminClient
        .from('daw_plugins')
        .select('name, bypass')
        .eq('id', testPluginId)
        .single();

      expect(original?.name).toBe('Test Reverb Plugin');
      expect(original?.bypass).toBe(false);
    });

    it('✗ Viewer collaborator cannot DELETE plugin', async () => {
      const { client } = await createUserClient(viewerCollaborator.email, viewerCollaborator.password);

      const { error } = await client
        .from('daw_plugins')
        .delete()
        .eq('id', testPluginId);

      // Verify plugin still exists
      const adminClient = createAdminClient();
      const { data } = await adminClient
        .from('daw_plugins')
        .select('id')
        .eq('id', testPluginId)
        .single();

      expect(data).not.toBeNull();
    });
  });

  // ==========================================================================
  // Non-Member Tests (No access)
  // ==========================================================================
  describe('Non-member access restrictions', () => {
    it('✗ Non-member cannot SELECT plugins', async () => {
      const { client } = await createUserClient(nonMember.email, nonMember.password);

      const { data, error } = await client
        .from('daw_plugins')
        .select('*')
        .eq('id', testPluginId)
        .single();

      // RLS should prevent access - no data returned
      expect(data).toBeNull();
    });

    it('✗ Non-member cannot INSERT plugin', async () => {
      const { client } = await createUserClient(nonMember.email, nonMember.password);

      const { data, error } = await client
        .from('daw_plugins')
        .insert({
          track_id: testTrackId,
          wam_id: 'com.example.hacked',
          wam_version: '1.0.0',
          name: 'Non-Member Plugin',
          position: 100,
        })
        .select()
        .single();

      // RLS should prevent insert
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it('✗ Non-member cannot UPDATE plugin', async () => {
      const { client } = await createUserClient(nonMember.email, nonMember.password);

      const { data, error } = await client
        .from('daw_plugins')
        .update({ name: 'Non-Member Hacked Plugin' })
        .eq('id', testPluginId)
        .select()
        .single();

      // RLS should prevent update
      expect(data).toBeNull();

      // Verify plugin was not modified
      const adminClient = createAdminClient();
      const { data: original } = await adminClient
        .from('daw_plugins')
        .select('name')
        .eq('id', testPluginId)
        .single();

      expect(original?.name).toBe('Test Reverb Plugin');
    });

    it('✗ Non-member cannot DELETE plugin', async () => {
      const { client } = await createUserClient(nonMember.email, nonMember.password);

      const { error } = await client
        .from('daw_plugins')
        .delete()
        .eq('id', testPluginId);

      // Verify plugin still exists
      const adminClient = createAdminClient();
      const { data } = await adminClient
        .from('daw_plugins')
        .select('id')
        .eq('id', testPluginId)
        .single();

      expect(data).not.toBeNull();
    });

    it('✗ Non-member cannot access plugins of a project they are not part of', async () => {
      const { client } = await createUserClient(nonMember.email, nonMember.password);

      // Try to get all plugins for the track
      const { data, error } = await client
        .from('daw_plugins')
        .select('*')
        .eq('track_id', testTrackId);

      // RLS should filter out all plugins - empty array
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  // ==========================================================================
  // Anonymous Tests (No access)
  // ==========================================================================
  describe('Anonymous access restrictions', () => {
    it('✗ Anonymous cannot access plugins', async () => {
      const anonClient = createAnonClient();

      const { data, error } = await anonClient
        .from('daw_plugins')
        .select('*')
        .eq('id', testPluginId)
        .single();

      // RLS should prevent access
      expect(data).toBeNull();
    });

    it('✗ Anonymous cannot INSERT plugins', async () => {
      const anonClient = createAnonClient();

      const { data, error } = await anonClient
        .from('daw_plugins')
        .insert({
          track_id: testTrackId,
          wam_id: 'com.example.anonymous',
          wam_version: '1.0.0',
          name: 'Anonymous Plugin',
          position: 100,
        })
        .select()
        .single();

      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it('✗ Anonymous cannot UPDATE plugins', async () => {
      const anonClient = createAnonClient();

      const { data, error } = await anonClient
        .from('daw_plugins')
        .update({ name: 'Anonymous Hacked' })
        .eq('id', testPluginId)
        .select()
        .single();

      expect(data).toBeNull();
    });

    it('✗ Anonymous cannot DELETE plugins', async () => {
      const anonClient = createAnonClient();

      const { error } = await anonClient
        .from('daw_plugins')
        .delete()
        .eq('id', testPluginId);

      // Verify plugin still exists
      const adminClient = createAdminClient();
      const { data } = await adminClient
        .from('daw_plugins')
        .select('id')
        .eq('id', testPluginId)
        .single();

      expect(data).not.toBeNull();
    });
  });

  // ==========================================================================
  // Admin Tests (Full access to all plugins)
  // ==========================================================================
  describe('Admin access: daw_plugins_admin_all', () => {
    it('✓ Admin can SELECT any plugin', async () => {
      const { client } = await createUserClient(adminUser.email, adminUser.password);

      const { data, error } = await client
        .from('daw_plugins')
        .select('*')
        .eq('id', testPluginId)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(testPluginId);
    });

    it('✓ Admin can INSERT plugin on any track', async () => {
      const { client } = await createUserClient(adminUser.email, adminUser.password);

      const { data, error } = await client
        .from('daw_plugins')
        .insert({
          track_id: testTrackId,
          wam_id: 'com.example.admin-plugin',
          wam_version: '1.0.0',
          name: 'Admin Created Plugin',
          position: 0,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.name).toBe('Admin Created Plugin');

      // Cleanup
      const adminClient = createAdminClient();
      await adminClient.from('daw_plugins').delete().eq('id', data!.id);
    });

    it('✓ Admin can UPDATE any plugin', async () => {
      const { client } = await createUserClient(adminUser.email, adminUser.password);
      const adminNote = `Admin updated at ${Date.now()}`;

      const { data, error } = await client
        .from('daw_plugins')
        .update({ name: adminNote })
        .eq('id', testPluginId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.name).toBe(adminNote);

      // Restore original name
      const adminClient = createAdminClient();
      await adminClient
        .from('daw_plugins')
        .update({ name: 'Test Reverb Plugin' })
        .eq('id', testPluginId);
    });

    it('✓ Admin can DELETE any plugin', async () => {
      // Create a plugin to delete
      const adminClient = createAdminClient();
      const { data: pluginToDelete } = await adminClient
        .from('daw_plugins')
        .insert({
          track_id: testTrackId,
          wam_id: 'com.example.admin-delete',
          wam_version: '1.0.0',
          name: 'Admin Delete Test Plugin',
          position: 97,
        })
        .select()
        .single();

      expect(pluginToDelete).not.toBeNull();

      // Delete as admin user (not service role)
      const { client } = await createUserClient(adminUser.email, adminUser.password);
      const { error: deleteError } = await client
        .from('daw_plugins')
        .delete()
        .eq('id', pluginToDelete!.id);

      expect(deleteError).toBeNull();

      // Verify deletion
      const { data: deleted } = await adminClient
        .from('daw_plugins')
        .select('id')
        .eq('id', pluginToDelete!.id)
        .single();

      expect(deleted).toBeNull();
    });
  });
});
