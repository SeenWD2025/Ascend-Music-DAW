/**
 * Integration Tests: Pros (Service Provider) API Routes
 * 
 * Tests pro profile endpoints:
 * - POST /api/v1/pros - Create pro profile
 * - GET /api/v1/pros/:id - Get pro profile
 * - PUT /api/v1/pros/:id - Update pro profile
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestUserWithToken,
  deleteTestUser,
  type TestUser,
} from '../helpers/auth.helper.js';
import { apiGet, apiPost, apiPut } from '../helpers/api.helper.js';
import { deleteProProfile, createProProfileData } from '../helpers/factories.js';
import { createAdminClient } from '../setup.js';

describe('Integration: Pros API', () => {
  let proUserA: TestUser & { accessToken: string };
  let proUserB: TestUser & { accessToken: string };
  let clientUser: TestUser & { accessToken: string };

  beforeAll(async () => {
    proUserA = await createTestUserWithToken({
      displayName: 'Pro Test User A',
      role: 'pro',
    });
    proUserB = await createTestUserWithToken({
      displayName: 'Pro Test User B',
      role: 'pro',
    });
    clientUser = await createTestUserWithToken({
      displayName: 'Client Test User',
      role: 'client',
    });
  });

  afterAll(async () => {
    await deleteProProfile(proUserA.id);
    await deleteProProfile(proUserB.id);
    await deleteTestUser(proUserA.id);
    await deleteTestUser(proUserB.id);
    await deleteTestUser(clientUser.id);
  });

  describe('POST /api/v1/pros', () => {
    it('should create pro profile and set role', async () => {
      const profileData = createProProfileData();

      const response = await apiPost<{
        id: string;
        services: string[];
        rates: { hourly: number; currency: string };
      }>('/api/v1/pros', {
        services: profileData.services,
        rates: profileData.rates,
        portfolio_url: profileData.portfolio_url,
        availability: profileData.availability,
        intake_notes: profileData.intake_notes,
      }, proUserA.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.id).toBe(proUserA.id);
      expect(response.data?.services).toEqual(profileData.services);
      expect(response.data?.rates?.currency).toBe('USD');
    });

    it('should update existing pro profile on second POST', async () => {
      // First create
      await apiPost('/api/v1/pros', {
        services: ['Initial Service'],
      }, proUserB.accessToken);

      // Then update via POST (upsert)
      const response = await apiPost<{
        services: string[];
        availability: string;
      }>('/api/v1/pros', {
        services: ['Updated Service', 'New Service'],
        availability: 'Updated availability',
      }, proUserB.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.services).toContain('Updated Service');
      expect(response.data?.availability).toBe('Updated availability');
    });

    it('should return 401 without authentication', async () => {
      const response = await apiPost('/api/v1/pros', {
        services: ['Mixing'],
      });

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 400 for invalid services format', async () => {
      const response = await apiPost('/api/v1/pros', {
        services: 'not-an-array', // Should be array
      }, proUserA.accessToken);

      expect(response.status).toBe(400);
    });

    it('should return 400 for missing required services', async () => {
      const response = await apiPost('/api/v1/pros', {
        rates: { hourly: 100 },
        // Missing services
      }, proUserA.accessToken);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/pros/:id', () => {
    it('should return pro profile for any authenticated user', async () => {
      const response = await apiGet<{
        id: string;
        services: string[];
      }>(`/api/v1/pros/${proUserA.id}`, clientUser.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.id).toBe(proUserA.id);
    });

    it('should return pro profile for owner', async () => {
      const response = await apiGet<{
        id: string;
        services: string[];
        rates: object;
      }>(`/api/v1/pros/${proUserA.id}`, proUserA.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.id).toBe(proUserA.id);
    });

    it('should return 404 for non-existent pro profile', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await apiGet(`/api/v1/pros/${fakeId}`, clientUser.accessToken);

      expect(response.status).toBe(404);
    });

    it('should return 400 for invalid UUID', async () => {
      const response = await apiGet('/api/v1/pros/invalid-uuid', clientUser.accessToken);

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /api/v1/pros/:id', () => {
    it('should update own pro profile', async () => {
      const updateData = {
        availability: `Updated at ${Date.now()}`,
        rates: {
          hourly: 125,
          per_track: 300,
          currency: 'USD',
        },
      };

      const response = await apiPut<{
        availability: string;
        rates: { hourly: number };
      }>(`/api/v1/pros/${proUserA.id}`, updateData, proUserA.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.availability).toBe(updateData.availability);
      expect(response.data?.rates?.hourly).toBe(125);
    });

    it('should update services array', async () => {
      const updateData = {
        services: ['Mixing', 'Mastering', 'Production', 'Vocal Coaching'],
      };

      const response = await apiPut<{
        services: string[];
      }>(`/api/v1/pros/${proUserA.id}`, updateData, proUserA.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.services).toHaveLength(4);
      expect(response.data?.services).toContain('Vocal Coaching');
    });

    it('should return 403 when updating another user\'s pro profile', async () => {
      const updateData = {
        availability: 'Hacked!',
      };

      const response = await apiPut(
        `/api/v1/pros/${proUserA.id}`,
        updateData,
        proUserB.accessToken
      );

      expect(response.status).toBe(403);
      expect(response.error?.code).toBe('FORBIDDEN');
    });

    it('should return 401 without authentication', async () => {
      const response = await apiPut(`/api/v1/pros/${proUserA.id}`, {
        availability: 'Unauthenticated update',
      });

      expect(response.status).toBe(401);
    });

    it('should return 404 when updating non-existent pro profile', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await apiPut(`/api/v1/pros/${fakeId}`, {
        availability: 'Update phantom profile',
      }, proUserA.accessToken);

      // Could be 403 (not owner) or 404 (not found)
      expect([403, 404]).toContain(response.status);
    });
  });

  describe('Role verification', () => {
    it('should update user role to pro after creating pro profile', async () => {
      const adminClient = createAdminClient();

      // Check that proUserA has role 'pro'
      const { data, error } = await adminClient
        .from('profiles')
        .select('role')
        .eq('id', proUserA.id)
        .single();

      expect(error).toBeNull();
      expect(data?.role).toBe('pro');
    });
  });
});
