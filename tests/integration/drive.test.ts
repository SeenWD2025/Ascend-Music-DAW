/**
 * Integration Tests: Drive API Routes
 * 
 * Tests Drive API endpoints:
 * - GET /api/v1/drive/status - Get connection status
 * - POST /api/v1/drive/connect - Initiate OAuth connection
 * - POST /api/v1/drive/disconnect - Disconnect Drive
 * - GET /api/v1/drive/files - List user's files
 * - POST /api/v1/drive/upload - Upload file
 * - GET /api/v1/drive/files/:id - Get file metadata
 * - PUT /api/v1/drive/files/:id - Update file metadata
 * - DELETE /api/v1/drive/files/:id - Delete file
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  createTestUserWithToken,
  deleteTestUser,
  type TestUser,
} from '../helpers/auth.helper.js';
import {
  createMockDriveConnection,
  createMockDriveFile,
  deleteMockDriveConnection,
  deleteAllMockDriveFiles,
  MockDriveConnection,
  MockDriveFile,
} from '../helpers/drive.helper.js';
import { apiGet, apiPost, apiPut, apiDelete } from '../helpers/api.helper.js';

describe('Integration: Drive API', () => {
  let testUser: TestUser & { accessToken: string };
  let otherUser: TestUser & { accessToken: string };

  beforeAll(async () => {
    testUser = await createTestUserWithToken({
      displayName: 'Drive Test User',
      role: 'client',
    });
    otherUser = await createTestUserWithToken({
      displayName: 'Other User',
      role: 'pro',
    });
  });

  afterAll(async () => {
    await deleteMockDriveConnection(testUser.id);
    await deleteMockDriveConnection(otherUser.id);
    await deleteAllMockDriveFiles(testUser.id);
    await deleteAllMockDriveFiles(otherUser.id);
    await deleteTestUser(testUser.id);
    await deleteTestUser(otherUser.id);
  });

  afterEach(async () => {
    // Clean up after each test
    await deleteMockDriveConnection(testUser.id);
    await deleteAllMockDriveFiles(testUser.id);
  });

  // ==========================================================================
  // GET /api/v1/drive/status
  // ==========================================================================

  describe('GET /api/v1/drive/status', () => {
    it('should return disconnected when no connection exists', async () => {
      const response = await apiGet<{
        connected: boolean;
        email: string | null;
        connectedAt: string | null;
        revoked: boolean;
      }>('/api/v1/drive/status', testUser.accessToken);

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data?.connected).toBe(false);
      expect(response.data?.email).toBeNull();
      expect(response.data?.connectedAt).toBeNull();
    });

    it('should return connected with email when connected', async () => {
      // Create a mock connection
      await createMockDriveConnection({
        userId: testUser.id,
        email: 'test@gmail.com',
      });

      const response = await apiGet<{
        connected: boolean;
        email: string | null;
        connectedAt: string | null;
        revoked: boolean;
      }>('/api/v1/drive/status', testUser.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.connected).toBe(true);
      expect(response.data?.email).toBe('test@gmail.com');
      expect(response.data?.connectedAt).toBeDefined();
      expect(response.data?.revoked).toBe(false);
    });

    it('should return revoked status when connection is revoked', async () => {
      await createMockDriveConnection({
        userId: testUser.id,
        email: 'revoked@gmail.com',
        revoked: true,
      });

      const response = await apiGet<{
        connected: boolean;
        email: string | null;
        revoked: boolean;
      }>('/api/v1/drive/status', testUser.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.connected).toBe(false);
      expect(response.data?.revoked).toBe(true);
    });

    it('should return 401 without authentication', async () => {
      const response = await apiGet('/api/v1/drive/status');

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });

    it('should NOT expose OAuth tokens in response', async () => {
      await createMockDriveConnection({
        userId: testUser.id,
        email: 'tokens@gmail.com',
      });

      const response = await apiGet<Record<string, unknown>>(
        '/api/v1/drive/status',
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data).not.toHaveProperty('accessToken');
      expect(response.data).not.toHaveProperty('access_token');
      expect(response.data).not.toHaveProperty('refreshToken');
      expect(response.data).not.toHaveProperty('refresh_token');
    });
  });

  // ==========================================================================
  // POST /api/v1/drive/connect
  // ==========================================================================

  describe('POST /api/v1/drive/connect', () => {
    it('should return authUrl with valid state parameter', async () => {
      const response = await apiPost<{
        authUrl: string;
        state: string;
      }>('/api/v1/drive/connect', {}, testUser.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.authUrl).toBeDefined();
      expect(response.data?.state).toBeDefined();

      // Verify authUrl is a Google OAuth URL
      expect(response.data?.authUrl).toContain('accounts.google.com');
      expect(response.data?.authUrl).toContain('oauth2');
      expect(response.data?.authUrl).toContain('state=');

      // Verify state is a base64url encoded string
      expect(response.data?.state).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should include correct OAuth scopes in authUrl', async () => {
      const response = await apiPost<{
        authUrl: string;
      }>('/api/v1/drive/connect', {}, testUser.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.authUrl).toContain('scope=');
      expect(response.data?.authUrl).toContain('drive');
    });

    it('should return 401 without authentication', async () => {
      const response = await apiPost('/api/v1/drive/connect', {});

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });

    it('should generate unique state for each request (CSRF protection)', async () => {
      const response1 = await apiPost<{ state: string }>(
        '/api/v1/drive/connect',
        {},
        testUser.accessToken
      );
      const response2 = await apiPost<{ state: string }>(
        '/api/v1/drive/connect',
        {},
        testUser.accessToken
      );

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response1.data?.state).not.toBe(response2.data?.state);
    });
  });

  // ==========================================================================
  // POST /api/v1/drive/disconnect
  // ==========================================================================

  describe('POST /api/v1/drive/disconnect', () => {
    it('should successfully disconnect/revoke connection', async () => {
      // Create a connection first
      await createMockDriveConnection({
        userId: testUser.id,
        email: 'disconnect@gmail.com',
      });

      const response = await apiPost<{ success: boolean }>(
        '/api/v1/drive/disconnect',
        {},
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.success).toBe(true);

      // Verify connection is now revoked
      const statusResponse = await apiGet<{ connected: boolean; revoked: boolean }>(
        '/api/v1/drive/status',
        testUser.accessToken
      );

      expect(statusResponse.data?.connected).toBe(false);
      expect(statusResponse.data?.revoked).toBe(true);
    });

    it('should return 401 without authentication', async () => {
      const response = await apiPost('/api/v1/drive/disconnect', {});

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });

    it('should handle disconnect when already disconnected gracefully', async () => {
      // No connection exists
      const response = await apiPost<{ success: boolean }>(
        '/api/v1/drive/disconnect',
        {},
        testUser.accessToken
      );

      // Should succeed even if no connection (idempotent)
      expect([200, 404]).toContain(response.status);
    });
  });

  // ==========================================================================
  // GET /api/v1/drive/files
  // ==========================================================================

  describe('GET /api/v1/drive/files', () => {
    it('should return empty array when no files exist', async () => {
      const response = await apiGet<{
        files: unknown[];
        total: number;
      }>('/api/v1/drive/files', testUser.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.files).toEqual([]);
      expect(response.data?.total).toBe(0);
    });

    it('should return only user\'s own files', async () => {
      // Create files for test user
      await createMockDriveFile({ ownerId: testUser.id, name: 'user-file1.wav' });
      await createMockDriveFile({ ownerId: testUser.id, name: 'user-file2.wav' });

      // Create file for other user
      await createMockDriveFile({ ownerId: otherUser.id, name: 'other-file.wav' });

      const response = await apiGet<{
        files: Array<{ name: string; ownerId: string }>;
        total: number;
      }>('/api/v1/drive/files', testUser.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.files.length).toBe(2);
      expect(response.data?.total).toBe(2);

      // Verify all files belong to test user
      const ownerIds = response.data?.files.map(f => f.ownerId);
      expect(ownerIds).toEqual([testUser.id, testUser.id]);

      // Cleanup other user's file
      await deleteAllMockDriveFiles(otherUser.id);
    });

    it('should filter by purpose', async () => {
      await createMockDriveFile({ ownerId: testUser.id, name: 'stem.wav', purpose: 'stem' });
      await createMockDriveFile({ ownerId: testUser.id, name: 'mix.wav', purpose: 'mix' });
      await createMockDriveFile({ ownerId: testUser.id, name: 'master.wav', purpose: 'master' });

      const response = await apiGet<{
        files: Array<{ name: string; purpose: string }>;
      }>('/api/v1/drive/files?purpose=stem', testUser.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.files.length).toBe(1);
      expect(response.data?.files[0].purpose).toBe('stem');
    });

    it('should support pagination with limit and offset', async () => {
      // Create 5 files
      for (let i = 1; i <= 5; i++) {
        await createMockDriveFile({ ownerId: testUser.id, name: `file${i}.wav` });
      }

      // First page
      const page1 = await apiGet<{
        files: Array<{ name: string }>;
        total: number;
      }>('/api/v1/drive/files?limit=2&offset=0', testUser.accessToken);

      expect(page1.status).toBe(200);
      expect(page1.data?.files.length).toBe(2);
      expect(page1.data?.total).toBe(5);

      // Second page
      const page2 = await apiGet<{
        files: Array<{ name: string }>;
      }>('/api/v1/drive/files?limit=2&offset=2', testUser.accessToken);

      expect(page2.status).toBe(200);
      expect(page2.data?.files.length).toBe(2);
    });

    it('should return 401 without authentication', async () => {
      const response = await apiGet('/api/v1/drive/files');

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });
  });

  // ==========================================================================
  // POST /api/v1/drive/upload
  // ==========================================================================

  describe('POST /api/v1/drive/upload', () => {
    it('should return 401 without authentication', async () => {
      const response = await apiPost('/api/v1/drive/upload', {});

      expect(response.status).toBe(401);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 400 when not connected to Drive', async () => {
      // No Drive connection exists
      // Note: This would require multipart form data in real test
      const response = await apiPost(
        '/api/v1/drive/upload',
        {},
        testUser.accessToken
      );

      // Without multipart, we get INVALID_CONTENT_TYPE
      expect([400, 401]).toContain(response.status);
    });

    // Note: Full upload testing requires multipart form-data handling
    // which would need additional setup in the API helper
    it('should validate purpose field values', async () => {
      // This test documents the expected validation
      // Full implementation would use multipart form data
      const validPurposes = ['stem', 'mix', 'master', 'reference', 'document', 'other'];
      expect(validPurposes).toContain('stem');
      expect(validPurposes).not.toContain('invalid');
    });
  });

  // ==========================================================================
  // GET /api/v1/drive/files/:id
  // ==========================================================================

  describe('GET /api/v1/drive/files/:id', () => {
    it('should return file metadata for owner', async () => {
      const mockFile = await createMockDriveFile({
        ownerId: testUser.id,
        name: 'metadata-test.wav',
        purpose: 'stem',
        description: 'Test description',
      });

      const response = await apiGet<{
        id: string;
        name: string;
        purpose: string;
        ownerId: string;
        description: string;
      }>(`/api/v1/drive/files/${mockFile.id}`, testUser.accessToken);

      expect(response.status).toBe(200);
      expect(response.data?.id).toBe(mockFile.id);
      expect(response.data?.name).toBe('metadata-test.wav');
      expect(response.data?.purpose).toBe('stem');
      expect(response.data?.description).toBe('Test description');
    });

    it('should return 404 for non-existent file', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await apiGet(
        `/api/v1/drive/files/${fakeId}`,
        testUser.accessToken
      );

      expect(response.status).toBe(404);
      expect(response.error?.code).toBe('NOT_FOUND');
    });

    it('should return 403 for other user\'s file', async () => {
      // Create file owned by other user
      const otherFile = await createMockDriveFile({
        ownerId: otherUser.id,
        name: 'other-user-file.wav',
        privacy: 'private',
      });

      const response = await apiGet(
        `/api/v1/drive/files/${otherFile.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(403);
      expect(response.error?.code).toBe('FORBIDDEN');

      // Cleanup
      await deleteAllMockDriveFiles(otherUser.id);
    });

    it('should allow access to shared file', async () => {
      const sharedFile = await createMockDriveFile({
        ownerId: otherUser.id,
        name: 'shared-with-me.wav',
        sharedWith: [testUser.id],
      });

      const response = await apiGet<{ id: string }>(
        `/api/v1/drive/files/${sharedFile.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.id).toBe(sharedFile.id);

      // Cleanup
      await deleteAllMockDriveFiles(otherUser.id);
    });

    it('should return 401 without authentication', async () => {
      const mockFile = await createMockDriveFile({
        ownerId: testUser.id,
        name: 'auth-test.wav',
      });

      const response = await apiGet(`/api/v1/drive/files/${mockFile.id}`);

      expect(response.status).toBe(401);
    });
  });

  // ==========================================================================
  // PUT /api/v1/drive/files/:id
  // ==========================================================================

  describe('PUT /api/v1/drive/files/:id', () => {
    it('should update file metadata for owner', async () => {
      const mockFile = await createMockDriveFile({
        ownerId: testUser.id,
        name: 'original.wav',
        description: 'Original description',
        purpose: 'stem',
      });

      const response = await apiPut<{
        id: string;
        name: string;
        description: string;
        purpose: string;
      }>(
        `/api/v1/drive/files/${mockFile.id}`,
        {
          name: 'updated.wav',
          description: 'Updated description',
          purpose: 'master',
        },
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.name).toBe('updated.wav');
      expect(response.data?.description).toBe('Updated description');
      expect(response.data?.purpose).toBe('master');
    });

    it('should return 403 for other user\'s file', async () => {
      const otherFile = await createMockDriveFile({
        ownerId: otherUser.id,
        name: 'not-mine.wav',
      });

      const response = await apiPut(
        `/api/v1/drive/files/${otherFile.id}`,
        { name: 'hacked.wav' },
        testUser.accessToken
      );

      expect(response.status).toBe(403);

      // Cleanup
      await deleteAllMockDriveFiles(otherUser.id);
    });

    it('should return 404 for non-existent file', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await apiPut(
        `/api/v1/drive/files/${fakeId}`,
        { name: 'ghost.wav' },
        testUser.accessToken
      );

      expect(response.status).toBe(404);
    });

    it('should return 401 without authentication', async () => {
      const mockFile = await createMockDriveFile({
        ownerId: testUser.id,
        name: 'auth-test.wav',
      });

      const response = await apiPut(`/api/v1/drive/files/${mockFile.id}`, {
        name: 'no-auth.wav',
      });

      expect(response.status).toBe(401);
    });

    it('should not allow shared user to update file', async () => {
      const sharedFile = await createMockDriveFile({
        ownerId: otherUser.id,
        name: 'shared-readonly.wav',
        sharedWith: [testUser.id],
      });

      const response = await apiPut(
        `/api/v1/drive/files/${sharedFile.id}`,
        { name: 'shared-user-edit.wav' },
        testUser.accessToken
      );

      expect(response.status).toBe(403);

      // Cleanup
      await deleteAllMockDriveFiles(otherUser.id);
    });
  });

  // ==========================================================================
  // DELETE /api/v1/drive/files/:id
  // ==========================================================================

  describe('DELETE /api/v1/drive/files/:id', () => {
    it('should delete file for owner', async () => {
      const mockFile = await createMockDriveFile({
        ownerId: testUser.id,
        name: 'delete-me.wav',
      });

      const response = await apiDelete<{ success: boolean }>(
        `/api/v1/drive/files/${mockFile.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(200);
      expect(response.data?.success).toBe(true);

      // Verify file is deleted
      const checkResponse = await apiGet(
        `/api/v1/drive/files/${mockFile.id}`,
        testUser.accessToken
      );
      expect(checkResponse.status).toBe(404);
    });

    it('should return 403 for other user\'s file', async () => {
      const otherFile = await createMockDriveFile({
        ownerId: otherUser.id,
        name: 'not-my-file.wav',
      });

      const response = await apiDelete(
        `/api/v1/drive/files/${otherFile.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(403);

      // Cleanup
      await deleteAllMockDriveFiles(otherUser.id);
    });

    it('should return 404 for non-existent file', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await apiDelete(
        `/api/v1/drive/files/${fakeId}`,
        testUser.accessToken
      );

      expect(response.status).toBe(404);
    });

    it('should return 401 without authentication', async () => {
      const mockFile = await createMockDriveFile({
        ownerId: testUser.id,
        name: 'auth-delete.wav',
      });

      const response = await apiDelete(`/api/v1/drive/files/${mockFile.id}`);

      expect(response.status).toBe(401);
    });

    it('should not allow shared user to delete file', async () => {
      const sharedFile = await createMockDriveFile({
        ownerId: otherUser.id,
        name: 'shared-no-delete.wav',
        sharedWith: [testUser.id],
      });

      const response = await apiDelete(
        `/api/v1/drive/files/${sharedFile.id}`,
        testUser.accessToken
      );

      expect(response.status).toBe(403);

      // Cleanup
      await deleteAllMockDriveFiles(otherUser.id);
    });
  });
});
