/**
 * Drive Test Helpers
 * 
 * Utilities for Drive integration testing including mock connection creation
 * and mock file upload helpers.
 */

import { v4 as uuidv4 } from 'uuid';
import { createAdminClient } from '../setup.js';
import type { FilePurpose, FilePrivacy } from '../../apps/api/src/schemas/drive.js';

// ============================================================================
// Types
// ============================================================================

export interface MockDriveConnection {
  id: string;
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
}

export interface MockDriveFile {
  id: string;
  ownerId: string;
  driveFileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  purpose: FilePurpose;
  privacy: FilePrivacy;
  sharedWith: string[];
  uploadStatus: 'pending' | 'uploading' | 'complete' | 'failed';
}

export interface CreateMockConnectionOptions {
  userId: string;
  email?: string;
  revoked?: boolean;
  tokenExpired?: boolean;
}

export interface CreateMockFileOptions {
  ownerId: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  purpose?: FilePurpose;
  privacy?: FilePrivacy;
  sharedWith?: string[];
  uploadStatus?: 'pending' | 'uploading' | 'complete' | 'failed';
  projectId?: string;
  folderPath?: string;
  description?: string;
}

// ============================================================================
// Mock Drive Connection Helpers
// ============================================================================

/**
 * Creates a mock Drive connection in the database for testing.
 * Uses service role to bypass RLS.
 */
export async function createMockDriveConnection(
  options: CreateMockConnectionOptions
): Promise<MockDriveConnection> {
  const adminClient = createAdminClient();
  const uniqueId = uuidv4().slice(0, 8);

  const tokenExpiresAt = options.tokenExpired
    ? new Date(Date.now() - 3600000) // 1 hour ago
    : new Date(Date.now() + 3600000); // 1 hour from now

  const connectionData = {
    user_id: options.userId,
    access_token: `mock_access_token_${uniqueId}`,
    refresh_token: `mock_refresh_token_${uniqueId}`,
    token_expires_at: tokenExpiresAt.toISOString(),
    scopes: ['https://www.googleapis.com/auth/drive.file'],
    email: options.email || `test-${uniqueId}@gmail.com`,
    connected_at: new Date().toISOString(),
    revoked: options.revoked ?? false,
  };

  const { data, error } = await adminClient
    .from('drive_connections')
    .insert(connectionData)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create mock Drive connection: ${error?.message || 'Unknown error'}`);
  }

  return {
    id: data.id,
    userId: data.user_id,
    email: data.email,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenExpiresAt: new Date(data.token_expires_at),
  };
}

/**
 * Deletes a mock Drive connection from the database.
 */
export async function deleteMockDriveConnection(userId: string): Promise<void> {
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from('drive_connections')
    .delete()
    .eq('user_id', userId);

  if (error) {
    console.warn(`Warning: Could not delete mock Drive connection: ${error.message}`);
  }
}

/**
 * Updates a mock Drive connection to be revoked.
 */
export async function revokeMockDriveConnection(userId: string): Promise<void> {
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from('drive_connections')
    .update({ revoked: true, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to revoke mock Drive connection: ${error.message}`);
  }
}

// ============================================================================
// Mock Drive File Helpers
// ============================================================================

/**
 * Creates a mock Drive file record in the database for testing.
 * Uses service role to bypass RLS.
 */
export async function createMockDriveFile(
  options: CreateMockFileOptions
): Promise<MockDriveFile> {
  const adminClient = createAdminClient();
  const uniqueId = uuidv4().slice(0, 8);

  const fileData = {
    owner_id: options.ownerId,
    drive_file_id: `mock_drive_file_${uniqueId}`,
    name: options.name || `test-file-${uniqueId}.wav`,
    mime_type: options.mimeType || 'audio/wav',
    size_bytes: options.sizeBytes ?? 1024000,
    purpose: options.purpose ?? 'other',
    project_id: options.projectId ?? null,
    folder_path: options.folderPath ?? null,
    description: options.description ?? null,
    drive_web_url: `https://drive.google.com/file/d/mock_${uniqueId}/view`,
    drive_thumbnail_url: `https://drive.google.com/thumbnail?id=mock_${uniqueId}`,
    privacy: options.privacy ?? 'private',
    shared_with: options.sharedWith ?? [],
    upload_status: options.uploadStatus ?? 'complete',
    error_message: null,
  };

  const { data, error } = await adminClient
    .from('drive_files')
    .insert(fileData)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create mock Drive file: ${error?.message || 'Unknown error'}`);
  }

  return {
    id: data.id,
    ownerId: data.owner_id,
    driveFileId: data.drive_file_id,
    name: data.name,
    mimeType: data.mime_type,
    sizeBytes: data.size_bytes,
    purpose: data.purpose as FilePurpose,
    privacy: data.privacy as FilePrivacy,
    sharedWith: data.shared_with,
    uploadStatus: data.upload_status,
  };
}

/**
 * Deletes a mock Drive file from the database.
 */
export async function deleteMockDriveFile(fileId: string): Promise<void> {
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from('drive_files')
    .delete()
    .eq('id', fileId);

  if (error) {
    console.warn(`Warning: Could not delete mock Drive file: ${error.message}`);
  }
}

/**
 * Deletes all mock Drive files for a user.
 */
export async function deleteAllMockDriveFiles(userId: string): Promise<void> {
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from('drive_files')
    .delete()
    .eq('owner_id', userId);

  if (error) {
    console.warn(`Warning: Could not delete mock Drive files: ${error.message}`);
  }
}

/**
 * Creates multiple mock Drive files at once.
 */
export async function createMockDriveFiles(
  options: CreateMockFileOptions[]
): Promise<MockDriveFile[]> {
  const files: MockDriveFile[] = [];
  
  for (const opt of options) {
    const file = await createMockDriveFile(opt);
    files.push(file);
  }

  return files;
}

// ============================================================================
// Test Data Factories
// ============================================================================

/**
 * Creates mock file upload data for testing.
 */
export function createMockFileUploadData(overrides: Partial<{
  name: string;
  mimeType: string;
  purpose: FilePurpose;
  privacy: FilePrivacy;
  projectId: string;
  folderPath: string;
  description: string;
}> = {}): {
  name: string;
  mimeType: string;
  purpose: FilePurpose;
  privacy: FilePrivacy;
  projectId?: string;
  folderPath?: string;
  description?: string;
} {
  const uniqueId = uuidv4().slice(0, 8);

  return {
    name: overrides.name || `test-upload-${uniqueId}.wav`,
    mimeType: overrides.mimeType || 'audio/wav',
    purpose: overrides.purpose || 'stem',
    privacy: overrides.privacy || 'private',
    ...(overrides.projectId && { projectId: overrides.projectId }),
    ...(overrides.folderPath && { folderPath: overrides.folderPath }),
    ...(overrides.description && { description: overrides.description }),
  };
}

/**
 * Gets a mock Drive connection status via the view.
 */
export async function getMockDriveConnectionStatus(userId: string): Promise<{
  connected: boolean;
  email: string | null;
  revoked: boolean;
} | null> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from('drive_connection_status')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    connected: !data.revoked,
    email: data.email,
    revoked: data.revoked,
  };
}
