/**
 * API Test Helpers
 * 
 * Utilities for making API requests in tests.
 */

import { testEnv } from '../setup.js';

export interface ApiResponse<T = unknown> {
  status: number;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

/**
 * Makes an authenticated API request.
 */
export async function apiRequest<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  options: {
    body?: unknown;
    accessToken?: string;
    headers?: Record<string, string>;
  } = {}
): Promise<ApiResponse<T>> {
  const { body, accessToken, headers = {} } = options;
  
  const url = `${testEnv.apiUrl}${path.startsWith('/') ? path : `/${path}`}`;
  
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (accessToken) {
    requestHeaders['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseBody = await response.json().catch(() => ({})) as Record<string, unknown>;

  return {
    status: response.status,
    ...responseBody,
  } as ApiResponse<T>;
}

/**
 * GET request helper.
 */
export async function apiGet<T = unknown>(
  path: string,
  accessToken?: string
): Promise<ApiResponse<T>> {
  return apiRequest<T>('GET', path, { accessToken });
}

/**
 * POST request helper.
 */
export async function apiPost<T = unknown>(
  path: string,
  body: unknown,
  accessToken?: string
): Promise<ApiResponse<T>> {
  return apiRequest<T>('POST', path, { body, accessToken });
}

/**
 * PUT request helper.
 */
export async function apiPut<T = unknown>(
  path: string,
  body: unknown,
  accessToken?: string
): Promise<ApiResponse<T>> {
  return apiRequest<T>('PUT', path, { body, accessToken });
}

/**
 * PATCH request helper.
 */
export async function apiPatch<T = unknown>(
  path: string,
  body: unknown,
  accessToken?: string
): Promise<ApiResponse<T>> {
  return apiRequest<T>('PATCH', path, { body, accessToken });
}

/**
 * DELETE request helper.
 */
export async function apiDelete<T = unknown>(
  path: string,
  accessToken?: string
): Promise<ApiResponse<T>> {
  return apiRequest<T>('DELETE', path, { accessToken });
}

/**
 * Waits for API to be ready (useful in CI).
 */
export async function waitForApi(
  maxRetries = 10,
  delayMs = 1000
): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${testEnv.apiUrl}/health`);
      if (response.ok) {
        console.log('API is ready');
        return true;
      }
    } catch {
      // API not ready yet
    }
    
    console.log(`Waiting for API... (${i + 1}/${maxRetries})`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  throw new Error('API did not become ready in time');
}

/**
 * Asserts that the response is successful (2xx).
 */
export function expectSuccess(response: ApiResponse): void {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Expected success but got ${response.status}: ${JSON.stringify(response.error)}`
    );
  }
}

/**
 * Asserts that the response is an error with specific status.
 */
export function expectError(response: ApiResponse, expectedStatus: number): void {
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus} but got ${response.status}: ${JSON.stringify(response)}`
    );
  }
}
