/*
  # Add permission-based SELECT policy to user_roles table

  1. Security Enhancement
    - Add new RLS policy for authenticated users to SELECT user_roles
    - Uses check_user_permission(state, district) function to determine access
    - Allows users to see roles within their permission scope

  2. Policy Details
    - Command: SELECT
    - Role: authenticated
    - Condition: check_user_permission(state, district) = true
*/

-- Add new SELECT policy for permission-based access
CREATE POLICY "Permission-based SELECT access"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (check_user_permission(state, district));