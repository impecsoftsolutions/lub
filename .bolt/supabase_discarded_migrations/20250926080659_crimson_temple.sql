/*
  # Drop overly permissive policy from user_roles table

  1. Security Changes
    - Drop the "Allow authenticated users to manage roles" policy
    - This removes the ability for any authenticated user to INSERT, UPDATE, DELETE roles
    - Only the "Allow access to own role data" SELECT policy remains
    - Super admins can still manage roles via bypassrls privilege

  2. Result
    - Regular users can only SELECT their own role data
    - Role management operations require super admin privileges
    - More secure role management system
*/

-- Drop the overly permissive policy that allowed any authenticated user to manage all roles
DROP POLICY IF EXISTS "Allow authenticated users to manage roles" ON user_roles;