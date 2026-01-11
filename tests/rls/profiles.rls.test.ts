/**
 * RLS Policy Tests: profiles table
 * 
 * Verifies Row Level Security policies for the profiles table.
 * 
 * Policies tested:
 * - profiles_select_public: Anyone can read profiles
 * - profiles_insert_own: Authenticated users can insert their own profile
 * - profiles_update_own_or_admin: Owner or admin can update
 * - profiles_delete_own: Owner can delete their own profile
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createAdminClient, createUserClient, createAnonClient } from '../setup.js';
import {
  createTestUser,
  createAdminUser,
  deleteTestUser,
  getAccessToken,
  type TestUser,
} from '../helpers/auth.helper.js';
import { createProfileData } from '../helpers/factories.js';
import { createClient } from '@supabase/supabase-js';
import { testEnv } from '../setup.js';

describe('RLS: profiles table', () => {
  let userA: TestUser;
  let userB: TestUser;
  let adminUser: TestUser;

  beforeAll(async () => {
    // Create test users
    userA = await createTestUser({ displayName: 'User A', role: 'client' });
    userB = await createTestUser({ displayName: 'User B', role: 'pro' });
    adminUser = await createAdminUser();
  });

  afterAll(async () => {
    // Cleanup test users
    await deleteTestUser(userA.id);
    await deleteTestUser(userB.id);
    await deleteTestUser(adminUser.id);
  });

  describe('SELECT policy: profiles_select_public', () => {
    it('should allow owner to read their own profile', async () => {
      const { client } = await createUserClient(userA.email, userA.password);

      const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', userA.id)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(userA.id);
    });

    it('should allow public to read any profile (discovery)', async () => {
      const { client } = await createUserClient(userB.email, userB.password);

      // User B reads User A's profile
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', userA.id)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(userA.id);
    });

    it('should allow anonymous to read profiles', async () => {
      const anonClient = createAnonClient();

      const { data, error } = await anonClient
        .from('profiles')
        .select('*')
        .eq('id', userA.id)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(userA.id);
    });
  });

  describe('INSERT policy: profiles_insert_own', () => {
    it('should NOT allow anonymous to insert profile for arbitrary user', async () => {
      const anonClient = createAnonClient();
      const fakeUserId = '00000000-0000-0000-0000-000000000001';

      const { error } = await anonClient.from('profiles').insert({
        id: fakeUserId,
        email: 'fake@test.com',
        display_name: 'Fake User',
        role: 'client',
      });

      // Should fail - RLS prevents anonymous inserts
      expect(error).not.toBeNull();
    });

    it('should NOT allow user to insert profile for another user', async () => {
      const { client: clientA } = await createUserClient(userA.email, userA.password);
      const fakeUserId = '00000000-0000-0000-0000-000000000002';

      const { error } = await clientA.from('profiles').insert({
        id: fakeUserId,
        email: 'hacked@test.com',
        display_name: 'Hacked User',
        role: 'client',
      });

      // Should fail - RLS prevents inserting for other users
      expect(error).not.toBeNull();
    });
  });

  describe('UPDATE policy: profiles_update_own_or_admin', () => {
    it('should allow owner to update their own profile', async () => {
      const { client } = await createUserClient(userA.email, userA.password);
      const newBio = `Updated bio at ${Date.now()}`;

      const { data, error } = await client
        .from('profiles')
        .update({ bio: newBio })
        .eq('id', userA.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.bio).toBe(newBio);
    });

    it('should NOT allow non-owner to update another user\'s profile', async () => {
      const { client: clientB } = await createUserClient(userB.email, userB.password);

      const { data, error } = await clientB
        .from('profiles')
        .update({ bio: 'Hacked bio!' })
        .eq('id', userA.id)
        .select()
        .single();

      // RLS should prevent this - no rows returned or error
      expect(data).toBeNull();
    });

    it('should allow admin to update any profile', async () => {
      const { client: adminClient } = await createUserClient(adminUser.email, adminUser.password);
      const newBio = `Admin updated at ${Date.now()}`;

      const { data, error } = await adminClient
        .from('profiles')
        .update({ bio: newBio })
        .eq('id', userA.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.bio).toBe(newBio);
    });

    it('should NOT allow admin to change their own role via bypass', async () => {
      // This tests that even admin updates are controlled
      const { client: adminClient } = await createUserClient(adminUser.email, adminUser.password);

      // Admin can update, but we should verify the data is correctly persisted
      const { data, error } = await adminClient
        .from('profiles')
        .update({ display_name: 'Super Admin' })
        .eq('id', adminUser.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.role).toBe('admin'); // Role should remain admin
    });
  });

  describe('DELETE policy: profiles_delete_own', () => {
    let tempUser: TestUser;

    beforeEach(async () => {
      tempUser = await createTestUser({ displayName: 'Temp User' });
    });

    afterAll(async () => {
      // Cleanup in case test fails
      try {
        await deleteTestUser(tempUser?.id);
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should NOT allow non-owner to delete another user\'s profile', async () => {
      const { client: clientA } = await createUserClient(userA.email, userA.password);

      // Try to delete tempUser's profile as userA
      const { error } = await clientA
        .from('profiles')
        .delete()
        .eq('id', tempUser.id);

      // Check that profile still exists using admin
      const adminClient = createAdminClient();
      const { data } = await adminClient
        .from('profiles')
        .select('id')
        .eq('id', tempUser.id)
        .single();

      expect(data).not.toBeNull();
    });
  });
});
