/**
 * RLS Policy Tests: daw_tracks table
 * 
 * Verifies Row Level Security policies for the daw_tracks table.
 * Tracks inherit access from their parent project.
 * 
 * Policies tested:
 * - daw_tracks_member_select: Project members (owner + active collaborators) can SELECT
 * - daw_tracks_editor_insert: Project editors (owner + editor/admin collaborators) can INSERT
 * - daw_tracks_editor_update: Project editors can UPDATE
 * - daw_tracks_editor_delete: Project editors can DELETE
 * - daw_tracks_admin_all: Platform admin can access all tracks
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAdminClient, createUserClient } from '../setup.js';
import {
  createTestUser,
  createAdminUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/auth.helper.js';

describe('RLS: daw_tracks table', () => {
  let projectOwner: TestUser;
  let editorCollaborator: TestUser;
  let viewerCollaborator: TestUser;
  let nonMember: TestUser;
  let adminUser: TestUser;
  let testProjectId: string;
  let testTrackId: string;

  beforeAll(async () => {
    // Create test users
    projectOwner = await createTestUser({ displayName: 'Track Test Owner', role: 'client' });
    editorCollaborator = await createTestUser({ displayName: 'Track Editor', role: 'client' });
    viewerCollaborator = await createTestUser({ displayName: 'Track Viewer', role: 'client' });
    nonMember = await createTestUser({ displayName: 'Non Member', role: 'client' });
    adminUser = await createAdminUser();

    // Create a test project as admin (bypass RLS)
    const adminClient = createAdminClient();
    const { data: project, error: projectError } = await adminClient
      .from('daw_projects')
      .insert({
        owner_id: projectOwner.id,
        name: 'Track RLS Test Project',
        description: 'Project for testing track RLS policies',
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

    // Create a test track for read/update/delete tests
    const { data: track, error: trackError } = await adminClient
      .from('daw_tracks')
      .insert({
        project_id: testProjectId,
        name: 'Test Track',
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

    // Delete tracks first (cascade should handle this, but be explicit)
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
    it('should allow project owner to SELECT tracks', async () => {
      const { client } = await createUserClient(projectOwner.email, projectOwner.password);

      const { data, error } = await client
        .from('daw_tracks')
        .select('*')
        .eq('id', testTrackId)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(testTrackId);
      expect(data?.name).toBe('Test Track');
    });

    it('should allow project owner to INSERT a new track', async () => {
      const { client } = await createUserClient(projectOwner.email, projectOwner.password);

      const { data, error } = await client
        .from('daw_tracks')
        .insert({
          project_id: testProjectId,
          name: 'Owner Created Track',
          type: 'midi',
          position: 1,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.name).toBe('Owner Created Track');
      expect(data?.type).toBe('midi');

      // Cleanup
      const adminClient = createAdminClient();
      await adminClient.from('daw_tracks').delete().eq('id', data!.id);
    });

    it('should allow project owner to UPDATE a track', async () => {
      const { client } = await createUserClient(projectOwner.email, projectOwner.password);
      const newName = `Owner Updated ${Date.now()}`;

      const { data, error } = await client
        .from('daw_tracks')
        .update({ name: newName, volume: 0.8 })
        .eq('id', testTrackId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.name).toBe(newName);
      expect(data?.volume).toBe(0.8);

      // Restore original values
      const adminClient = createAdminClient();
      await adminClient
        .from('daw_tracks')
        .update({ name: 'Test Track', volume: 1.0 })
        .eq('id', testTrackId);
    });

    it('should allow project owner to DELETE a track', async () => {
      const { client } = await createUserClient(projectOwner.email, projectOwner.password);

      // Create a track to delete
      const adminClient = createAdminClient();
      const { data: trackToDelete } = await adminClient
        .from('daw_tracks')
        .insert({
          project_id: testProjectId,
          name: 'Track to Delete',
          type: 'audio',
          position: 99,
        })
        .select()
        .single();

      expect(trackToDelete).not.toBeNull();

      // Delete as owner
      const { error: deleteError } = await client
        .from('daw_tracks')
        .delete()
        .eq('id', trackToDelete!.id);

      expect(deleteError).toBeNull();

      // Verify deletion
      const { data: deleted } = await adminClient
        .from('daw_tracks')
        .select('id')
        .eq('id', trackToDelete!.id)
        .single();

      expect(deleted).toBeNull();
    });
  });

  // ==========================================================================
  // Editor Collaborator Tests (Full CRUD)
  // ==========================================================================
  describe('Editor collaborator access (can_edit_daw_project)', () => {
    it('should allow editor collaborator to SELECT tracks', async () => {
      const { client } = await createUserClient(editorCollaborator.email, editorCollaborator.password);

      const { data, error } = await client
        .from('daw_tracks')
        .select('*')
        .eq('id', testTrackId)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(testTrackId);
    });

    it('should allow editor collaborator to INSERT a new track', async () => {
      const { client } = await createUserClient(editorCollaborator.email, editorCollaborator.password);

      const { data, error } = await client
        .from('daw_tracks')
        .insert({
          project_id: testProjectId,
          name: 'Editor Created Track',
          type: 'bus',
          position: 2,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.name).toBe('Editor Created Track');
      expect(data?.type).toBe('bus');

      // Cleanup
      const adminClient = createAdminClient();
      await adminClient.from('daw_tracks').delete().eq('id', data!.id);
    });

    it('should allow editor collaborator to UPDATE a track', async () => {
      const { client } = await createUserClient(editorCollaborator.email, editorCollaborator.password);
      const newColor = '#00FF00';

      const { data, error } = await client
        .from('daw_tracks')
        .update({ color: newColor, mute: true })
        .eq('id', testTrackId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.color).toBe(newColor);
      expect(data?.mute).toBe(true);

      // Restore original values
      const adminClient = createAdminClient();
      await adminClient
        .from('daw_tracks')
        .update({ color: '#FF5500', mute: false })
        .eq('id', testTrackId);
    });

    it('should allow editor collaborator to DELETE a track', async () => {
      const { client } = await createUserClient(editorCollaborator.email, editorCollaborator.password);

      // Create a track to delete
      const adminClient = createAdminClient();
      const { data: trackToDelete } = await adminClient
        .from('daw_tracks')
        .insert({
          project_id: testProjectId,
          name: 'Editor Delete Track',
          type: 'audio',
          position: 98,
        })
        .select()
        .single();

      expect(trackToDelete).not.toBeNull();

      // Delete as editor
      const { error: deleteError } = await client
        .from('daw_tracks')
        .delete()
        .eq('id', trackToDelete!.id);

      expect(deleteError).toBeNull();

      // Verify deletion
      const { data: deleted } = await adminClient
        .from('daw_tracks')
        .select('id')
        .eq('id', trackToDelete!.id)
        .single();

      expect(deleted).toBeNull();
    });
  });

  // ==========================================================================
  // Viewer Collaborator Tests (SELECT only)
  // ==========================================================================
  describe('Viewer collaborator access (is_daw_project_member, SELECT only)', () => {
    it('should allow viewer collaborator to SELECT tracks', async () => {
      const { client } = await createUserClient(viewerCollaborator.email, viewerCollaborator.password);

      const { data, error } = await client
        .from('daw_tracks')
        .select('*')
        .eq('id', testTrackId)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(testTrackId);
      expect(data?.name).toBe('Test Track');
    });

    it('should NOT allow viewer collaborator to INSERT a track', async () => {
      const { client } = await createUserClient(viewerCollaborator.email, viewerCollaborator.password);

      const { data, error } = await client
        .from('daw_tracks')
        .insert({
          project_id: testProjectId,
          name: 'Viewer Attempted Track',
          type: 'audio',
          position: 50,
        })
        .select()
        .single();

      // RLS should prevent insert
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it('should NOT allow viewer collaborator to UPDATE a track', async () => {
      const { client } = await createUserClient(viewerCollaborator.email, viewerCollaborator.password);

      const { data, error } = await client
        .from('daw_tracks')
        .update({ name: 'Viewer Hacked Track' })
        .eq('id', testTrackId)
        .select()
        .single();

      // RLS should prevent update - no rows returned
      expect(data).toBeNull();

      // Verify track was not modified
      const adminClient = createAdminClient();
      const { data: original } = await adminClient
        .from('daw_tracks')
        .select('name')
        .eq('id', testTrackId)
        .single();

      expect(original?.name).toBe('Test Track');
    });

    it('should NOT allow viewer collaborator to DELETE a track', async () => {
      const { client } = await createUserClient(viewerCollaborator.email, viewerCollaborator.password);

      const { error } = await client
        .from('daw_tracks')
        .delete()
        .eq('id', testTrackId);

      // Verify track still exists
      const adminClient = createAdminClient();
      const { data } = await adminClient
        .from('daw_tracks')
        .select('id')
        .eq('id', testTrackId)
        .single();

      expect(data).not.toBeNull();
    });
  });

  // ==========================================================================
  // Non-Member Tests (No access)
  // ==========================================================================
  describe('Non-member access restrictions', () => {
    it('should NOT allow non-member to SELECT tracks', async () => {
      const { client } = await createUserClient(nonMember.email, nonMember.password);

      const { data, error } = await client
        .from('daw_tracks')
        .select('*')
        .eq('id', testTrackId)
        .single();

      // RLS should prevent access - no data returned
      expect(data).toBeNull();
    });

    it('should NOT allow non-member to INSERT a track', async () => {
      const { client } = await createUserClient(nonMember.email, nonMember.password);

      const { data, error } = await client
        .from('daw_tracks')
        .insert({
          project_id: testProjectId,
          name: 'Non-Member Track',
          type: 'audio',
          position: 100,
        })
        .select()
        .single();

      // RLS should prevent insert
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it('should NOT allow non-member to UPDATE a track', async () => {
      const { client } = await createUserClient(nonMember.email, nonMember.password);

      const { data, error } = await client
        .from('daw_tracks')
        .update({ name: 'Non-Member Hacked Track' })
        .eq('id', testTrackId)
        .select()
        .single();

      // RLS should prevent update
      expect(data).toBeNull();

      // Verify track was not modified
      const adminClient = createAdminClient();
      const { data: original } = await adminClient
        .from('daw_tracks')
        .select('name')
        .eq('id', testTrackId)
        .single();

      expect(original?.name).toBe('Test Track');
    });

    it('should NOT allow non-member to DELETE a track', async () => {
      const { client } = await createUserClient(nonMember.email, nonMember.password);

      const { error } = await client
        .from('daw_tracks')
        .delete()
        .eq('id', testTrackId);

      // Verify track still exists
      const adminClient = createAdminClient();
      const { data } = await adminClient
        .from('daw_tracks')
        .select('id')
        .eq('id', testTrackId)
        .single();

      expect(data).not.toBeNull();
    });

    it('should NOT allow non-member to access tracks of another project', async () => {
      const { client } = await createUserClient(nonMember.email, nonMember.password);

      // Try to get all tracks for the project
      const { data, error } = await client
        .from('daw_tracks')
        .select('*')
        .eq('project_id', testProjectId);

      // RLS should filter out all tracks - empty array
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  // ==========================================================================
  // Admin Tests (Full access to all tracks)
  // ==========================================================================
  describe('Admin access: daw_tracks_admin_all', () => {
    it('should allow admin to SELECT any track', async () => {
      const { client } = await createUserClient(adminUser.email, adminUser.password);

      const { data, error } = await client
        .from('daw_tracks')
        .select('*')
        .eq('id', testTrackId)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(testTrackId);
    });

    it('should allow admin to INSERT a track on any project', async () => {
      const { client } = await createUserClient(adminUser.email, adminUser.password);

      const { data, error } = await client
        .from('daw_tracks')
        .insert({
          project_id: testProjectId,
          name: 'Admin Created Track',
          type: 'master',
          position: 0,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.name).toBe('Admin Created Track');

      // Cleanup
      const adminClient = createAdminClient();
      await adminClient.from('daw_tracks').delete().eq('id', data!.id);
    });

    it('should allow admin to UPDATE any track', async () => {
      const { client } = await createUserClient(adminUser.email, adminUser.password);
      const adminNote = `Admin updated at ${Date.now()}`;

      const { data, error } = await client
        .from('daw_tracks')
        .update({ name: adminNote })
        .eq('id', testTrackId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.name).toBe(adminNote);

      // Restore original name
      const adminClient = createAdminClient();
      await adminClient
        .from('daw_tracks')
        .update({ name: 'Test Track' })
        .eq('id', testTrackId);
    });

    it('should allow admin to DELETE any track', async () => {
      // Create a track to delete
      const adminClient = createAdminClient();
      const { data: trackToDelete } = await adminClient
        .from('daw_tracks')
        .insert({
          project_id: testProjectId,
          name: 'Admin Delete Test Track',
          type: 'audio',
          position: 97,
        })
        .select()
        .single();

      expect(trackToDelete).not.toBeNull();

      // Delete as admin user (not service role)
      const { client } = await createUserClient(adminUser.email, adminUser.password);
      const { error: deleteError } = await client
        .from('daw_tracks')
        .delete()
        .eq('id', trackToDelete!.id);

      expect(deleteError).toBeNull();

      // Verify deletion
      const { data: deleted } = await adminClient
        .from('daw_tracks')
        .select('id')
        .eq('id', trackToDelete!.id)
        .single();

      expect(deleted).toBeNull();
    });
  });
});
