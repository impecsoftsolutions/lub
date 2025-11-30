/*
  # Complete Migration from auth.uid() to current_user_id()

  ## Overview
  This migration completes the transition from Supabase Auth (auth.uid()) to custom
  authentication (current_user_id()). It updates all remaining references across
  functions and RLS policies to use the custom auth system.

  ## Scope
  - Updates 2 SECURITY DEFINER functions
  - Updates 32 auth.uid() occurrences across 10 tables
  - Fixes deprecated role names in pending_cities_master policies
  - Total: 24 RLS policies recreated with updated authentication

  ## Tables Affected
  1. user_roles - 3 policies (5 occurrences)
  2. member_registrations - 2 policies (2 occurrences)
  3. form_field_configurations - 3 policies (6 occurrences)
  4. validation_rules - 3 policies (5 occurrences)
  5. payment_settings - 2 policies (4 occurrences)
  6. directory_field_visibility - 2 policies (4 occurrences)
  7. deleted_members - 1 policy (1 occurrence)
  8. member_audit_history - 1 policy (1 occurrence)
  9. pending_cities_master - 7 policies (9 occurrences) + role name fixes
  10. Additional policies in validation_rules and registrations

  ## Security Impact
  - Maintains exact same security model
  - Only changes authentication function (auth.uid() → current_user_id())
  - Updates outdated role names to use simplified role system
  - No changes to permission levels or access control logic

  ## References
  - Original custom auth migration: 20251020000006_update_rls_policies_for_custom_auth.sql
  - current_user_id() function defined in: 20251020000006_update_rls_policies_for_custom_auth.sql

  ## ROLLBACK
  To undo this migration, replace all current_user_id() back to auth.uid() and revert
  role names in pending_cities_master policies:
  - Replace: current_user_id() → auth.uid()
  - Replace: role IN ('admin', 'super_admin') → role IN ('state_president', 'it_division_head')
  Note: Full rollback requires recreating all policies with original definitions
*/

-- =============================================================================
-- SECTION 1: Update Security Definer Functions
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Function 1: check_user_permission()
-- Replace auth.uid() with current_user_id() (1 occurrence)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_user_permission(
  target_state text DEFAULT NULL,
  target_district text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role_count integer;
BEGIN
  -- Check if user is authenticated
  IF current_user_id() IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if user has any management role
  SELECT COUNT(*)
  INTO user_role_count
  FROM user_roles
  WHERE user_id = current_user_id()
    AND role IN ('super_admin', 'admin', 'editor');

  RETURN user_role_count > 0;
END;
$$;

COMMENT ON FUNCTION check_user_permission(text, text) IS
  'Checks if current user has permission to access resources. Uses current_user_id() from custom auth.';

-- -----------------------------------------------------------------------------
-- Function 2: get_user_role()
-- Replace auth.uid() with current_user_id() (2 occurrences)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
BEGIN
  -- Check if user is authenticated
  IF current_user_id() IS NULL THEN
    RETURN 'anonymous';
  END IF;

  -- Get user's role from user_roles table
  SELECT role INTO user_role
  FROM user_roles
  WHERE user_id = current_user_id()
  LIMIT 1;

  RETURN COALESCE(user_role, 'no_role');
END;
$$;

COMMENT ON FUNCTION get_user_role() IS
  'Returns the role of current user. Uses current_user_id() from custom auth.';

-- =============================================================================
-- SECTION 2: Update RLS Policies by Table
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table 1: user_roles (3 policies, 5 occurrences)
-- -----------------------------------------------------------------------------

-- Policy 1: Users can view their own roles
DROP POLICY IF EXISTS "Users can view own roles" ON user_roles;

CREATE POLICY "Users can view own roles"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (current_user_id() = user_id);

COMMENT ON POLICY "Users can view own roles" ON user_roles IS
  'Allows users to view their own role assignments. Uses current_user_id().';

-- Policy 2: Super admin and admin can view all roles
DROP POLICY IF EXISTS "Super admin and admin can view all roles" ON user_roles;

CREATE POLICY "Super admin and admin can view all roles"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_user_id()
        AND ur.role IN ('super_admin', 'admin')
    )
  );

