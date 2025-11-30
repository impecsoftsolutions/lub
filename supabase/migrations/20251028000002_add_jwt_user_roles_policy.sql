/*
  # Add JWT-based RLS policy for user_roles

  1. Purpose
    - Allow admin users to query user_roles from browser client
    - Use auth.jwt() which is available in browser context
    - Existing current_user_id() policies remain for server-side operations

  2. Security
    - Only users with account_type 'admin' or 'both' can read all roles
    - Policy checks users table for account_type
    - JWT email must match a valid admin user
    - User must have active account status

  3. Impact
    - Admin Users page can now load role data from browser
    - Roles will display correctly (e.g., "Super Admin", "State President")
    - Works alongside existing RLS policies

  4. Note
    - This does NOT replace existing policies
    - This adds an additional policy for browser client access
    - Server-side operations continue to use current_user_id() policies
*/

-- Add policy for admins to view user roles using JWT
CREATE POLICY "Admins can view user roles via JWT"
  ON user_roles
  FOR SELECT
  TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1
      FROM users u
      WHERE u.email = (auth.jwt() ->> 'email')::text
      AND u.account_type IN ('admin', 'both')
      AND u.account_status = 'active'
    )
  );

COMMENT ON POLICY "Admins can view user roles via JWT" ON user_roles IS
  'Allows admin users to read all user roles using JWT email for authentication. Used by browser clients that cannot set session variables. Works alongside current_user_id() based policies.';

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'JWT-based RLS policy added for user_roles table';
  RAISE NOTICE 'Admin users can now query user roles from browser client';
END $$;
