/**
 * Integration Tests: Clients (Service Seeker) API Routes
 * 
 * Tests client profile endpoints:
 * - POST /api/v1/clients - Create client profile
 * - GET /api/v1/clients/:id - Get client profile
 * - PUT /api/v1/clients/:id - Update client profile
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestUserWithToken,
  createAdminUser,
  getAccessToken,
  deleteTestUser,
  type TestUser,
} from '../helpers/auth.helper.js';
import { apiGet, apiPost, apiPut } from '../helpers/api.helper.js';
import { deleteClientProfile, createClientProfileData } from '../helpers/factories.js';
import { createAdminClient } from '../setup.js';

describe('Integration: Clients API', () => {
  let clientUserA: TestUser & { accessToken: string };
  let clientUserB: TestUser & { accessToken: string };
  let proUser: TestUser & { accessToken: string };
  let adminUser: TestUser & { accessToken: string };

  beforeAll(async () => {
    clientUserA = await createTestUserWithToken({
      displayName: 'Client Test User A',
      role: 'client',
    });
    clientUserB = await createTestUserWithToken({
      displayName: 'Client Test User B',
      role: 'client',
    });
    proUser = await createTestUserWithToken({
      displayName: 'Pro Test User',
      role: 'pro',
    });
    const admin = await createAdminUser();
    const adminToken = await getAccessToken(admin.email, admin.password);
    adminUser = { ...admin, accessToken: adminToken };
  });

  afterAll(async () => {
    await deleteClientProfile(clientUserA.id);
    await deleteClientProfile(clientUserB.id);
    await deleteTestUser(clientUserA.id);
    await deleteTestUser(clientUserB.id);
    await deleteTestUser(proUser.id);
    await deleteTestUser(adminUser.id);
  });

  describe('POST /api/v1/clients', () => {
    it('should create client profile and set role', async () => {
      const profileData = createClientProfileData();

      const response = await apiPost<{
        id: string;
        needs: string[];
        budget_range: string;
        preferences: object;
      }>('/api/v1/clients', {
        needs: profileData.needs,
        budget_range: profileData.budget_range,
        project_types: profileData.project_types,
        preferences: profileData.preferences,
      }, clientUserA.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.id).toBe(clientUserA.id);
      expect(response.data?.needs).toEqual(profileData.needs);
      expect(response.data?.budget_range).toBe(profileData.budget_range);
    });

    it('should update existing client profile on second POST', async () => {
      // First create
      await apiPost('/api/v1/clients', {
        needs: ['Initial Need'],
      }, clientUserB.accessToken);

      // Then update via POST (upsert)
      const response = await apiPost<{
        needs: string[];
        budget_range: string;
      }>('/api/v1/clients', {
        needs: ['Updated Need', 'New Need'],
        budget_range: '$2000-$5000',
      }, clientUserB.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.needs).toContain('Updated Need');
      expect(response.data?.budget_range).toBe('$2000-$5000');
    });

    it('should return 401 without authentication', async () => {
      const response = await apiPost('/api/v1/clients', {
        needs: ['Mixing'],
      });

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 400 for invalid needs format', async () => {
      const response = await apiPost('/api/v1/clients', {
        needs: 'not-an-array', // Should be array
      }, clientUserA.accessToken);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/clients/:id', () => {
    it('should return client profile for owner', async () => {
      const response = await apiGet<{
        id: string;
        needs: string[];
      }>(`/api/v1/clients/${clientUserA.id}`, clientUserA.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.id).toBe(clientUserA.id);
    });

    it('should return 403 when non-owner tries to access client profile', async () => {
      // Client B tries to access Client A's profile
      const response = await apiGet(
        `/api/v1/clients/${clientUserA.id}`,
        clientUserB.accessToken
      );

      expect(response.status).toBe(403);
      expect(response.error?.code).toBe('FORBIDDEN');
    });

    it('should return 403 when pro tries to access client profile', async () => {
      const response = await apiGet(
        `/api/v1/clients/${clientUserA.id}`,
        proUser.accessToken
      );

      expect(response.status).toBe(403);
    });

    it('should allow admin to access any client profile', async () => {
      const response = await apiGet<{
        id: string;
        needs: string[];
      }>(`/api/v1/clients/${clientUserA.id}`, adminUser.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.id).toBe(clientUserA.id);
    });

    it('should return 401 without authentication', async () => {
      const response = await apiGet(`/api/v1/clients/${clientUserA.id}`);

      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent client profile', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await apiGet(`/api/v1/clients/${fakeId}`, adminUser.accessToken);

      expect(response.status).toBe(404);
    });

    it('should return 400 for invalid UUID', async () => {
      const response = await apiGet('/api/v1/clients/invalid-uuid', clientUserA.accessToken);

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /api/v1/clients/:id', () => {
    it('should update own client profile', async () => {
      const updateData = {
        budget_range: `$${Date.now() % 1000}-$${Date.now() % 10000}`,
        preferences: {
          turnaround: '1 week',
          revisions: 5,
          communication_style: 'realtime' as const,
        },
      };

      const response = await apiPut<{
        budget_range: string;
        preferences: { revisions: number };
      }>(`/api/v1/clients/${clientUserA.id}`, updateData, clientUserA.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.budget_range).toBe(updateData.budget_range);
      expect(response.data?.preferences?.revisions).toBe(5);
    });

    it('should update needs array', async () => {
      const updateData = {
        needs: ['Mixing', 'Mastering', 'Production', 'Arrangement'],
      };

      const response = await apiPut<{
        needs: string[];
      }>(`/api/v1/clients/${clientUserA.id}`, updateData, clientUserA.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.needs).toHaveLength(4);
      expect(response.data?.needs).toContain('Arrangement');
    });

    it('should return 403 when updating another user\'s client profile', async () => {
      const updateData = {
        budget_range: 'Hacked!',
      };

      const response = await apiPut(
        `/api/v1/clients/${clientUserA.id}`,
        updateData,
        clientUserB.accessToken
      );

      expect(response.status).toBe(403);
      expect(response.error?.code).toBe('FORBIDDEN');
    });

    it('should return 401 without authentication', async () => {
      const response = await apiPut(`/api/v1/clients/${clientUserA.id}`, {
        budget_range: 'Unauthenticated update',
      });

      expect(response.status).toBe(401);
    });

    it('should return 403 when pro tries to update client profile', async () => {
      const response = await apiPut(
        `/api/v1/clients/${clientUserA.id}`,
        { budget_range: 'Pro hacked!' },
        proUser.accessToken
      );

      expect(response.status).toBe(403);
    });
  });

  describe('Role verification', () => {
    it('should have user role as client after creating client profile', async () => {
      const adminClient = createAdminClient();

      const { data, error } = await adminClient
        .from('profiles')
        .select('role')
        .eq('id', clientUserA.id)
        .single();

      expect(error).toBeNull();
      expect(data?.role).toBe('client');
    });
  });

  describe('Client profile privacy', () => {
    it('should keep client profile data private from other users', async () => {
      // Verify that client profiles are not exposed through the profiles table
      // when accessed by non-owners
      const { testEnv } = await import('../setup.js');
      const { createClient } = await import('@supabase/supabase-js');
      
      // Create client for proUser
      const proClient = createClient(testEnv.supabaseUrl, testEnv.supabaseAnonKey);
      await proClient.auth.signInWithPassword({
        email: proUser.email,
        password: proUser.password,
      });

      // Try to access client's seeker profile directly via RLS
      const { data, error } = await proClient
        .from('service_seeker_profiles')
        .select('*')
        .eq('id', clientUserA.id);

      // Should return empty array (RLS blocks access)
      expect(data).toEqual([]);
    });
  });
});