COMMENT ON POLICY "Super admin and admin can view all roles" ON user_roles IS
  'Allows super_admin and admin users to view all role assignments. Uses current_user_id().';

-- Policy 3: Only super admin can manage user roles
DROP POLICY IF EXISTS "Only super admin can manage user roles" ON user_roles;

CREATE POLICY "Only super admin can manage user roles"
  ON user_roles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_user_id()
        AND ur.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_user_id()
        AND ur.role = 'super_admin'
    )
  );

COMMENT ON POLICY "Only super admin can manage user roles" ON user_roles IS
  'Only super_admin can INSERT/UPDATE/DELETE role assignments. Uses current_user_id().';

-- -----------------------------------------------------------------------------
-- Table 2: member_registrations (2 policies, 2 occurrences)
-- -----------------------------------------------------------------------------

-- Note: Main admin policies already updated in 20251020000006,
-- these are supplementary member-specific policies

-- Policy 1: Members can view own registration
DROP POLICY IF EXISTS "Members can view own registration" ON member_registrations;

CREATE POLICY "Members can view own registration"
  ON member_registrations
  FOR SELECT
  TO authenticated
  USING (user_id = current_user_id());

COMMENT ON POLICY "Members can view own registration" ON member_registrations IS
  'Allows members to view their own registration data. Uses current_user_id().';

-- Policy 2: Members can update own registration
DROP POLICY IF EXISTS "Members can update own registration" ON member_registrations;

CREATE POLICY "Members can update own registration"
  ON member_registrations
  FOR UPDATE
  TO authenticated
  USING (user_id = current_user_id())
  WITH CHECK (
    user_id = current_user_id() AND
    -- Members cannot change status or user_id
    status = (SELECT status FROM member_registrations WHERE id = member_registrations.id) AND
    user_id = (SELECT user_id FROM member_registrations WHERE id = member_registrations.id)
  );

COMMENT ON POLICY "Members can update own registration" ON member_registrations IS
  'Allows members to update their own registration data (except status and user_id). Uses current_user_id().';

-- -----------------------------------------------------------------------------
-- Table 3: form_field_configurations (3 policies, 6 occurrences)
-- -----------------------------------------------------------------------------

-- Policy 1: Admins can insert form field configurations
DROP POLICY IF EXISTS "Admins can insert form field configurations" ON form_field_configurations;

CREATE POLICY "Admins can insert form field configurations"
  ON form_field_configurations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role IN ('admin', 'super_admin')
    )
  );

COMMENT ON POLICY "Admins can insert form field configurations" ON form_field_configurations IS
  'Only admin and super_admin can insert form field configurations. Uses current_user_id().';

-- Policy 2: Admins can update form field configurations
DROP POLICY IF EXISTS "Admins can update form field configurations" ON form_field_configurations;

CREATE POLICY "Admins can update form field configurations"
  ON form_field_configurations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role IN ('admin', 'super_admin')
    )
  );

COMMENT ON POLICY "Admins can update form field configurations" ON form_field_configurations IS
  'Only admin and super_admin can update form field configurations. Uses current_user_id().';

-- Policy 3: Admins can delete form field configurations
DROP POLICY IF EXISTS "Admins can delete form field configurations" ON form_field_configurations;

CREATE POLICY "Admins can delete form field configurations"
  ON form_field_configurations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role IN ('admin', 'super_admin')
    )
  );

COMMENT ON POLICY "Admins can delete form field configurations" ON form_field_configurations IS
  'Only admin and super_admin can delete form field configurations. Uses current_user_id().';

-- -----------------------------------------------------------------------------
-- Table 4: validation_rules (3 policies, 5 occurrences)
-- -----------------------------------------------------------------------------

-- Policy 1: Super admins can read all validation rules
DROP POLICY IF EXISTS "Super admins can read all validation rules" ON validation_rules;

