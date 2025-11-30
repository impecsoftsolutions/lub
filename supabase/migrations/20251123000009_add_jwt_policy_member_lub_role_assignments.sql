/*
  # Add JWT-based RLS Policy for member_lub_role_assignments

  1. Problem
    - Admin Member Role Assignments list shows empty
    - Service uses direct SELECT from member_lub_role_assignments
    - Existing policies are "TO authenticated" only
    - App uses custom auth with JWT (connection is anon role)
    - Browser clients cannot set session variables (current_user_id returns NULL)
    - Result: RLS blocks the SELECT, returns 0 rows silently

  2. Solution
    - Add JWT-based SELECT policy for admins
    - Use auth.jwt() which is available in browser context
    - Check users table for admin privileges
    - Pattern matches existing JWT policies for user_roles and form_field_configurations

  3. Security
    - Only users with account_type 'admin', 'both', or 'super_admin' can view assignments
    - JWT email must match a valid admin user in users table
    - User account must be active
    - Works alongside existing "TO authenticated" policies

  4. Impact
    - Admin Member Role Assignments list will now display data
    - Public Leadership page unchanged (uses RPC with SECURITY DEFINER)
    - No frontend code changes needed
*/

-- =============================================================================
-- Add JWT-based SELECT Policy for Admins
-- =============================================================================

CREATE POLICY "Admins can view member LUB role assignments via JWT"
  ON member_lub_role_assignments
  FOR SELECT
  TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1
      FROM users u
      WHERE u.email = (auth.jwt() ->> 'email')::text
        AND u.account_type IN ('admin', 'both', 'super_admin')
        AND u.account_status = 'active'
    )
  );

COMMENT ON POLICY "Admins can view member LUB role assignments via JWT" ON member_lub_role_assignments IS
  'Allows admin users to read all member LUB role assignments using JWT email for authentication. Used by browser clients (AdminDesignationsManagement) that cannot set session variables. Works alongside existing TO authenticated policies.';

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'JWT-based SELECT policy added for member_lub_role_assignments table';
  RAISE NOTICE 'Admin users can now query member role assignments from browser client';
  RAISE NOTICE 'Member Role Assignments list will now display data';
END $$;

-- =============================================================================
-- End
-- =============================================================================
