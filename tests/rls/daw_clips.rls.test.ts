/**
 * RLS Policy Tests: daw_clips table
 * 
 * Verifies Row Level Security policies for the daw_clips table.
 * Clips inherit access from their parent track/project.
 * 
 * Policies tested:
 * - daw_clips_member_select: Project members (owner + active collaborators) can SELECT
 * - daw_clips_editor_insert: Project editors (owner + editor/admin collaborators) can INSERT
 * - daw_clips_editor_update: Project editors can UPDATE
 * - daw_clips_editor_delete: Project editors can DELETE
 * - daw_clips_admin_all: Platform admin can access all clips
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAdminClient, createUserClient } from '../setup.js';
import {
  createTestUser,
  createAdminUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/auth.helper.js';

describe('RLS: daw_clips table', () => {
  let projectOwner: TestUser;
  let editorCollaborator: TestUser;
  let viewerCollaborator: TestUser;
  let nonMember: TestUser;
  let adminUser: TestUser;
  let testProjectId: string;
  let testTrackId: string;
  let testClipId: string;

  beforeAll(async () => {
    // Create test users
    projectOwner = await createTestUser({ displayName: 'Clip Test Owner', role: 'client' });
    editorCollaborator = await createTestUser({ displayName: 'Clip Editor', role: 'client' });
    viewerCollaborator = await createTestUser({ displayName: 'Clip Viewer', role: 'client' });
    nonMember = await createTestUser({ displayName: 'Non Member', role: 'client' });
    adminUser = await createAdminUser();

    // Create a test project as admin (bypass RLS)
    const adminClient = createAdminClient();
    const { data: project, error: projectError } = await adminClient
      .from('daw_projects')
      .insert({
        owner_id: projectOwner.id,
        name: 'Clip RLS Test Project',
        description: 'Project for testing clip RLS policies',
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

    // Create a test track for clip tests
    const { data: track, error: trackError } = await adminClient
      .from('daw_tracks')
      .insert({
        project_id: testProjectId,
        name: 'Test Track for Clips',
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

    // Create a test clip for read/update/delete tests
    const { data: clip, error: clipError } = await adminClient
      .from('daw_clips')
      .insert({
        track_id: testTrackId,
        name: 'Test Clip',
        clip_type: 'audio',
        start_time: 0.0,
        duration: 5.0,
        source_offset_seconds: 0.0,
        volume: 1.0,
        pan: 0.0,
        mute: false,
      })
      .select()
      .single();

    if (clipError || !clip) {
      throw new Error(`Failed to create test clip: ${clipError?.message}`);
    }

    testClipId = clip.id;

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

    // Delete clips first
    await adminClient.from('daw_clips').delete().eq('track_id', testTrackId);

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
    it('should allow project owner to SELECT clips', async () => {
      const { client } = await createUserClient(projectOwner.email, projectOwner.password);

      const { data, error } = await client
        .from('daw_clips')
        .select('*')
        .eq('id', testClipId)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(testClipId);
      expect(data?.name).toBe('Test Clip');
    });

    it('should allow project owner to INSERT a new clip', async () => {
      const { client } = await createUserClient(projectOwner.email, projectOwner.password);

      const { data, error } = await client
        .from('daw_clips')
        .insert({
          track_id: testTrackId,
          name: 'Owner Created Clip',
          clip_type: 'midi',
          start_time: 10.0,
          duration: 4.0,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.name).toBe('Owner Created Clip');
      expect(data?.clip_type).toBe('midi');

      // Cleanup
      const adminClient = createAdminClient();
      await adminClient.from('daw_clips').delete().eq('id', data!.id);
    });

    it('should allow project owner to UPDATE a clip', async () => {
      const { client } = await createUserClient(projectOwner.email, projectOwner.password);
      const newName = `Owner Updated ${Date.now()}`;

      const { data, error } = await client
        .from('daw_clips')
        .update({ name: newName, volume: 0.8 })
        .eq('id', testClipId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.name).toBe(newName);
      expect(data?.volume).toBe(0.8);

      // Restore original values
      const adminClient = createAdminClient();
      await adminClient
        .from('daw_clips')
        .update({ name: 'Test Clip', volume: 1.0 })
        .eq('id', testClipId);
    });

    it('should allow project owner to DELETE a clip', async () => {
      const { client } = await createUserClient(projectOwner.email, projectOwner.password);

      // Create a clip to delete
      const adminClient = createAdminClient();
      const { data: clipToDelete } = await adminClient
        .from('daw_clips')
        .insert({
          track_id: testTrackId,
          name: 'Clip to Delete',
          clip_type: 'audio',
          start_time: 99.0,
          duration: 2.0,
        })
        .select()
        .single();

      expect(clipToDelete).not.toBeNull();

      // Delete as owner
      const { error: deleteError } = await client
        .from('daw_clips')
        .delete()
        .eq('id', clipToDelete!.id);

      expect(deleteError).toBeNull();

      // Verify deletion
      const { data: deleted } = await adminClient
        .from('daw_clips')
        .select('id')
        .eq('id', clipToDelete!.id)
        .single();

      expect(deleted).toBeNull();
    });
  });

  // ==========================================================================
  // Editor Collaborator Tests (Full CRUD)
  // ==========================================================================
  describe('Editor collaborator access (can_edit_daw_project)', () => {
    it('should allow editor collaborator to SELECT clips', async () => {
      const { client } = await createUserClient(editorCollaborator.email, editorCollaborator.password);

      const { data, error } = await client
        .from('daw_clips')
        .select('*')
        .eq('id', testClipId)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(testClipId);
    });

    it('should allow editor collaborator to INSERT a new clip', async () => {
      const { client } = await createUserClient(editorCollaborator.email, editorCollaborator.password);

      const { data, error } = await client
        .from('daw_clips')
        .insert({
          track_id: testTrackId,
          name: 'Editor Created Clip',
          clip_type: 'audio',
          start_time: 20.0,
          duration: 3.0,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.name).toBe('Editor Created Clip');
      expect(data?.clip_type).toBe('audio');

      // Cleanup
      const adminClient = createAdminClient();
      await adminClient.from('daw_clips').delete().eq('id', data!.id);
    });

    it('should allow editor collaborator to UPDATE a clip', async () => {
      const { client } = await createUserClient(editorCollaborator.email, editorCollaborator.password);
      const newPan = 0.5;

      const { data, error } = await client
        .from('daw_clips')
        .update({ pan: newPan, mute: true })
        .eq('id', testClipId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.pan).toBe(newPan);
      expect(data?.mute).toBe(true);

      // Restore original values
      const adminClient = createAdminClient();
      await adminClient
        .from('daw_clips')
        .update({ pan: 0.0, mute: false })
        .eq('id', testClipId);
    });

    it('should allow editor collaborator to DELETE a clip', async () => {
      const { client } = await createUserClient(editorCollaborator.email, editorCollaborator.password);

      // Create a clip to delete
      const adminClient = createAdminClient();
      const { data: clipToDelete } = await adminClient
        .from('daw_clips')
        .insert({
          track_id: testTrackId,
          name: 'Editor Delete Clip',
          clip_type: 'audio',
          start_time: 98.0,
          duration: 1.5,
        })
        .select()
        .single();

      expect(clipToDelete).not.toBeNull();

      // Delete as editor
      const { error: deleteError } = await client
        .from('daw_clips')
        .delete()
        .eq('id', clipToDelete!.id);

      expect(deleteError).toBeNull();

      // Verify deletion
      const { data: deleted } = await adminClient
        .from('daw_clips')
        .select('id')
        .eq('id', clipToDelete!.id)
        .single();

      expect(deleted).toBeNull();
    });
  });

  // ==========================================================================
  // Viewer Collaborator Tests (SELECT only)
  // ==========================================================================
  describe('Viewer collaborator access (is_daw_project_member, SELECT only)', () => {
    it('should allow viewer collaborator to SELECT clips', async () => {
      const { client } = await createUserClient(viewerCollaborator.email, viewerCollaborator.password);

      const { data, error } = await client
        .from('daw_clips')
        .select('*')
        .eq('id', testClipId)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(testClipId);
      expect(data?.name).toBe('Test Clip');
    });

    it('should NOT allow viewer collaborator to INSERT a clip', async () => {
      const { client } = await createUserClient(viewerCollaborator.email, viewerCollaborator.password);

      const { data, error } = await client
        .from('daw_clips')
        .insert({
          track_id: testTrackId,
          name: 'Viewer Attempted Clip',
          clip_type: 'audio',
          start_time: 50.0,
          duration: 2.0,
        })
        .select()
        .single();

      // RLS should prevent insert
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it('should NOT allow viewer collaborator to UPDATE a clip', async () => {
      const { client } = await createUserClient(viewerCollaborator.email, viewerCollaborator.password);

      const { data, error } = await client
        .from('daw_clips')
        .update({ name: 'Viewer Hacked Clip' })
        .eq('id', testClipId)
        .select()
        .single();

      // RLS should prevent update - no rows returned
      expect(data).toBeNull();

      // Verify clip was not modified
      const adminClient = createAdminClient();
      const { data: original } = await adminClient
        .from('daw_clips')
        .select('name')
        .eq('id', testClipId)
        .single();

      expect(original?.name).toBe('Test Clip');
    });

    it('should NOT allow viewer collaborator to DELETE a clip', async () => {
      const { client } = await createUserClient(viewerCollaborator.email, viewerCollaborator.password);

      const { error } = await client
        .from('daw_clips')
        .delete()
        .eq('id', testClipId);

      // Verify clip still exists
      const adminClient = createAdminClient();
      const { data } = await adminClient
        .from('daw_clips')
        .select('id')
        .eq('id', testClipId)
        .single();

      expect(data).not.toBeNull();
    });
  });

  // ==========================================================================
  // Non-Member Tests (No access)
  // ==========================================================================
  describe('Non-member access restrictions', () => {
    it('should NOT allow non-member to SELECT clips', async () => {
      const { client } = await createUserClient(nonMember.email, nonMember.password);

      const { data, error } = await client
        .from('daw_clips')
        .select('*')
        .eq('id', testClipId)
        .single();

      // RLS should prevent access - no data returned
      expect(data).toBeNull();
    });

    it('should NOT allow non-member to INSERT a clip', async () => {
      const { client } = await createUserClient(nonMember.email, nonMember.password);

      const { data, error } = await client
        .from('daw_clips')
        .insert({
          track_id: testTrackId,
          name: 'Non-Member Clip',
          clip_type: 'audio',
          start_time: 100.0,
          duration: 1.0,
        })
        .select()
        .single();

      // RLS should prevent insert
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it('should NOT allow non-member to UPDATE a clip', async () => {
      const { client } = await createUserClient(nonMember.email, nonMember.password);

      const { data, error } = await client
        .from('daw_clips')
        .update({ name: 'Non-Member Hacked Clip' })
        .eq('id', testClipId)
        .select()
        .single();

      // RLS should prevent update
      expect(data).toBeNull();

      // Verify clip was not modified
      const adminClient = createAdminClient();
      const { data: original } = await adminClient
        .from('daw_clips')
        .select('name')
        .eq('id', testClipId)
        .single();

      expect(original?.name).toBe('Test Clip');
    });

    it('should NOT allow non-member to DELETE a clip', async () => {
      const { client } = await createUserClient(nonMember.email, nonMember.password);

      const { error } = await client
        .from('daw_clips')
        .delete()
        .eq('id', testClipId);

      // Verify clip still exists
      const adminClient = createAdminClient();
      const { data } = await adminClient
        .from('daw_clips')
        .select('id')
        .eq('id', testClipId)
        .single();

      expect(data).not.toBeNull();
    });

    it('should NOT allow non-member to access clips of another project', async () => {
      const { client } = await createUserClient(nonMember.email, nonMember.password);

      // Try to get all clips for the track
      const { data, error } = await client
        .from('daw_clips')
        .select('*')
        .eq('track_id', testTrackId);

      // RLS should filter out all clips - empty array
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  // ==========================================================================
  // Admin Tests (Full access to all clips)
  // ==========================================================================
  describe('Admin access: daw_clips_admin_all', () => {
    it('should allow admin to SELECT any clip', async () => {
      const { client } = await createUserClient(adminUser.email, adminUser.password);

      const { data, error } = await client
        .from('daw_clips')
        .select('*')
        .eq('id', testClipId)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(testClipId);
    });

    it('should allow admin to INSERT a clip on any track', async () => {
      const { client } = await createUserClient(adminUser.email, adminUser.password);

      const { data, error } = await client
        .from('daw_clips')
        .insert({
          track_id: testTrackId,
          name: 'Admin Created Clip',
          clip_type: 'audio',
          start_time: 0.0,
          duration: 10.0,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.name).toBe('Admin Created Clip');

      // Cleanup
      const adminClient = createAdminClient();
      await adminClient.from('daw_clips').delete().eq('id', data!.id);
    });

    it('should allow admin to UPDATE any clip', async () => {
      const { client } = await createUserClient(adminUser.email, adminUser.password);
      const adminNote = `Admin updated at ${Date.now()}`;

      const { data, error } = await client
        .from('daw_clips')
        .update({ name: adminNote })
        .eq('id', testClipId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.name).toBe(adminNote);

      // Restore original name
      const adminClient = createAdminClient();
      await adminClient
        .from('daw_clips')
        .update({ name: 'Test Clip' })
        .eq('id', testClipId);
    });

    it('should allow admin to DELETE any clip', async () => {
      // Create a clip to delete
      const adminClient = createAdminClient();
      const { data: clipToDelete } = await adminClient
        .from('daw_clips')
        .insert({
          track_id: testTrackId,
          name: 'Admin Delete Test Clip',
          clip_type: 'audio',
          start_time: 97.0,
          duration: 2.5,
        })
        .select()
        .single();

      expect(clipToDelete).not.toBeNull();

      // Delete as admin user (not service role)
      const { client } = await createUserClient(adminUser.email, adminUser.password);
      const { error: deleteError } = await client
        .from('daw_clips')
        .delete()
        .eq('id', clipToDelete!.id);

      expect(deleteError).toBeNull();

      // Verify deletion
      const { data: deleted } = await adminClient
        .from('daw_clips')
        .select('id')
        .eq('id', clipToDelete!.id)
        .single();

      expect(deleted).toBeNull();
    });
  });
});