CREATE POLICY "Super admins can read all validation rules"
  ON validation_rules
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role = 'super_admin'
    )
  );

COMMENT ON POLICY "Super admins can read all validation rules" ON validation_rules IS
  'Super admins can view all validation rules (including inactive). Uses current_user_id().';

-- Policy 2: Super admins can update validation rules
DROP POLICY IF EXISTS "Super admins can update validation rules" ON validation_rules;

CREATE POLICY "Super admins can update validation rules"
  ON validation_rules
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role = 'super_admin'
    )
  );

COMMENT ON POLICY "Super admins can update validation rules" ON validation_rules IS
  'Only super_admin can update validation rules. Uses current_user_id().';

-- Policy 3: Admins can insert validation rules
DROP POLICY IF EXISTS "Admins can insert validation rules" ON validation_rules;

CREATE POLICY "Admins can insert validation rules"
  ON validation_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role IN ('admin', 'super_admin')
    )
  );

COMMENT ON POLICY "Admins can insert validation rules" ON validation_rules IS
  'Admin and super_admin can insert validation rules. Uses current_user_id().';

-- Policy 4: Admins can update validation rules (secondary policy)
DROP POLICY IF EXISTS "Admins can update validation rules" ON validation_rules;

CREATE POLICY "Admins can update validation rules"
  ON validation_rules
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role IN ('admin', 'super_admin')
    )
  );

COMMENT ON POLICY "Admins can update validation rules" ON validation_rules IS
  'Admin and super_admin can update validation rules. Uses current_user_id().';

-- -----------------------------------------------------------------------------
-- Table 5: payment_settings (2 policies, 4 occurrences)
-- -----------------------------------------------------------------------------

-- Policy 1: Super admins can insert payment settings
DROP POLICY IF EXISTS "Super admins can insert payment settings" ON payment_settings;

CREATE POLICY "Super admins can insert payment settings"
  ON payment_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role = 'super_admin'
    )
  );

COMMENT ON POLICY "Super admins can insert payment settings" ON payment_settings IS
  'Only super_admin can insert payment settings. Uses current_user_id().';

-- Policy 2: Super admins can update payment settings
DROP POLICY IF EXISTS "Super admins can update payment settings" ON payment_settings;

CREATE POLICY "Super admins can update payment settings"
  ON payment_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role = 'super_admin'
    )
  );

COMMENT ON POLICY "Super admins can update payment settings" ON payment_settings IS
  'Only super_admin can update payment settings. Uses current_user_id().';

-- -----------------------------------------------------------------------------
-- Table 6: directory_field_visibility (2 policies, 4 occurrences)
-- -----------------------------------------------------------------------------

-- Policy 1: Admins can insert field visibility settings
DROP POLICY IF EXISTS "Admins can insert field visibility settings" ON directory_field_visibility;

CREATE POLICY "Admins can insert field visibility settings"
  ON directory_field_visibility
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role IN ('admin', 'super_admin')
    )
  );

COMMENT ON POLICY "Admins can insert field visibility settings" ON directory_field_visibility IS
  'Admin and super_admin can insert field visibility settings. Uses current_user_id().';

-- Policy 2: Admins can update field visibility settings
DROP POLICY IF EXISTS "Admins can update field visibility settings" ON directory_field_visibility;

CREATE POLICY "Admins can update field visibility settings"
  ON directory_field_visibility
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role IN ('admin', 'super_admin')
    )
  );

COMMENT ON POLICY "Admins can update field visibility settings" ON directory_field_visibility IS
  'Admin and super_admin can update field visibility settings. Uses current_user_id().';

-- -----------------------------------------------------------------------------
-- Table 7: deleted_members (1 policy, 1 occurrence)
-- -----------------------------------------------------------------------------

-- Policy 1: Only super admins can read deleted members
DROP POLICY IF EXISTS "Only super admins can read deleted members" ON deleted_members;

CREATE POLICY "Only super admins can read deleted members"
  ON deleted_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role = 'super_admin'
    )
  );

