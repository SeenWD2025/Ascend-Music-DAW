/**
 * Authentication Test Helpers
 * 
 * Utilities for creating and managing test users.
 */

import { createAdminClient, testEnv } from '../setup.js';
import { v4 as uuidv4 } from 'uuid';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  displayName: string;
  role: 'pro' | 'client' | 'admin' | 'label_staff';
}

/**
 * Creates a test user with authentication and profile.
 */
export async function createTestUser(
  options: Partial<TestUser> = {}
): Promise<TestUser> {
  const adminClient = createAdminClient();
  const uniqueId = uuidv4().slice(0, 8);
  
  const user: TestUser = {
    id: '',
    email: options.email || `test-${uniqueId}@amg-test.local`,
    password: options.password || `TestPassword123!${uniqueId}`,
    displayName: options.displayName || `Test User ${uniqueId}`,
    role: options.role || 'client',
  };

  // Create auth user
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: {
      display_name: user.displayName,
      role: user.role,
    },
  });

  if (authError || !authData.user) {
    throw new Error(`Failed to create test user: ${authError?.message || 'Unknown error'}`);
  }

  user.id = authData.user.id;

  // Profile should be auto-created by trigger, but update the role if needed
  const { error: profileError } = await adminClient
    .from('profiles')
    .update({ role: user.role, display_name: user.displayName })
    .eq('id', user.id);

  if (profileError) {
    console.warn(`Warning: Could not update profile role: ${profileError.message}`);
  }

  return user;
}

/**
 * Deletes a test user and their associated data.
 */
export async function deleteTestUser(userId: string): Promise<void> {
  const adminClient = createAdminClient();

  // Delete from extended profile tables first (cascade should handle this, but be explicit)
  await adminClient.from('service_provider_profiles').delete().eq('id', userId);
  await adminClient.from('service_seeker_profiles').delete().eq('id', userId);
  await adminClient.from('profiles').delete().eq('id', userId);

  // Delete auth user
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) {
    console.warn(`Warning: Could not delete test user ${userId}: ${error.message}`);
  }
}

/**
 * Cleans up all test users (identified by email pattern).
 */
export async function cleanupTestUsers(): Promise<void> {
  const adminClient = createAdminClient();

  // Find test users by email pattern
  const { data: users, error } = await adminClient.auth.admin.listUsers();
  
  if (error || !users) {
    console.warn('Warning: Could not list users for cleanup');
    return;
  }

  const testUsers = users.users.filter(u => u.email?.includes('@amg-test.local'));
  
  for (const user of testUsers) {
    await deleteTestUser(user.id);
  }

  console.log(`Cleaned up ${testUsers.length} test users`);
}

/**
 * Creates an admin user for testing admin operations.
 */
export async function createAdminUser(): Promise<TestUser> {
  return createTestUser({
    displayName: 'Test Admin',
    role: 'admin',
  });
}

/**
 * Creates a pro user for testing service provider operations.
 */
export async function createProUser(): Promise<TestUser> {
  return createTestUser({
    displayName: 'Test Pro',
    role: 'pro',
  });
}

/**
 * Creates a client user for testing service seeker operations.
 */
export async function createClientUser(): Promise<TestUser> {
  return createTestUser({
    displayName: 'Test Client',
    role: 'client',
  });
}

/**
 * Gets an access token for a test user.
 */
export async function getAccessToken(
  email: string,
  password: string
): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(testEnv.supabaseUrl, testEnv.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    throw new Error(`Failed to get access token: ${error?.message || 'No session'}`);
  }

  return data.session.access_token;
}

/**
 * Creates a test user and returns their access token.
 */
export async function createTestUserWithToken(
  options: Partial<TestUser> = {}
): Promise<TestUser & { accessToken: string }> {
  const user = await createTestUser(options);
  const accessToken = await getAccessToken(user.email, user.password);
  return { ...user, accessToken };
}
