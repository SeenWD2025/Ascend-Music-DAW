/**
 * RLS Policy Tests: service_seeker_profiles table
 * 
 * Verifies Row Level Security policies for the service_seeker_profiles table.
 * 
 * Policies tested:
 * - service_seeker_profiles_select_own_or_admin: Owner or admin only
 * - service_seeker_profiles_insert_own: Owner only
 * - service_seeker_profiles_update_own: Owner only
 * - service_seeker_profiles_delete_own: Owner only
 * 
 * Note: Client profiles are PRIVATE (unlike pro profiles which are public).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAdminClient, createUserClient, createAnonClient } from '../setup.js';
import {
  createTestUser,
  createAdminUser,
  createClientUser,
  createProUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/auth.helper.js';
import {
  insertClientProfile,
  deleteClientProfile,
  createClientProfileData,
} from '../helpers/factories.js';

describe('RLS: service_seeker_profiles table', () => {
  let clientUserA: TestUser;
  let clientUserB: TestUser;
  let proUser: TestUser;
  let adminUser: TestUser;

  beforeAll(async () => {
    // Create test users
    clientUserA = await createClientUser();
    clientUserB = await createClientUser();
    proUser = await createProUser();
    adminUser = await createAdminUser();

    // Insert client profiles for testing reads
    await insertClientProfile(clientUserA.id, {
      needs: ['Mixing', 'Mastering'],
      budget_range: '$500-$1000',
    });
    await insertClientProfile(clientUserB.id, {
      needs: ['Production'],
      budget_range: '$1000-$2000',
    });
  });

  afterAll(async () => {
    // Cleanup
    await deleteClientProfile(clientUserA.id);
    await deleteClientProfile(clientUserB.id);
    await deleteTestUser(clientUserA.id);
    await deleteTestUser(clientUserB.id);
    await deleteTestUser(proUser.id);
    await deleteTestUser(adminUser.id);
  });

  describe('SELECT policy: service_seeker_profiles_select_own_or_admin', () => {
    it('should allow owner to read their own client profile', async () => {
      const { client } = await createUserClient(clientUserA.email, clientUserA.password);

      const { data, error } = await client
        .from('service_seeker_profiles')
        .select('*')
        .eq('id', clientUserA.id)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(clientUserA.id);
      expect(data?.needs).toContain('Mixing');
    });

    it('should NOT allow non-owner to access other\'s client profile', async () => {
      const { client } = await createUserClient(clientUserB.email, clientUserB.password);

      // Client B tries to read Client A's profile
      const { data, error } = await client
        .from('service_seeker_profiles')
        .select('*')
        .eq('id', clientUserA.id)
        .single();

      // RLS should deny - either error or no data
      expect(data).toBeNull();
    });

    it('should NOT allow pro user to access client profiles', async () => {
      const { client } = await createUserClient(proUser.email, proUser.password);

      // Pro tries to read client's profile
      const { data, error } = await client
        .from('service_seeker_profiles')
        .select('*')
        .eq('id', clientUserA.id)
        .single();

      // RLS should deny access
      expect(data).toBeNull();
    });

    it('should NOT allow anonymous to access client profiles', async () => {
      const anonClient = createAnonClient();

      const { data, error } = await anonClient
        .from('service_seeker_profiles')
        .select('*')
        .eq('id', clientUserA.id)
        .single();

      // RLS should deny anonymous access
      expect(data).toBeNull();
    });

    it('should allow admin to view client profiles', async () => {
      const { client } = await createUserClient(adminUser.email, adminUser.password);

      const { data, error } = await client
        .from('service_seeker_profiles')
        .select('*')
        .eq('id', clientUserA.id)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(clientUserA.id);
    });
  });

  describe('INSERT policy: service_seeker_profiles_insert_own', () => {
    let newClientUser: TestUser;

    beforeAll(async () => {
      // Create a new user without a client profile
      newClientUser = await createTestUser({ displayName: 'New Client', role: 'client' });
    });

    afterAll(async () => {
      await deleteClientProfile(newClientUser.id);
      await deleteTestUser(newClientUser.id);
    });

    it('should allow user to insert their own client profile', async () => {
      const { client } = await createUserClient(newClientUser.email, newClientUser.password);
      const profileData = createClientProfileData();

      const { data, error } = await client.from('service_seeker_profiles').insert({
        id: newClientUser.id,
        needs: profileData.needs,
        budget_range: profileData.budget_range,
        project_types: profileData.project_types,
        preferences: profileData.preferences,
      }).select().single();

      expect(error).toBeNull();
      expect(data?.id).toBe(newClientUser.id);
    });

    it('should NOT allow user to insert client profile for another user', async () => {
      const { client } = await createUserClient(proUser.email, proUser.password);

      const { error } = await client.from('service_seeker_profiles').insert({
        id: clientUserA.id, // Trying to insert for another user
        needs: ['Hacking'],
        budget_range: '$0',
      });

      // Should fail due to RLS or conflict
      expect(error).not.toBeNull();
    });

    it('should NOT allow anonymous to insert client profile', async () => {
      const anonClient = createAnonClient();
      const fakeUserId = '00000000-0000-0000-0000-000000000099';

      const { error } = await anonClient.from('service_seeker_profiles').insert({
        id: fakeUserId,
        needs: ['Anonymous'],
        budget_range: '$0',
      });

      expect(error).not.toBeNull();
    });
  });

  describe('UPDATE policy: service_seeker_profiles_update_own', () => {
    it('should allow owner to update their own client profile', async () => {
      const { client } = await createUserClient(clientUserA.email, clientUserA.password);
      const newBudget = `Updated ${Date.now()}`;

      const { data, error } = await client
        .from('service_seeker_profiles')
        .update({ budget_range: newBudget })
        .eq('id', clientUserA.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.budget_range).toBe(newBudget);
    });

    it('should NOT allow non-owner to update another user\'s client profile', async () => {
      const { client } = await createUserClient(clientUserB.email, clientUserB.password);

      const { data, error } = await client
        .from('service_seeker_profiles')
        .update({ budget_range: 'Hacked!' })
        .eq('id', clientUserA.id)
        .select()
        .single();

      // RLS should prevent this
      expect(data).toBeNull();
    });

    it('should NOT allow pro to update client profile', async () => {
      const { client } = await createUserClient(proUser.email, proUser.password);

      const { data, error } = await client
        .from('service_seeker_profiles')
        .update({ budget_range: 'Pro hacked!' })
        .eq('id', clientUserA.id)
        .select()
        .single();

      expect(data).toBeNull();
    });
  });

  describe('DELETE policy: service_seeker_profiles_delete_own', () => {
    it('should NOT allow non-owner to delete another user\'s client profile', async () => {
      const { client } = await createUserClient(clientUserB.email, clientUserB.password);

      // Try to delete clientUserA's profile
      await client
        .from('service_seeker_profiles')
        .delete()
        .eq('id', clientUserA.id);

      // Verify profile still exists using admin
      const adminClient = createAdminClient();
      const { data } = await adminClient
        .from('service_seeker_profiles')
        .select('id')
        .eq('id', clientUserA.id)
        .single();

      expect(data).not.toBeNull();
    });
  });
});
