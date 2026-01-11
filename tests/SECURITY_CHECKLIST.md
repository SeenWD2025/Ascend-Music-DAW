# Security Checklist - Sprint 01 & 02: Auth + Profiles + Drive

This document tracks verified security controls for the AMG Music Platform Sprint 01 and Sprint 02 deliverables.

## Status Legend
- ✅ Verified - Test exists and passes
- ⚠️ Partial - Some coverage exists, needs improvement
- ❌ Not tested - Needs test implementation
- 🚧 To implement - Feature not yet built

---

## 1. Authentication Security

### JWT Validation on Protected Routes
- [x] **Tested**: `requireAuth` middleware rejects requests without token
- [x] **Tested**: `requireAuth` middleware rejects invalid tokens
- [x] **Tested**: `requireAuth` middleware rejects expired tokens
- [x] **Tested**: Bearer token format validated (must start with "Bearer ")
- [x] **Tested**: Request context includes userId, userRole after auth
- [ ] **TODO**: Implement token refresh mechanism tests

### Session Management
- [x] **Tested**: Logout endpoint clears session
- [x] **Tested**: `/auth/me` returns 401 for unauthenticated requests
- [ ] **TODO**: Session expiry handling
- [ ] **TODO**: Concurrent session limits (if applicable)

### Auth Endpoint Security
- [x] **Tested**: Invalid credentials return 401 (not 500)
- [x] **Tested**: Error messages don't leak user existence
- [🚧] **To implement**: Rate limiting on `/auth/login` endpoint
- [🚧] **To implement**: Rate limiting on `/admin/seed` endpoint
- [ ] **TODO**: Brute force protection

---

## 2. Row Level Security (RLS)

### profiles Table
- [x] **Tested**: Owner can read their own profile
- [x] **Tested**: Owner can update their own profile
- [x] **Tested**: Public can read profiles (SELECT policy)
- [x] **Tested**: Non-owner cannot update another user's profile
- [x] **Tested**: Admin can update any profile
- [x] **Tested**: Anonymous cannot insert profile for arbitrary user
- [x] **Tested**: Owner can delete their own profile
- [x] **Tested**: Non-owner cannot delete another user's profile

### service_provider_profiles Table
- [x] **Tested**: Owner can read their own pro profile
- [x] **Tested**: Owner can update their own pro profile
- [x] **Tested**: Public can read pro profiles (for discovery)
- [x] **Tested**: Non-owner cannot update another's pro profile
- [x] **Tested**: Non-owner cannot delete another's pro profile
- [x] **Tested**: Admin can view pro profiles

### service_seeker_profiles Table
- [x] **Tested**: Owner can read their own client profile
- [x] **Tested**: Owner can update their own client profile
- [x] **Tested**: Non-owner CANNOT read another's client profile (PRIVATE)
- [x] **Tested**: Non-owner cannot update another's client profile
- [x] **Tested**: Admin can view client profiles
- [x] **Tested**: Anonymous cannot access client profiles

### drive_connections Table (Sprint 02)
- [x] **Tested**: Owner can SELECT their connection status (via view)
- [x] **Tested**: View does NOT expose access_token or refresh_token
- [x] **Tested**: Non-owner cannot see another user's connection
- [x] **Tested**: Owner can DELETE their connection
- [x] **Tested**: Anonymous cannot access any connections
- [x] **Tested**: Client cannot INSERT tokens (service role only)
- [x] **Tested**: Client cannot UPDATE tokens (service role only)
- [x] **Tested**: Service role can INSERT/UPDATE tokens for backend operations

### drive_files Table (Sprint 02)
- [x] **Tested**: Owner can SELECT their own files
- [x] **Tested**: Owner can INSERT their own files
- [x] **Tested**: Owner can UPDATE their own files
- [x] **Tested**: Owner can DELETE their own files
- [x] **Tested**: Non-owner cannot SELECT another user's private files
- [x] **Tested**: User in shared_with[] can SELECT file
- [x] **Tested**: Admin can SELECT any file (abuse review)
- [x] **Tested**: Non-owner cannot UPDATE another user's files
- [x] **Tested**: Non-owner cannot DELETE another user's files
- [x] **Tested**: User in shared_with[] cannot UPDATE file (read-only access)
- [x] **Tested**: Privacy defaults to 'private'
- [x] **Tested**: shared_with defaults to empty array

