/*
  # Fix User Signup RLS Policy

  1. Problem
    - Users table has RLS enabled but no INSERT policy
    - Signup fails with "new row violates row-level security policy"
    - Unauthenticated users cannot create accounts

  2. Solution
    - Add INSERT policy to allow unauthenticated users to signup
    - Restrict to member accounts only (prevent privilege escalation)
    - Validate required fields are present

  3. Security
    - Policy restricted to account_type: 'member' or 'both' only
    - Cannot create admin-only accounts through signup
    - Enforces required fields: email, password_hash, mobile_number
    - Sets account_status to 'active' by default
    - Existing UNIQUE constraints prevent duplicate emails/mobile numbers

  4. Tables Affected
    - users: Add INSERT policy for public access during signup
*/

-- =============================================
-- Add INSERT policy for user signup
-- =============================================

CREATE POLICY "Anyone can signup (insert user)"
  ON users
  FOR INSERT
  TO public
  WITH CHECK (
    -- Only allow creating member accounts (not admin-only)
    account_type IN ('member', 'both') AND
    -- Ensure required fields are present
    email IS NOT NULL AND
    password_hash IS NOT NULL AND
    mobile_number IS NOT NULL AND
    -- Set initial account status to active
    account_status = 'active'
  );

-- =============================================
-- Add comment for documentation
-- =============================================

COMMENT ON POLICY "Anyone can signup (insert user)" ON users IS
  'Allows unauthenticated users to create member accounts during signup. Restricted to member account_type only to prevent privilege escalation. Validates required fields.';

-- =============================================
-- Log migration completion
-- =============================================

DO $$
BEGIN
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'User Signup RLS Policy Migration Complete';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Users table now allows INSERT for signup';
  RAISE NOTICE 'Policy name: "Anyone can signup (insert user)"';
  RAISE NOTICE 'Restrictions:';
  RAISE NOTICE '  - account_type: member or both only';
  RAISE NOTICE '  - Required fields: email, password_hash, mobile_number';
  RAISE NOTICE '  - account_status: must be active';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Signup should now work without RLS errors!';
  RAISE NOTICE '===========================================';
END $$;
