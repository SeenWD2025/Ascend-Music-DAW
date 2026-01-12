/**
 * Shared type definitions used by both API and web apps.
 */
/**
 * User roles in the platform.
 */
export type UserRole = 'public' | 'artist' | 'pro' | 'label_artist' | 'label_staff' | 'moderator' | 'admin';
/**
 * User profile data.
 */
export interface Profile {
    id: string;
    user_id: string;
    email: string;
    display_name: string | null;
    avatar_url: string | null;
    role: UserRole;
    onboarding_complete: boolean;
    created_at: string;
    updated_at: string;
}
/**
 * Standard API response wrapper.
 */
export interface ApiResponse<T> {
    data: T;
    meta?: {
        page?: number;
        limit?: number;
        total?: number;
    };
}
/**
 * Standard API error response.
 */
export interface ApiError {
    error: {
        code: string;
        message: string;
        details?: unknown;
        requestId?: string;
    };
}
/**
 * Pagination parameters.
 */
export interface PaginationParams {
    page?: number;
    limit?: number;
}
/**
 * Sort direction.
 */
export type SortDirection = 'asc' | 'desc';
//# sourceMappingURL=index.d.ts.map