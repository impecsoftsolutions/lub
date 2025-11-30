/*
  # Remove JWT-based RLS Policies

  ## Overview
  This migration removes JWT-based RLS policies that were created for Supabase Auth
  but cannot work with our custom authentication system.

  ## Problem
  - Custom authentication uses localStorage tokens, NOT Supabase Auth JWT
  - auth.jwt() and auth.uid() always return NULL in custom auth systems
  - JWT-based policies provide false security and never allow access
  - These policies create confusion and clutter the policy list

  ## Policies to Remove
  1. "Admins can update member registrations via JWT" - Uses auth.jwt()
  2. "Admins can select member registrations via JWT" - Uses auth.jwt()
  3. "Users can read own roles via JWT" - Uses auth.jwt()
  4. Any other JWT-based policies that rely on auth.jwt() or auth.uid()

  ## Policies to Keep
  - Public read policies for approved members (directory access)
  - Public insert policies for new registrations
  - Any working current_user_id() policies (if applicable)
  - RPC functions with SECURITY DEFINER (they bypass RLS correctly)

  ## Impact
  - No functional impact since JWT policies never worked
  - Cleans up policy list
  - Reduces confusion for future developers
  - Makes security model clearer
*/

-- ============================================================================
-- REMOVE JWT-BASED POLICY FROM member_registrations
-- ============================================================================

-- Drop the JWT-based UPDATE policy (created in 20251028000004)
DROP POLICY IF EXISTS "Admins can update member registrations via JWT" ON member_registrations;

-- Drop the JWT-based SELECT policy (created in 20251028000003)
DROP POLICY IF EXISTS "Admins can select member registrations via JWT" ON member_registrations;

-- Log member_registrations cleanup
DO $$
BEGIN
  RAISE NOTICE '✓ Removed JWT-based UPDATE policy from member_registrations';
  RAISE NOTICE '✓ Removed JWT-based SELECT policy from member_registrations';
END $$;

-- ============================================================================
-- REMOVE JWT-BASED POLICY FROM user_roles
-- ============================================================================

-- Drop the JWT-based policy on user_roles (created in 20251028000002)
DROP POLICY IF EXISTS "Users can read own roles via JWT" ON user_roles;

-- Log user_roles cleanup
DO $$
BEGIN
  RAISE NOTICE '✓ Removed JWT-based policy from user_roles';
END $$;

-- ============================================================================
-- VERIFICATION: CHECK REMAINING POLICIES
-- ============================================================================

-- List all remaining policies on member_registrations
DO $$
DECLARE
  v_policy_record RECORD;
  v_policy_count integer := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'REMAINING POLICIES ON member_registrations:';
  RAISE NOTICE '========================================';

  FOR v_policy_record IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE tablename = 'member_registrations'
    ORDER BY policyname
  LOOP
    v_policy_count := v_policy_count + 1;
    RAISE NOTICE '% - Policy: %', v_policy_count, v_policy_record.policyname;
    RAISE NOTICE '   Command: % | Roles: %', v_policy_record.cmd, v_policy_record.roles;
  END LOOP;

  IF v_policy_count = 0 THEN
    RAISE NOTICE 'No policies found on member_registrations table';
  END IF;

  RAISE NOTICE '';
END $$;

-- ============================================================================
-- SUMMARY
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'JWT POLICY CLEANUP COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Removed Policies:';
  RAISE NOTICE '  ✓ Admins can update member registrations via JWT';
  RAISE NOTICE '  ✓ Admins can select member registrations via JWT';
  RAISE NOTICE '  ✓ Users can read own roles via JWT';
  RAISE NOTICE '';
  RAISE NOTICE 'Reason for Removal:';
  RAISE NOTICE '  - Custom auth system does not use Supabase Auth JWT';
  RAISE NOTICE '  - auth.jwt() and auth.uid() always return NULL';
  RAISE NOTICE '  - Policies provided false security and never allowed access';
  RAISE NOTICE '';
  RAISE NOTICE 'Current Security Model:';
  RAISE NOTICE '  - SECURITY DEFINER RPC functions for admin operations';
  RAISE NOTICE '  - Public policies for directory and registration';
  RAISE NOTICE '  - Explicit permission validation in RPC functions';
  RAISE NOTICE '';
END $$;
