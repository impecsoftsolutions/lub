/*
  # Drop Old auth.uid() RLS Policies from user_roles Table

  1. Problem
    - The user_roles table has conflicting RLS policies
    - Old policies use auth.uid() which returns NULL in custom auth system
    - This blocks all queries to user_roles table
    - New policies use current_user_id() which works correctly

  2. Old Policies Being Dropped (use auth.uid())
    - user_roles_select_own
    - user_roles_select_super_admin
    - user_roles_insert_super_admin
    - user_roles_update_super_admin
    - user_roles_delete_super_admin

  3. New Policies to Keep (use current_user_id())
    - "Users can view own roles"
    - "Super admin and admin can view all roles"
    - "Only super admin can manage user roles"

  4. Impact
    - Removes blocking policies that prevented user_roles queries
    - Ensures only current_user_id() based policies remain active
    - Fixes permission system and super admin checks
*/

-- Drop old policies that use auth.uid() (these block all queries)
DROP POLICY IF EXISTS "user_roles_select_own" ON user_roles;
DROP POLICY IF EXISTS "user_roles_select_super_admin" ON user_roles;
DROP POLICY IF EXISTS "user_roles_insert_super_admin" ON user_roles;
DROP POLICY IF EXISTS "user_roles_update_super_admin" ON user_roles;
DROP POLICY IF EXISTS "user_roles_delete_super_admin" ON user_roles;
