/*
  # Fix Missing INSERT Policy for member_audit_history Table

  1. Problem
    - Migration 20251020000006 dropped the original INSERT policy
    - Never recreated it with custom auth function
    - Audit logging fails with 401 errors

  2. Solution
    - Create new INSERT policy for admins using current_user_id()
    - Allow any user with a role in user_roles table to insert audit records

  3. Security
    - Only users with admin roles can insert audit records
    - Uses custom authentication function current_user_id()
*/

-- Create INSERT policy for member_audit_history table
CREATE POLICY "Admins can insert audit records"
  ON member_audit_history
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_user_id()
    )
  );

-- Add comment for documentation
COMMENT ON POLICY "Admins can insert audit records" ON member_audit_history IS
  'Allows users with roles (admin, super_admin, editor, etc.) to insert audit history records when making changes to member data. Uses current_user_id() for custom auth.';

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Successfully created INSERT policy for member_audit_history table';
  RAISE NOTICE 'Admins can now log member changes to audit history';
END $$;
