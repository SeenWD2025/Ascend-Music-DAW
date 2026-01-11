/**
 * Test Setup for AMG Music Platform
 * 
 * Initializes test environment with Supabase clients and global utilities.
 */

import { config } from 'dotenv';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Load environment variables from .env.test or .env
config({ path: path.resolve(__dirname, '../.env.test') });
config({ path: path.resolve(__dirname, '../.env') });

// Validate required environment variables
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.warn(`Warning: Missing environment variable ${envVar}. Some tests may fail.`);
  }
}

// Export environment config for tests
export const testEnv = {
  supabaseUrl: process.env.SUPABASE_URL || 'http://localhost:54321',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  apiUrl: process.env.API_URL || 'http://localhost:3001',
  adminSeedSecret: process.env.ADMIN_SEED_SECRET || 'test-seed-secret',
};

/**
 * Creates a Supabase admin client with service role key.
 * This bypasses RLS for test setup/teardown.
 */
export function createAdminClient(): SupabaseClient {
  return createClient(testEnv.supabaseUrl, testEnv.supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Creates a Supabase client with anon key (respects RLS).
 */
export function createAnonClient(): SupabaseClient {
  return createClient(testEnv.supabaseUrl, testEnv.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Creates a Supabase client authenticated as a specific user.
 * This is used to test RLS policies from the user's perspective.
 */
export async function createUserClient(
  email: string,
  password: string
): Promise<{ client: SupabaseClient; userId: string; accessToken: string }> {
  const client = createClient(testEnv.supabaseUrl, testEnv.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user || !data.session) {
    throw new Error(`Failed to sign in as ${email}: ${error?.message || 'Unknown error'}`);
  }

  return {
    client,
    userId: data.user.id,
    accessToken: data.session.access_token,
  };
}

// Note: Global test hooks are defined in vitest.config.ts setupFiles
// These are removed to avoid "Cannot find name 'beforeAll'" errors
// when not running in a vitest context
