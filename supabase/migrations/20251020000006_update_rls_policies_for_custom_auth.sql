/*
  # Update RLS Policies for Custom Authentication

  1. Purpose
    - Replace auth.uid() with custom session function
    - Update all RLS policies to work with custom auth
    - Maintain existing security model

  2. Changes
    - Create session-based user ID function
    - Update member_registrations policies
    - Update user_roles policies
    - Update audit history policies

  3. Notes
    - Application must set session context
    - Session validation happens at application layer
*/

-- =============================================
-- Create function to get current user from session
-- =============================================

-- This function will be called by application to set current user context
CREATE OR REPLACE FUNCTION set_session_user(session_user_id uuid)
RETURNS void AS $$
BEGIN
  -- Store user_id in session variable
  PERFORM set_config('app.current_user_id', session_user_id::text, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current user ID from session
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS uuid AS $$
DECLARE
  user_id_text text;
BEGIN
  -- Get user_id from session variable
  user_id_text := current_setting('app.current_user_id', true);

  IF user_id_text IS NULL OR user_id_text = '' THEN
    RETURN NULL;
  END IF;

  RETURN user_id_text::uuid;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- Update member_registrations RLS policies
-- =============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Members can view own registration" ON member_registrations;
DROP POLICY IF EXISTS "Members can update own registration" ON member_registrations;
DROP POLICY IF EXISTS "Authenticated users can create registration" ON member_registrations;
DROP POLICY IF EXISTS "Role-based access for member registrations" ON member_registrations;
DROP POLICY IF EXISTS "Role-based updates for member registrations" ON member_registrations;

-- Create new policies using custom auth
CREATE POLICY "Members can view own registration"
  ON member_registrations
  FOR SELECT
  TO public
  USING (user_id = current_user_id());

CREATE POLICY "Members can update own registration"
  ON member_registrations
  FOR UPDATE
  TO public
  USING (user_id = current_user_id())
  WITH CHECK (
    user_id = current_user_id() AND
    -- Members cannot change these fields
    status = (SELECT status FROM member_registrations WHERE id = member_registrations.id) AND
    user_id = (SELECT user_id FROM member_registrations WHERE id = member_registrations.id)
  );

CREATE POLICY "Authenticated users can create registration"
  ON member_registrations
  FOR INSERT
  TO public
  WITH CHECK (
    user_id = current_user_id() OR
    user_id IS NULL -- Allow initial registration without user_id
  );

-- Admin access policies (check if user has admin role)
CREATE POLICY "Admins can view all registrations"
  ON member_registrations
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_user_id()
    )
  );

CREATE POLICY "Admins can update all registrations"
  ON member_registrations
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_user_id()
    )
  );

CREATE POLICY "Admins can delete registrations"
  ON member_registrations
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_user_id()
      AND ur.role = 'super_admin'
    )
  );

-- =============================================
-- Update user_roles RLS policies
-- =============================================

DROP POLICY IF EXISTS "Super admins can manage all user roles" ON user_roles;
DROP POLICY IF EXISTS "State admins can manage roles in their state" ON user_roles;
DROP POLICY IF EXISTS "Users can see their own roles" ON user_roles;

CREATE POLICY "Super admins can manage all user roles"
  ON user_roles
  FOR ALL
  TO public
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

CREATE POLICY "Users can see their own roles"
  ON user_roles
  FOR SELECT
  TO public
  USING (user_id = current_user_id());

-- =============================================
-- Update member_audit_history RLS policies
-- =============================================

DROP POLICY IF EXISTS "Members can view own audit history" ON member_audit_history;

CREATE POLICY "Members can view own audit history"
  ON member_audit_history
  FOR SELECT
  TO public
  USING (
    member_id IN (
      SELECT id FROM member_registrations WHERE user_id = current_user_id()
    )
  );

CREATE POLICY "Admins can view all audit history"
  ON member_audit_history
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_user_id()
    )
  );

-- =============================================
-- Update check_user_permission function
-- =============================================

DROP FUNCTION IF EXISTS check_user_permission(text, text);

CREATE OR REPLACE FUNCTION check_user_permission(
  target_state text DEFAULT NULL,
  target_district text DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
  user_role_record RECORD;
BEGIN
  -- Get user's highest role
  SELECT role, state, district INTO user_role_record
  FROM user_roles
  WHERE user_id = current_user_id()
  ORDER BY
    CASE role
      WHEN 'super_admin' THEN 1
      WHEN 'state_president' THEN 2
      WHEN 'state_general_secretary' THEN 3
      WHEN 'district_president' THEN 4
      WHEN 'district_general_secretary' THEN 5
      WHEN 'it_division_head' THEN 6
      WHEN 'accounts_head' THEN 7
      ELSE 99
    END
  LIMIT 1;

  -- If no role found, deny access
  IF user_role_record IS NULL THEN
    RETURN false;
  END IF;

  -- Super admin has access to everything
  IF user_role_record.role = 'super_admin' THEN
    RETURN true;
  END IF;

  -- State-level roles can access their state
  IF user_role_record.role IN ('state_president', 'state_general_secretary') THEN
    RETURN user_role_record.state = target_state OR target_state IS NULL;
  END IF;

  -- District-level roles can access their district
  IF user_role_record.role IN ('district_president', 'district_general_secretary') THEN
    RETURN user_role_record.state = target_state AND user_role_record.district = target_district;
  END IF;

  -- IT Division and Accounts heads
  IF user_role_record.role IN ('it_division_head', 'accounts_head') THEN
    IF user_role_record.state IS NOT NULL THEN
      RETURN user_role_record.state = target_state OR target_state IS NULL;
    END IF;
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'RLS policies updated for custom authentication';
  RAISE NOTICE 'Application must call set_session_user() to set session context';
END $$;

-- Add comments
COMMENT ON FUNCTION set_session_user(uuid) IS
  'Sets the current user ID in session context. Must be called by application after validating session token.';

COMMENT ON FUNCTION current_user_id() IS
  'Returns the current user ID from session context. Used in RLS policies.';