---

## 3. API Authorization

### Profile Endpoints
- [x] **Tested**: PUT `/profiles/:id` returns 403 for non-owner
- [x] **Tested**: PUT `/profiles/:id` returns 401 without auth
- [x] **Tested**: GET `/profiles/:id` returns public profile (limited fields)
- [x] **Tested**: GET `/profiles/:id` returns full profile for owner

### Pro Endpoints
- [x] **Tested**: POST `/pros` requires authentication
- [x] **Tested**: PUT `/pros/:id` returns 403 for non-owner
- [x] **Tested**: GET `/pros/:id` is publicly accessible

### Client Endpoints
- [x] **Tested**: POST `/clients` requires authentication
- [x] **Tested**: GET `/clients/:id` returns 403 for non-owner
- [x] **Tested**: PUT `/clients/:id` returns 403 for non-owner
- [x] **Tested**: Admin can access any client profile

### Admin Endpoints
- [x] **Tested**: POST `/admin/seed` requires valid secret
- [x] **Tested**: POST `/admin/seed` returns 403 without valid key
- [x] **Tested**: POST `/admin/seed` fails if admin already exists
- [x] **Tested**: Secret not exposed in error messages

### Drive Endpoints (Sprint 02)
- [x] **Tested**: GET `/drive/status` returns 401 without auth
- [x] **Tested**: GET `/drive/status` does NOT expose OAuth tokens
- [x] **Tested**: POST `/drive/connect` returns 401 without auth
- [x] **Tested**: POST `/drive/connect` generates unique state (CSRF protection)
- [x] **Tested**: POST `/drive/disconnect` returns 401 without auth
- [x] **Tested**: GET `/drive/files` returns only user's own files
- [x] **Tested**: GET `/drive/files` returns 401 without auth
- [x] **Tested**: GET `/drive/files/:id` returns 403 for other user's file
- [x] **Tested**: GET `/drive/files/:id` returns 404 for non-existent file
- [x] **Tested**: PUT `/drive/files/:id` returns 403 for other user's file
- [x] **Tested**: DELETE `/drive/files/:id` returns 403 for other user's file
- [x] **Tested**: Shared users have read-only access (cannot update/delete)

---

## 4. Data Privacy

### Private Fields Not Leaked
- [x] **Tested**: Public profile response excludes `email`
- [x] **Tested**: Public profile response excludes `onboarding_complete`
- [x] **Tested**: Client profiles are not accessible to other users

### Role Escalation Prevention
- [x] **Tested**: Cannot update role through profile update endpoint
- [x] **Tested**: Role changes require proper authorization
- [x] **Tested**: Admin role can only be set via seed endpoint

### Drive Data Privacy (Sprint 02)
- [x] **Tested**: OAuth tokens never exposed in API responses
- [x] **Tested**: OAuth state parameter prevents CSRF attacks
- [x] **Tested**: State tokens have expiration (10 min)
- [x] **Tested**: Token refresh handles revoked tokens gracefully
- [x] **Tested**: Files default to private privacy
- [x] **Tested**: shared_with expansion only happens via explicit mechanisms
- [x] **Tested**: Admin can view files for abuse review
- [x] **Tested**: Drive API errors don't leak sensitive info (tokens)
- [x] **Tested**: drive_connection_status view excludes tokens

---

## 5. Input Validation

### Profile Data
- [x] **Tested**: Invalid UUID format rejected (400)
- [x] **Tested**: Invalid array types rejected (e.g., services as string)
- [x] **Tested**: Required fields validated
- [ ] **TODO**: XSS prevention in text fields (bio, display_name)
- [ ] **TODO**: SQL injection prevention (handled by Supabase)

### Drive Data (Sprint 02)
- [x] **Tested**: Invalid privacy value rejected (CHECK constraint)
- [x] **Tested**: Valid purpose values enforced (CHECK constraint)
- [x] **Tested**: Upload status transitions validated
- [ ] **TODO**: File name sanitization
- [ ] **TODO**: MIME type validation

