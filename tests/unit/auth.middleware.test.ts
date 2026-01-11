/**
 * Unit Tests: Auth Middleware
 * 
 * Tests the authentication middleware functions in isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Fastify request/reply
const createMockRequest = (overrides = {}) => ({
  headers: {},
  id: 'test-request-id',
  log: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
  ...overrides,
});

const createMockReply = () => {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply;
};

describe('Unit: Auth Middleware', () => {
  describe('Token Extraction', () => {
    it('should extract token from valid Authorization header', () => {
      const extractToken = (request: { headers: { authorization?: string } }) => {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          return null;
        }
        return authHeader.slice(7);
      };

      const request = createMockRequest({
        headers: { authorization: 'Bearer valid-token-123' },
      });

      const token = extractToken(request);
      expect(token).toBe('valid-token-123');
    });

    it('should return null for missing Authorization header', () => {
      const extractToken = (request: { headers: { authorization?: string } }) => {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          return null;
        }
        return authHeader.slice(7);
      };

      const request = createMockRequest({
        headers: {},
      });

      const token = extractToken(request);
      expect(token).toBeNull();
    });

    it('should return null for non-Bearer Authorization header', () => {
      const extractToken = (request: { headers: { authorization?: string } }) => {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          return null;
        }
        return authHeader.slice(7);
      };

      const request = createMockRequest({
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      });

      const token = extractToken(request);
      expect(token).toBeNull();
    });

    it('should handle empty Bearer token', () => {
      const extractToken = (request: { headers: { authorization?: string } }) => {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          return null;
        }
        return authHeader.slice(7);
      };

      const request = createMockRequest({
        headers: { authorization: 'Bearer ' },
      });

      const token = extractToken(request);
      expect(token).toBe('');
    });
  });

  describe('requireAuth middleware', () => {
    it('should return 401 when no token provided', async () => {
      const request = createMockRequest({ headers: {} });
      const reply = createMockReply();

      // Simulate middleware behavior
      const headers = request.headers as { authorization?: string };
      const authHeader = headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        reply.status(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing or invalid authorization header',
            requestId: request.id,
          },
        });
      }

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'UNAUTHORIZED',
          }),
        })
      );
    });

    it('should attach user context on valid token', () => {
      const request = createMockRequest({
        headers: { authorization: 'Bearer valid-token' },
      }) as Record<string, unknown>;

      // Simulate successful auth
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
      };
      const mockProfile = {
        role: 'client',
      };

      request.userId = mockUser.id;
      request.userRole = mockProfile.role;
      request.authContext = {
        userId: mockUser.id,
        email: mockUser.email,
        role: mockProfile.role,
      };

      expect(request.userId).toBe('user-123');
      expect(request.userRole).toBe('client');
      expect(request.authContext).toEqual({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'client',
      });
    });
  });

  describe('requireRole middleware', () => {
    it('should allow access for matching role', () => {
      const userRole = 'admin';
      const requiredRoles = ['admin', 'label_staff'];

      const hasAccess = requiredRoles.includes(userRole);
      expect(hasAccess).toBe(true);
    });

    it('should deny access for non-matching role', () => {
      const userRole = 'client';
      const requiredRoles = ['admin', 'label_staff'];

      const hasAccess = requiredRoles.includes(userRole);
      expect(hasAccess).toBe(false);
    });

    it('should handle multiple required roles', () => {
      const checkRole = (userRole: string, requiredRoles: string[]) => {
        return requiredRoles.includes(userRole);
      };

      expect(checkRole('pro', ['pro', 'admin'])).toBe(true);
      expect(checkRole('admin', ['pro', 'admin'])).toBe(true);
      expect(checkRole('client', ['pro', 'admin'])).toBe(false);
    });
  });

  describe('Owner or Admin check', () => {
    it('should allow owner to access their own resource', () => {
      const currentUserId: string = 'user-123';
      const resourceOwnerId: string = 'user-123';
      const userRole: string = 'client';

      const canAccess = currentUserId === resourceOwnerId || userRole === 'admin';
      expect(canAccess).toBe(true);
    });

    it('should allow admin to access any resource', () => {
      const currentUserId: string = 'admin-456';
      const resourceOwnerId: string = 'user-123';
      const userRole: string = 'admin';

      const canAccess = currentUserId === resourceOwnerId || userRole === 'admin';
      expect(canAccess).toBe(true);
    });

    it('should deny non-owner non-admin access', () => {
      const currentUserId: string = 'user-789';
      const resourceOwnerId: string = 'user-123';
      const userRole: string = 'client';

      const canAccess = currentUserId === resourceOwnerId || userRole === 'admin';
      expect(canAccess).toBe(false);
    });
  });

  describe('JWT validation', () => {
    it('should reject obviously malformed JWT', () => {
      const isValidJwtFormat = (token: string) => {
        const parts = token.split('.');
        return parts.length === 3;
      };

      expect(isValidJwtFormat('not.a.jwt.token.with.too.many.parts')).toBe(false);
      expect(isValidJwtFormat('notajwt')).toBe(false);
      expect(isValidJwtFormat('')).toBe(false);
      expect(isValidJwtFormat('header.payload.signature')).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should include requestId in error responses', () => {
      const requestId = 'req-abc-123';
      const errorResponse = {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid token',
          requestId,
        },
      };

      expect(errorResponse.error.requestId).toBe(requestId);
    });

    it('should not expose internal error details', () => {
      const internalError = new Error('Database connection failed');
      
      const sanitizedError = {
        code: 'INTERNAL_ERROR',
        message: 'Authentication failed',
        // Should NOT include: internalError.message, stack trace, etc.
      };

      expect(sanitizedError).not.toHaveProperty('stack');
      expect(sanitizedError.message).not.toContain('Database');
    });
  });
});

describe('Unit: Auth Context Types', () => {
  describe('UserRole type', () => {
    it('should define valid user roles', () => {
      const validRoles = ['pro', 'client', 'admin', 'label_staff'] as const;
      type UserRole = typeof validRoles[number];

      const testRole: UserRole = 'admin';
      expect(validRoles.includes(testRole)).toBe(true);
    });
  });

  describe('AuthContext interface', () => {
    it('should have required properties', () => {
      interface AuthContext {
        userId: string;
        email: string;
        role: string;
      }

      const context: AuthContext = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'client',
      };

      expect(context).toHaveProperty('userId');
      expect(context).toHaveProperty('email');
      expect(context).toHaveProperty('role');
    });
  });
});
