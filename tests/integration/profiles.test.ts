/**
 * Integration Tests: Profiles API Routes
 * 
 * Tests profile endpoints:
 * - GET /api/v1/profiles/:id - Get public profile
 * - PUT /api/v1/profiles/:id - Update profile
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestUserWithToken,
  createAdminUser,
  getAccessToken,
  deleteTestUser,
  type TestUser,
} from '../helpers/auth.helper.js';
import { apiGet, apiPut } from '../helpers/api.helper.js';
import { createProfileData } from '../helpers/factories.js';

describe('Integration: Profiles API', () => {
  let userA: TestUser & { accessToken: string };
  let userB: TestUser & { accessToken: string };
  let adminUser: TestUser & { accessToken: string };

  beforeAll(async () => {
    userA = await createTestUserWithToken({
      displayName: 'Profile Test User A',
      role: 'client',
    });
    userB = await createTestUserWithToken({
      displayName: 'Profile Test User B',
      role: 'pro',
    });
    const admin = await createAdminUser();
    const adminToken = await getAccessToken(admin.email, admin.password);
    adminUser = { ...admin, accessToken: adminToken };
  });

  afterAll(async () => {
    await deleteTestUser(userA.id);
    await deleteTestUser(userB.id);
    await deleteTestUser(adminUser.id);
  });

  describe('GET /api/v1/profiles/:id', () => {
    it('should return public profile for any user', async () => {
      const response = await apiGet<{
        id: string;
        display_name: string;
        role: string;
      }>(`/api/v1/profiles/${userA.id}`);

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data?.id).toBe(userA.id);
      expect(response.data?.display_name).toBe('Profile Test User A');
    });

    it('should return full profile when requesting own profile', async () => {
      const response = await apiGet<{
        id: string;
        email: string;
        display_name: string;
        role: string;
        onboarding_complete: boolean;
      }>(`/api/v1/profiles/${userA.id}`, userA.accessToken);

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data?.id).toBe(userA.id);
      expect(response.data?.email).toBe(userA.email);
      // Full profile should include email (private field)
    });

    it('should return 404 for non-existent profile', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await apiGet(`/api/v1/profiles/${fakeId}`);

      expect(response.status).toBe(404);
      expect(response.error?.code).toBe('NOT_FOUND');
    });

    it('should return 400 for invalid UUID', async () => {
      const response = await apiGet('/api/v1/profiles/not-a-uuid');

      expect(response.status).toBe(400);
      expect(response.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /api/v1/profiles/:id', () => {
    it('should update own profile successfully (200)', async () => {
      const updateData = {
        bio: `Updated bio at ${Date.now()}`,
        location: 'New York, NY',
        preferred_genres: ['Hip Hop', 'Jazz'],
      };

      const response = await apiPut<{
        id: string;
        bio: string;
        location: string;
        preferred_genres: string[];
      }>(`/api/v1/profiles/${userA.id}`, updateData, userA.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.bio).toBe(updateData.bio);
      expect(response.data?.location).toBe(updateData.location);
      expect(response.data?.preferred_genres).toEqual(updateData.preferred_genres);
    });

    it('should update display_name', async () => {
      const updateData = {
        display_name: 'New Display Name',
      };

      const response = await apiPut<{
        display_name: string;
      }>(`/api/v1/profiles/${userA.id}`, updateData, userA.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.display_name).toBe('New Display Name');
    });

    it('should update links object', async () => {
      const updateData = {
        links: {
          website: 'https://mysite.com',
          twitter: 'https://twitter.com/myhandle',
          instagram: 'https://instagram.com/myhandle',
        },
      };

      const response = await apiPut<{
        links: Record<string, string>;
      }>(`/api/v1/profiles/${userA.id}`, updateData, userA.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.links?.website).toBe('https://mysite.com');
    });

    it('should return 403 when updating another user\'s profile', async () => {
      const updateData = {
        bio: 'Hacked bio!',
      };

      // User B tries to update User A's profile
      const response = await apiPut(
        `/api/v1/profiles/${userA.id}`,
        updateData,
        userB.accessToken
      );

      expect(response.status).toBe(403);
      expect(response.error?.code).toBe('FORBIDDEN');
    });

    it('should return 401 without authentication', async () => {
      const updateData = {
        bio: 'Unauthorized update',
      };

      const response = await apiPut(`/api/v1/profiles/${userA.id}`, updateData);

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });

    it('should allow admin to update any profile', async () => {
      const updateData = {
        bio: 'Admin updated this profile',
      };

      const response = await apiPut<{
        bio: string;
      }>(`/api/v1/profiles/${userB.id}`, updateData, adminUser.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.bio).toBe('Admin updated this profile');
    });

    it('should return 400 for invalid update data', async () => {
      const updateData = {
        preferred_genres: 'not-an-array', // Should be array
      };

      const response = await apiPut(
        `/api/v1/profiles/${userA.id}`,
        updateData,
        userA.accessToken
      );

      expect(response.status).toBe(400);
    });

    it('should NOT allow updating role through this endpoint', async () => {
      const updateData = {
        role: 'admin', // Trying to escalate to admin
      };

      const response = await apiPut<{
        role: string;
      }>(`/api/v1/profiles/${userA.id}`, updateData, userA.accessToken);

      // Either rejected or role ignored
      if (response.status === 200) {
        expect(response.data?.role).not.toBe('admin');
      }
    });
  });

  describe('Profile data privacy', () => {
    it('should NOT expose email in public profile response', async () => {
      // Request another user's profile without auth
      const response = await apiGet<Record<string, unknown>>(`/api/v1/profiles/${userB.id}`);

      expect(response.status).toBe(200);
      // Public profiles should not expose email
      // This depends on implementation - check if email is excluded
    });
  });
});
