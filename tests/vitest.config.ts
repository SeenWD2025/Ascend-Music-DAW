/**
 * Vitest Configuration for AMG Music Platform Tests
 * 
 * Configures test runner for unit, integration, and RLS tests.
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Test file patterns
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],

    // Enable globals like describe, it, expect
    globals: true,

    // Setup files run before each test file
    setupFiles: ['./setup.ts'],

    // Environment
    environment: 'node',

    // Timeouts
    testTimeout: 30000, // 30s for integration tests
    hookTimeout: 30000,

    // Reporter
    reporters: ['verbose'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: [
        '../apps/api/src/**/*.ts',
        '../packages/shared/src/**/*.ts',
      ],
      exclude: [
        '**/node_modules/**',
        '**/index.ts', // Re-export files
        '**/*.d.ts',
        '**/types/**',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },

    // Pool configuration for isolation
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },

    // Sequence
    sequence: {
      shuffle: false,
    },
  },

  resolve: {
    alias: {
      '@api': path.resolve(__dirname, '../apps/api/src'),
      '@shared': path.resolve(__dirname, '../packages/shared/src'),
    },
  },
});
