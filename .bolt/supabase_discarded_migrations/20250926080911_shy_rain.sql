/*
  # Add permission-based RLS policies for user_roles table

  1. New Policies
    - Permission-based INSERT access: Allows authenticated users to INSERT user roles if they have permission for the target state/district
    - Permission-based UPDATE access: Allows authenticated users to UPDATE user roles if they have permission for the target state/district  
    - Permission-based DELETE access: Allows authenticated users to DELETE user roles if they have permission for the target state/district

  2. Security
    - All policies use check_user_permission(state, district) to verify geographic permissions
    - Maintains existing access patterns while adding proper authorization
    - Super admins retain unrestricted access via bypassrls
*/

-- Add INSERT policy for permission-based access
CREATE POLICY "Permission-based INSERT access"
  ON user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (check_user_permission(state, district));

-- Add UPDATE policy for permission-based access
CREATE POLICY "Permission-based UPDATE access"
  ON user_roles
  FOR UPDATE
  TO authenticated
  USING (check_user_permission(state, district))
  WITH CHECK (check_user_permission(state, district));

-- Add DELETE policy for permission-based access
CREATE POLICY "Permission-based DELETE access"
  ON user_roles
  FOR DELETE
  TO authenticated
  USING (check_user_permission(state, district));