/**
 * RLS Policy Tests: daw_exports table
 * 
 * Verifies Row Level Security policies for the daw_exports table.
 * Exports have specific ownership and access rules.
 * 
 * Policies tested:
 * - daw_exports_owner_select: Export owner can SELECT their exports
 * - daw_exports_member_insert: Project members can INSERT exports (owner_id must match auth.uid())
 * - daw_exports_owner_delete: Export owner can DELETE their exports
 * - daw_exports_admin_all: Platform admin can access all exports
 * - UPDATE is restricted to service role only (status transitions)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAdminClient, createUserClient, createAnonClient } from '../setup.js';
import {
  createTestUser,
  createAdminUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/auth.helper.js';

describe('RLS: daw_exports table', () => {
  let projectOwner: TestUser;
  let projectMember: TestUser;
  let nonMember: TestUser;
  let adminUser: TestUser;
  let testProjectId: string;
  let testExportId: string;

  beforeAll(async () => {
    // Create test users
    projectOwner = await createTestUser({ displayName: 'Export Test Owner', role: 'client' });
    projectMember = await createTestUser({ displayName: 'Export Member', role: 'client' });
    nonMember = await createTestUser({ displayName: 'Non Member', role: 'client' });
    adminUser = await createAdminUser();

    // Create a test project as admin (bypass RLS)
    const adminClient = createAdminClient();
    const { data: project, error: projectError } = await adminClient
      .from('daw_projects')
      .insert({
        owner_id: projectOwner.id,
        name: 'Export RLS Test Project',
        description: 'Project for testing export RLS policies',
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

    // Add a collaborator
    await adminClient.from('daw_collaborators').insert({
      project_id: testProjectId,
      user_id: projectMember.id,
      role: 'editor',
      invited_by: projectOwner.id,
      status: 'active',
      joined_at: new Date().toISOString(),
    });

    // Create a test export for read/update/delete tests
    const { data: exportData, error: exportError } = await adminClient
      .from('daw_exports')
      .insert({
        project_id: testProjectId,
        user_id: projectOwner.id,
        owner_id: projectOwner.id,
        format: 'wav',
        quality_settings: { bitrate: 320 },
        status: 'queued',
        idempotency_key: `test-export-${Date.now()}`,
      })
      .select()
      .single();

    if (exportError || !exportData) {
      throw new Error(`Failed to create test export: ${exportError?.message}`);
    }

    testExportId = exportData.id;
  });

  afterAll(async () => {
    // Cleanup using admin client
    const adminClient = createAdminClient();

    // Delete exports
    await adminClient.from('daw_exports').delete().eq('project_id', testProjectId);

    // Delete collaborators
    await adminClient.from('daw_collaborators').delete().eq('project_id', testProjectId);

    // Delete test project
    await adminClient.from('daw_projects').delete().eq('id', testProjectId);

    // Delete test users
    await deleteTestUser(projectOwner.id);
    await deleteTestUser(projectMember.id);
    await deleteTestUser(nonMember.id);
    await deleteTestUser(adminUser.id);
  });

  // ==========================================================================
  // Export Owner Tests
  // ==========================================================================
  describe('Export owner access', () => {
    it('✓ Export owner can SELECT their exports', async () => {
      const { client } = await createUserClient(projectOwner.email, projectOwner.password);

      const { data, error } = await client
        .from('daw_exports')
        .select('*')
        .eq('id', testExportId)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(testExportId);
      expect(data?.format).toBe('wav');
      expect(data?.status).toBe('queued');
    });

    it('✓ Export owner can DELETE their exports', async () => {
      const { client } = await createUserClient(projectOwner.email, projectOwner.password);

      // Create an export to delete
      const adminClient = createAdminClient();
      const { data: exportToDelete } = await adminClient
        .from('daw_exports')
        .insert({
          project_id: testProjectId,
          user_id: projectOwner.id,
          owner_id: projectOwner.id,
          format: 'mp3',
          status: 'queued',
          idempotency_key: `delete-test-${Date.now()}`,
        })
        .select()
        .single();

      expect(exportToDelete).not.toBeNull();

      // Delete as owner
      const { error: deleteError } = await client
        .from('daw_exports')
        .delete()
        .eq('id', exportToDelete!.id);

      expect(deleteError).toBeNull();

      // Verify deletion
      const { data: deleted } = await adminClient
        .from('daw_exports')
        .select('id')
        .eq('id', exportToDelete!.id)
        .single();

      expect(deleted).toBeNull();
    });
  });

  // ==========================================================================
  // Project Member Tests
  // ==========================================================================
  describe('Project member access', () => {
    it('✓ Project member can SELECT exports on shared project', async () => {
      const { client } = await createUserClient(projectMember.email, projectMember.password);

      // Member should be able to see project exports via member_select policy
      const { data, error } = await client
        .from('daw_exports')
        .select('*')
        .eq('project_id', testProjectId);

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.length).toBeGreaterThanOrEqual(1);
    });

    it('✓ Project member can INSERT export (owner_id matches auth.uid())', async () => {
      const { client } = await createUserClient(projectMember.email, projectMember.password);

      const { data, error } = await client
        .from('daw_exports')
        .insert({
          project_id: testProjectId,
          user_id: projectMember.id,
          owner_id: projectMember.id,
          format: 'flac',
          status: 'queued',
          idempotency_key: `member-export-${Date.now()}`,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.format).toBe('flac');
      expect(data?.owner_id).toBe(projectMember.id);

      // Cleanup
      const adminClient = createAdminClient();
      await adminClient.from('daw_exports').delete().eq('id', data!.id);
    });

    it('✗ Project member cannot INSERT export with mismatched owner_id', async () => {
      const { client } = await createUserClient(projectMember.email, projectMember.password);

      // Try to insert export with owner_id set to project owner (not self)
      const { data, error } = await client
        .from('daw_exports')
        .insert({
          project_id: testProjectId,
          user_id: projectOwner.id, // Wrong user
          owner_id: projectOwner.id, // Wrong owner
          format: 'wav',
          status: 'queued',
          idempotency_key: `spoofed-export-${Date.now()}`,
        })
        .select()
        .single();

      // RLS should prevent insert with wrong owner_id
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it('✗ Project member cannot DELETE exports owned by others', async () => {
      const { client } = await createUserClient(projectMember.email, projectMember.password);

      // Try to delete the test export owned by project owner
      const { error } = await client
        .from('daw_exports')
        .delete()
        .eq('id', testExportId);

      // Verify export still exists
      const adminClient = createAdminClient();
      const { data } = await adminClient
        .from('daw_exports')
        .select('id')
        .eq('id', testExportId)
        .single();

      expect(data).not.toBeNull();
    });
  });

  // ==========================================================================
  // Non-Member Tests (No access)
  // ==========================================================================
  describe('Non-member access restrictions', () => {
    it('✗ Non-member cannot SELECT exports', async () => {
      const { client } = await createUserClient(nonMember.email, nonMember.password);

      const { data, error } = await client
        .from('daw_exports')
        .select('*')
        .eq('id', testExportId)
        .single();

      // RLS should prevent access - no data returned
      expect(data).toBeNull();
    });

    it('✗ Non-member cannot INSERT export', async () => {
      const { client } = await createUserClient(nonMember.email, nonMember.password);

      const { data, error } = await client
        .from('daw_exports')
        .insert({
          project_id: testProjectId,
          user_id: nonMember.id,
          owner_id: nonMember.id,
          format: 'mp3',
          status: 'queued',
          idempotency_key: `non-member-export-${Date.now()}`,
        })
        .select()
        .single();

      // RLS should prevent insert (non-member of project)
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it('✗ Non-member cannot DELETE exports', async () => {
      const { client } = await createUserClient(nonMember.email, nonMember.password);

      const { error } = await client
        .from('daw_exports')
        .delete()
        .eq('id', testExportId);

      // Verify export still exists
      const adminClient = createAdminClient();
      const { data } = await adminClient
        .from('daw_exports')
        .select('id')
        .eq('id', testExportId)
        .single();

      expect(data).not.toBeNull();
    });

    it('✗ Non-member cannot access exports list of a project', async () => {
      const { client } = await createUserClient(nonMember.email, nonMember.password);

      const { data, error } = await client
        .from('daw_exports')
        .select('*')
        .eq('project_id', testProjectId);

      // RLS should filter out all exports - empty array
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  // ==========================================================================
  // UPDATE Restrictions (Service Role Only)
  // ==========================================================================
  describe('UPDATE restrictions (service role only)', () => {
    it('✗ Export owner cannot UPDATE export status', async () => {
      const { client } = await createUserClient(projectOwner.email, projectOwner.password);

      const { data, error } = await client
        .from('daw_exports')
        .update({ status: 'processing' })
        .eq('id', testExportId)
        .select()
        .single();

      // No UPDATE policy for authenticated users - should fail or return no rows
      expect(data).toBeNull();

      // Verify status was not changed
      const adminClient = createAdminClient();
      const { data: original } = await adminClient
        .from('daw_exports')
        .select('status')
        .eq('id', testExportId)
        .single();

      expect(original?.status).toBe('queued');
    });

    it('✓ Service role can UPDATE export status', async () => {
      const adminClient = createAdminClient();

      const { data, error } = await adminClient
        .from('daw_exports')
        .update({ status: 'processing', started_at: new Date().toISOString() })
        .eq('id', testExportId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.status).toBe('processing');

      // Restore original status
      await adminClient
        .from('daw_exports')
        .update({ status: 'queued', started_at: null })
        .eq('id', testExportId);
    });
  });

  // ==========================================================================
  // Anonymous Tests (No access)
  // ==========================================================================
  describe('Anonymous access restrictions', () => {
    it('✗ Anonymous cannot access exports', async () => {
      const anonClient = createAnonClient();

      const { data, error } = await anonClient
        .from('daw_exports')
        .select('*')
        .eq('id', testExportId)
        .single();

      // RLS should prevent access
      expect(data).toBeNull();
    });

    it('✗ Anonymous cannot INSERT exports', async () => {
      const anonClient = createAnonClient();

      const { data, error } = await anonClient
        .from('daw_exports')
        .insert({
          project_id: testProjectId,
          format: 'wav',
          status: 'queued',
          idempotency_key: `anon-export-${Date.now()}`,
        })
        .select()
        .single();

      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it('✗ Anonymous cannot DELETE exports', async () => {
      const anonClient = createAnonClient();

      const { error } = await anonClient
        .from('daw_exports')
        .delete()
        .eq('id', testExportId);

      // Verify export still exists
      const adminClient = createAdminClient();
      const { data } = await adminClient
        .from('daw_exports')
        .select('id')
        .eq('id', testExportId)
        .single();

      expect(data).not.toBeNull();
    });
  });

  // ==========================================================================
  // Admin Tests (Full access to all exports)
  // ==========================================================================
  describe('Admin access: daw_exports_admin_all', () => {
    it('✓ Admin can SELECT any export', async () => {
      const { client } = await createUserClient(adminUser.email, adminUser.password);

      const { data, error } = await client
        .from('daw_exports')
        .select('*')
        .eq('id', testExportId)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(testExportId);
    });

    it('✓ Admin can INSERT export on any project', async () => {
      const { client } = await createUserClient(adminUser.email, adminUser.password);

      const { data, error } = await client
        .from('daw_exports')
        .insert({
          project_id: testProjectId,
          user_id: adminUser.id,
          owner_id: adminUser.id,
          format: 'flac',
          status: 'queued',
          idempotency_key: `admin-export-${Date.now()}`,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.format).toBe('flac');

      // Cleanup
      const adminClient = createAdminClient();
      await adminClient.from('daw_exports').delete().eq('id', data!.id);
    });

    it('✓ Admin can UPDATE any export', async () => {
      const { client } = await createUserClient(adminUser.email, adminUser.password);

      const { data, error } = await client
        .from('daw_exports')
        .update({ status: 'complete', completed_at: new Date().toISOString() })
        .eq('id', testExportId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.status).toBe('complete');

      // Restore original status
      const adminClient = createAdminClient();
      await adminClient
        .from('daw_exports')
        .update({ status: 'queued', completed_at: null })
        .eq('id', testExportId);
    });

    it('✓ Admin can DELETE any export', async () => {
      // Create an export to delete
      const adminClient = createAdminClient();
      const { data: exportToDelete } = await adminClient
        .from('daw_exports')
        .insert({
          project_id: testProjectId,
          user_id: projectOwner.id,
          owner_id: projectOwner.id,
          format: 'wav',
          status: 'queued',
          idempotency_key: `admin-delete-${Date.now()}`,
        })
        .select()
        .single();

      expect(exportToDelete).not.toBeNull();

      // Delete as admin user (not service role)
      const { client } = await createUserClient(adminUser.email, adminUser.password);
      const { error: deleteError } = await client
        .from('daw_exports')
        .delete()
        .eq('id', exportToDelete!.id);

      expect(deleteError).toBeNull();

      // Verify deletion
      const { data: deleted } = await adminClient
        .from('daw_exports')
        .select('id')
        .eq('id', exportToDelete!.id)
        .single();

      expect(deleted).toBeNull();
    });
  });
});
