/**
 * Test Data Factories
 * 
 * Factory functions for creating test data.
 */

import { v4 as uuidv4 } from 'uuid';
import { createAdminClient } from '../setup.js';

/**
 * Profile data factory.
 */
export interface ProfileFactory {
  id?: string;
  email?: string;
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  location?: string;
  preferred_genres?: string[];
  links?: Record<string, string>;
  role?: 'pro' | 'client' | 'admin' | 'label_staff';
  onboarding_complete?: boolean;
}

/**
 * Creates profile data with defaults.
 */
export function createProfileData(overrides: ProfileFactory = {}): ProfileFactory {
  const uniqueId = uuidv4().slice(0, 8);
  
  return {
    display_name: `Test Profile ${uniqueId}`,
    avatar_url: undefined,
    bio: 'This is a test bio for testing purposes.',
    location: 'Test City, TC',
    preferred_genres: ['Hip Hop', 'R&B'],
    links: {
      website: 'https://example.com',
      twitter: 'https://twitter.com/test',
    },
    role: 'client',
    onboarding_complete: false,
    ...overrides,
  };
}

/**
 * Service provider profile data factory.
 */
export interface ProProfileFactory {
  id?: string;
  services?: string[];
  rates?: {
    hourly?: number;
    per_track?: number;
    per_project?: number;
    currency?: string;
    custom?: Record<string, number>;
  };
  portfolio_url?: string | null;
  availability?: string | null;
  intake_notes?: string | null;
}

/**
 * Creates service provider profile data with defaults.
 */
export function createProProfileData(overrides: ProProfileFactory = {}): ProProfileFactory {
  return {
    services: ['Mixing', 'Mastering'],
    rates: {
      hourly: 75,
      per_track: 150,
      currency: 'USD',
    },
    portfolio_url: 'https://portfolio.example.com',
    availability: 'Weekdays 9AM-5PM EST',
    intake_notes: 'Please provide stems and reference tracks.',
    ...overrides,
  };
}

/**
 * Service seeker profile data factory.
 */
export interface ClientProfileFactory {
  id?: string;
  needs?: string[];
  budget_range?: string | null;
  project_types?: string[];
  preferences?: {
    turnaround?: string;
    revisions?: number;
    communication_style?: 'async' | 'realtime' | 'flexible';
    preferred_format?: string;
  };
}

/**
 * Creates service seeker profile data with defaults.
 */
export function createClientProfileData(overrides: ClientProfileFactory = {}): ClientProfileFactory {
  return {
    needs: ['Mixing', 'Vocal Production'],
    budget_range: '$500-$1000',
    project_types: ['Single', 'EP'],
    preferences: {
      turnaround: '2 weeks',
      revisions: 3,
      communication_style: 'flexible',
      preferred_format: 'WAV 48kHz/24bit',
    },
    ...overrides,
  };
}

/**
 * Inserts a pro profile directly into the database (bypassing API).
 * Useful for setting up test data.
 */
export async function insertProProfile(
  userId: string,
  data: ProProfileFactory = {}
): Promise<void> {
  const adminClient = createAdminClient();
  const profileData = createProProfileData(data);

  const { error } = await adminClient
    .from('service_provider_profiles')
    .upsert({
      id: userId,
      services: profileData.services,
      rates: profileData.rates,
      portfolio_url: profileData.portfolio_url,
      availability: profileData.availability,
      intake_notes: profileData.intake_notes,
    });

  if (error) {
    throw new Error(`Failed to insert pro profile: ${error.message}`);
  }
}

/**
 * Inserts a client profile directly into the database (bypassing API).
 * Useful for setting up test data.
 */
export async function insertClientProfile(
  userId: string,
  data: ClientProfileFactory = {}
): Promise<void> {
  const adminClient = createAdminClient();
  const profileData = createClientProfileData(data);

  const { error } = await adminClient
    .from('service_seeker_profiles')
    .upsert({
      id: userId,
      needs: profileData.needs,
      budget_range: profileData.budget_range,
      project_types: profileData.project_types,
      preferences: profileData.preferences,
    });

  if (error) {
    throw new Error(`Failed to insert client profile: ${error.message}`);
  }
}

/**
 * Updates a user's profile role directly.
 */
export async function setUserRole(
  userId: string,
  role: 'pro' | 'client' | 'admin' | 'label_staff'
): Promise<void> {
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from('profiles')
    .update({ role })
    .eq('id', userId);

  if (error) {
    throw new Error(`Failed to set user role: ${error.message}`);
  }
}

/**
 * Deletes a pro profile.
 */
export async function deleteProProfile(userId: string): Promise<void> {
  const adminClient = createAdminClient();
  await adminClient.from('service_provider_profiles').delete().eq('id', userId);
}

/**
 * Deletes a client profile.
 */
export async function deleteClientProfile(userId: string): Promise<void> {
  const adminClient = createAdminClient();
  await adminClient.from('service_seeker_profiles').delete().eq('id', userId);
}
