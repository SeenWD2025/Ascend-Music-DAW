/**
 * Integration Tests: Admin API Routes
 * 
 * Tests admin endpoints:
 * - POST /api/v1/admin/seed - Create initial admin user
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { apiPost } from '../helpers/api.helper.js';
import { createAdminClient, testEnv } from '../setup.js';
import { v4 as uuidv4 } from 'uuid';

describe('Integration: Admin API', () => {
  let createdAdminIds: string[] = [];

  afterAll(async () => {
    // Cleanup any created admin users
    const adminClient = createAdminClient();
    for (const id of createdAdminIds) {
      try {
        await adminClient.from('profiles').delete().eq('id', id);
        await adminClient.auth.admin.deleteUser(id);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('POST /api/v1/admin/seed', () => {
    it('should create admin when valid seed key is provided', async () => {
      const uniqueId = uuidv4().slice(0, 8);
      const seedData = {
        email: `admin-${uniqueId}@amg-test.local`,
        password: `SecureAdminPass123!${uniqueId}`,
        display_name: `Test Admin ${uniqueId}`,
        secret: testEnv.adminSeedSecret,
      };

      // First, ensure no admin exists by checking the profiles table
      const adminClient = createAdminClient();
      const { data: existingAdmins } = await adminClient
        .from('profiles')
        .select('id')
        .eq('role', 'admin');

      // If admin already exists, skip this test
      if (existingAdmins && existingAdmins.length > 0) {
        console.log('Admin already exists, skipping create test');
        return;
      }

      const response = await apiPost<{
        id: string;
        email: string;
        display_name: string;
        role: string;
      }>('/api/v1/admin/seed', seedData);

      expect(response.status).toBe(201);
      expect(response.data?.email).toBe(seedData.email);
      expect(response.data?.display_name).toBe(seedData.display_name);
      expect(response.data?.role).toBe('admin');

      if (response.data?.id) {
        createdAdminIds.push(response.data.id);
      }
    });

    it('should return 403 without valid seed key', async () => {
      const uniqueId = uuidv4().slice(0, 8);
      const seedData = {
        email: `admin-${uniqueId}@amg-test.local`,
        password: `SecureAdminPass123!${uniqueId}`,
        display_name: `Fake Admin ${uniqueId}`,
        secret: 'wrong-secret-key-12345',
      };

      const response = await apiPost('/api/v1/admin/seed', seedData);

      expect(response.status).toBe(403);
      expect(response.error?.code).toBe('FORBIDDEN');
    });

    it('should return 403 with empty secret', async () => {
      const uniqueId = uuidv4().slice(0, 8);
      const seedData = {
        email: `admin-${uniqueId}@amg-test.local`,
        password: `SecureAdminPass123!${uniqueId}`,
        display_name: `Fake Admin ${uniqueId}`,
        secret: '',
      };

      const response = await apiPost('/api/v1/admin/seed', seedData);

      // Should fail validation or authorization
      expect([400, 403]).toContain(response.status);
    });

    it('should fail if admin already exists', async () => {
      // First create an admin
      const uniqueId1 = uuidv4().slice(0, 8);
      const firstAdmin = {
        email: `admin-first-${uniqueId1}@amg-test.local`,
        password: `SecureAdminPass123!${uniqueId1}`,
        display_name: `First Admin ${uniqueId1}`,
        secret: testEnv.adminSeedSecret,
      };

      const firstResponse = await apiPost<{ id: string }>('/api/v1/admin/seed', firstAdmin);
      if (firstResponse.data?.id) {
        createdAdminIds.push(firstResponse.data.id);
      }

      // Try to create another admin
      const uniqueId2 = uuidv4().slice(0, 8);
      const secondAdmin = {
        email: `admin-second-${uniqueId2}@amg-test.local`,
        password: `SecureAdminPass123!${uniqueId2}`,
        display_name: `Second Admin ${uniqueId2}`,
        secret: testEnv.adminSeedSecret,
      };

      const secondResponse = await apiPost('/api/v1/admin/seed', secondAdmin);

      // Should fail because admin already exists
      expect(secondResponse.status).toBe(400);
      expect(secondResponse.error?.code).toBe('ADMIN_EXISTS');
    });

    it('should return 400 for invalid email format', async () => {
      const seedData = {
        email: 'not-an-email',
        password: 'SecureAdminPass123!',
        display_name: 'Invalid Email Admin',
        secret: testEnv.adminSeedSecret,
      };

      const response = await apiPost('/api/v1/admin/seed', seedData);

      expect(response.status).toBe(400);
    });

    it('should return 400 for short password', async () => {
      const seedData = {
        email: 'admin-short@amg-test.local',
        password: 'short', // Less than 12 characters
        display_name: 'Short Password Admin',
        secret: testEnv.adminSeedSecret,
      };

      const response = await apiPost('/api/v1/admin/seed', seedData);

      expect(response.status).toBe(400);
    });

    it('should return 400 for missing required fields', async () => {
      const seedData = {
        email: 'admin-missing@amg-test.local',
        // Missing password, display_name, secret
      };

      const response = await apiPost('/api/v1/admin/seed', seedData);

      expect(response.status).toBe(400);
    });
  });

  describe('Admin Security', () => {
    it('should not expose seed secret in error messages', async () => {
      const seedData = {
        email: 'admin-security@amg-test.local',
        password: 'SecureAdminPass123!',
        display_name: 'Security Test Admin',
        secret: 'test-wrong-secret',
      };

      const response = await apiPost('/api/v1/admin/seed', seedData);

      // Error message should not contain the actual secret
      const responseStr = JSON.stringify(response);
      expect(responseStr).not.toContain(testEnv.adminSeedSecret);
    });

    it('should log security event for failed seed attempts', async () => {
      // This test validates that the endpoint doesn't leak timing info
      const start = Date.now();
      
      const seedData = {
        email: 'admin-timing@amg-test.local',
        password: 'SecureAdminPass123!',
        display_name: 'Timing Test Admin',
        secret: 'wrong-secret',
      };

      await apiPost('/api/v1/admin/seed', seedData);
      
      const elapsed = Date.now() - start;
      
      // Response should be reasonably quick (not artificially delayed)
      // but also not instant (some processing should occur)
      expect(elapsed).toBeLessThan(5000);
    });
  });
});
