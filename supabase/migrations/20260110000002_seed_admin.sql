-- Migration: Seed Admin User Profile
-- Sprint: 01 - Auth + Profiles + Roles
-- Created: 2026-01-10
-- Description: Seeds initial admin profile for AMG Music Platform
-- Note: The actual auth.users record must be created through Supabase Auth (signup/invite)
--       This migration prepares the profiles record that will be linked when the admin signs up

-- ============================================================================
-- SEED: Initial Admin Profile
-- ============================================================================

-- This DO block inserts an admin profile placeholder only if:
-- 1. An auth.users record with the admin email exists (created via Supabase Auth)
-- 2. A profile for that user doesn't already exist
-- 
-- If the admin user hasn't signed up yet, this will be handled by the 
-- on_auth_user_created trigger, and we can update the role to 'admin' manually
-- or via a separate admin setup script.

DO $$
DECLARE
    admin_email TEXT := 'admin@devn-noble.com';
    admin_user_id UUID;
BEGIN
    -- Check if the admin user exists in auth.users
    SELECT id INTO admin_user_id 
    FROM auth.users 
    WHERE email = admin_email
    LIMIT 1;

    -- If admin user exists and profile doesn't exist, create it
    IF admin_user_id IS NOT NULL THEN
        INSERT INTO public.profiles (
            id,
            email,
            display_name,
            role,
            onboarding_complete,
            bio,
            links
        )
        VALUES (
            admin_user_id,
            admin_email,
            'AMG Admin',
            'admin',
            true,
            'Ascend Music Group Platform Administrator',
            '{"website": "https://ascendmusicgroup.com"}'::jsonb
        )
        ON CONFLICT (id) DO UPDATE SET
            role = 'admin',
            updated_at = NOW()
        WHERE profiles.role != 'admin';
        
        RAISE NOTICE 'Admin profile created/updated for user: %', admin_user_id;
    ELSE
        RAISE NOTICE 'Admin user not found in auth.users. Profile will be created on signup via trigger.';
        RAISE NOTICE 'After signup, run: UPDATE public.profiles SET role = ''admin'' WHERE email = ''%'';', admin_email;
    END IF;
END $$;

-- ============================================================================
-- HELPER: Function to promote a user to admin (for manual use)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.promote_to_admin(user_email TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE public.profiles 
    SET role = 'admin', updated_at = NOW()
    WHERE email = user_email;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User with email % not found', user_email;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.promote_to_admin IS 'Promotes a user to admin role. Use with caution - should only be called by superuser.';

-- Revoke execute from public, only allow postgres/service_role
REVOKE EXECUTE ON FUNCTION public.promote_to_admin FROM PUBLIC;
