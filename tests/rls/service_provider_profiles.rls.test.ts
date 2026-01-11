/**
 * RLS Policy Tests: service_provider_profiles table
 * 
 * Verifies Row Level Security policies for the service_provider_profiles table.
 * 
 * Policies tested:
 * - service_provider_profiles_select_public: Anyone can read (for directory)
 * - service_provider_profiles_insert_own: Owner only
 * - service_provider_profiles_update_own: Owner only
 * - service_provider_profiles_delete_own: Owner only
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAdminClient, createUserClient, createAnonClient } from '../setup.js';
import {
  createTestUser,
  createAdminUser,
  createProUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/auth.helper.js';
import {
  insertProProfile,
  deleteProProfile,
  setUserRole,
  createProProfileData,
} from '../helpers/factories.js';

describe('RLS: service_provider_profiles table', () => {
  let proUserA: TestUser;
  let proUserB: TestUser;
  let clientUser: TestUser;
  let adminUser: TestUser;

  beforeAll(async () => {
    // Create test users
    proUserA = await createProUser();
    proUserB = await createProUser();
    clientUser = await createTestUser({ displayName: 'Client User', role: 'client' });
    adminUser = await createAdminUser();

    // Insert pro profiles for testing reads
    await insertProProfile(proUserA.id, {
      services: ['Mixing', 'Mastering'],
      rates: { hourly: 100, currency: 'USD' },
    });
    await insertProProfile(proUserB.id, {
      services: ['Production'],
      rates: { per_track: 500, currency: 'USD' },
    });
  });

  afterAll(async () => {
    // Cleanup
    await deleteProProfile(proUserA.id);
    await deleteProProfile(proUserB.id);
    await deleteTestUser(proUserA.id);
    await deleteTestUser(proUserB.id);
    await deleteTestUser(clientUser.id);
    await deleteTestUser(adminUser.id);
  });

  describe('SELECT policy: service_provider_profiles_select_public', () => {
    it('should allow owner to read their own pro profile', async () => {
      const { client } = await createUserClient(proUserA.email, proUserA.password);

      const { data, error } = await client
        .from('service_provider_profiles')
        .select('*')
        .eq('id', proUserA.id)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(proUserA.id);
      expect(data?.services).toContain('Mixing');
    });

    it('should allow public to read any pro profile (for discovery)', async () => {
      const { client } = await createUserClient(clientUser.email, clientUser.password);

      // Client reads Pro A's profile
      const { data, error } = await client
        .from('service_provider_profiles')
        .select('*')
        .eq('id', proUserA.id)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(proUserA.id);
    });

    it('should allow anonymous to read pro profiles', async () => {
      const anonClient = createAnonClient();

      const { data, error } = await anonClient
        .from('service_provider_profiles')
        .select('*')
        .eq('id', proUserA.id)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
    });

    it('should allow admin to view pro profiles', async () => {
      const { client } = await createUserClient(adminUser.email, adminUser.password);

      const { data, error } = await client
        .from('service_provider_profiles')
        .select('*')
        .eq('id', proUserA.id)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.id).toBe(proUserA.id);
    });
  });

  describe('INSERT policy: service_provider_profiles_insert_own', () => {
    let newProUser: TestUser;

    beforeAll(async () => {
      // Create a new user without a pro profile
      newProUser = await createTestUser({ displayName: 'New Pro', role: 'pro' });
    });

    afterAll(async () => {
      await deleteProProfile(newProUser.id);
      await deleteTestUser(newProUser.id);
    });

    it('should allow user to insert their own pro profile', async () => {
      const { client } = await createUserClient(newProUser.email, newProUser.password);
      const profileData = createProProfileData();

      const { data, error } = await client.from('service_provider_profiles').insert({
        id: newProUser.id,
        services: profileData.services,
        rates: profileData.rates,
        portfolio_url: profileData.portfolio_url,
      }).select().single();

      expect(error).toBeNull();
      expect(data?.id).toBe(newProUser.id);
    });

    it('should NOT allow user to insert pro profile for another user', async () => {
      const { client } = await createUserClient(clientUser.email, clientUser.password);

      const { error } = await client.from('service_provider_profiles').insert({
        id: proUserA.id, // Trying to insert for another user
        services: ['Hacking'],
        rates: { hourly: 1 },
      });

      // Should fail due to RLS or conflict
      expect(error).not.toBeNull();
    });
  });

  describe('UPDATE policy: service_provider_profiles_update_own', () => {
    it('should allow owner to update their own pro profile', async () => {
      const { client } = await createUserClient(proUserA.email, proUserA.password);
      const newAvailability = `Updated ${Date.now()}`;

      const { data, error } = await client
        .from('service_provider_profiles')
        .update({ availability: newAvailability })
        .eq('id', proUserA.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.availability).toBe(newAvailability);
    });

    it('should NOT allow non-owner to update another user\'s pro profile', async () => {
      const { client } = await createUserClient(proUserB.email, proUserB.password);

      const { data, error } = await client
        .from('service_provider_profiles')
        .update({ availability: 'Hacked!' })
        .eq('id', proUserA.id)
        .select()
        .single();

      // RLS should prevent this - no rows updated
      expect(data).toBeNull();
    });

    it('should NOT allow client to update pro profile', async () => {
      const { client } = await createUserClient(clientUser.email, clientUser.password);

      const { data, error } = await client
        .from('service_provider_profiles')
        .update({ availability: 'Client hacked!' })
        .eq('id', proUserA.id)
        .select()
        .single();

      expect(data).toBeNull();
    });
  });

  describe('DELETE policy: service_provider_profiles_delete_own', () => {
    it('should NOT allow non-owner to delete another user\'s pro profile', async () => {
      const { client } = await createUserClient(proUserB.email, proUserB.password);

      // Try to delete proUserA's profile as proUserB
      await client
        .from('service_provider_profiles')
        .delete()
        .eq('id', proUserA.id);

      // Verify profile still exists using admin
      const adminClient = createAdminClient();
      const { data } = await adminClient
        .from('service_provider_profiles')
        .select('id')
        .eq('id', proUserA.id)
        .single();

      expect(data).not.toBeNull();
    });
  });
});
