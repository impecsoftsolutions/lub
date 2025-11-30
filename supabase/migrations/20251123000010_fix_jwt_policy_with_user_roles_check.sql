/*
  # Fix JWT Policy for member_lub_role_assignments - Add user_roles Check

  1. Problem
    - Current JWT policy only checks users.account_type
    - Tulasi (super_admin) has account_type = 'member' but role via user_roles
    - Policy USING clause evaluates to FALSE → RLS returns 0 rows silently
    - Admin list still shows "No member assignments found"

  2. Root Cause
    - User can have admin privileges via TWO paths:
      a) users.account_type IN ('admin', 'both', 'super_admin')
      b) user_roles.role IN ('super_admin', 'admin', 'editor')
    - Our policy only checked (a), missing users who have privileges via (b)

  3. Solution
    - Replace JWT policy to check BOTH paths
    - Pattern matches admin_assign_member_lub_role RPC authorization logic
    - If EITHER condition is true, user can view all assignments

  4. Impact
    - Super admins with account_type = 'member' can now view assignments
    - Aligns with RPC authorization pattern used throughout the app
    - Admin Member Role Assignments list will display data for all admin users
*/

-- =============================================================================
-- Drop and recreate JWT policy with user_roles check
-- =============================================================================

-- Drop existing policy
DROP POLICY IF EXISTS "Admins can view member LUB role assignments via JWT" ON member_lub_role_assignments;

-- Recreate policy with user_roles check (matching RPC authorization pattern)
CREATE POLICY "Admins can view member LUB role assignments via JWT"
  ON member_lub_role_assignments
  FOR SELECT
  TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1
      FROM users u
      WHERE u.email = (auth.jwt() ->> 'email')::text
        AND u.account_status = 'active'
        AND (
          -- Path A: User has admin account_type
          u.account_type IN ('admin', 'both', 'super_admin')
          OR
          -- Path B: User has admin role via user_roles
          EXISTS (
            SELECT 1
            FROM user_roles ur
            WHERE ur.user_id = u.id
              AND ur.role IN ('super_admin', 'admin', 'editor')
          )
        )
    )
  );

COMMENT ON POLICY "Admins can view member LUB role assignments via JWT" ON member_lub_role_assignments IS
  'Allows admin users to view all member LUB role assignments. Checks both users.account_type and user_roles.role to match RPC authorization pattern. Users with account_type admin/both/super_admin OR role super_admin/admin/editor can view assignments.';

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'JWT policy updated for member_lub_role_assignments';
  RAISE NOTICE 'Now checks both account_type and user_roles.role';
  RAISE NOTICE 'Super admins with account_type=member can now view assignments';
END $$;

-- =============================================================================
-- End
-- =============================================================================
