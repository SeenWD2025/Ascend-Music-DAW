/**
 * RLS Policy Tests: drive_files table
 * 
 * Verifies Row Level Security policies for the drive_files table.
 * 
 * Privacy Model:
 * - Default privacy is 'private' (owner only)
 * - shared_with[] array grants explicit access
 * - Admin can access all files for abuse review
 * 
 * Policies tested:
 * - drive_files_select_own: Owner can read their own files
 * - drive_files_select_shared: Users in shared_with[] can read
 * - drive_files_select_admin: Admin can read any file
 * - drive_files_insert_own: Owner can insert their own files
 * - drive_files_update_own: Owner can update their own files
 * - drive_files_delete_own: Owner can delete their own files
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createAdminClient, createUserClient, createAnonClient } from '../setup.js';
import {
  createTestUser,
  createAdminUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/auth.helper.js';
import {
  createMockDriveFile,
  deleteMockDriveFile,
  deleteAllMockDriveFiles,
  MockDriveFile,
} from '../helpers/drive.helper.js';

describe('RLS: drive_files table', () => {
  let userA: TestUser;
  let userB: TestUser;
  let adminUser: TestUser;

  beforeAll(async () => {
    // Create test users
    userA = await createTestUser({ displayName: 'File Owner A', role: 'client' });
    userB = await createTestUser({ displayName: 'User B', role: 'pro' });
    adminUser = await createAdminUser();
  });

  afterAll(async () => {
    // Cleanup
    await deleteAllMockDriveFiles(userA.id);
    await deleteAllMockDriveFiles(userB.id);
    await deleteTestUser(userA.id);
    await deleteTestUser(userB.id);
    await deleteTestUser(adminUser.id);
  });

  afterEach(async () => {
    // Clean up files after each test
    await deleteAllMockDriveFiles(userA.id);
    await deleteAllMockDriveFiles(userB.id);
  });

  // ==========================================================================
  // SELECT Policy Tests - Owner Access
  // ==========================================================================

  describe('SELECT policy: drive_files_select_own', () => {
    it('✅ Owner can SELECT their own files', async () => {
      const mockFile = await createMockDriveFile({
        ownerId: userA.id,
        name: 'my-track.wav',
        purpose: 'stem',
        privacy: 'private',
      });

      const { client } = await createUserClient(userA.email, userA.password);

      const { data, error } = await client
        .from('drive_files')
        .select('*')
        .eq('id', mockFile.id)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(mockFile.id);
      expect(data?.name).toBe('my-track.wav');
      expect(data?.owner_id).toBe(userA.id);
    });

    it('✅ Owner can list all their own files', async () => {
      // Create multiple files
      await createMockDriveFile({ ownerId: userA.id, name: 'file1.wav' });
      await createMockDriveFile({ ownerId: userA.id, name: 'file2.wav' });
      await createMockDriveFile({ ownerId: userA.id, name: 'file3.wav' });

      const { client } = await createUserClient(userA.email, userA.password);

      const { data, error } = await client
        .from('drive_files')
        .select('*')
        .eq('owner_id', userA.id);

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.length).toBe(3);
    });

    it('❌ Non-owner cannot SELECT another user\'s private files', async () => {
      const mockFile = await createMockDriveFile({
        ownerId: userA.id,
        name: 'private-file.wav',
        privacy: 'private',
      });

      const { client } = await createUserClient(userB.email, userB.password);

      // User B tries to read User A's private file
      const { data, error } = await client
        .from('drive_files')
        .select('*')
        .eq('id', mockFile.id)
        .single();

      // Should return no data (RLS blocks access)
      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe('PGRST116'); // No rows returned
    });

    it('❌ Anonymous cannot access any files', async () => {
      const mockFile = await createMockDriveFile({
        ownerId: userA.id,
        name: 'anon-test.wav',
      });

      const anonClient = createAnonClient();

      const { data, error } = await anonClient
        .from('drive_files')
        .select('*')
        .eq('id', mockFile.id)
        .single();

      expect(data).toBeNull();
    });
  });

  // ==========================================================================
  // SELECT Policy Tests - Shared Access
  // ==========================================================================

  describe('SELECT policy: drive_files_select_shared', () => {
    it('✅ User in shared_with[] can SELECT file', async () => {
      // Create a file shared with User B
      const mockFile = await createMockDriveFile({
        ownerId: userA.id,
        name: 'shared-file.wav',
        privacy: 'workspace',
        sharedWith: [userB.id],
      });

      const { client } = await createUserClient(userB.email, userB.password);

      const { data, error } = await client
        .from('drive_files')
        .select('*')
        .eq('id', mockFile.id)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(mockFile.id);
      expect(data?.shared_with).toContain(userB.id);
    });

    it('❌ User NOT in shared_with[] cannot SELECT file', async () => {
      // Create a file with empty shared_with
      const mockFile = await createMockDriveFile({
        ownerId: userA.id,
        name: 'not-shared.wav',
        privacy: 'private',
        sharedWith: [], // Not shared with anyone
      });

      const { client } = await createUserClient(userB.email, userB.password);

      const { data, error } = await client
        .from('drive_files')
        .select('*')
        .eq('id', mockFile.id)
        .single();

      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });

    it('✅ Multiple users in shared_with[] can access', async () => {
      // Create a third user for this test
      const userC = await createTestUser({ displayName: 'User C', role: 'client' });

      try {
        const mockFile = await createMockDriveFile({
          ownerId: userA.id,
          name: 'multi-shared.wav',
          privacy: 'workspace',
          sharedWith: [userB.id, userC.id],
        });

        // Both User B and User C can access
        const { client: clientB } = await createUserClient(userB.email, userB.password);
        const { client: clientC } = await createUserClient(userC.email, userC.password);

        const { data: dataB, error: errorB } = await clientB
          .from('drive_files')
          .select('*')
          .eq('id', mockFile.id)
          .single();

        const { data: dataC, error: errorC } = await clientC
          .from('drive_files')
          .select('*')
          .eq('id', mockFile.id)
          .single();

        expect(errorB).toBeNull();
        expect(errorC).toBeNull();
        expect(dataB?.id).toBe(mockFile.id);
        expect(dataC?.id).toBe(mockFile.id);
      } finally {
        await deleteTestUser(userC.id);
      }
    });
  });

  // ==========================================================================
  // SELECT Policy Tests - Admin Access
  // ==========================================================================

  describe('SELECT policy: drive_files_select_admin', () => {
    it('✅ Admin can SELECT any file (abuse review)', async () => {
      const mockFile = await createMockDriveFile({
        ownerId: userA.id,
        name: 'admin-review-file.wav',
        privacy: 'private',
      });

      const { client } = await createUserClient(adminUser.email, adminUser.password);

      const { data, error } = await client
        .from('drive_files')
        .select('*')
        .eq('id', mockFile.id)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(mockFile.id);
    });

    it('✅ Admin can list all files in system', async () => {
      // Create files for multiple users
      await createMockDriveFile({ ownerId: userA.id, name: 'userA-file.wav' });
      await createMockDriveFile({ ownerId: userB.id, name: 'userB-file.wav' });

      const { client } = await createUserClient(adminUser.email, adminUser.password);

      const { data, error } = await client
        .from('drive_files')
        .select('*');

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.length).toBeGreaterThanOrEqual(2);
      
      // Verify files from both users are visible
      const ownerIds = data?.map(f => f.owner_id);
      expect(ownerIds).toContain(userA.id);
      expect(ownerIds).toContain(userB.id);
    });
  });

  // ==========================================================================
  // INSERT Policy Tests
  // ==========================================================================

  describe('INSERT policy: drive_files_insert_own', () => {
    it('✅ Owner can INSERT their own files', async () => {
      const { client } = await createUserClient(userA.email, userA.password);

      const { data, error } = await client
        .from('drive_files')
        .insert({
          owner_id: userA.id,
          drive_file_id: 'test_drive_file_123',
          name: 'user-uploaded.wav',
          mime_type: 'audio/wav',
          purpose: 'stem',
          privacy: 'private',
          upload_status: 'pending',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.owner_id).toBe(userA.id);
      expect(data?.name).toBe('user-uploaded.wav');
      expect(data?.privacy).toBe('private');
    });

    it('❌ User cannot INSERT file with different owner_id', async () => {
      const { client } = await createUserClient(userB.email, userB.password);

      // User B tries to insert a file with User A as owner
      const { error } = await client.from('drive_files').insert({
        owner_id: userA.id, // Trying to insert as someone else
        drive_file_id: 'hacked_file_id',
        name: 'hacked-file.wav',
        mime_type: 'audio/wav',
        purpose: 'other',
        privacy: 'private',
        upload_status: 'pending',
      });

      expect(error).not.toBeNull();
      expect(error?.code).toBe('42501'); // RLS violation
    });

    it('❌ Anonymous cannot INSERT files', async () => {
      const anonClient = createAnonClient();

      const { error } = await anonClient.from('drive_files').insert({
        owner_id: userA.id,
        drive_file_id: 'anon_file_id',
        name: 'anon-file.wav',
        mime_type: 'audio/wav',
        purpose: 'other',
        privacy: 'private',
        upload_status: 'pending',
      });

      expect(error).not.toBeNull();
    });

    it('✅ Privacy model: default is private when not specified', async () => {
      const { client } = await createUserClient(userA.email, userA.password);

      const { data, error } = await client
        .from('drive_files')
        .insert({
          owner_id: userA.id,
          drive_file_id: 'default_privacy_test',
          name: 'default-privacy.wav',
          mime_type: 'audio/wav',
          // privacy not specified - should default to 'private'
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.privacy).toBe('private'); // Verify default
    });
  });

  // ==========================================================================
  // UPDATE Policy Tests
  // ==========================================================================

  describe('UPDATE policy: drive_files_update_own', () => {
    it('✅ Owner can UPDATE their own files', async () => {
      const mockFile = await createMockDriveFile({
        ownerId: userA.id,
        name: 'original-name.wav',
        description: 'Original description',
      });

      const { client } = await createUserClient(userA.email, userA.password);

      const { error } = await client
        .from('drive_files')
        .update({
          name: 'updated-name.wav',
          description: 'Updated description',
        })
        .eq('id', mockFile.id);

      expect(error).toBeNull();

      // Verify update
      const { data: updated } = await client
        .from('drive_files')
        .select('*')
        .eq('id', mockFile.id)
        .single();

      expect(updated?.name).toBe('updated-name.wav');
      expect(updated?.description).toBe('Updated description');
    });

    it('✅ Owner can UPDATE purpose field', async () => {
      const mockFile = await createMockDriveFile({
        ownerId: userA.id,
        purpose: 'stem',
      });

      const { client } = await createUserClient(userA.email, userA.password);

      const { error } = await client
        .from('drive_files')
        .update({ purpose: 'master' })
        .eq('id', mockFile.id);

      expect(error).toBeNull();

      const { data: updated } = await client
        .from('drive_files')
        .select('purpose')
        .eq('id', mockFile.id)
        .single();

      expect(updated?.purpose).toBe('master');
    });

    it('❌ Non-owner cannot UPDATE another user\'s files', async () => {
      const mockFile = await createMockDriveFile({
        ownerId: userA.id,
        name: 'cannot-modify.wav',
      });

      const { client } = await createUserClient(userB.email, userB.password);

      // User B tries to update User A's file
      const { error, count } = await client
        .from('drive_files')
        .update({ name: 'hacked-name.wav' })
        .eq('id', mockFile.id);

      // RLS silently blocks (0 rows affected)
      expect(error).toBeNull();

      // Verify file was NOT updated
      const adminClient = createAdminClient();
      const { data: checkData } = await adminClient
        .from('drive_files')
        .select('name')
        .eq('id', mockFile.id)
        .single();

      expect(checkData?.name).toBe('cannot-modify.wav');
    });

    it('❌ User in shared_with cannot UPDATE file', async () => {
      const mockFile = await createMockDriveFile({
        ownerId: userA.id,
        name: 'shared-no-edit.wav',
        sharedWith: [userB.id],
      });

      const { client } = await createUserClient(userB.email, userB.password);

      // User B has read access but should NOT have update access
      const { error } = await client
        .from('drive_files')
        .update({ name: 'shared-user-edit.wav' })
        .eq('id', mockFile.id);

      // Verify file was NOT updated
      const adminClient = createAdminClient();
      const { data: checkData } = await adminClient
        .from('drive_files')
        .select('name')
        .eq('id', mockFile.id)
        .single();

      expect(checkData?.name).toBe('shared-no-edit.wav');
    });

    it('❌ Anonymous cannot UPDATE any files', async () => {
      const mockFile = await createMockDriveFile({
        ownerId: userA.id,
        name: 'anon-no-update.wav',
      });

      const anonClient = createAnonClient();

      await anonClient
        .from('drive_files')
        .update({ name: 'anon-updated.wav' })
        .eq('id', mockFile.id);

      // Verify file was NOT updated
      const adminClient = createAdminClient();
      const { data: checkData } = await adminClient
        .from('drive_files')
        .select('name')
        .eq('id', mockFile.id)
        .single();

      expect(checkData?.name).toBe('anon-no-update.wav');
    });
  });

  // ==========================================================================
  // DELETE Policy Tests
  // ==========================================================================

  describe('DELETE policy: drive_files_delete_own', () => {
    it('✅ Owner can DELETE their own files', async () => {
      const mockFile = await createMockDriveFile({
        ownerId: userA.id,
        name: 'delete-me.wav',
      });

      const { client } = await createUserClient(userA.email, userA.password);

      const { error } = await client
        .from('drive_files')
        .delete()
        .eq('id', mockFile.id);

      expect(error).toBeNull();

      // Verify deletion
      const adminClient = createAdminClient();
      const { data: checkData } = await adminClient
        .from('drive_files')
        .select('*')
        .eq('id', mockFile.id)
        .single();

      expect(checkData).toBeNull();
    });

    it('❌ Non-owner cannot DELETE another user\'s files', async () => {
      const mockFile = await createMockDriveFile({
        ownerId: userA.id,
        name: 'no-delete.wav',
      });

      const { client } = await createUserClient(userB.email, userB.password);

      // User B tries to delete User A's file
      const { error } = await client
        .from('drive_files')
        .delete()
        .eq('id', mockFile.id);

      // RLS silently blocks
      expect(error).toBeNull();

      // Verify file still exists
      const adminClient = createAdminClient();
      const { data: checkData } = await adminClient
        .from('drive_files')
        .select('*')
        .eq('id', mockFile.id)
        .single();

      expect(checkData).not.toBeNull();
    });

    it('❌ User in shared_with cannot DELETE file', async () => {
      const mockFile = await createMockDriveFile({
        ownerId: userA.id,
        name: 'shared-no-delete.wav',
        sharedWith: [userB.id],
      });

      const { client } = await createUserClient(userB.email, userB.password);

      await client
        .from('drive_files')
        .delete()
        .eq('id', mockFile.id);

      // Verify file still exists
      const adminClient = createAdminClient();
      const { data: checkData } = await adminClient
        .from('drive_files')
        .select('*')
        .eq('id', mockFile.id)
        .single();

      expect(checkData).not.toBeNull();
    });

    it('❌ Anonymous cannot DELETE any files', async () => {
      const mockFile = await createMockDriveFile({
        ownerId: userA.id,
        name: 'anon-no-delete.wav',
      });

      const anonClient = createAnonClient();

      await anonClient
        .from('drive_files')
        .delete()
        .eq('id', mockFile.id);

      // Verify file still exists
      const adminClient = createAdminClient();
      const { data: checkData } = await adminClient
        .from('drive_files')
        .select('*')
        .eq('id', mockFile.id)
        .single();

      expect(checkData).not.toBeNull();
    });
  });

  // ==========================================================================
  // Privacy Model Verification
  // ==========================================================================

  describe('Privacy model verification', () => {
    it('✅ Files default to private privacy', async () => {
      const adminClient = createAdminClient();

      const { data, error } = await adminClient
        .from('drive_files')
        .insert({
          owner_id: userA.id,
          drive_file_id: 'privacy_default_test',
          name: 'privacy-default.wav',
          mime_type: 'audio/wav',
          // No privacy specified
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.privacy).toBe('private');
    });

    it('✅ shared_with starts empty by default', async () => {
      const adminClient = createAdminClient();

      const { data, error } = await adminClient
        .from('drive_files')
        .insert({
          owner_id: userA.id,
          drive_file_id: 'shared_with_default_test',
          name: 'shared-default.wav',
          mime_type: 'audio/wav',
          // No shared_with specified
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.shared_with).toEqual([]);
    });

    it('✅ Privacy can be set to workspace, chat, or public', async () => {
      const adminClient = createAdminClient();

      const privacyLevels = ['private', 'workspace', 'chat', 'public'] as const;

      for (const privacy of privacyLevels) {
        const { data, error } = await adminClient
          .from('drive_files')
          .insert({
            owner_id: userA.id,
            drive_file_id: `privacy_${privacy}_test`,
            name: `privacy-${privacy}.wav`,
            mime_type: 'audio/wav',
            privacy,
          })
          .select()
          .single();

        expect(error).toBeNull();
        expect(data?.privacy).toBe(privacy);
      }
    });

    it('❌ Invalid privacy value is rejected', async () => {
      const adminClient = createAdminClient();

      const { error } = await adminClient.from('drive_files').insert({
        owner_id: userA.id,
        drive_file_id: 'invalid_privacy_test',
        name: 'invalid-privacy.wav',
        mime_type: 'audio/wav',
        privacy: 'invalid', // Not a valid privacy level
      });

      expect(error).not.toBeNull();
      // Check constraint violation
      expect(error?.code).toBe('23514'); // CHECK constraint violation
    });
  });
});
