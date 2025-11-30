/*
  # Add JWT-based RLS policies for form_field_configurations table

  1. Purpose
    - Fix form configuration save bug by allowing admin browser access
    - Browser clients cannot set session variables (current_user_id returns NULL)
    - Use auth.jwt() which is available in browser context
    - Existing current_user_id() policies remain for server-side operations

  2. Current Problem
    - AdminFormFieldConfiguration page calls updateFieldConfiguration()
    - Update query succeeds but RLS blocks it (0 rows affected)
    - No error returned, success toast shows, but data doesn't persist
    - User sees old values after page refresh

  3. Solution
    - Add JWT-based policies that check users table for account_type
    - Check for 'admin', 'both', or 'super_admin' account types
    - Check for active account status
    - Works alongside existing current_user_id() policies

  4. Security
    - Only users with admin privileges can modify form configurations
    - JWT email must match a valid admin user in users table
    - User account must be active
    - Policies apply to SELECT, INSERT, UPDATE, DELETE operations

  5. Impact
    - Admin Form Field Configuration page will now save changes correctly
    - No changes needed to frontend code
    - Works alongside existing RLS policies
    - Does NOT replace existing policies
*/

-- =============================================================================
-- SECTION 1: Add JWT-based RLS Policies
-- =============================================================================

-- Policy 1: SELECT - Allow admins to view form field configurations via JWT
CREATE POLICY "Admins can view form field configurations via JWT"
  ON form_field_configurations
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

COMMENT ON POLICY "Admins can view form field configurations via JWT" ON form_field_configurations IS
  'Allows admin users to read form field configurations using JWT email for authentication. Used by browser clients that cannot set session variables. Works alongside current_user_id() based policies.';

-- Policy 2: INSERT - Allow admins to insert form field configurations via JWT
CREATE POLICY "Admins can insert form field configurations via JWT"
  ON form_field_configurations
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM users u
      WHERE u.email = (auth.jwt() ->> 'email')::text
      AND u.account_type IN ('admin', 'both', 'super_admin')
      AND u.account_status = 'active'
    )
  );

COMMENT ON POLICY "Admins can insert form field configurations via JWT" ON form_field_configurations IS
  'Allows admin users to insert form field configurations using JWT email for authentication. Used by browser clients that cannot set session variables. Works alongside current_user_id() based policies.';

-- Policy 3: UPDATE - Allow admins to update form field configurations via JWT
CREATE POLICY "Admins can update form field configurations via JWT"
  ON form_field_configurations
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

COMMENT ON POLICY "Admins can update form field configurations via JWT" ON form_field_configurations IS
  'Allows admin users to update form field configurations using JWT email for authentication. Used by browser clients that cannot set session variables. Works alongside current_user_id() based policies. THIS IS THE KEY FIX FOR THE SAVE BUG.';

-- Policy 4: DELETE - Allow admins to delete form field configurations via JWT
CREATE POLICY "Admins can delete form field configurations via JWT"
  ON form_field_configurations
  FOR DELETE
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

COMMENT ON POLICY "Admins can delete form field configurations via JWT" ON form_field_configurations IS
  'Allows admin users to delete form field configurations using JWT email for authentication. Used by browser clients that cannot set session variables. Works alongside current_user_id() based policies.';

-- =============================================================================
-- SECTION 2: Log Completion
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE 'Migration 20251102000001 completed successfully';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes Applied:';
  RAISE NOTICE '1. Added JWT-based SELECT policy for form_field_configurations';
  RAISE NOTICE '2. Added JWT-based INSERT policy for form_field_configurations';
  RAISE NOTICE '3. Added JWT-based UPDATE policy for form_field_configurations (FIXES SAVE BUG)';
  RAISE NOTICE '4. Added JWT-based DELETE policy for form_field_configurations';
  RAISE NOTICE '';
  RAISE NOTICE 'Impact:';
  RAISE NOTICE '- Admin Form Field Configuration page can now save changes from browser';
  RAISE NOTICE '- Existing current_user_id() policies remain unchanged';
  RAISE NOTICE '- Works alongside existing RLS policies';
  RAISE NOTICE '';
  RAISE NOTICE 'Testing:';
  RAISE NOTICE '1. Login as admin at /signin';
  RAISE NOTICE '2. Navigate to /admin/settings/forms/join-lub';
  RAISE NOTICE '3. Toggle field visibility or required status';
  RAISE NOTICE '4. Click "Save Changes"';
  RAISE NOTICE '5. Refresh page - changes should persist';
  RAISE NOTICE '';
  RAISE NOTICE '=============================================================================';
END $$;