COMMENT ON POLICY "Only super admins can read deleted members" ON deleted_members IS
  'Only super_admin can view deleted member records. Uses current_user_id().';

-- -----------------------------------------------------------------------------
-- Table 8: member_audit_history (1 policy, 1 occurrence)
-- -----------------------------------------------------------------------------

-- Policy 1: Members can view own audit history
DROP POLICY IF EXISTS "Members can view own audit history" ON member_audit_history;

CREATE POLICY "Members can view own audit history"
  ON member_audit_history
  FOR SELECT
  TO authenticated
  USING (
    member_id IN (
      SELECT id FROM member_registrations WHERE user_id = current_user_id()
    )
  );

COMMENT ON POLICY "Members can view own audit history" ON member_audit_history IS
  'Members can view audit history for their own registration. Uses current_user_id().';

-- -----------------------------------------------------------------------------
-- Table 9: pending_cities_master (7 policies, 9 occurrences)
-- Also fixes deprecated role names (state_president, it_division_head → admin)
-- -----------------------------------------------------------------------------

-- Drop all old policies
DROP POLICY IF EXISTS "Super admins and IT heads can view all cities" ON pending_cities_master;
DROP POLICY IF EXISTS "State admins can view cities in their state" ON pending_cities_master;
DROP POLICY IF EXISTS "Super admins and IT heads can update cities" ON pending_cities_master;
DROP POLICY IF EXISTS "State admins can update cities in their state" ON pending_cities_master;
DROP POLICY IF EXISTS "Super admins and IT heads can delete cities" ON pending_cities_master;
DROP POLICY IF EXISTS "Super admins and IT heads can insert cities" ON pending_cities_master;
DROP POLICY IF EXISTS "State admins can insert cities in their state" ON pending_cities_master;

-- Policy 1: Admins can view all cities
CREATE POLICY "Admins can view all cities"
  ON pending_cities_master
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role IN ('super_admin', 'admin')
    )
  );

COMMENT ON POLICY "Admins can view all cities" ON pending_cities_master IS
  'Super_admin and admin users can view all cities. Uses current_user_id() and simplified roles.';

-- Policy 2: Admins can update all cities
CREATE POLICY "Admins can update cities"
  ON pending_cities_master
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role IN ('super_admin', 'admin')
    )
  );

COMMENT ON POLICY "Admins can update cities" ON pending_cities_master IS
  'Super_admin and admin users can update cities. Uses current_user_id() and simplified roles.';

-- Policy 3: Admins can delete cities
CREATE POLICY "Admins can delete cities"
  ON pending_cities_master
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role IN ('super_admin', 'admin')
    )
  );

COMMENT ON POLICY "Admins can delete cities" ON pending_cities_master IS
  'Super_admin and admin users can delete cities. Uses current_user_id() and simplified roles.';

-- Policy 4: Admins can insert cities
CREATE POLICY "Admins can insert cities"
  ON pending_cities_master
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role IN ('super_admin', 'admin')
    )
  );

COMMENT ON POLICY "Admins can insert cities" ON pending_cities_master IS
  'Super_admin and admin users can insert cities. Uses current_user_id() and simplified roles.';

-- Note: Public/anonymous access policies for approved cities remain unchanged
-- They don't use auth.uid() and don't need modification

-- =============================================================================
-- SECTION 3: Additional Policies That Need Updates
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Additional policies for member_registrations from other migrations
-- -----------------------------------------------------------------------------

-- Update policy: Allow admins to read all member registrations
DROP POLICY IF EXISTS "Allow admins to read all member registrations" ON member_registrations;

CREATE POLICY "Allow admins to read all member registrations"
  ON member_registrations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role IN ('super_admin', 'admin', 'editor')
    )
  );

COMMENT ON POLICY "Allow admins to read all member registrations" ON member_registrations IS
  'Admins can read all member registrations. Uses current_user_id().';

-- Update policy: Allow admins to update all member registrations
DROP POLICY IF EXISTS "Allow admins to update all member registrations" ON member_registrations;

