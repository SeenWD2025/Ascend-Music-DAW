/**
 * Integration Tests: Auth API Routes
 * 
 * Tests authentication endpoints:
 * - GET /api/v1/auth/me - Get current user
 * - POST /api/v1/auth/logout - Logout user
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestUserWithToken,
  deleteTestUser,
  type TestUser,
} from '../helpers/auth.helper.js';
import { apiGet, apiPost } from '../helpers/api.helper.js';

describe('Integration: Auth API', () => {
  let testUser: TestUser & { accessToken: string };

  beforeAll(async () => {
    testUser = await createTestUserWithToken({
      displayName: 'Auth Test User',
      role: 'client',
    });
  });

  afterAll(async () => {
    await deleteTestUser(testUser.id);
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return user data when authenticated', async () => {
      const response = await apiGet<{
        user: { id: string; email: string };
        profile: { id: string; display_name: string; role: string };
      }>('/api/v1/auth/me', testUser.accessToken);

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data?.user?.id).toBe(testUser.id);
      expect(response.data?.user?.email).toBe(testUser.email);
      expect(response.data?.profile?.id).toBe(testUser.id);
      expect(response.data?.profile?.display_name).toBe(testUser.displayName);
    });

    it('should return 401 when not authenticated', async () => {
      const response = await apiGet('/api/v1/auth/me');

      expect(response.status).toBe(401);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 with invalid token', async () => {
      const response = await apiGet('/api/v1/auth/me', 'invalid-token-12345');

      expect(response.status).toBe(401);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 with malformed Authorization header', async () => {
      const { testEnv } = await import('../setup.js');
      const url = `${testEnv.apiUrl}/api/v1/auth/me`;

      // Send request with malformed header (no "Bearer " prefix)
      const response = await fetch(url, {
        headers: {
          Authorization: testUser.accessToken, // Missing "Bearer " prefix
        },
      });

      expect(response.status).toBe(401);
    });

    it('should return profile with correct role', async () => {
      const response = await apiGet<{
        profile: { role: string };
      }>('/api/v1/auth/me', testUser.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.profile?.role).toBe('client');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should successfully logout when authenticated', async () => {
      // Create a temporary user for logout test
      const tempUser = await createTestUserWithToken({
        displayName: 'Logout Test User',
      });

      try {
        const response = await apiPost(
          '/api/v1/auth/logout',
          {},
          tempUser.accessToken
        );

        expect(response.status).toBe(200);
      } finally {
        await deleteTestUser(tempUser.id);
      }
    });

    it('should return 401 when not authenticated', async () => {
      const response = await apiPost('/api/v1/auth/logout', {});

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Session validation', () => {
    it('should reject expired token', async () => {
      // This would require a token that's actually expired
      // For now, test with clearly invalid token
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjoxfQ.invalid';
      
      const response = await apiGet('/api/v1/auth/me', expiredToken);

      expect(response.status).toBe(401);
    });
  });
});
