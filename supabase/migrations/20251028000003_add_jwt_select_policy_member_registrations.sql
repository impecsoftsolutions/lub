/*
  # Add JWT-based RLS policy for member_registrations

  1. Purpose
    - Allow admin users to query member_registrations from browser client
    - Use auth.jwt() which is available in browser context
    - Existing current_user_id() policies remain for server-side operations

  2. Security
    - Only users with account_type 'admin' or 'both' can read all registrations
    - Policy checks users table for account_type
    - JWT email must match a valid admin user
    - User must have active account status

  3. Impact
    - Admin can now update members and read back the updated data
    - EditMemberModal will work correctly from browser
    - Works alongside existing RLS policies

  4. Note
    - This does NOT replace existing policies
    - This adds an additional policy for browser client access
    - Server-side operations continue to use current_user_id() policies
*/

-- Add policy for admins to view member registrations using JWT
CREATE POLICY "Admins can view member registrations via JWT"
  ON member_registrations
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

COMMENT ON POLICY "Admins can view member registrations via JWT" ON member_registrations IS
  'Allows admin users to read all member registrations using JWT email for authentication. Used by browser clients that cannot set session variables. Works alongside current_user_id() based policies.';

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'JWT-based RLS policy added for member_registrations table';
  RAISE NOTICE 'Admin users can now query member registrations from browser client';
END $$;
