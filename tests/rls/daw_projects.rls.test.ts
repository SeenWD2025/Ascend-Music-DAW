/**
 * RLS Policy Tests: daw_projects table
 * 
 * Verifies Row Level Security policies for the daw_projects table.
 * 
 * Policies tested:
 * - daw_projects_owner_all: Owner can SELECT, INSERT, UPDATE, DELETE
 * - daw_projects_collaborator_select: Active collaborator can SELECT
 * - daw_projects_collaborator_update: Editor/Admin collaborator can UPDATE
 * - daw_projects_admin_all: Platform admin can access all projects
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAdminClient, createUserClient } from '../setup.js';
import {
  createTestUser,
  createAdminUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/auth.helper.js';

describe('RLS: daw_projects table', () => {
  let ownerUser: TestUser;
  let nonOwnerUser: TestUser;
  let editorCollaborator: TestUser;
  let viewerCollaborator: TestUser;
  let revokedCollaborator: TestUser;
  let adminUser: TestUser;
  let testProjectId: string;

  beforeAll(async () => {
    // Create test users
    ownerUser = await createTestUser({ displayName: 'Project Owner', role: 'client' });
    nonOwnerUser = await createTestUser({ displayName: 'Non Owner', role: 'client' });
    editorCollaborator = await createTestUser({ displayName: 'Editor Collaborator', role: 'client' });
    viewerCollaborator = await createTestUser({ displayName: 'Viewer Collaborator', role: 'client' });
    revokedCollaborator = await createTestUser({ displayName: 'Revoked Collaborator', role: 'client' });
    adminUser = await createAdminUser();

    // Create a test project as admin (bypass RLS) for collaborator tests
    const adminClient = createAdminClient();
    const { data: project, error: projectError } = await adminClient
      .from('daw_projects')
      .insert({
        owner_id: ownerUser.id,
        name: 'Test Project for RLS',
        description: 'A project to test RLS policies',
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

    // Add collaborators
    await adminClient.from('daw_collaborators').insert([
      {
        project_id: testProjectId,
        user_id: editorCollaborator.id,
        role: 'editor',
        invited_by: ownerUser.id,
        status: 'active',
        joined_at: new Date().toISOString(),
      },
      {
        project_id: testProjectId,
        user_id: viewerCollaborator.id,
        role: 'viewer',
        invited_by: ownerUser.id,
        status: 'active',
        joined_at: new Date().toISOString(),
      },
      {
        project_id: testProjectId,
        user_id: revokedCollaborator.id,
        role: 'editor',
        invited_by: ownerUser.id,
        status: 'revoked',
      },
    ]);
  });

  afterAll(async () => {
    // Cleanup using admin client
    const adminClient = createAdminClient();

    // Delete collaborators first
    await adminClient.from('daw_collaborators').delete().eq('project_id', testProjectId);

    // Delete test project
    await adminClient.from('daw_projects').delete().eq('id', testProjectId);

    // Delete test users
    await deleteTestUser(ownerUser.id);
    await deleteTestUser(nonOwnerUser.id);
    await deleteTestUser(editorCollaborator.id);
    await deleteTestUser(viewerCollaborator.id);
    await deleteTestUser(revokedCollaborator.id);
    await deleteTestUser(adminUser.id);
  });

  // ==========================================================================
  // Owner Tests
  // ==========================================================================
  describe('Owner access: daw_projects_owner_all', () => {
    it('should allow owner to SELECT their own project', async () => {
      const { client } = await createUserClient(ownerUser.email, ownerUser.password);

      const { data, error } = await client
        .from('daw_projects')
        .select('*')
        .eq('id', testProjectId)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(testProjectId);
      expect(data?.name).toBe('Test Project for RLS');
    });

    it('should allow owner to INSERT a new project', async () => {
      const { client } = await createUserClient(ownerUser.email, ownerUser.password);

      const { data, error } = await client
        .from('daw_projects')
        .insert({
          owner_id: ownerUser.id,
          name: 'Owner Created Project',
          bpm: 140,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.name).toBe('Owner Created Project');
      expect(data?.owner_id).toBe(ownerUser.id);

      // Cleanup: delete the created project
      const adminClient = createAdminClient();
      await adminClient.from('daw_projects').delete().eq('id', data!.id);
    });

    it('should allow owner to UPDATE their own project', async () => {
      const { client } = await createUserClient(ownerUser.email, ownerUser.password);
      const newName = `Updated Name ${Date.now()}`;

      const { data, error } = await client
        .from('daw_projects')
        .update({ name: newName })
        .eq('id', testProjectId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.name).toBe(newName);

      // Restore original name
      const adminClient = createAdminClient();
      await adminClient
        .from('daw_projects')
        .update({ name: 'Test Project for RLS' })
        .eq('id', testProjectId);
    });

    it('should allow owner to DELETE their own project', async () => {
      const { client } = await createUserClient(ownerUser.email, ownerUser.password);

      // Create a project to delete
      const { data: newProject } = await client
        .from('daw_projects')
        .insert({
          owner_id: ownerUser.id,
          name: 'Project to Delete',
        })
        .select()
        .single();

      expect(newProject).not.toBeNull();

      // Delete the project
      const { error: deleteError } = await client
        .from('daw_projects')
        .delete()
        .eq('id', newProject!.id);

      expect(deleteError).toBeNull();

      // Verify deletion
      const { data: deleted } = await client
        .from('daw_projects')
        .select('*')
        .eq('id', newProject!.id)
        .single();

      expect(deleted).toBeNull();
    });
  });

  // ==========================================================================
  // Non-Owner Tests
  // ==========================================================================
  describe('Non-owner access restrictions', () => {
    it('should NOT allow non-owner to SELECT another user\'s project', async () => {
      const { client } = await createUserClient(nonOwnerUser.email, nonOwnerUser.password);

      const { data, error } = await client
        .from('daw_projects')
        .select('*')
        .eq('id', testProjectId)
        .single();

      // RLS should prevent access - either error or no data
      expect(data).toBeNull();
    });

    it('should NOT allow non-owner to UPDATE another user\'s project', async () => {
      const { client } = await createUserClient(nonOwnerUser.email, nonOwnerUser.password);

      const { data, error } = await client
        .from('daw_projects')
        .update({ name: 'Hacked Project Name' })
        .eq('id', testProjectId)
        .select()
        .single();

      // RLS should prevent update - no rows returned
      expect(data).toBeNull();

      // Verify the project was not modified
      const adminClient = createAdminClient();
      const { data: original } = await adminClient
        .from('daw_projects')
        .select('name')
        .eq('id', testProjectId)
        .single();

      expect(original?.name).toBe('Test Project for RLS');
    });

    it('should NOT allow non-owner to DELETE another user\'s project', async () => {
      const { client } = await createUserClient(nonOwnerUser.email, nonOwnerUser.password);

      const { error } = await client
        .from('daw_projects')
        .delete()
        .eq('id', testProjectId);

      // Verify project still exists
      const adminClient = createAdminClient();
      const { data } = await adminClient
        .from('daw_projects')
        .select('id')
        .eq('id', testProjectId)
        .single();

      expect(data).not.toBeNull();
    });

    it('should NOT allow non-owner to INSERT a project for another user', async () => {
      const { client } = await createUserClient(nonOwnerUser.email, nonOwnerUser.password);

      const { data, error } = await client
        .from('daw_projects')
        .insert({
          owner_id: ownerUser.id, // Trying to create for another user
          name: 'Fake Project',
        })
        .select()
        .single();

      // RLS should prevent this
      expect(error).not.toBeNull();
    });
  });

  // ==========================================================================
  // Editor Collaborator Tests
  // ==========================================================================
  describe('Editor collaborator access: daw_projects_collaborator_*', () => {
    it('should allow active editor collaborator to SELECT the project', async () => {
      const { client } = await createUserClient(editorCollaborator.email, editorCollaborator.password);

      const { data, error } = await client
        .from('daw_projects')
        .select('*')
        .eq('id', testProjectId)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(testProjectId);
    });

    it('should allow active editor collaborator to UPDATE the project', async () => {
      const { client } = await createUserClient(editorCollaborator.email, editorCollaborator.password);
      const newDescription = `Updated by editor at ${Date.now()}`;

      const { data, error } = await client
        .from('daw_projects')
        .update({ description: newDescription })
        .eq('id', testProjectId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.description).toBe(newDescription);
    });

    it('should NOT allow editor collaborator to DELETE the project', async () => {
      const { client } = await createUserClient(editorCollaborator.email, editorCollaborator.password);

      const { error } = await client
        .from('daw_projects')
        .delete()
        .eq('id', testProjectId);

      // Verify project still exists
      const adminClient = createAdminClient();
      const { data } = await adminClient
        .from('daw_projects')
        .select('id')
        .eq('id', testProjectId)
        .single();

      expect(data).not.toBeNull();
    });
  });

  // ==========================================================================
  // Viewer Collaborator Tests
  // ==========================================================================
  describe('Viewer collaborator access: daw_projects_collaborator_select', () => {
    it('should allow active viewer collaborator to SELECT the project', async () => {
      const { client } = await createUserClient(viewerCollaborator.email, viewerCollaborator.password);

      const { data, error } = await client
        .from('daw_projects')
        .select('*')
        .eq('id', testProjectId)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(testProjectId);
    });

    it('should NOT allow viewer collaborator to UPDATE the project', async () => {
      const { client } = await createUserClient(viewerCollaborator.email, viewerCollaborator.password);

      const { data, error } = await client
        .from('daw_projects')
        .update({ name: 'Viewer Hacked Name' })
        .eq('id', testProjectId)
        .select()
        .single();

      // RLS should prevent update - no rows returned
      expect(data).toBeNull();
    });

    it('should NOT allow viewer collaborator to DELETE the project', async () => {
      const { client } = await createUserClient(viewerCollaborator.email, viewerCollaborator.password);

      const { error } = await client
        .from('daw_projects')
        .delete()
        .eq('id', testProjectId);

      // Verify project still exists
      const adminClient = createAdminClient();
      const { data } = await adminClient
        .from('daw_projects')
        .select('id')
        .eq('id', testProjectId)
        .single();

      expect(data).not.toBeNull();
    });
  });

  // ==========================================================================
  // Revoked Collaborator Tests
  // ==========================================================================
  describe('Revoked collaborator access restrictions', () => {
    it('should NOT allow revoked collaborator to SELECT the project', async () => {
      const { client } = await createUserClient(revokedCollaborator.email, revokedCollaborator.password);

      const { data, error } = await client
        .from('daw_projects')
        .select('*')
        .eq('id', testProjectId)
        .single();

      // RLS should block access - no data returned
      expect(data).toBeNull();
    });

    it('should NOT allow revoked collaborator to UPDATE the project', async () => {
      const { client } = await createUserClient(revokedCollaborator.email, revokedCollaborator.password);

      const { data, error } = await client
        .from('daw_projects')
        .update({ name: 'Revoked User Attack' })
        .eq('id', testProjectId)
        .select()
        .single();

      // RLS should prevent update
      expect(data).toBeNull();
    });
  });

  // ==========================================================================
  // Admin Tests
  // ==========================================================================
  describe('Admin access: daw_projects_admin_all', () => {
    it('should allow admin to SELECT any project', async () => {
      const { client } = await createUserClient(adminUser.email, adminUser.password);

      const { data, error } = await client
        .from('daw_projects')
        .select('*')
        .eq('id', testProjectId)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(testProjectId);
    });

    it('should allow admin to UPDATE any project', async () => {
      const { client } = await createUserClient(adminUser.email, adminUser.password);
      const adminNote = `Admin updated at ${Date.now()}`;

      const { data, error } = await client
        .from('daw_projects')
        .update({ description: adminNote })
        .eq('id', testProjectId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.description).toBe(adminNote);
    });

    it('should allow admin to DELETE any project', async () => {
      // Create a project to delete via admin
      const adminClientRaw = createAdminClient();
      const { data: projectToDelete } = await adminClientRaw
        .from('daw_projects')
        .insert({
          owner_id: ownerUser.id,
          name: 'Admin Delete Test Project',
        })
        .select()
        .single();

      expect(projectToDelete).not.toBeNull();

      // Delete as admin user (not service role)
      const { client } = await createUserClient(adminUser.email, adminUser.password);
      const { error: deleteError } = await client
        .from('daw_projects')
        .delete()
        .eq('id', projectToDelete!.id);

      expect(deleteError).toBeNull();

      // Verify deletion
      const { data: deleted } = await adminClientRaw
        .from('daw_projects')
        .select('id')
        .eq('id', projectToDelete!.id)
        .single();

      expect(deleted).toBeNull();
    });

    it('should allow admin to INSERT a project for any user', async () => {
      const { client } = await createUserClient(adminUser.email, adminUser.password);

      const { data, error } = await client
        .from('daw_projects')
        .insert({
          owner_id: nonOwnerUser.id, // Creating for another user as admin
          name: 'Admin Created Project',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.owner_id).toBe(nonOwnerUser.id);

      // Cleanup
      const adminClient = createAdminClient();
      await adminClient.from('daw_projects').delete().eq('id', data!.id);
    });
  });
});