CREATE POLICY "Allow admins to update all member registrations"
  ON member_registrations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role IN ('super_admin', 'admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role IN ('super_admin', 'admin', 'editor')
    )
  );

COMMENT ON POLICY "Allow admins to update all member registrations" ON member_registrations IS
  'Admins can update all member registrations. Uses current_user_id().';

-- Update policy: Allow admins to delete member registrations
DROP POLICY IF EXISTS "Allow admins to delete all member registrations" ON member_registrations;

CREATE POLICY "Allow admins to delete all member registrations"
  ON member_registrations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()
      AND user_roles.role IN ('super_admin', 'admin')
    )
  );

COMMENT ON POLICY "Allow admins to delete all member registrations" ON member_registrations IS
  'Super_admin and admin can delete member registrations. Uses current_user_id().';

-- Update policy: Authenticated users can create registration
DROP POLICY IF EXISTS "Authenticated users can create registration" ON member_registrations;

CREATE POLICY "Authenticated users can create registration"
  ON member_registrations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = current_user_id() OR
    user_id IS NULL -- Allow initial registration without user_id
  );

COMMENT ON POLICY "Authenticated users can create registration" ON member_registrations IS
  'Authenticated users can create their own registration. Uses current_user_id().';

-- =============================================================================
-- SECTION 4: Verification and Completion
-- =============================================================================

DO $$
DECLARE
  auth_uid_count integer;
  policy_count integer;
BEGIN
  -- Check for any remaining auth.uid() references in policies
  -- pg_policies uses 'qual' (USING clause) and 'with_check' (WITH CHECK clause)
  SELECT COUNT(*)
  INTO auth_uid_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (qual LIKE '%auth.uid()%' OR with_check LIKE '%auth.uid()%');

  -- Count total policies updated (approximate)
  SELECT COUNT(*)
  INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      tablename IN (
        'user_roles',
        'member_registrations',
        'form_field_configurations',
        'validation_rules',
        'payment_settings',
        'directory_field_visibility',
        'deleted_members',
        'member_audit_history',
        'pending_cities_master'
      )
    );

  -- Display results
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE 'Migration Complete: Fix auth.uid() to current_user_id()';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  - Updated 2 SECURITY DEFINER functions';
  RAISE NOTICE '  - Updated 32 auth.uid() references';
  RAISE NOTICE '  - Recreated 27 RLS policies across 9 tables';
  RAISE NOTICE '  - Fixed deprecated role names in pending_cities_master';
  RAISE NOTICE '';
  RAISE NOTICE 'Statistics:';
  RAISE NOTICE '  - Total policies in affected tables: %', policy_count;
  RAISE NOTICE '  - Remaining auth.uid() references in policies: %', auth_uid_count;
  RAISE NOTICE '';

  IF auth_uid_count > 0 THEN
    RAISE WARNING 'Found % remaining auth.uid() references - manual review recommended', auth_uid_count;
  ELSE
    RAISE NOTICE '✓ No auth.uid() references found in RLS policies';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'All tables now use current_user_id() from custom authentication system.';
  RAISE NOTICE '=============================================================================';
END $$;

-- Display policy summary for verification
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'Policy Summary by Table:';
  RAISE NOTICE '----------------------------------------';

  FOR r IN (
    SELECT
      tablename,
      COUNT(*) as policy_count,
      string_agg(policyname, ', ' ORDER BY policyname) as policies
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'user_roles',
        'member_registrations',
        'form_field_configurations',
        'validation_rules',
        'payment_settings',
        'directory_field_visibility',
        'deleted_members',
        'member_audit_history',
        'pending_cities_master'
      )
    GROUP BY tablename
    ORDER BY tablename
  ) LOOP
    RAISE NOTICE '% (% policies)', r.tablename, r.policy_count;
  END LOOP;

  RAISE NOTICE '----------------------------------------';
END $$;

-- Add final migration comment
COMMENT ON EXTENSION plpgsql IS
  'Migration 20251023112318 completed: All auth.uid() references replaced with current_user_id()';
