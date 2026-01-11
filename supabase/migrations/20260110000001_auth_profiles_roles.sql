-- Migration: Auth Profiles & Roles Foundation
-- Sprint: 01 - Auth + Profiles + Roles
-- Created: 2026-01-10
-- Description: Creates core profile tables with RLS policies for AMG Music Platform

-- ============================================================================
-- 1. UTILITY FUNCTION: updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. TABLE: profiles (1:1 with auth.users)
-- ============================================================================

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    location TEXT,
    preferred_genres TEXT[] DEFAULT '{}',
    links JSONB DEFAULT '{}'::jsonb,
    role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('pro', 'client', 'admin', 'label_staff')),
    onboarding_complete BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.profiles IS 'User profiles extending Supabase Auth users. One profile per authenticated user.';
COMMENT ON COLUMN public.profiles.role IS 'User role: pro (service provider), client (service seeker), admin, or label_staff';
COMMENT ON COLUMN public.profiles.links IS 'Social links object, e.g. {"twitter": "...", "instagram": "...", "website": "..."}';
COMMENT ON COLUMN public.profiles.preferred_genres IS 'Array of music genres the user prefers or works with';

-- Trigger for updated_at
CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 3. TABLE: service_provider_profiles (Music Pros)
-- ============================================================================

CREATE TABLE public.service_provider_profiles (
    id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    services TEXT[] DEFAULT '{}',
    rates JSONB DEFAULT '{}'::jsonb,
    portfolio_url TEXT,
    availability TEXT,
    intake_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.service_provider_profiles IS 'Extended profile for Music Pros offering services (producers, engineers, etc.)';
COMMENT ON COLUMN public.service_provider_profiles.services IS 'Array of services offered, e.g. {"mixing", "mastering", "production"}';
COMMENT ON COLUMN public.service_provider_profiles.rates IS 'Pricing structure, e.g. {"hourly": 100, "per_track": 250, "currency": "USD"}';
COMMENT ON COLUMN public.service_provider_profiles.availability IS 'Availability description or schedule reference';
COMMENT ON COLUMN public.service_provider_profiles.intake_notes IS 'Notes or questions for potential clients during intake';

-- Trigger for updated_at
CREATE TRIGGER set_service_provider_profiles_updated_at
    BEFORE UPDATE ON public.service_provider_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 4. TABLE: service_seeker_profiles (Clients)
-- ============================================================================

CREATE TABLE public.service_seeker_profiles (
    id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    needs TEXT[] DEFAULT '{}',
    budget_range TEXT,
    project_types TEXT[] DEFAULT '{}',
    preferences JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.service_seeker_profiles IS 'Extended profile for Clients seeking music services';
COMMENT ON COLUMN public.service_seeker_profiles.needs IS 'Array of service needs, e.g. {"mixing", "vocal production"}';
COMMENT ON COLUMN public.service_seeker_profiles.budget_range IS 'Budget range description, e.g. "$500-$1000 per track"';
COMMENT ON COLUMN public.service_seeker_profiles.project_types IS 'Types of projects, e.g. {"single", "EP", "album", "sync"}';
COMMENT ON COLUMN public.service_seeker_profiles.preferences IS 'Additional preferences, e.g. {"turnaround": "2 weeks", "revisions": 3}';

-- Trigger for updated_at
CREATE TRIGGER set_service_seeker_profiles_updated_at
    BEFORE UPDATE ON public.service_seeker_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 5. INDEXES
-- ============================================================================

-- profiles indexes
CREATE UNIQUE INDEX idx_profiles_display_name ON public.profiles(display_name) WHERE display_name IS NOT NULL;
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_created_at ON public.profiles(created_at);
CREATE INDEX idx_profiles_email ON public.profiles(email);

-- service_provider_profiles indexes (FK is already indexed as PK)
CREATE INDEX idx_service_provider_profiles_services ON public.service_provider_profiles USING GIN(services);

-- service_seeker_profiles indexes (FK is already indexed as PK)
CREATE INDEX idx_service_seeker_profiles_needs ON public.service_seeker_profiles USING GIN(needs);
CREATE INDEX idx_service_seeker_profiles_project_types ON public.service_seeker_profiles USING GIN(project_types);

-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_provider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_seeker_profiles ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 6.1 profiles RLS policies
-- ----------------------------------------------------------------------------

-- SELECT: Public can read profiles (for public directory/discovery)
CREATE POLICY "profiles_select_public"
    ON public.profiles
    FOR SELECT
    USING (true);

-- INSERT: Authenticated users can only insert their own profile
CREATE POLICY "profiles_insert_own"
    ON public.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- UPDATE: Owner can update their own profile, OR admin can update any
CREATE POLICY "profiles_update_own_or_admin"
    ON public.profiles
    FOR UPDATE
    USING (
        auth.uid() = id 
        OR EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    )
    WITH CHECK (
        auth.uid() = id 
        OR EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- DELETE: Owner only can delete their profile
CREATE POLICY "profiles_delete_own"
    ON public.profiles
    FOR DELETE
    USING (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- 6.2 service_provider_profiles RLS policies
-- ----------------------------------------------------------------------------

-- SELECT: Public can read (for pro directory/discovery)
CREATE POLICY "service_provider_profiles_select_public"
    ON public.service_provider_profiles
    FOR SELECT
    USING (true);

-- INSERT: Owner only
CREATE POLICY "service_provider_profiles_insert_own"
    ON public.service_provider_profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- UPDATE: Owner only
CREATE POLICY "service_provider_profiles_update_own"
    ON public.service_provider_profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- DELETE: Owner only
CREATE POLICY "service_provider_profiles_delete_own"
    ON public.service_provider_profiles
    FOR DELETE
    USING (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- 6.3 service_seeker_profiles RLS policies
-- ----------------------------------------------------------------------------

-- SELECT: Owner OR admin can read (client profiles are private)
CREATE POLICY "service_seeker_profiles_select_own_or_admin"
    ON public.service_seeker_profiles
    FOR SELECT
    USING (
        auth.uid() = id 
        OR EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- INSERT: Owner only
CREATE POLICY "service_seeker_profiles_insert_own"
    ON public.service_seeker_profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- UPDATE: Owner only
CREATE POLICY "service_seeker_profiles_update_own"
    ON public.service_seeker_profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- DELETE: Owner only
CREATE POLICY "service_seeker_profiles_delete_own"
    ON public.service_seeker_profiles
    FOR DELETE
    USING (auth.uid() = id);

-- ============================================================================
-- 7. HELPER FUNCTION: Create profile on signup (optional trigger)
-- ============================================================================

-- This function can be used as a trigger on auth.users to auto-create profiles
-- Enable by uncommenting the trigger creation below if desired

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'role', 'client')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile when a new user signs up
-- This runs after a user is created in auth.users
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
