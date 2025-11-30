/*
  # Add JWT-based UPDATE policy for member_registrations

  1. Purpose
    - Allow admin users to update member_registrations from browser client
    - Use auth.jwt() which is available in browser context
    - Existing current_user_id() policies remain for server-side operations

  2. Security
    - Only users with account_type 'admin', 'both', or 'super_admin' can update registrations
    - Policy checks users table for account_type
    - JWT email must match a valid admin user
    - User must have active account status

  3. Impact
    - Admin can now update members from browser (EditMemberModal)
    - No need to set session context with setUserContext()
    - Works alongside existing RLS policies

  4. Note
    - This does NOT replace existing policies
    - This adds an additional policy for browser client access
    - Server-side operations continue to use current_user_id() policies
*/

-- Add policy for admins to update member registrations using JWT
CREATE POLICY "Admins can update member registrations via JWT"
  ON member_registrations
  FOR UPDATE
  TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1
      FROM users u
      WHERE u.email = (auth.jwt() ->> 'email')::text
      AND u.account_type IN ('admin', 'both', 'super_admin')
      AND u.account_status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM users u
      WHERE u.email = (auth.jwt() ->> 'email')::text
      AND u.account_type IN ('admin', 'both', 'super_admin')
      AND u.account_status = 'active'
    )
  );

COMMENT ON POLICY "Admins can update member registrations via JWT" ON member_registrations IS
  'Allows admin users to update member registrations using JWT email for authentication. Used by browser clients that cannot set session variables. Works alongside current_user_id() based policies.';

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'JWT-based UPDATE policy added for member_registrations table';
  RAISE NOTICE 'Admin users can now update member registrations from browser client';
END $$;