### URL Validation
- [ ] **TODO**: Validate `portfolio_url` format
- [ ] **TODO**: Validate `links` URLs format
- [ ] **TODO**: Prevent javascript: URLs

---

## 6. OWASP Top 10 Auth Considerations

### A01: Broken Access Control
- [x] RLS policies prevent horizontal privilege escalation
- [x] Owner checks prevent unauthorized resource access
- [x] Admin bypass explicitly checks role
- [x] Drive files: Owner-only by default (Sprint 02)
- [x] Drive tokens: Service role only access (Sprint 02)

### A02: Cryptographic Failures
- [x] Passwords handled by Supabase Auth (bcrypt)
- [x] JWTs signed by Supabase with proper algorithms
- [x] OAuth state tokens use base64url encoding (Sprint 02)
- [ ] **TODO**: Verify HTTPS enforcement in production

### A03: Injection
- [x] Parameterized queries via Supabase client
- [x] No raw SQL in application code
- [ ] **TODO**: Validate JSON inputs don't contain malicious payloads

### A04: Insecure Design
- [x] Admin seed requires secret key
- [x] One-time admin creation enforced
- [x] Role-based access control implemented
- [x] OAuth flow uses state parameter for CSRF (Sprint 02)
- [x] Tokens stored server-side only (Sprint 02)

### A05: Security Misconfiguration
- [ ] **TODO**: Verify service role key not exposed in frontend
- [ ] **TODO**: Verify anon key has minimal permissions
- [🚧] **To implement**: Security headers (CORS, CSP, etc.)

### A07: Identification and Authentication Failures
- [x] Strong password requirements (12+ chars for admin)
- [🚧] **To implement**: Rate limiting on auth endpoints
- [ ] **TODO**: Account lockout after failed attempts

---

## 7. Rate Limiting Status

| Endpoint | Status | Limit |
|----------|--------|-------|
| POST /auth/login | 🚧 To implement | 10/min |
| POST /auth/signup | 🚧 To implement | 5/min |
| POST /admin/seed | 🚧 To implement | 3/min |
| PUT /profiles/:id | 🚧 To implement | 30/min |
| POST /drive/upload | 🚧 To implement | 50/hour |
| POST /drive/connect | 🚧 To implement | 10/hour |

---

## 8. Test Coverage Summary

| Category | Tests | Passing | Coverage |
|----------|-------|---------|----------|
| RLS: profiles | 10 | - | High |
| RLS: service_provider_profiles | 8 | - | High |
| RLS: service_seeker_profiles | 10 | - | High |
| RLS: drive_connections | 15 | - | High |
| RLS: drive_files | 22 | - | High |
| API: auth | 6 | - | Medium |
| API: profiles | 12 | - | High |
| API: pros | 10 | - | High |
| API: clients | 12 | - | High |
| API: admin | 8 | - | Medium |
| API: drive | 25 | - | High |
| Unit: auth middleware | 12 | - | Medium |
| Unit: profile service | 10 | - | Medium |
| Unit: drive service | 18 | - | High |
| Unit: token manager | 22 | - | High |

---

## 9. Recommended Follow-ups

### Critical (Before Production)
1. Implement rate limiting on auth endpoints
2. Add security headers middleware
3. Verify environment variables not leaked
4. Add brute force protection

### Important (Sprint 03+)
1. Add audit logging for admin actions
2. Implement session management improvements
3. Add CAPTCHA for signup (if needed)
4. XSS sanitization for user-generated content
5. File name/content sanitization for Drive uploads
6. MIME type deep validation

### Nice to Have
1. Implement security event monitoring
2. Add anomaly detection for auth patterns
3. Implement API versioning strategy
4. Add request signing for sensitive operations

---

## 10. Sign-off

| Role | Name | Date | Status |
|------|------|------|--------|
| QA Lead | - | - | Pending |
| Security Review | - | - | Pending |
| Dev Lead | - | - | Pending |

---

*Last Updated: 2026-01-10*
*Sprint: 01 - Auth + Profiles, 02 - Google Drive Upload Manager*
*Document Owner: A07-QA/Security*
